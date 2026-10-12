import enum
import uuid
from datetime import date
from decimal import Decimal

from sqlalchemy import Date, Enum, ForeignKey, Numeric, String, Text, UniqueConstraint, Uuid
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, TenantOwnedMixin, TimestampMixin, UUIDPrimaryKeyMixin


class InvoiceStatus(str, enum.Enum):
    DRAFT = "DRAFT"
    ISSUED = "ISSUED"
    PAID = "PAID"
    CANCELLED = "CANCELLED"


class Invoice(Base, UUIDPrimaryKeyMixin, TenantOwnedMixin, TimestampMixin):
    __tablename__ = "invoices"
    __table_args__ = (
        UniqueConstraint("tenant_id", "invoice_number", name="uq_invoices_tenant_number"),
        UniqueConstraint("tenant_id", "contract_id", "period_month", name="uq_invoices_contract_period"),
    )

    # Repair invoices point at a repair case; monthly contract-fee invoices do not.
    repair_case_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("repair_cases.id", ondelete="RESTRICT"), nullable=True, index=True
    )
    customer_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("customers.id", ondelete="RESTRICT"), nullable=True, index=True
    )
    invoice_kind: Mapped[str] = mapped_column(String(20), nullable=False, default="REPAIR", server_default="REPAIR")
    contract_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("service_contracts.id", ondelete="SET NULL"), nullable=True, index=True
    )
    period_month: Mapped[str | None] = mapped_column(String(7))
    issue_date: Mapped[date | None] = mapped_column(Date)
    due_date: Mapped[date | None] = mapped_column(Date)
    payment_method: Mapped[str | None] = mapped_column(String(8))
    paid_at: Mapped[date | None] = mapped_column(Date)
    estimate_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("estimates.id", ondelete="SET NULL"), nullable=True, index=True
    )
    invoice_number: Mapped[str] = mapped_column(String(40), nullable=False)
    status: Mapped[InvoiceStatus] = mapped_column(
        Enum(InvoiceStatus, name="invoice_status"), nullable=False, default=InvoiceStatus.DRAFT
    )
    subtotal: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False, default=0)
    vat_total: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False, default=0)
    total: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False, default=0)
    notes: Mapped[str | None] = mapped_column(Text)


class InvoiceLine(Base, UUIDPrimaryKeyMixin, TenantOwnedMixin, TimestampMixin):
    __tablename__ = "invoice_lines"

    invoice_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("invoices.id", ondelete="CASCADE"), nullable=False, index=True
    )
    description: Mapped[str] = mapped_column(String(255), nullable=False)
    quantity: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False, default=1)
    unit_price: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False, default=0)
    vat_rate: Mapped[Decimal] = mapped_column(Numeric(5, 2), nullable=False, default=22)
    line_subtotal: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False, default=0)
    line_vat: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False, default=0)
    line_total: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False, default=0)
