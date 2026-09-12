from uuid import UUID
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.db.deps import get_db
from app.models.garage import Customer, RepairCase, Vehicle
from app.schemas.garage import RepairCaseCreate, RepairCaseListItem, RepairCaseRead, RepairCaseUpdate
from app.services.audit import record_audit
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


@router.get("", response_model=list[RepairCaseListItem])
def list_repair_cases(
    q: str = "",
    customer_id: UUID | None = None,
    vehicle_id: UUID | None = None,
    offset: int = Query(0, ge=0),
    limit: int = Query(200, ge=1, le=200),
    db: Session = Depends(get_db),
    auth: AuthContext = Depends(require_permission("case.read")),
):
    rows = db.execute(
        select(RepairCase, Vehicle, Customer)
        .join(Vehicle, Vehicle.id == RepairCase.vehicle_id)
        .join(Customer, Customer.id == RepairCase.customer_id)
        .where(
            RepairCase.tenant_id == auth.tenant_id,
            Vehicle.tenant_id == auth.tenant_id,
            Customer.tenant_id == auth.tenant_id,
            RepairCase.customer_id == customer_id if customer_id else True,
            RepairCase.vehicle_id == vehicle_id if vehicle_id else True,
            or_(RepairCase.case_number.icontains(q, autoescape=True), Vehicle.license_plate.icontains(q, autoescape=True), Customer.first_name.icontains(q, autoescape=True), Customer.last_name.icontains(q, autoescape=True), Customer.company_name.icontains(q, autoescape=True)),
        )
        .order_by(RepairCase.created_at.desc(), RepairCase.id.desc())
        .offset(offset).limit(limit)
    ).all()

    return [
        RepairCaseListItem(
            id=case.id,
            case_number=case.case_number,
            status=case.status,
            plate=vehicle.license_plate,
            vehicle_name=" ".join(filter(None, [vehicle.make, vehicle.model, vehicle.version])) or "Veicolo",
            customer_name=customer.company_name or f"{customer.first_name or ''} {customer.last_name or ''}".strip() or "Cliente",
            mileage=case.mileage,
        )
        for case, vehicle, customer in rows
    ]


@router.get("/{case_id}", response_model=RepairCaseRead)
def get_repair_case(case_id: UUID, db: Session = Depends(get_db), auth: AuthContext = Depends(require_permission("case.read"))):
    case = db.scalar(select(RepairCase).where(RepairCase.id == case_id, RepairCase.tenant_id == auth.tenant_id))
    if case is None:
        raise HTTPException(status_code=404, detail="Repair case not found")
    return case


@router.patch("/{case_id}", response_model=RepairCaseRead)
def update_repair_case(case_id: UUID, payload: RepairCaseUpdate, db: Session = Depends(get_db), auth: AuthContext = Depends(require_permission("case.update"))):
    case = db.scalar(select(RepairCase).where(RepairCase.id == case_id, RepairCase.tenant_id == auth.tenant_id))
    if case is None:
        raise HTTPException(status_code=404, detail="Repair case not found")
    changes = payload.model_dump(exclude_unset=True)
    before = {key: getattr(case, key) for key in changes}
    for key, value in changes.items():
        setattr(case, key, value)
    record_audit(db, tenant_id=auth.tenant_id, user_id=auth.user_id, entity_type="repair_case", entity_id=case.id, action="updated", old_value=before, new_value=changes)
    db.commit()
    db.refresh(case)
    return case
