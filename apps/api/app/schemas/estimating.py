from decimal import Decimal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from app.models.estimating import EstimateLineCategory, EstimateStatus, LaborType


class LaborRateUpsert(BaseModel):
    labor_type: LaborType
    hourly_rate: Decimal = Field(ge=0)
    currency: str = "EUR"


class LaborRateRead(LaborRateUpsert):
    id: UUID
    model_config = ConfigDict(from_attributes=True)


class EstimateCreate(BaseModel):
    repair_case_id: UUID
    notes: str | None = None
    # None = use the customer's active service contract when there is one.
    # False = public price list even for a contract customer.
    apply_contract: bool | None = None


class EstimateStatusUpdate(BaseModel):
    status: EstimateStatus


class EstimateLineCreate(BaseModel):
    category: EstimateLineCategory
    operation: str | None = None
    part: str | None = None
    oem_code: str | None = None
    description: str
    quantity: Decimal = Field(default=Decimal("1"), ge=0)
    unit_price: Decimal = Field(default=Decimal("0"), ge=0)
    discount_percent: Decimal = Field(default=Decimal("0"), ge=0, le=100)
    labor_hours: Decimal = Field(default=Decimal("0"), ge=0)
    labor_rate: Decimal = Field(default=Decimal("0"), ge=0)
    paint_hours: Decimal = Field(default=Decimal("0"), ge=0)
    paint_rate: Decimal = Field(default=Decimal("0"), ge=0)
    materials: Decimal = Field(default=Decimal("0"), ge=0)
    vat_rate: Decimal = Field(default=Decimal("22"), ge=0)


class EstimateLineRead(EstimateLineCreate):
    id: UUID
    estimate_id: UUID
    parts_amount: Decimal = Decimal("0")
    labor_amount: Decimal = Decimal("0")
    line_subtotal: Decimal
    line_vat: Decimal
    line_total: Decimal
    model_config = ConfigDict(from_attributes=True)


class EstimateRead(BaseModel):
    id: UUID
    repair_case_id: UUID
    estimate_number: str
    version: int
    status: EstimateStatus
    currency: str
    subtotal: Decimal
    vat_total: Decimal
    total: Decimal
    notes: str | None = None
    contract_id: UUID | None = None
    labor_included: bool = False
    labor_discount_percent: Decimal = Decimal("0")
    parts_markup_percent: Decimal = Decimal("0")
    model_config = ConfigDict(from_attributes=True)


class EstimateListItem(EstimateRead):
    case_number: str = ""
    plate: str = ""
    customer_name: str = ""
    contract_name: str | None = None
