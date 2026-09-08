import enum
import uuid
from decimal import Decimal

from sqlalchemy import Enum, ForeignKey, Numeric, String, Text, UniqueConstraint, Uuid
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, TenantOwnedMixin, TimestampMixin, UUIDPrimaryKeyMixin


class LaborType(str, enum.Enum):
    BODY = "BODY"
    MECHANICAL = "MECHANICAL"
    PAINT = "PAINT"
    ELECTRICAL = "ELECTRICAL"
    DIAGNOSTIC = "DIAGNOSTIC"


class EstimateStatus(str, enum.Enum):
    DRAFT = "DRAFT"
    READY = "READY"
    SENT = "SENT"
    VIEWED = "VIEWED"
    APPROVED = "APPROVED"
    REJECTED = "REJECTED"
    EXPIRED = "EXPIRED"
    SUPERSEDED = "SUPERSEDED"


class EstimateLineCategory(str, enum.Enum):
    PART = "PART"
    BODY_LABOR = "BODY_LABOR"
    MECHANICAL_LABOR = "MECHANICAL_LABOR"
    PAINT = "PAINT"
    ELECTRICAL = "ELECTRICAL"
    DIAGNOSTIC = "DIAGNOSTIC"
    MATERIAL = "MATERIAL"
    DISPOSAL = "DISPOSAL"
    EXTERNAL_SERVICE = "EXTERNAL_SERVICE"
    OTHER = "OTHER"


class LaborRate(Base, UUIDPrimaryKeyMixin, TenantOwnedMixin, TimestampMixin):
    __tablename__ = "labor_rates"
    __table_args__ = (
        UniqueConstraint("tenant_id", "labor_type", name="uq_labor_rates_tenant_type"),
    )

    labor_type: Mapped[LaborType] = mapped_column(Enum(LaborType, name="labor_type"), nullable=False)
    hourly_rate: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    currency: Mapped[str] = mapped_column(String(3), nullable=False, default="EUR")


class Estimate(Base, UUIDPrimaryKeyMixin, TenantOwnedMixin, TimestampMixin):
    __tablename__ = "estimates"
    __table_args__ = (
        UniqueConstraint("tenant_id", "estimate_number", name="uq_estimates_tenant_number"),
    )

    repair_case_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("repair_cases.id", ondelete="CASCADE"), nullable=False, index=True
    )
    estimate_number: Mapped[str] = mapped_column(String(40), nullable=False)
    version: Mapped[int] = mapped_column(nullable=False, default=1)
    status: Mapped[EstimateStatus] = mapped_column(
        Enum(EstimateStatus, name="estimate_status"), nullable=False, default=EstimateStatus.DRAFT
    )
    currency: Mapped[str] = mapped_column(String(3), nullable=False, default="EUR")
    subtotal: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False, default=0)
    vat_total: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False, default=0)
    total: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False, default=0)
    notes: Mapped[str | None] = mapped_column(Text)


class EstimateLine(Base, UUIDPrimaryKeyMixin, TenantOwnedMixin, TimestampMixin):
    __tablename__ = "estimate_lines"

    estimate_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("estimates.id", ondelete="CASCADE"), nullable=False, index=True
    )
    category: Mapped[EstimateLineCategory] = mapped_column(
        Enum(EstimateLineCategory, name="estimate_line_category"), nullable=False
    )
    operation: Mapped[str | None] = mapped_column(String(120))
    part: Mapped[str | None] = mapped_column(String(160))
    oem_code: Mapped[str | None] = mapped_column(String(120))
    description: Mapped[str] = mapped_column(String(255), nullable=False)
    quantity: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False, default=1)
    unit_price: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False, default=0)
    discount_percent: Mapped[Decimal] = mapped_column(Numeric(5, 2), nullable=False, default=0)
    labor_hours: Mapped[Decimal] = mapped_column(Numeric(8, 2), nullable=False, default=0)
    labor_rate: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False, default=0)
    paint_hours: Mapped[Decimal] = mapped_column(Numeric(8, 2), nullable=False, default=0)
    paint_rate: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False, default=0)
    materials: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False, default=0)
    vat_rate: Mapped[Decimal] = mapped_column(Numeric(5, 2), nullable=False, default=22)
    line_subtotal: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False, default=0)
    line_vat: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False, default=0)
    line_total: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False, default=0)
