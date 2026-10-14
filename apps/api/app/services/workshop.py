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


# Estimate lines that are not a job to tick (consumables, disposal fees).
NOT_A_JOB = {EstimateLineCategory.MATERIAL, EstimateLineCategory.DISPOSAL}
# Body jobs go to the body shop, everything else to the mechanics.
ITEM_BODY, ITEM_MECHANICAL = "ITEM_BODY", "ITEM_MECHANICAL"


def estimate_lines(db: Session, estimate: Estimate) -> list[EstimateLine]:
    return list(db.scalars(
        select(EstimateLine).where(EstimateLine.estimate_id == estimate.id, EstimateLine.tenant_id == estimate.tenant_id)
        .order_by(EstimateLine.created_at)
    ).all())


def is_generic_labor(line: EstimateLine) -> bool:
    """Plain hours ("Manodopera (NC-DIA-…)") are not a job of their own: the steps above cover them."""
    return (line.description or "").lower().startswith("manodopera")


def item_description(line: EstimateLine) -> str:
    """What the worker reads on the button: "Sostituzione Pastiglie anteriori", "Verniciatura Portiera"…"""
    text = (line.description or line.part or "").strip()
    if line.category == EstimateLineCategory.PART and not text.lower().startswith(("sostitu", "cambio", "montaggio")):
        text = f"Sostituzione {text}"
    elif line.category == EstimateLineCategory.PAINT and not text.lower().startswith("vernic"):
        text = f"Verniciatura {text}"
    if line.quantity and line.quantity != 1:
        text = f"{text} ×{line.quantity.normalize():f}"
    return text[:255]


def add_item_tasks(db: Session, order: WorkOrder, lines: list[EstimateLine], start: int = 0) -> int:
    """One task per part/job in the estimate, so the worker ticks exactly what was approved."""
    index = start
    for line in lines:
        if line.category in NOT_A_JOB or not (line.description or line.part) or is_generic_labor(line):
            continue
        index += 1
        db.add(WorkOrderTask(
            tenant_id=order.tenant_id, work_order_id=order.id,
            task_type=ITEM_BODY if line.category in BODY_CATEGORIES else ITEM_MECHANICAL,
            description=item_description(line), sort_order=index, estimate_line_id=line.id,
        ))
    return index


def ensure_item_tasks(db: Session, order: WorkOrder) -> bool:
    """Older work orders were opened without per-part tasks: add them once (before the closing checks)."""
    if order.estimate_id is None:
        return False
    has_items = db.scalar(select(func.count(WorkOrderTask.id)).where(
        WorkOrderTask.work_order_id == order.id, WorkOrderTask.estimate_line_id.is_not(None),
    ))
    if has_items:
        return False
    estimate = db.get(Estimate, order.estimate_id)
    lines = estimate_lines(db, estimate) if estimate else []
    if not any(line.category not in NOT_A_JOB and not is_generic_labor(line) for line in lines):
        return False
    closing = [task_type for task_type, _ in CLOSING_TASKS]
    tasks = list(db.scalars(select(WorkOrderTask).where(WorkOrderTask.work_order_id == order.id).order_by(WorkOrderTask.sort_order)).all())
    opening = [task for task in tasks if task.task_type not in closing]
    start = max((task.sort_order for task in opening), default=0)
    end = add_item_tasks(db, order, lines, start=start)
    for offset, task in enumerate([task for task in tasks if task.task_type in closing], start=1):
        task.sort_order = end + offset
    return True


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
    lines = estimate_lines(db, estimate)
    flow = default_tasks({line.category for line in lines})
    # Generic flow, then one button per part/job of the estimate, then the closing checks.
    opening = [task for task in flow if task not in CLOSING_TASKS]
    index = 0
    for task_type, description in opening:
        index += 1
        db.add(WorkOrderTask(tenant_id=tenant_id, work_order_id=order.id, task_type=task_type, description=description, sort_order=index))
    index = add_item_tasks(db, order, lines, start=index)
    for task_type, description in CLOSING_TASKS:
        index += 1
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
