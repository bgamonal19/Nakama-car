from sqlalchemy import JSON, Boolean, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, TenantOwnedMixin, TimestampMixin, UUIDPrimaryKeyMixin


class VehicleLookup(Base, UUIDPrimaryKeyMixin, TenantOwnedMixin, TimestampMixin):
    """One paid plate lookup. Used as cache (no second charge for the same plate)
    and to count the monthly usage against the configured limit."""

    __tablename__ = "vehicle_lookups"

    license_plate: Mapped[str] = mapped_column(String(20), nullable=False, index=True)
    provider: Mapped[str] = mapped_column(String(40), nullable=False)
    found: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    payload: Mapped[dict | None] = mapped_column(JSON)
