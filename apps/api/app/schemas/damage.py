from uuid import UUID
from pydantic import BaseModel, ConfigDict

from app.models.damage import DamageOperation


class DamageUpsert(BaseModel):
    vehicle_area_code: str
    operation: DamageOperation
    suspected_damage: str | None = None
    notes: str | None = None


class DamageRead(DamageUpsert):
    id: UUID
    repair_case_id: UUID
    model_config = ConfigDict(from_attributes=True)
