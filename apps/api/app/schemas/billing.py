from decimal import Decimal
from uuid import UUID

from pydantic import BaseModel, ConfigDict

from app.models.billing import InvoiceStatus


class InvoiceCreateFromEstimate(BaseModel):
    estimate_id: UUID
    notes: str | None = None


class InvoiceRead(BaseModel):
    id: UUID
    repair_case_id: UUID
    estimate_id: UUID | None
    invoice_number: str
    status: InvoiceStatus
    subtotal: Decimal
    vat_total: Decimal
    total: Decimal
    notes: str | None = None
    model_config = ConfigDict(from_attributes=True)


class InvoiceStatusUpdate(BaseModel):
    status: InvoiceStatus
