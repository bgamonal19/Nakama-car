import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, String, Text, Uuid
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, TenantOwnedMixin, TimestampMixin, UUIDPrimaryKeyMixin


class CaseTrackingLink(Base, UUIDPrimaryKeyMixin, TenantOwnedMixin, TimestampMixin):
    """Public link the customer uses to follow the repair and chat with the workshop."""

    __tablename__ = "case_tracking_links"

    repair_case_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("repair_cases.id", ondelete="CASCADE"), nullable=False, unique=True, index=True
    )
    public_token: Mapped[str] = mapped_column(String(96), nullable=False, unique=True, index=True)
    active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    last_viewed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class CaseMessage(Base, UUIDPrimaryKeyMixin, TenantOwnedMixin, TimestampMixin):
    """Chat message between the customer and the workshop about one repair case."""

    __tablename__ = "case_messages"

    repair_case_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("repair_cases.id", ondelete="CASCADE"), nullable=False, index=True
    )
    sender: Mapped[str] = mapped_column(String(12), nullable=False)  # CUSTOMER | WORKSHOP
    author_name: Mapped[str | None] = mapped_column(String(120))
    body: Mapped[str] = mapped_column(Text, nullable=False)
    delivered_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    read_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
