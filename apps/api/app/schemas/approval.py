from decimal import Decimal
from pydantic import BaseModel, Field


class EstimateShareResponse(BaseModel):
    public_token: str
    public_path: str


class PublicEstimateLine(BaseModel):
    description: str
    quantity: Decimal
    line_total: Decimal


class PublicEstimateRead(BaseModel):
    estimate_number: str
    status: str
    customer_name: str
    vehicle: str
    license_plate: str
    subtotal: Decimal
    vat_total: Decimal
    total: Decimal
    lines: list[PublicEstimateLine]


class PublicEstimateDecision(BaseModel):
    accepted: bool
    signature_name: str = Field(min_length=2, max_length=180)
    customer_notes: str | None = None
