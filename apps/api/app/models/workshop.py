import enum
import uuid

from sqlalchemy import Enum, ForeignKey, String, Text, UniqueConstraint, Uuid
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, TenantOwnedMixin, TimestampMixin, UUIDPrimaryKeyMixin


class WorkOrderStatus(str, enum.Enum):
    NEW = "NEW"
    WAITING_APPROVAL = "WAITING_APPROVAL"
    APPROVED = "APPROVED"
    WAITING_PARTS = "WAITING_PARTS"
    IN_REPAIR = "IN_REPAIR"
    PAINTING = "PAINTING"
    ASSEMBLY = "ASSEMBLY"
    QUALITY_CONTROL = "QUALITY_CONTROL"
    READY = "READY"
    DELIVERED = "DELIVERED"
    INVOICED = "INVOICED"


class WorkOrder(Base, UUIDPrimaryKeyMixin, TenantOwnedMixin, TimestampMixin):
    __tablename__ = "work_orders"
    __table_args__ = (
        UniqueConstraint("tenant_id", "work_order_number", name="uq_work_orders_tenant_number"),
    )

    repair_case_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("repair_cases.id", ondelete="CASCADE"), nullable=False, index=True
    )
    estimate_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("estimates.id", ondelete="SET NULL"), nullable=True, index=True
    )
    work_order_number: Mapped[str] = mapped_column(String(40), nullable=False)
    status: Mapped[WorkOrderStatus] = mapped_column(
        Enum(WorkOrderStatus, name="work_order_status"), nullable=False, default=WorkOrderStatus.NEW
    )
    priority: Mapped[str] = mapped_column(String(20), nullable=False, default="NORMAL")
    notes: Mapped[str | None] = mapped_column(Text)


class WorkTaskStatus(str, enum.Enum):
    PENDING = "PENDING"
    IN_PROGRESS = "IN_PROGRESS"
    DONE = "DONE"
    BLOCKED = "BLOCKED"


class WorkOrderTask(Base, UUIDPrimaryKeyMixin, TenantOwnedMixin, TimestampMixin):
    __tablename__ = "work_order_tasks"

    work_order_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("work_orders.id", ondelete="CASCADE"), nullable=False, index=True
    )
    task_type: Mapped[str] = mapped_column(String(64), nullable=False)
    description: Mapped[str] = mapped_column(String(255), nullable=False)
    status: Mapped[WorkTaskStatus] = mapped_column(
        Enum(WorkTaskStatus, name="work_task_status"), nullable=False, default=WorkTaskStatus.PENDING
    )
    assigned_user_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, nullable=True, index=True)
    sort_order: Mapped[int] = mapped_column(nullable=False, default=0)
