from typing import Literal
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
    roles: list[str] = []
    # BODY (carrozzeria), MECHANICAL (meccanica) or None (sees everything).
    work_area: str | None = None
    # True until the user ticks the two boxes (terms, privacy notice) of the current version.
    legal_required: bool = False


class LegalAcceptance(BaseModel):
    """Two separate boxes, both must be ticked: terms and conditions, privacy notice read."""
    accept_terms: Literal[True]
    accept_privacy: Literal[True]


class BootstrapRequest(BaseModel):
    tenant_name: str = "NAKAMA CAR"
    tenant_slug: str = "nakama-car"
    admin_email: EmailStr
    admin_password: str = Field(min_length=10)
    first_name: str
    last_name: str
    company_name: str = "NAKAMA CAR"
    vat_number: str | None = None
    accept_terms: bool = False
    accept_privacy: bool = False
