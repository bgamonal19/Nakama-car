from uuid import UUID
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.db.deps import get_db
from app.models.billing import Invoice
from app.models.estimating import Estimate, EstimateStatus
from app.models.garage import Customer, RepairCase, RepairCaseStatus, Vehicle
from app.models.media import Media
from app.models.tracking import CaseMessage
from app.models.workshop import WorkOrder, WorkOrderTask, WorkTaskStatus
from app.schemas.garage import RepairCaseCreate, RepairCaseListItem, RepairCaseRead, RepairCaseUpdate
from app.services.audit import record_audit
from app.security.context import AuthContext, is_admin, require_permission


def staff_area(db: Session, auth: AuthContext) -> str | None:
    from app.services.staff import user_area

    return user_area(db, auth.user_id, auth.tenant_id)

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
            # Mechanics see mechanical jobs, bodyshop the body ones.
            RepairCase.work_type == area if (area := staff_area(db, auth)) else True,
            or_(RepairCase.case_number.icontains(q, autoescape=True), Vehicle.license_plate.icontains(q, autoescape=True), Customer.first_name.icontains(q, autoescape=True), Customer.last_name.icontains(q, autoescape=True), Customer.company_name.icontains(q, autoescape=True)),
        )
        .order_by(RepairCase.created_at.desc(), RepairCase.id.desc())
        .offset(offset).limit(limit)
    ).all()

    # Latest estimate of each case, so the list can show whether it was accepted, rejected or is still pending.
    estimate_status: dict = {}
    case_ids = [case.id for case, _, _ in rows]
    if case_ids:
        for case_id, value in db.execute(
            select(Estimate.repair_case_id, Estimate.status)
            .where(Estimate.tenant_id == auth.tenant_id, Estimate.repair_case_id.in_(case_ids), Estimate.status != EstimateStatus.SUPERSEDED)
            .order_by(Estimate.created_at, Estimate.id)
        ).all():
            estimate_status[case_id] = value

    return [
        RepairCaseListItem(
            id=case.id,
            case_number=case.case_number,
            status=case.status,
            work_type=case.work_type or "BODY",
            plate=vehicle.license_plate,
            vehicle_name=" ".join(filter(None, [vehicle.make, vehicle.model, vehicle.version])) or "Veicolo",
            customer_name=customer.company_name or f"{customer.first_name or ''} {customer.last_name or ''}".strip() or "Cliente",
            mileage=case.mileage,
            estimate_status=estimate_status.get(case.id),
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


# Once the job reaches one of these, work has been done on the vehicle and the case is history.
WORK_STARTED = {
    RepairCaseStatus.IN_REPAIR, RepairCaseStatus.PAINTING, RepairCaseStatus.ASSEMBLY, RepairCaseStatus.QUALITY_CONTROL,
    RepairCaseStatus.READY, RepairCaseStatus.DELIVERED, RepairCaseStatus.INVOICED,
}


def case_deletion(db: Session, case: RepairCase) -> dict:
    """What deleting the case takes with it, and what stops it.

    Invoices always stop it: an issued invoice is a fiscal document and stays. Once work has started
    only an administrator may delete the case (forced), e.g. a job opened on the wrong vehicle.
    """
    def count(model, *where) -> int:
        return db.scalar(select(func.count()).select_from(model).where(*where)) or 0

    started_tasks = count(
        WorkOrderTask,
        WorkOrderTask.work_order_id.in_(select(WorkOrder.id).where(WorkOrder.repair_case_id == case.id)),
        WorkOrderTask.status.in_((WorkTaskStatus.IN_PROGRESS, WorkTaskStatus.DONE)),
    )
    invoices = count(Invoice, Invoice.repair_case_id == case.id)
    return {
        "case_number": case.case_number,
        "estimates": count(Estimate, Estimate.repair_case_id == case.id),
        "work_orders": count(WorkOrder, WorkOrder.repair_case_id == case.id),
        "started_tasks": started_tasks,
        "photos": count(Media, Media.repair_case_id == case.id),
        "messages": count(CaseMessage, CaseMessage.repair_case_id == case.id),
        "invoices": invoices,
        "work_started": case.status in WORK_STARTED or started_tasks > 0,
        "blocked": "Impossibile eliminare la pratica: ha già fatture, che restano in archivio." if invoices else None,
    }


@router.get("/{case_id}/deletion")
def preview_case_deletion(case_id: UUID, db: Session = Depends(get_db), auth: AuthContext = Depends(require_permission("case.create"))):
    case = db.scalar(select(RepairCase).where(RepairCase.id == case_id, RepairCase.tenant_id == auth.tenant_id))
    if case is None:
        raise HTTPException(status_code=404, detail="Repair case not found")
    return case_deletion(db, case)


@router.delete("/{case_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_repair_case(
    case_id: UUID,
    force: bool = Query(default=False),
    db: Session = Depends(get_db),
    auth: AuthContext = Depends(require_permission("case.create")),
):
    """Remove a case never carried out (opened by mistake, estimate refused, customer never came).

    A case whose work has started needs an administrator and ``force``. Invoices always refuse it.
    Its estimates, work orders, photos, damages and chat go with it; the customer and the vehicle stay.
    """
    case = db.scalar(select(RepairCase).where(RepairCase.id == case_id, RepairCase.tenant_id == auth.tenant_id))
    if case is None:
        raise HTTPException(status_code=404, detail="Repair case not found")
    impact = case_deletion(db, case)
    if impact["blocked"]:
        raise HTTPException(status_code=409, detail=impact["blocked"])
    if impact["work_started"]:
        if not force:
            raise HTTPException(status_code=409, detail="Impossibile eliminare la pratica: i lavori sono già iniziati.")
        if not is_admin(auth):
            raise HTTPException(status_code=403, detail="Solo un amministratore può eliminare una pratica con lavori iniziati.")
    remove_case(db, case, auth, forced=impact["work_started"])
    db.commit()


def remove_case(db: Session, case: RepairCase, auth: AuthContext, forced: bool = False) -> None:
    record_audit(db, tenant_id=auth.tenant_id, user_id=auth.user_id, entity_type="repair_case", entity_id=case.id,
                 action="deleted", old_value={"case_number": case.case_number, "status": case.status.value, "forced": forced})
    db.delete(case)
