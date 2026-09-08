from uuid import UUID

from pydantic import BaseModel, EmailStr, Field


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class LoginResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user_id: UUID
    tenant_id: UUID
    first_name: str
    last_name: str
    permissions: list[str]


class BootstrapRequest(BaseModel):
    tenant_name: str = "NAKAMA CAR"
    tenant_slug: str = "nakama-car"
    admin_email: EmailStr
    admin_password: str = Field(min_length=10)
    first_name: str
    last_name: str
    company_name: str = "NAKAMA CAR"
    vat_number: str | None = None
