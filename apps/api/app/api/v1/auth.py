from fastapi import APIRouter, Depends, Header, HTTPException, status
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
from app.schemas.auth import BootstrapRequest, LoginRequest, LoginResponse
from app.security.passwords import hash_password, verify_password
from app.security.tokens import create_access_token

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
def login(payload: LoginRequest, db: Session = Depends(get_db)):
    user = db.scalar(select(User).where(func.lower(User.email) == payload.email.lower()))
    if user is None or user.status != UserStatus.ACTIVE or not verify_password(user.password_hash, payload.password):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")

    membership = db.scalar(
        select(UserTenant)
        .where(UserTenant.user_id == user.id)
        .order_by(UserTenant.is_default.desc(), UserTenant.created_at.asc())
    )
    if membership is None:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="No tenant membership")

    permissions = effective_permissions(db, user.id, membership.tenant_id)
    token = create_access_token(
        user_id=user.id,
        tenant_id=membership.tenant_id,
        permissions=permissions,
    )
    return LoginResponse(
        access_token=token,
        user_id=user.id,
        tenant_id=membership.tenant_id,
        first_name=user.first_name,
        last_name=user.last_name,
        permissions=permissions,
    )


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

    admin_role = roles["ADMIN"]
    for permission in permissions_by_code.values():
        db.add(RolePermission(role_id=admin_role.id, permission_id=permission.id))

    user = User(
        email=payload.admin_email.lower(),
        password_hash=hash_password(payload.admin_password),
        first_name=payload.first_name,
        last_name=payload.last_name,
        status=UserStatus.ACTIVE,
    )
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
    )
