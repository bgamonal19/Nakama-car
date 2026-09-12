from uuid import UUID
from pydantic import BaseModel, ConfigDict, EmailStr, Field, model_validator

from app.models.garage import CustomerType, RepairCaseStatus


class CustomerCreate(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)
    customer_type: CustomerType = CustomerType.PRIVATE
    first_name: str | None = None
    last_name: str | None = None
    company_name: str | None = None
    tax_code: str | None = None
    vat_number: str | None = None
    address: str | None = None
    city: str | None = None
    province: str | None = None
    postal_code: str | None = None
    country: str = Field(default="IT", min_length=2, max_length=2)
    phone: str | None = None
    email: EmailStr | None = None
    pec: EmailStr | None = None
    sdi: str | None = None
    notes: str | None = None

    @model_validator(mode="after")
    def validate_identity(self):
        if self.customer_type == CustomerType.PRIVATE and not (self.first_name or self.last_name):
            raise ValueError("Private customer requires first_name or last_name")
        if self.customer_type == CustomerType.COMPANY and not self.company_name:
            raise ValueError("Company customer requires company_name")
        return self


class CustomerRead(CustomerCreate):
    id: UUID
    model_config = ConfigDict(from_attributes=True)


class VehicleCreate(BaseModel):
    customer_id: UUID | None = None
    license_plate: str = Field(min_length=2, max_length=20)
    vin: str | None = Field(default=None, max_length=32)
    make: str | None = None
    model: str | None = None
    version: str | None = None
    year: int | None = Field(default=None, ge=1886, le=2100)
    mileage: int | None = Field(default=None, ge=0)
    color_name: str | None = None
    paint_code: str | None = None


class VehicleRead(VehicleCreate):
    id: UUID
    external_vehicle_id: str | None = None
    vehicle_data_provider: str | None = None
    model_config = ConfigDict(from_attributes=True)


class RepairCaseCreate(BaseModel):
    customer_id: UUID
    vehicle_id: UUID
    mileage: int | None = Field(default=None, ge=0)
    fuel_level_percent: int | None = Field(default=None, ge=0, le=100)
    customer_notes: str | None = None
    internal_notes: str | None = None


class RepairCaseRead(RepairCaseCreate):
    id: UUID
    case_number: str
    status: RepairCaseStatus
    model_config = ConfigDict(from_attributes=True)


class RepairCaseListItem(BaseModel):
    id: UUID
    case_number: str
    status: RepairCaseStatus
    plate: str
    vehicle_name: str
    customer_name: str
    mileage: int | None = None


class CustomerUpdate(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)
    first_name: str | None = None
    last_name: str | None = None
    company_name: str | None = None
    tax_code: str | None = None
    vat_number: str | None = None
    address: str | None = None
    city: str | None = None
    province: str | None = None
    postal_code: str | None = None
    country: str | None = None
    phone: str | None = None
    email: EmailStr | None = None
    pec: EmailStr | None = None
    sdi: str | None = None
    notes: str | None = None


class VehicleUpdate(BaseModel):
    customer_id: UUID | None = None
    vin: str | None = Field(default=None, max_length=32)
    make: str | None = None
    model: str | None = None
    version: str | None = None
    year: int | None = Field(default=None, ge=1886, le=2100)
    mileage: int | None = Field(default=None, ge=0)
    color_name: str | None = None
    paint_code: str | None = None


class RepairCaseUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    mileage: int | None = Field(default=None, ge=0)
    fuel_level_percent: int | None = Field(default=None, ge=0, le=100)
    customer_notes: str | None = None
    internal_notes: str | None = None
