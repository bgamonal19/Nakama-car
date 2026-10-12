from datetime import date, datetime
from decimal import Decimal
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict

from app.models.billing import InvoiceStatus

# FatturaPA ModalitaPagamento codes offered in the UI.
PaymentMethod = Literal["MP01", "MP02", "MP05", "MP08", "MP12", "MP19"]


class InvoiceCreateFromEstimate(BaseModel):
    estimate_id: UUID
    notes: str | None = None


class InvoiceRead(BaseModel):
    id: UUID
    repair_case_id: UUID | None = None
    estimate_id: UUID | None = None
    customer_id: UUID | None = None
    contract_id: UUID | None = None
    invoice_kind: str = "REPAIR"
    period_month: str | None = None
    invoice_number: str
    status: InvoiceStatus
    subtotal: Decimal
    vat_total: Decimal
    total: Decimal
    issue_date: date | None = None
    due_date: date | None = None
    payment_method: str | None = None
    paid_at: date | None = None
    notes: str | None = None
    created_at: datetime | None = None
    customer_name: str = ""
    plate: str | None = None
    model_config = ConfigDict(from_attributes=True)


class InvoiceLineRead(BaseModel):
    id: UUID
    description: str
    quantity: Decimal
    unit_price: Decimal
    vat_rate: Decimal
    line_subtotal: Decimal
    line_vat: Decimal
    line_total: Decimal
    model_config = ConfigDict(from_attributes=True)


class InvoiceDetail(InvoiceRead):
    lines: list[InvoiceLineRead] = []


class InvoiceStatusUpdate(BaseModel):
    status: InvoiceStatus
    paid_at: date | None = None


class InvoiceUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    issue_date: date | None = None
    due_date: date | None = None
    payment_method: PaymentMethod | None = None
    notes: str | None = None
