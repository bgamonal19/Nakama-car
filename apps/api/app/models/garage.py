import enum
import uuid
from datetime import datetime

from sqlalchemy import Enum, ForeignKey, Integer, String, Text, UniqueConstraint, Uuid
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, TenantOwnedMixin, TimestampMixin, UUIDPrimaryKeyMixin


class CustomerType(str, enum.Enum):
    PRIVATE = "PRIVATE"
    COMPANY = "COMPANY"


class RepairCaseStatus(str, enum.Enum):
    NEW = "NEW"
    WAITING_APPROVAL = "WAITING_APPROVAL"
    APPROVED = "APPROVED"
    WAITING_PARTS = "WAITING_PARTS"
    IN_REPAIR = "IN_REPAIR"
    PAINTING = "PAINTING"
    ASSEMBLY = "ASSEMBLY"
    QUALITY_CONTROL = "QUALITY_CONTROL"
    READY = "READY"
    DELIVERED = "DELIVERED"
    INVOICED = "INVOICED"


class Customer(Base, UUIDPrimaryKeyMixin, TenantOwnedMixin, TimestampMixin):
    __tablename__ = "customers"

    customer_type: Mapped[CustomerType] = mapped_column(
        Enum(CustomerType, name="customer_type"), nullable=False, default=CustomerType.PRIVATE
    )
    first_name: Mapped[str | None] = mapped_column(String(120))
    last_name: Mapped[str | None] = mapped_column(String(120))
    company_name: Mapped[str | None] = mapped_column(String(180))
    tax_code: Mapped[str | None] = mapped_column(String(32))
    vat_number: Mapped[str | None] = mapped_column(String(32))
    address: Mapped[str | None] = mapped_column(String(255))
    city: Mapped[str | None] = mapped_column(String(120))
    province: Mapped[str | None] = mapped_column(String(8))
    postal_code: Mapped[str | None] = mapped_column(String(16))
    country: Mapped[str] = mapped_column(String(2), nullable=False, default="IT")
    phone: Mapped[str | None] = mapped_column(String(32))
    email: Mapped[str | None] = mapped_column(String(255))
    pec: Mapped[str | None] = mapped_column(String(255))
    sdi: Mapped[str | None] = mapped_column(String(16))
    notes: Mapped[str | None] = mapped_column(Text)


class Vehicle(Base, UUIDPrimaryKeyMixin, TenantOwnedMixin, TimestampMixin):
    __tablename__ = "vehicles"
    __table_args__ = (
        UniqueConstraint("tenant_id", "license_plate", name="uq_vehicles_tenant_plate"),
    )

    customer_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("customers.id", ondelete="SET NULL"), nullable=True, index=True
    )
    license_plate: Mapped[str] = mapped_column(String(20), nullable=False)
    vin: Mapped[str | None] = mapped_column(String(32), index=True)
    make: Mapped[str | None] = mapped_column(String(120))
    model: Mapped[str | None] = mapped_column(String(120))
    version: Mapped[str | None] = mapped_column(String(160))
    year: Mapped[int | None] = mapped_column(Integer)
    mileage: Mapped[int | None] = mapped_column(Integer)
    color_name: Mapped[str | None] = mapped_column(String(120))
    paint_code: Mapped[str | None] = mapped_column(String(64))
    external_vehicle_id: Mapped[str | None] = mapped_column(String(255))
    vehicle_data_provider: Mapped[str | None] = mapped_column(String(64))


class RepairCase(Base, UUIDPrimaryKeyMixin, TenantOwnedMixin, TimestampMixin):
    __tablename__ = "repair_cases"
    __table_args__ = (
        UniqueConstraint("tenant_id", "case_number", name="uq_repair_cases_tenant_number"),
    )

    case_number: Mapped[str] = mapped_column(String(40), nullable=False)
    customer_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("customers.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    vehicle_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("vehicles.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    status: Mapped[RepairCaseStatus] = mapped_column(
        Enum(RepairCaseStatus, name="repair_case_status"),
        nullable=False,
        default=RepairCaseStatus.NEW,
        index=True,
    )
    mileage: Mapped[int | None] = mapped_column(Integer)
    fuel_level_percent: Mapped[int | None] = mapped_column(Integer)
    customer_notes: Mapped[str | None] = mapped_column(Text)
    internal_notes: Mapped[str | None] = mapped_column(Text)
    opened_at: Mapped[datetime | None]
