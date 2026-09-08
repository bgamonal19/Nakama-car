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
    model_config = ConfigDict(from_attributes=True)
