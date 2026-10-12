from decimal import Decimal
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator

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
    # Hand-drawn outline: up to 30 strokes of up to 600 points [x, y], each between 0 and 1.
    sketch: list[list[list[float]]] | None = None

    @field_validator("sketch")
    @classmethod
    def check_sketch(cls, value: list[list[list[float]]] | None) -> list[list[list[float]]] | None:
        if value is None:
            return None
        if len(value) > 30 or any(len(stroke) > 600 for stroke in value):
            raise ValueError("Disegno troppo grande")
        cleaned = []
        for stroke in value:
            points = []
            for point in stroke:
                if len(point) != 2 or not all(0 <= coordinate <= 1 for coordinate in point):
                    raise ValueError("Punto del disegno non valido")
                points.append([round(point[0], 4), round(point[1], 4)])
            if len(points) >= 2:
                cleaned.append(points)
        return cleaned or None


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
    webp: bool = False


PlateView = Literal["front", "front-3-4", "rear-3-4", "rear", "rear-3-4-right", "front-3-4-right"]


class PlateSpotWrite(BaseModel):
    make: str = Field(min_length=1, max_length=120)
    model: str = Field(min_length=1, max_length=120)
    view: PlateView
    x: float = Field(ge=0, le=1)
    y: float = Field(ge=0, le=1)
    width: float = Field(ge=0.05, le=0.8)
    turn: float = Field(ge=-80, le=80)
