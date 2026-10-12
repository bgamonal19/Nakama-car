from datetime import date
from decimal import Decimal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, model_validator


class ServiceContractCreate(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)
    customer_id: UUID
    name: str = Field(min_length=2, max_length=160)
    labor_included: bool = True
    labor_discount_percent: Decimal = Field(default=Decimal("0"), ge=0, le=100)
    parts_markup_percent: Decimal = Field(default=Decimal("0"), ge=0, le=100)
    monthly_fee: Decimal = Field(default=Decimal("0"), ge=0)
    fee_vat_rate: Decimal = Field(default=Decimal("22"), ge=0, le=100)
    fee_description: str | None = Field(default=None, max_length=255)
    start_date: date
    end_date: date | None = None
    is_active: bool = True
    notes: str | None = None

    @model_validator(mode="after")
    def validate_period(self):
        if self.end_date is not None and self.end_date < self.start_date:
            raise ValueError("end_date must not be before start_date")
        return self


class ServiceContractUpdate(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True, extra="forbid")
    name: str | None = Field(default=None, min_length=2, max_length=160)
    labor_included: bool | None = None
    labor_discount_percent: Decimal | None = Field(default=None, ge=0, le=100)
    parts_markup_percent: Decimal | None = Field(default=None, ge=0, le=100)
    monthly_fee: Decimal | None = Field(default=None, ge=0)
    fee_vat_rate: Decimal | None = Field(default=None, ge=0, le=100)
    fee_description: str | None = Field(default=None, max_length=255)
    start_date: date | None = None
    end_date: date | None = None
    is_active: bool | None = None
    notes: str | None = None


class ServiceContractRead(ServiceContractCreate):
    id: UUID
    customer_name: str = ""
    model_config = ConfigDict(from_attributes=True)


class ContractFeeInvoiceCreate(BaseModel):
    period_month: str = Field(pattern=r"^\d{4}-(0[1-9]|1[0-2])$", description="YYYY-MM")
