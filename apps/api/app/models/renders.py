import uuid
from decimal import Decimal

from sqlalchemy import Boolean, ForeignKey, Integer, LargeBinary, Numeric, String, Text, UniqueConstraint, Uuid
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, TenantOwnedMixin, TimestampMixin, UUIDPrimaryKeyMixin


class VehicleRender(Base, UUIDPrimaryKeyMixin, TenantOwnedMixin, TimestampMixin):
    """A studio render of a make/model/year/color from one view, paid once and reused."""

    __tablename__ = "vehicle_renders"
    __table_args__ = (
        UniqueConstraint("tenant_id", "render_key", name="uq_vehicle_renders_tenant_key"),
    )

    render_key: Mapped[str] = mapped_column(String(255), nullable=False)
    make: Mapped[str] = mapped_column(String(120), nullable=False)
    model: Mapped[str] = mapped_column(String(120), nullable=False)
    year: Mapped[int | None] = mapped_column(Integer)
    color: Mapped[str] = mapped_column(String(20), nullable=False)
    view: Mapped[str] = mapped_column(String(30), nullable=False)
    found: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    mime_type: Mapped[str | None] = mapped_column(String(60))
    content: Mapped[bytes | None] = mapped_column(LargeBinary)


class DamageMarker(Base, UUIDPrimaryKeyMixin, TenantOwnedMixin, TimestampMixin):
    """A damage pinned on a vehicle picture: view + relative position (0..1)."""

    __tablename__ = "damage_markers"

    repair_case_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("repair_cases.id", ondelete="CASCADE"), nullable=False, index=True
    )
    view: Mapped[str] = mapped_column(String(30), nullable=False)
    x: Mapped[Decimal] = mapped_column(Numeric(6, 4), nullable=False)
    y: Mapped[Decimal] = mapped_column(Numeric(6, 4), nullable=False)
    operation: Mapped[str] = mapped_column(String(20), nullable=False)
    area_label: Mapped[str] = mapped_column(String(160), nullable=False)
    notes: Mapped[str | None] = mapped_column(Text)


class PlateSpot(Base, UUIDPrimaryKeyMixin, TenantOwnedMixin, TimestampMixin):
    """Where the number plate sits on the pictures of one make/model, per view.

    Adjusted once by hand in the workshop and reused for every vehicle of that model.
    """

    __tablename__ = "plate_spots"
    __table_args__ = (
        UniqueConstraint("tenant_id", "model_key", "view", name="uq_plate_spots_tenant_model_view"),
    )

    model_key: Mapped[str] = mapped_column(String(255), nullable=False)
    view: Mapped[str] = mapped_column(String(30), nullable=False)
    x: Mapped[Decimal] = mapped_column(Numeric(6, 4), nullable=False)
    y: Mapped[Decimal] = mapped_column(Numeric(6, 4), nullable=False)
    width: Mapped[Decimal] = mapped_column(Numeric(6, 4), nullable=False)
    turn: Mapped[Decimal] = mapped_column(Numeric(6, 2), nullable=False, default=0)
