"""Workshop staff: personal profile of each user and quick diagnoses sent to the office."""
import enum
import uuid
from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import Date, DateTime, Enum, ForeignKey, Numeric, String, Text, Uuid
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, TenantOwnedMixin, TimestampMixin, UUIDPrimaryKeyMixin


class UserProfile(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    """Personal details a worker keeps up to date (one per user)."""

    __tablename__ = "user_profiles"

    user_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, unique=True, index=True)
    phone: Mapped[str | None] = mapped_column(String(32))
    birth_date: Mapped[date | None] = mapped_column(Date)
    tax_code: Mapped[str | None] = mapped_column(String(32))
    address: Mapped[str | None] = mapped_column(String(255))
    city: Mapped[str | None] = mapped_column(String(120))
    postal_code: Mapped[str | None] = mapped_column(String(16))
    emergency_contact: Mapped[str | None] = mapped_column(String(160))
    emergency_phone: Mapped[str | None] = mapped_column(String(32))
    skills: Mapped[str | None] = mapped_column(Text)
    notes: Mapped[str | None] = mapped_column(Text)
    # BODY (carrozzeria) / MECHANICAL (meccanica). Empty = from the role.
    work_area: Mapped[str | None] = mapped_column(String(12))


class DiagnosisStatus(str, enum.Enum):
    SENT = "SENT"  # sent by the worker, waiting for the office
    CONVERTED = "CONVERTED"  # turned into an estimate
    REJECTED = "REJECTED"


class Diagnosis(Base, UUIDPrimaryKeyMixin, TenantOwnedMixin, TimestampMixin):
    """Quick diagnosis made in the workshop and sent to the main account for the estimate."""

    __tablename__ = "diagnoses"

    diagnosis_number: Mapped[str] = mapped_column(String(40), nullable=False)
    created_by: Mapped[uuid.UUID] = mapped_column(Uuid, nullable=False, index=True)
    license_plate: Mapped[str] = mapped_column(String(20), nullable=False, index=True)
    vehicle_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, ForeignKey("vehicles.id", ondelete="SET NULL"))
    repair_case_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, ForeignKey("repair_cases.id", ondelete="SET NULL"))
    estimate_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, ForeignKey("estimates.id", ondelete="SET NULL"))
    work_type: Mapped[str] = mapped_column(String(12), nullable=False, default="MECHANICAL")
    mileage: Mapped[int | None] = mapped_column()
    complaint: Mapped[str | None] = mapped_column(Text)
    findings: Mapped[str | None] = mapped_column(Text)
    urgency: Mapped[str] = mapped_column(String(12), nullable=False, default="NORMAL")
    labor_hours: Mapped[Decimal] = mapped_column(Numeric(8, 2), nullable=False, default=0)
    status: Mapped[DiagnosisStatus] = mapped_column(Enum(DiagnosisStatus, name="diagnosis_status"), nullable=False, default=DiagnosisStatus.SENT)
    reviewed_by: Mapped[uuid.UUID | None] = mapped_column(Uuid)
    reviewed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    review_note: Mapped[str | None] = mapped_column(Text)


class DiagnosisLine(Base, UUIDPrimaryKeyMixin, TenantOwnedMixin, TimestampMixin):
    """Part, material or external service needed, as written by the worker."""

    __tablename__ = "diagnosis_lines"

    diagnosis_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("diagnoses.id", ondelete="CASCADE"), nullable=False, index=True)
    kind: Mapped[str] = mapped_column(String(12), nullable=False)  # PART | MATERIAL | SERVICE
    description: Mapped[str] = mapped_column(String(255), nullable=False)
    oem_code: Mapped[str | None] = mapped_column(String(120))
    quantity: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False, default=1)
    unit_price: Mapped[Decimal | None] = mapped_column(Numeric(12, 2))
    sort_order: Mapped[int] = mapped_column(nullable=False, default=0)
