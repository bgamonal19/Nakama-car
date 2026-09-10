from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import delete, func, select
from uuid import UUID
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError

from app.db.deps import get_db
from app.models.identity import Role, User, UserRole, UserStatus, UserTenant, Tenant
from app.schemas.users import UserCreate, UserRead, UserUpdate
from app.security.context import AuthContext, require_permission
from app.security.passwords import hash_password
from app.services.audit import record_audit

router = APIRouter(prefix="/users", tags=["users"])


def user_to_read(db: Session, user: User, tenant_id) -> UserRead:
    roles = db.scalars(
        select(Role.code)
        .join(UserRole, UserRole.role_id == Role.id)
        .where(
            UserRole.user_id == user.id,
            UserRole.tenant_id == tenant_id,
            Role.tenant_id == tenant_id,
        )
    ).all()
    return UserRead(
        id=user.id,
        email=user.email,
        first_name=user.first_name,
        last_name=user.last_name,
        status=user.status,
        role_codes=sorted(roles),
    )


@router.get("", response_model=list[UserRead])
def list_users(
    db: Session = Depends(get_db),
    auth: AuthContext = Depends(require_permission("users.manage")),
):
    users = db.scalars(
        select(User)
        .join(UserTenant, UserTenant.user_id == User.id)
        .where(UserTenant.tenant_id == auth.tenant_id)
        .order_by(User.first_name, User.last_name)
    ).all()
    return [user_to_read(db, user, auth.tenant_id) for user in users]


@router.post("", response_model=UserRead, status_code=status.HTTP_201_CREATED)
def create_user(
    payload: UserCreate,
    db: Session = Depends(get_db),
    auth: AuthContext = Depends(require_permission("users.manage")),
):
    if db.scalar(select(User).where(func.lower(User.email) == payload.email.lower())) is not None:
        raise HTTPException(status_code=409, detail="Email already exists")

    role = db.scalar(
        select(Role).where(
            Role.tenant_id == auth.tenant_id,
            Role.code == payload.role_code.upper(),
        )
    )
    if role is None:
        raise HTTPException(status_code=404, detail="Role not found")

    user = User(
        email=payload.email.lower(),
        password_hash=hash_password(payload.password),
        first_name=payload.first_name,
        last_name=payload.last_name,
        status=UserStatus.ACTIVE,
    )
    try:
        db.add(user)
        db.flush()
        db.add(UserTenant(user_id=user.id, tenant_id=auth.tenant_id, is_default=True))
        db.add(UserRole(user_id=user.id, tenant_id=auth.tenant_id, role_id=role.id))
        record_audit(db, tenant_id=auth.tenant_id, user_id=auth.user_id,
                     entity_type="user", entity_id=user.id, action="CREATE",
                     new_value={"role_code": role.code})
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="Account already exists or could not be assigned")
    db.refresh(user)
    return user_to_read(db, user, auth.tenant_id)


@router.patch("/{user_id}", response_model=UserRead)
def update_user(
    user_id: UUID,
    payload: UserUpdate,
    db: Session = Depends(get_db),
    auth: AuthContext = Depends(require_permission("users.manage")),
):
    # Serialize role edits within the tenant, including last-admin checks.
    db.scalar(select(Tenant).where(Tenant.id == auth.tenant_id).with_for_update())
    user = db.scalar(select(User).join(UserTenant, UserTenant.user_id == User.id).where(
        User.id == user_id, UserTenant.tenant_id == auth.tenant_id,
    ).with_for_update())
    if user is None:
        raise HTTPException(status_code=404, detail="Utente non trovato")
    # Identity and credentials are global; a tenant admin must not change other memberships.
    if db.scalar(select(func.count(UserTenant.id)).where(UserTenant.user_id == user_id)) != 1:
        raise HTTPException(status_code=409, detail="Account condiviso tra aziende: contatta l’amministratore della piattaforma")
    email = payload.email.lower()
    if db.scalar(select(User.id).where(func.lower(User.email) == email, User.id != user_id)):
        raise HTTPException(status_code=409, detail="Email già associata a un account")
    role = db.scalar(select(Role).where(Role.tenant_id == auth.tenant_id, Role.code == payload.role_code.upper()))
    if role is None:
        raise HTTPException(status_code=404, detail="Profilo non trovato")
    old_roles = user_to_read(db, user, auth.tenant_id).role_codes
    role_changed = old_roles != [role.code]
    if "ADMIN" in old_roles and role.code != "ADMIN":
        other_admin = db.scalar(select(User.id).join(UserRole, UserRole.user_id == User.id)
            .join(Role, Role.id == UserRole.role_id).where(
                User.id != user_id, User.status == UserStatus.ACTIVE,
                UserRole.tenant_id == auth.tenant_id, Role.tenant_id == auth.tenant_id, Role.code == "ADMIN",
            ).limit(1))
        if other_admin is None:
            raise HTTPException(status_code=409, detail="Deve rimanere almeno un amministratore attivo")
    changed_fields = [field for field, value in {
        "email": email, "first_name": payload.first_name, "last_name": payload.last_name,
    }.items() if getattr(user, field) != value]
    revoke = email != user.email or payload.password is not None or role_changed
    try:
        user.email = email
        user.first_name = payload.first_name
        user.last_name = payload.last_name
        if payload.password is not None:
            user.password_hash = hash_password(payload.password)
            changed_fields.append("password")
        if role_changed:
            db.execute(delete(UserRole).where(UserRole.user_id == user_id, UserRole.tenant_id == auth.tenant_id))
            db.add(UserRole(user_id=user_id, tenant_id=auth.tenant_id, role_id=role.id))
            changed_fields.append("role_code")
        if revoke:
            user.auth_version += 1
        if changed_fields:
            record_audit(db, tenant_id=auth.tenant_id, user_id=auth.user_id,
                entity_type="user", entity_id=user_id, action="UPDATE",
                new_value={"changed_fields": changed_fields})
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="Impossibile salvare: account già esistente o assegnazione non valida")
    db.refresh(user)
    return user_to_read(db, user, auth.tenant_id)
