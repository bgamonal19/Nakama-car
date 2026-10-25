"""Read-only workshop scene. Positions are illustrative, never physical tracking."""
from datetime import date, datetime, time, timedelta, timezone
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app.db.deps import get_db
from app.models.garage import RepairCase, RepairCaseStatus, Vehicle
from app.models.identity import AuditLog
from app.models.workshop import WorkOrder, WorkOrderTask
from app.security.context import AuthContext, require_permission
from app.services.staff import user_area

router = APIRouter(prefix="/workshop-scene", tags=["workshop-scene"])
ROME = ZoneInfo("Europe/Rome")
CLOSED = [RepairCaseStatus.DELIVERED, RepairCaseStatus.INVOICED]


def iso(value: datetime) -> str:
    return (value.replace(tzinfo=timezone.utc) if value.tzinfo is None else value).isoformat()


def day_bounds(day: date):
    start = datetime.combine(day, time.min, ROME)
    return start.astimezone(timezone.utc), (start + timedelta(days=1)).astimezone(timezone.utc)


@router.get("")
def scene_snapshot(day: date | None = None, db: Session = Depends(get_db),
                   auth: AuthContext = Depends(require_permission("work_order.read"))):
    if user_area(db, auth.user_id, auth.tenant_id) == "BODY":
        raise HTTPException(403, "Vista riservata all'area meccanica")
    selected = day or datetime.now(ROME).date()
    if selected > datetime.now(ROME).date():
        raise HTTPException(422, "La data non può essere futura")
    start, end = day_bounds(selected)
    # Include historical participants, not only vehicles still present now.
    rows = db.execute(select(RepairCase, Vehicle).join(Vehicle, Vehicle.id == RepairCase.vehicle_id)
        .where(RepairCase.tenant_id == auth.tenant_id, Vehicle.tenant_id == auth.tenant_id,
               RepairCase.work_type == "MECHANICAL", RepairCase.created_at < end,
               or_(RepairCase.status.notin_(CLOSED), RepairCase.updated_at >= start))
        .order_by(RepairCase.created_at.desc(), RepairCase.id.desc()).limit(1001)).all()
    truncated = len(rows) > 1000
    rows = rows[:1000]
    ids = [case.id for case, _ in rows]
    orders = db.scalars(select(WorkOrder).where(WorkOrder.tenant_id == auth.tenant_id,
        WorkOrder.repair_case_id.in_(ids)).order_by(WorkOrder.created_at, WorkOrder.id)).all() if ids else []
    order_cases = {order.id: order.repair_case_id for order in orders}
    tasks = db.scalars(select(WorkOrderTask).where(WorkOrderTask.tenant_id == auth.tenant_id,
        WorkOrderTask.work_order_id.in_(order_cases))).all() if orders else []
    task_cases = {task.id: order_cases[task.work_order_id] for task in tasks}
    logs = db.scalars(select(AuditLog).where(AuditLog.tenant_id == auth.tenant_id,
        AuditLog.created_at >= start, AuditLog.created_at < end,
        or_((AuditLog.entity_type == "work_order") & AuditLog.entity_id.in_(order_cases),
            (AuditLog.entity_type == "work_task") & AuditLog.entity_id.in_(task_cases)),
        AuditLog.action == "status_changed", AuditLog.field_name == "status")
        .order_by(AuditLog.created_at, AuditLog.id).limit(2001)).all() if orders else []
    truncated = truncated or len(logs) > 2000
    # Earliest audited change at/after midnight identifies the pre-event status.
    initial = {}
    if orders:
        for log in db.scalars(select(AuditLog).where(AuditLog.tenant_id == auth.tenant_id,
            AuditLog.entity_type == "work_order", AuditLog.entity_id.in_(order_cases),
            AuditLog.action == "status_changed", AuditLog.field_name == "status",
            AuditLog.created_at >= start).order_by(AuditLog.created_at, AuditLog.id)).all():
            initial.setdefault(order_cases[log.entity_id], log.old_value)
    events = []
    for case, _ in rows:
        created = case.created_at.replace(tzinfo=timezone.utc) if case.created_at.tzinfo is None else case.created_at
        if start <= created < end:
            events.append({"id": f"case:{case.id}", "case_id": str(case.id), "at": iso(created),
                           "kind": "opened", "before": None, "after": "NEW"})
    for log in logs[:2000]:
        mapping = order_cases if log.entity_type == "work_order" else task_cases
        events.append({"id": str(log.id), "case_id": str(mapping[log.entity_id]), "at": iso(log.created_at),
                       "kind": "status" if log.entity_type == "work_order" else "task",
                       "before": log.old_value, "after": log.new_value})
    events.sort(key=lambda event: (event["at"], event["id"]))
    return {"day": selected.isoformat(), "timezone": "Europe/Rome", "generated_at": iso(datetime.now(timezone.utc)),
        "truncated": truncated, "positions_are_illustrative": True,
        "vehicles": [{"case_id": str(case.id), "vehicle_id": str(vehicle.id), "case_number": case.case_number,
            "plate": vehicle.license_plate, "make": vehicle.make, "model": vehicle.model,
            "version": vehicle.version, "year": vehicle.year, "color": vehicle.color_name,
            "category": vehicle.vehicle_category, "status": case.status.value,
            "initial_status": initial.get(case.id, case.status.value),
            "created_at": iso(case.created_at)} for case, vehicle in rows], "events": events}
