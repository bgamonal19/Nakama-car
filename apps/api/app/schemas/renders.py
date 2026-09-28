from decimal import Decimal
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

MarkerView = Literal[
    "front", "front-3-4", "side", "rear-3-4", "rear", "rear-3-4-right", "side-right", "front-3-4-right", "top",
]
MarkerOperation = Literal["CHECK", "REPAIR", "REPLACE", "PAINT"]


class DamageMarkerCreate(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)
    view: MarkerView
    x: Decimal = Field(ge=0, le=1)
    y: Decimal = Field(ge=0, le=1)
    operation: MarkerOperation
    area_label: str = Field(min_length=1, max_length=160)
    notes: str | None = None


class DamageMarkerRead(DamageMarkerCreate):
    id: UUID
    repair_case_id: UUID
    model_config = ConfigDict(from_attributes=True)


class RenderAvailability(BaseModel):
    configured: bool
    views: list[str]
    color: str
    used_this_month: int
    monthly_limit: int
