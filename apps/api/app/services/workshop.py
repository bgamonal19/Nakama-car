"""Work orders: opened automatically once the customer (or the office) approves an estimate."""
from datetime import datetime, timezone
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models.estimating import Estimate, EstimateLine, EstimateLineCategory
from app.models.garage import RepairCase, RepairCaseStatus
from app.models.workshop import WorkOrder, WorkOrderStatus, WorkOrderTask
from app.services.audit import record_audit

BODYSHOP_TASKS = [
    ("DISASSEMBLY", "Smontaggio"),
    ("BODY_REPAIR", "Riparazione carrozzeria"),
    ("PAINT_PREP", "Preparazione verniciatura"),
    ("PAINT", "Verniciatura"),
    ("ASSEMBLY", "Montaggio"),
]
MECHANICAL_TASKS = [
    ("ACCEPTANCE", "Accettazione e verifica richiesta cliente"),
    ("DIAGNOSTIC", "Diagnosi"),
    ("PARTS", "Approvvigionamento ricambi"),
    ("MECHANICAL_REPAIR", "Riparazione meccanica"),
    ("ROAD_TEST", "Prova su strada"),
]
CLOSING_TASKS = [
    ("QUALITY_CONTROL", "Controllo qualità"),
    ("CLEANING", "Pulizia e preparazione consegna"),
]
BODY_CATEGORIES = {EstimateLineCategory.BODY_LABOR, EstimateLineCategory.PAINT}


def default_tasks(categories: set[EstimateLineCategory]) -> list[tuple[str, str]]:
    """Pick the checklist from the kind of work in the estimate.

    Body/paint lines produce the bodyshop flow; mechanical, electrical, diagnostic
    and parts-only jobs produce the mechanical workshop flow; mixed jobs get both.
    """
    has_body = bool(categories & BODY_CATEGORIES)
    has_mechanical = bool(categories - BODY_CATEGORIES) or not categories
    tasks: list[tuple[str, str]] = []
    if has_mechanical:
        tasks += MECHANICAL_TASKS
    if has_body:
        tasks += BODYSHOP_TASKS
    return tasks + CLOSING_TASKS


def next_work_order_number(db: Session, tenant_id: UUID) -> str:
    year = datetime.now(timezone.utc).year
    count = db.scalar(
        select(func.count(WorkOrder.id)).where(
            WorkOrder.tenant_id == tenant_id,
            WorkOrder.work_order_number.like(f"NC-ODL-{year}-%"),
        )
    ) or 0
    return f"NC-ODL-{year}-{count + 1:06d}"


def open_work_order(db: Session, estimate: Estimate, user_id: UUID | None = None, source: str = "created_from_estimate") -> WorkOrder:
    """Return the estimate's work order, creating it (with its task checklist) if missing.

    The repair case moves to APPROVED so the job shows up in the workers' "Il mio lavoro".
    Does not commit.
    """
    tenant_id = estimate.tenant_id
    existing = db.scalar(select(WorkOrder).where(WorkOrder.tenant_id == tenant_id, WorkOrder.estimate_id == estimate.id))
    if existing is not None:
        return existing
    order = WorkOrder(
        tenant_id=tenant_id,
        repair_case_id=estimate.repair_case_id,
        estimate_id=estimate.id,
        work_order_number=next_work_order_number(db, tenant_id),
        status=WorkOrderStatus.APPROVED,
        priority="NORMAL",
    )
    db.add(order)
    db.flush()
    categories = set(db.scalars(
        select(EstimateLine.category).where(EstimateLine.estimate_id == estimate.id, EstimateLine.tenant_id == tenant_id)
    ).all())
    for index, (task_type, description) in enumerate(default_tasks(categories), start=1):
        db.add(WorkOrderTask(tenant_id=tenant_id, work_order_id=order.id, task_type=task_type, description=description, sort_order=index))
    case = db.scalar(select(RepairCase).where(RepairCase.id == estimate.repair_case_id, RepairCase.tenant_id == tenant_id))
    if case is not None and case.status in (RepairCaseStatus.NEW, RepairCaseStatus.WAITING_APPROVAL):
        case.status = RepairCaseStatus.APPROVED
    record_audit(
        db,
        tenant_id=tenant_id,
        user_id=user_id,
        entity_type="work_order",
        entity_id=order.id,
        action=source,
        new_value={"work_order_number": order.work_order_number, "estimate_id": str(estimate.id)},
    )
    return order
