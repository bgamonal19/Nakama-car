from fastapi import APIRouter, Depends, Header, HTTPException, Request, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.db.deps import get_db
from app.models.identity import (
    Permission,
    Role,
    RolePermission,
    Tenant,
    TenantSettings,
    User,
    UserRole,
    UserStatus,
    UserTenant,
)
from app.schemas.auth import BootstrapRequest, LegalAcceptance, LoginRequest, LoginResponse
from app.security.context import AuthContext, get_auth_context
from app.security.passwords import hash_password, verify_password
from app.security.tokens import create_access_token
from app.services import access

router = APIRouter(tags=["auth"])
settings = get_settings()

DEFAULT_PERMISSIONS = [
    "customer.read", "customer.write",
    "vehicle.read", "vehicle.write",
    "case.create", "case.read", "case.update",
    "estimate.create", "estimate.read", "estimate.change_price",
    "estimate.change_discount", "estimate.approve",
    "work_order.read", "work_order.update_status",
    "invoice.read", "invoice.create",
    "settings.manage", "users.manage", "audit.read",
]

DEFAULT_ROLES = [
    "ADMIN", "RECEPTION", "BODYSHOP", "PAINTER", "MECHANIC", "ACCOUNTING"
]

ROLE_PERMISSION_CODES = {
    "ADMIN": DEFAULT_PERMISSIONS,
    "RECEPTION": [
        "customer.read", "customer.write", "vehicle.read", "vehicle.write",
        "case.create", "case.read", "case.update",
        "estimate.create", "estimate.read",
        "work_order.read",
    ],
    "BODYSHOP": ["case.read", "case.update", "estimate.read", "work_order.read", "work_order.update_status"],
    "PAINTER": ["case.read", "case.update", "estimate.read", "work_order.read", "work_order.update_status"],
    "MECHANIC": ["case.read", "case.update", "estimate.read", "work_order.read", "work_order.update_status"],
    "ACCOUNTING": ["customer.read", "estimate.read", "invoice.read", "invoice.create"],
}


def session_extras(db: Session, user_id, tenant_id) -> dict:
    """Roles and work area, so the app shows each worker only what is theirs."""
    from app.services import staff

    return {"roles": staff.user_roles(db, user_id, tenant_id), "work_area": staff.user_area(db, user_id, tenant_id)}


def effective_permissions(db: Session, user_id, tenant_id) -> list[str]:
    rows = db.execute(
        select(Permission.code)
        .join(RolePermission, RolePermission.permission_id == Permission.id)
        .join(Role, Role.id == RolePermission.role_id)
        .join(UserRole, UserRole.role_id == Role.id)
        .where(
            UserRole.user_id == user_id,
            UserRole.tenant_id == tenant_id,
            Role.tenant_id == tenant_id,
        )
        .distinct()
    ).scalars().all()
    return sorted(rows)


@router.post("/auth/login", response_model=LoginResponse)
def login(payload: LoginRequest, request: Request, db: Session = Depends(get_db)):
    user = db.scalar(select(User).where(func.lower(User.email) == payload.email.lower()))
    membership = None if user is None else db.scalar(
        select(UserTenant)
        .where(UserTenant.user_id == user.id)
        .order_by(UserTenant.is_default.desc(), UserTenant.created_at.asc())
    )
    if user is None or user.status != UserStatus.ACTIVE or not verify_password(user.password_hash, payload.password):
        # Failed attempts on a real account are logged (unknown emails are not: nothing to protect, less data).
        if membership is not None:
            access.record_access(db, request, tenant_id=membership.tenant_id, user_id=user.id, email=user.email, event="LOGIN_FAILED")
            db.commit()
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")

    if membership is None:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="No tenant membership")
    access.record_access(db, request, tenant_id=membership.tenant_id, user_id=user.id, email=user.email, event="LOGIN_OK")
    db.commit()

    permissions = effective_permissions(db, user.id, membership.tenant_id)
    token = create_access_token(
        user_id=user.id,
        tenant_id=membership.tenant_id,
        permissions=permissions,
        auth_version=user.auth_version,
    )
    return LoginResponse(
        access_token=token,
        user_id=user.id,
        tenant_id=membership.tenant_id,
        first_name=user.first_name,
        last_name=user.last_name,
        permissions=permissions,
        legal_required=access.legal_required(user),
        **session_extras(db, user.id, membership.tenant_id),
    )


@router.post("/auth/legal")
def accept_legal(payload: LegalAcceptance, request: Request, db: Session = Depends(get_db), auth: AuthContext = Depends(get_auth_context)):
    """The worker ticked both boxes (terms, privacy notice) of the current version."""
    user = db.get(User, auth.user_id)
    access.accept_legal(user)
    access.record_access(db, request, tenant_id=auth.tenant_id, user_id=user.id, email=user.email, event="LEGAL_ACCEPTED")
    db.commit()
    return {"legal_version": user.legal_version, "terms_accepted_at": user.terms_accepted_at, "privacy_accepted_at": user.privacy_accepted_at}


@router.post("/setup/bootstrap", response_model=LoginResponse)
def bootstrap(
    payload: BootstrapRequest,
    x_bootstrap_token: str | None = Header(default=None),
    db: Session = Depends(get_db),
):
    if not settings.bootstrap_token or x_bootstrap_token != settings.bootstrap_token:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Bootstrap disabled")

    if (db.scalar(select(func.count(User.id))) or 0) > 0:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Application already initialized")

    tenant = Tenant(name=payload.tenant_name, slug=payload.tenant_slug)
    db.add(tenant)
    db.flush()

    db.add(
        TenantSettings(
            tenant_id=tenant.id,
            company_name=payload.company_name,
            vat_number=payload.vat_number,
        )
    )

    permissions_by_code = {}
    for code in DEFAULT_PERMISSIONS:
        permission = Permission(code=code, description=code)
        db.add(permission)
        db.flush()
        permissions_by_code[code] = permission

    roles = {}
    for code in DEFAULT_ROLES:
        role = Role(tenant_id=tenant.id, code=code, name=code)
        db.add(role)
        db.flush()
        roles[code] = role

    for role_code, permission_codes in ROLE_PERMISSION_CODES.items():
        role = roles[role_code]
        for permission_code in permission_codes:
            db.add(
                RolePermission(
                    role_id=role.id,
                    permission_id=permissions_by_code[permission_code].id,
                )
            )

    admin_role = roles["ADMIN"]

    user = User(
        email=payload.admin_email.lower(),
        password_hash=hash_password(payload.admin_password),
        first_name=payload.first_name,
        last_name=payload.last_name,
        status=UserStatus.ACTIVE,
    )
    if payload.accept_terms and payload.accept_privacy:
        access.accept_legal(user)
    db.add(user)
    db.flush()
    db.add(UserTenant(user_id=user.id, tenant_id=tenant.id, is_default=True))
    db.add(UserRole(user_id=user.id, tenant_id=tenant.id, role_id=admin_role.id))
    db.commit()

    permissions = DEFAULT_PERMISSIONS.copy()
    token = create_access_token(user_id=user.id, tenant_id=tenant.id, permissions=permissions)
    return LoginResponse(
        access_token=token,
        user_id=user.id,
        tenant_id=tenant.id,
        first_name=user.first_name,
        last_name=user.last_name,
        permissions=permissions,
        legal_required=access.legal_required(user),
    )
