from datetime import datetime, timezone
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.db.deps import get_db
from app.models.estimating import Estimate, EstimateStatus
from app.models.garage import RepairCase
from app.models.workshop import WorkOrder, WorkOrderStatus, WorkOrderTask
from app.schemas.workshop import WorkOrderCreate, WorkOrderRead, WorkOrderStatusUpdate, WorkTaskCreate, WorkTaskRead, WorkTaskStatusUpdate
from app.security.context import AuthContext, require_permission
from app.services.audit import record_audit

router = APIRouter(prefix="/work-orders", tags=["work-orders"])


@router.post("", response_model=WorkOrderRead, status_code=status.HTTP_201_CREATED)
def create_work_order(
    payload: WorkOrderCreate,
    db: Session = Depends(get_db),
    auth: AuthContext = Depends(require_permission("work_order.update_status")),
):
    case = db.scalar(
        select(RepairCase).where(
            RepairCase.id == payload.repair_case_id,
            RepairCase.tenant_id == auth.tenant_id,
        )
    )
    if case is None:
        raise HTTPException(status_code=404, detail="Repair case not found")
    if payload.estimate_id:
        estimate = db.scalar(
            select(Estimate).where(
                Estimate.id == payload.estimate_id,
                Estimate.tenant_id == auth.tenant_id,
            )
        )
        if estimate is None:
            raise HTTPException(status_code=404, detail="Estimate not found")
    year = datetime.now(timezone.utc).year
    count = db.scalar(
        select(func.count(WorkOrder.id)).where(
            WorkOrder.tenant_id == auth.tenant_id,
            WorkOrder.work_order_number.like(f"NC-ODL-{year}-%"),
        )
    ) or 0
    order = WorkOrder(
        tenant_id=auth.tenant_id,
        work_order_number=f"NC-ODL-{year}-{count + 1:06d}",
        **payload.model_dump(),
    )
    db.add(order)
    db.commit()
    db.refresh(order)
    return order




@router.post("/from-estimate/{estimate_id}", response_model=WorkOrderRead, status_code=status.HTTP_201_CREATED)
def create_work_order_from_estimate(
    estimate_id: UUID,
    db: Session = Depends(get_db),
    auth: AuthContext = Depends(require_permission("work_order.update_status")),
):
    estimate = db.scalar(
        select(Estimate).where(
            Estimate.id == estimate_id,
            Estimate.tenant_id == auth.tenant_id,
        )
    )
    if estimate is None:
        raise HTTPException(status_code=404, detail="Estimate not found")
    if estimate.status != EstimateStatus.APPROVED:
        raise HTTPException(status_code=409, detail="Estimate must be approved first")

    existing = db.scalar(
        select(WorkOrder).where(
            WorkOrder.tenant_id == auth.tenant_id,
            WorkOrder.estimate_id == estimate.id,
        )
    )
    if existing is not None:
        return existing

    year = datetime.now(timezone.utc).year
    count = db.scalar(
        select(func.count(WorkOrder.id)).where(
            WorkOrder.tenant_id == auth.tenant_id,
            WorkOrder.work_order_number.like(f"NC-ODL-{year}-%"),
        )
    ) or 0
    order = WorkOrder(
        tenant_id=auth.tenant_id,
        repair_case_id=estimate.repair_case_id,
        estimate_id=estimate.id,
        work_order_number=f"NC-ODL-{year}-{count + 1:06d}",
        status=WorkOrderStatus.APPROVED,
        priority="NORMAL",
    )
    db.add(order)
    db.flush()

    default_tasks = [
        ("DISASSEMBLY", "Smontaggio"),
        ("BODY_REPAIR", "Riparazione carrozzeria"),
        ("PAINT_PREP", "Preparazione verniciatura"),
        ("PAINT", "Verniciatura"),
        ("ASSEMBLY", "Montaggio"),
        ("QUALITY_CONTROL", "Controllo qualità"),
        ("CLEANING", "Pulizia e preparazione consegna"),
    ]
    for index, (task_type, description) in enumerate(default_tasks, start=1):
        db.add(
            WorkOrderTask(
                tenant_id=auth.tenant_id,
                work_order_id=order.id,
                task_type=task_type,
                description=description,
                sort_order=index,
            )
        )

    record_audit(
        db,
        tenant_id=auth.tenant_id,
        user_id=auth.user_id,
        entity_type="work_order",
        entity_id=order.id,
        action="created_from_estimate",
        new_value={
            "work_order_number": order.work_order_number,
            "estimate_id": str(estimate.id),
        },
    )
    db.commit()
    db.refresh(order)
    return order

@router.get("", response_model=list[WorkOrderRead])
def list_work_orders(
    db: Session = Depends(get_db),
    auth: AuthContext = Depends(require_permission("work_order.read")),
):
    return db.scalars(
        select(WorkOrder)
        .where(WorkOrder.tenant_id == auth.tenant_id)
        .order_by(WorkOrder.created_at.desc())
        .limit(100)
    ).all()


@router.patch("/{work_order_id}/status", response_model=WorkOrderRead)
def update_work_order_status(
    work_order_id: UUID,
    payload: WorkOrderStatusUpdate,
    db: Session = Depends(get_db),
    auth: AuthContext = Depends(require_permission("work_order.update_status")),
):
    order = db.scalar(
        select(WorkOrder).where(
            WorkOrder.id == work_order_id,
            WorkOrder.tenant_id == auth.tenant_id,
        )
    )
    if order is None:
        raise HTTPException(status_code=404, detail="Work order not found")
    old_status = order.status.value
    order.status = payload.status
    record_audit(
        db,
        tenant_id=auth.tenant_id,
        user_id=auth.user_id,
        entity_type="work_order",
        entity_id=order.id,
        action="status_changed",
        field_name="status",
        old_value=old_status,
        new_value=payload.status.value,
    )
    db.commit()
    db.refresh(order)
    return order


@router.get("/{work_order_id}/tasks", response_model=list[WorkTaskRead])
def list_work_order_tasks(
    work_order_id: UUID,
    db: Session = Depends(get_db),
    auth: AuthContext = Depends(require_permission("work_order.read")),
):
    order = db.scalar(
        select(WorkOrder).where(WorkOrder.id == work_order_id, WorkOrder.tenant_id == auth.tenant_id)
    )
    if order is None:
        raise HTTPException(status_code=404, detail="Work order not found")
    return db.scalars(
        select(WorkOrderTask)
        .where(
            WorkOrderTask.work_order_id == work_order_id,
            WorkOrderTask.tenant_id == auth.tenant_id,
        )
        .order_by(WorkOrderTask.sort_order, WorkOrderTask.created_at)
    ).all()


@router.post("/{work_order_id}/tasks", response_model=WorkTaskRead, status_code=status.HTTP_201_CREATED)
def create_work_order_task(
    work_order_id: UUID,
    payload: WorkTaskCreate,
    db: Session = Depends(get_db),
    auth: AuthContext = Depends(require_permission("work_order.update_status")),
):
    order = db.scalar(
        select(WorkOrder).where(WorkOrder.id == work_order_id, WorkOrder.tenant_id == auth.tenant_id)
    )
    if order is None:
        raise HTTPException(status_code=404, detail="Work order not found")
    task = WorkOrderTask(
        tenant_id=auth.tenant_id,
        work_order_id=work_order_id,
        **payload.model_dump(),
    )
    db.add(task)
    db.commit()
    db.refresh(task)
    return task


@router.patch("/{work_order_id}/tasks/{task_id}/status", response_model=WorkTaskRead)
def update_work_task_status(
    work_order_id: UUID,
    task_id: UUID,
    payload: WorkTaskStatusUpdate,
    db: Session = Depends(get_db),
    auth: AuthContext = Depends(require_permission("work_order.update_status")),
):
    task = db.scalar(
        select(WorkOrderTask).where(
            WorkOrderTask.id == task_id,
            WorkOrderTask.work_order_id == work_order_id,
            WorkOrderTask.tenant_id == auth.tenant_id,
        )
    )
    if task is None:
        raise HTTPException(status_code=404, detail="Work task not found")
    task.status = payload.status
    db.commit()
    db.refresh(task)
    return task
