from sqlalchemy import JSON, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column
from app.db.base import Base, TenantOwnedMixin, TimestampMixin, UUIDPrimaryKeyMixin


class DatevLink(Base, UUIDPrimaryKeyMixin, TenantOwnedMixin, TimestampMixin):
    __tablename__ = "datev_links"
    __table_args__ = (
        UniqueConstraint("tenant_id", "entity_type", "local_id", name="uq_datev_local"),
        UniqueConstraint("tenant_id", "entity_type", "remote_id", name="uq_datev_remote"),
    )
    entity_type: Mapped[str] = mapped_column(String(20), nullable=False)
    local_id: Mapped[str] = mapped_column(String(36), nullable=False)
    remote_id: Mapped[str | None] = mapped_column(String(255))
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="prepared")
    fingerprint: Mapped[str] = mapped_column(String(64), nullable=False)
    snapshot: Mapped[dict] = mapped_column(JSON, nullable=False)
    error_code: Mapped[str | None] = mapped_column(String(64))
