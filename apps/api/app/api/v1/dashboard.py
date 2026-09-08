from fastapi import APIRouter, Depends
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.db.deps import get_db
from app.models.garage import Customer, RepairCase, RepairCaseStatus, Vehicle
from app.schemas.dashboard import DashboardPractice, DashboardSummary
from app.security.context import AuthContext, require_permission

router = APIRouter(prefix="/dashboard", tags=["dashboard"])


@router.get("/summary", response_model=DashboardSummary)
def dashboard_summary(
    db: Session = Depends(get_db),
    auth: AuthContext = Depends(require_permission("case.read")),
):
    base = RepairCase.tenant_id == auth.tenant_id
    open_cases = db.scalar(
        select(func.count(RepairCase.id)).where(
            base,
            RepairCase.status.notin_([RepairCaseStatus.DELIVERED, RepairCaseStatus.INVOICED]),
        )
    ) or 0
    waiting_approval = db.scalar(
        select(func.count(RepairCase.id)).where(base, RepairCase.status == RepairCaseStatus.WAITING_APPROVAL)
    ) or 0
    in_progress = db.scalar(
        select(func.count(RepairCase.id)).where(
            base,
            RepairCase.status.in_([
                RepairCaseStatus.IN_REPAIR,
                RepairCaseStatus.PAINTING,
                RepairCaseStatus.ASSEMBLY,
                RepairCaseStatus.QUALITY_CONTROL,
            ]),
        )
    ) or 0
    ready = db.scalar(
        select(func.count(RepairCase.id)).where(base, RepairCase.status == RepairCaseStatus.READY)
    ) or 0

    rows = db.execute(
        select(RepairCase, Vehicle, Customer)
        .join(Vehicle, Vehicle.id == RepairCase.vehicle_id)
        .join(Customer, Customer.id == RepairCase.customer_id)
        .where(
            RepairCase.tenant_id == auth.tenant_id,
            Vehicle.tenant_id == auth.tenant_id,
            Customer.tenant_id == auth.tenant_id,
        )
        .order_by(RepairCase.created_at.desc())
        .limit(8)
    ).all()

    recent = []
    for case, vehicle, customer in rows:
        client = customer.company_name or f"{customer.first_name or ''} {customer.last_name or ''}".strip()
        car = " ".join(filter(None, [vehicle.make, vehicle.model, vehicle.version])) or "Veicolo"
        recent.append(
            DashboardPractice(
                code=case.case_number,
                plate=vehicle.license_plate,
                car=car,
                client=client or "Cliente",
                status=case.status.value,
            )
        )

    return DashboardSummary(
        open_cases=open_cases,
        waiting_approval=waiting_approval,
        in_progress=in_progress,
        ready=ready,
        recent_practices=recent,
    )
