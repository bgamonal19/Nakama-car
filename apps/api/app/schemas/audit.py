from datetime import datetime
from typing import Any
from uuid import UUID

from pydantic import BaseModel, ConfigDict


class AuditLogRead(BaseModel):
    id: UUID
    user_id: UUID | None
    entity_type: str
    entity_id: UUID | None
    action: str
    field_name: str | None
    old_value: Any = None
    new_value: Any = None
    created_at: datetime
    model_config = ConfigDict(from_attributes=True)
