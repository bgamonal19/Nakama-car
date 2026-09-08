from uuid import UUID
from pydantic import BaseModel, ConfigDict

from app.models.workshop import WorkOrderStatus, WorkTaskStatus


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


class WorkTaskCreate(BaseModel):
    task_type: str
    description: str
    assigned_user_id: UUID | None = None
    sort_order: int = 0


class WorkTaskStatusUpdate(BaseModel):
    status: WorkTaskStatus


class WorkTaskRead(WorkTaskCreate):
    id: UUID
    work_order_id: UUID
    status: WorkTaskStatus
    model_config = ConfigDict(from_attributes=True)
