from datetime import datetime, timezone
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.db.deps import get_db
from app.models.estimating import Estimate
from app.models.garage import RepairCase
from app.models.workshop import WorkOrder
from app.schemas.workshop import WorkOrderCreate, WorkOrderRead, WorkOrderStatusUpdate
from app.security.context import AuthContext, require_permission

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
    order.status = payload.status
    db.commit()
    db.refresh(order)
    return order
