from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.db.deps import get_db
from app.models.garage import Customer, RepairCase, Vehicle
from app.schemas.garage import RepairCaseCreate, RepairCaseRead
from app.security.context import AuthContext, require_permission

router = APIRouter(prefix="/cases", tags=["repair-cases"])


def next_case_number(db: Session, tenant_id) -> str:
    year = datetime.now(timezone.utc).year
    prefix = f"NC-{year}-"
    count = db.scalar(
        select(func.count(RepairCase.id)).where(
            RepairCase.tenant_id == tenant_id,
            RepairCase.case_number.like(f"{prefix}%"),
        )
    ) or 0
    return f"{prefix}{count + 1:06d}"


@router.post("", response_model=RepairCaseRead, status_code=status.HTTP_201_CREATED)
def create_repair_case(
    payload: RepairCaseCreate,
    db: Session = Depends(get_db),
    auth: AuthContext = Depends(require_permission("case.create")),
):
    customer = db.scalar(
        select(Customer).where(
            Customer.id == payload.customer_id,
            Customer.tenant_id == auth.tenant_id,
        )
    )
    vehicle = db.scalar(
        select(Vehicle).where(
            Vehicle.id == payload.vehicle_id,
            Vehicle.tenant_id == auth.tenant_id,
        )
    )
    if customer is None or vehicle is None:
        raise HTTPException(status_code=404, detail="Customer or vehicle not found")

    repair_case = RepairCase(
        tenant_id=auth.tenant_id,
        case_number=next_case_number(db, auth.tenant_id),
        opened_at=datetime.now(timezone.utc),
        **payload.model_dump(),
    )
    db.add(repair_case)
    db.commit()
    db.refresh(repair_case)
    return repair_case
