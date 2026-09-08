import enum
import uuid

from sqlalchemy import Enum, ForeignKey, String, Text, UniqueConstraint, Uuid
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, TenantOwnedMixin, TimestampMixin, UUIDPrimaryKeyMixin


class DamageOperation(str, enum.Enum):
    NO_DAMAGE = "NO_DAMAGE"
    CHECK = "CHECK"
    REPAIR = "REPAIR"
    REPLACE = "REPLACE"
    PAINT = "PAINT"


class VehicleArea(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "vehicle_areas"

    code: Mapped[str] = mapped_column(String(80), nullable=False, unique=True, index=True)
    label_it: Mapped[str] = mapped_column(String(160), nullable=False)
    sort_order: Mapped[int] = mapped_column(nullable=False, default=0)


class Damage(Base, UUIDPrimaryKeyMixin, TenantOwnedMixin, TimestampMixin):
    __tablename__ = "damages"
    __table_args__ = (
        UniqueConstraint("repair_case_id", "vehicle_area_code", name="uq_damage_case_area"),
    )

    repair_case_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("repair_cases.id", ondelete="CASCADE"), nullable=False, index=True
    )
    vehicle_area_code: Mapped[str] = mapped_column(String(80), nullable=False, index=True)
    operation: Mapped[DamageOperation] = mapped_column(
        Enum(DamageOperation, name="damage_operation"), nullable=False
    )
    suspected_damage: Mapped[str | None] = mapped_column(String(200))
    notes: Mapped[str | None] = mapped_column(Text)
