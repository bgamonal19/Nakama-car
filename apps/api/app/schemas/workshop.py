from uuid import UUID
from pydantic import BaseModel, ConfigDict

from app.models.workshop import WorkOrderStatus


class WorkOrderCreate(BaseModel):
    repair_case_id: UUID
    estimate_id: UUID | None = None
    priority: str = "NORMAL"
    notes: str | None = None


class WorkOrderStatusUpdate(BaseModel):
    status: WorkOrderStatus


class WorkOrderRead(WorkOrderCreate):
    id: UUID
    work_order_number: str
    status: WorkOrderStatus
    model_config = ConfigDict(from_attributes=True)
