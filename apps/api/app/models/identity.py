import enum
import uuid
from datetime import datetime, timezone

from sqlalchemy import Boolean, DateTime, Enum, ForeignKey, JSON, String, Text, UniqueConstraint, Uuid, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, TimestampMixin, UUIDPrimaryKeyMixin


class UserStatus(str, enum.Enum):
    ACTIVE = "ACTIVE"
    INVITED = "INVITED"
    DISABLED = "DISABLED"


class Tenant(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "tenants"
    name: Mapped[str] = mapped_column(String(160), nullable=False)
    slug: Mapped[str] = mapped_column(String(80), nullable=False, unique=True, index=True)
    country: Mapped[str] = mapped_column(String(2), nullable=False, default="IT")
    currency: Mapped[str] = mapped_column(String(3), nullable=False, default="EUR")
    locale: Mapped[str] = mapped_column(String(16), nullable=False, default="it-IT")
    timezone: Mapped[str] = mapped_column(String(64), nullable=False, default="Europe/Rome")
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)


class TenantSettings(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "tenant_settings"
    __table_args__ = (UniqueConstraint("tenant_id", name="uq_tenant_settings_tenant_id"),)
    tenant_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    company_name: Mapped[str | None] = mapped_column(String(160))
    vat_number: Mapped[str | None] = mapped_column(String(32))
    tax_code: Mapped[str | None] = mapped_column(String(32))
    pec: Mapped[str | None] = mapped_column(String(255))
    sdi: Mapped[str | None] = mapped_column(String(16))
    address: Mapped[str | None] = mapped_column(String(255))
    city: Mapped[str | None] = mapped_column(String(120))
    province: Mapped[str | None] = mapped_column(String(8))
    postal_code: Mapped[str | None] = mapped_column(String(16))
    country: Mapped[str] = mapped_column(String(2), nullable=False, default="IT", server_default="IT")
    regime_fiscale: Mapped[str] = mapped_column(String(4), nullable=False, default="RF01", server_default="RF01")
    iban: Mapped[str | None] = mapped_column(String(34))
    phone: Mapped[str | None] = mapped_column(String(32))
    email: Mapped[str | None] = mapped_column(String(255))
    logo_storage_key: Mapped[str | None] = mapped_column(String(512))
    estimate_validity_days: Mapped[int] = mapped_column(nullable=False, default=15)
    # Workshop availability shown to customers in the chat: ONLINE | PAUSED | OFFLINE.
    chat_status: Mapped[str] = mapped_column(String(12), nullable=False, default="ONLINE", server_default="ONLINE")


class User(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "users"
    email: Mapped[str] = mapped_column(String(255), nullable=False, unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    auth_version: Mapped[int] = mapped_column(nullable=False, default=0, server_default="0")
    first_name: Mapped[str] = mapped_column(String(120), nullable=False)
    last_name: Mapped[str] = mapped_column(String(120), nullable=False)
    status: Mapped[UserStatus] = mapped_column(Enum(UserStatus, name="user_status"), nullable=False, default=UserStatus.ACTIVE)
    # Version of terms + privacy notice accepted (two separate boxes) and when; empty = must accept at next login.
    legal_version: Mapped[str | None] = mapped_column(String(20))
    terms_accepted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    privacy_accepted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class Role(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "roles"
    __table_args__ = (UniqueConstraint("tenant_id", "code", name="uq_roles_tenant_code"),)
    tenant_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    code: Mapped[str] = mapped_column(String(64), nullable=False)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)


class Permission(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "permissions"
    code: Mapped[str] = mapped_column(String(120), nullable=False, unique=True)
    description: Mapped[str | None] = mapped_column(Text)


class UserTenant(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "user_tenants"
    __table_args__ = (UniqueConstraint("user_id", "tenant_id", name="uq_user_tenants_user_tenant"),)
    user_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    tenant_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    is_default: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)


class UserRole(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "user_roles"
    __table_args__ = (UniqueConstraint("user_id", "tenant_id", "role_id", name="uq_user_roles_assignment"),)
    user_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    tenant_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    role_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("roles.id", ondelete="CASCADE"), nullable=False, index=True)


class RolePermission(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "role_permissions"
    __table_args__ = (UniqueConstraint("role_id", "permission_id", name="uq_role_permissions_assignment"),)
    role_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("roles.id", ondelete="CASCADE"), nullable=False, index=True)
    permission_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("permissions.id", ondelete="CASCADE"), nullable=False, index=True)


class AuditLog(Base, UUIDPrimaryKeyMixin):
    __tablename__ = "audit_logs"
    tenant_id: Mapped[uuid.UUID] = mapped_column(Uuid, nullable=False, index=True)
    user_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, nullable=True, index=True)
    entity_type: Mapped[str] = mapped_column(String(100), nullable=False, index=True)
    entity_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, nullable=True, index=True)
    action: Mapped[str] = mapped_column(String(80), nullable=False)
    field_name: Mapped[str | None] = mapped_column(String(120))
    old_value: Mapped[object | None] = mapped_column(JSON)
    new_value: Mapped[object | None] = mapped_column(JSON)
    ip_address: Mapped[str | None] = mapped_column(String(64))
    user_agent: Mapped[str | None] = mapped_column(String(512))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())


class AccessLog(Base, UUIDPrimaryKeyMixin):
    """Who entered the app, when and how (kept 12 months, see services/access.py)."""

    __tablename__ = "access_logs"
    tenant_id: Mapped[uuid.UUID] = mapped_column(Uuid, nullable=False, index=True)
    # STAFF (workshop user) or PORTAL (customer access); the matching id is set.
    account_type: Mapped[str] = mapped_column(String(12), nullable=False)
    user_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, index=True)
    portal_account_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, index=True)
    email: Mapped[str] = mapped_column(String(255), nullable=False)
    # LOGIN_OK, LOGIN_FAILED (wrong password), LEGAL_ACCEPTED, PASSWORD_CHANGED.
    event: Mapped[str] = mapped_column(String(32), nullable=False)
    # How: password login from the web, the Android app or the Mac app.
    method: Mapped[str] = mapped_column(String(32), nullable=False, default="password")
    client: Mapped[str] = mapped_column(String(16), nullable=False, default="WEB")
    ip_address: Mapped[str | None] = mapped_column(String(64))
    user_agent: Mapped[str | None] = mapped_column(String(512))
    # Set here (microseconds), so events of the same second keep their order.
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now(), default=lambda: datetime.now(timezone.utc), index=True,
    )
