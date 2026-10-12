from pydantic import BaseModel, ConfigDict, EmailStr, Field


class CompanySettings(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True, from_attributes=True)
    company_name: str | None = Field(default=None, max_length=160)
    vat_number: str | None = Field(default=None, max_length=32)
    tax_code: str | None = Field(default=None, max_length=32)
    address: str | None = Field(default=None, max_length=255)
    city: str | None = Field(default=None, max_length=120)
    province: str | None = Field(default=None, max_length=8)
    postal_code: str | None = Field(default=None, max_length=16)
    country: str = Field(default="IT", min_length=2, max_length=2)
    regime_fiscale: str = Field(default="RF01", pattern=r"^RF(0[1-9]|1[0-9])$")
    iban: str | None = Field(default=None, max_length=34)
    phone: str | None = Field(default=None, max_length=32)
    email: EmailStr | None = None
    pec: EmailStr | None = None
    sdi: str | None = Field(default=None, max_length=16)
    estimate_validity_days: int = Field(default=15, ge=1, le=365)
