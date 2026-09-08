import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, String, Text, Uuid
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, TenantOwnedMixin, TimestampMixin, UUIDPrimaryKeyMixin


class EstimateApproval(Base, UUIDPrimaryKeyMixin, TenantOwnedMixin, TimestampMixin):
    __tablename__ = "estimate_approvals"

    estimate_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("estimates.id", ondelete="CASCADE"), nullable=False, index=True
    )
    public_token: Mapped[str] = mapped_column(String(96), nullable=False, unique=True, index=True)
    customer_name: Mapped[str | None] = mapped_column(String(180))
    accepted: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    signature_name: Mapped[str | None] = mapped_column(String(180))
    customer_notes: Mapped[str | None] = mapped_column(Text)
    ip_address: Mapped[str | None] = mapped_column(String(64))
    user_agent: Mapped[str | None] = mapped_column(String(512))
    responded_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
