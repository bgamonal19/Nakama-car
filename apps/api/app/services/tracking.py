"""What the customer sees about a repair: steps, work in progress and chat."""
from datetime import datetime, timedelta, timezone
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models.approval import EstimateApproval
from app.models.estimating import Estimate, EstimateStatus
from app.models.garage import Customer, RepairCase, RepairCaseStatus, Vehicle
from app.models.identity import Tenant, TenantSettings
from app.models.tracking import CaseMessage
from app.models.workshop import WorkOrder, WorkOrderTask, WorkTaskStatus

# Customer-friendly steps; each groups one or more internal statuses.
STEPS: list[tuple[str, str, tuple[RepairCaseStatus, ...]]] = [
    ("ACCEPTED", "Accettazione", (RepairCaseStatus.NEW,)),
    ("ESTIMATE", "Preventivo", (RepairCaseStatus.WAITING_APPROVAL, RepairCaseStatus.APPROVED)),
    ("WORK", "In lavorazione", (
        RepairCaseStatus.WAITING_PARTS, RepairCaseStatus.IN_REPAIR,
        RepairCaseStatus.PAINTING, RepairCaseStatus.ASSEMBLY,
    )),
    ("CHECK", "Controllo qualità", (RepairCaseStatus.QUALITY_CONTROL,)),
    ("READY", "Pronto per il ritiro", (RepairCaseStatus.READY,)),
    ("DELIVERED", "Consegnato", (RepairCaseStatus.DELIVERED, RepairCaseStatus.INVOICED)),
]

STATUS_TEXT = {
    RepairCaseStatus.NEW: "Veicolo accettato in officina",
    RepairCaseStatus.WAITING_APPROVAL: "Preventivo in attesa della tua approvazione",
    RepairCaseStatus.APPROVED: "Preventivo approvato, lavori in programmazione",
    RepairCaseStatus.WAITING_PARTS: "In attesa dei ricambi",
    RepairCaseStatus.IN_REPAIR: "Riparazione in corso",
    RepairCaseStatus.PAINTING: "Verniciatura in corso",
    RepairCaseStatus.ASSEMBLY: "Rimontaggio in corso",
    RepairCaseStatus.QUALITY_CONTROL: "Controllo qualità e prova su strada",
    RepairCaseStatus.READY: "Il veicolo è pronto: puoi passare a ritirarlo",
    RepairCaseStatus.DELIVERED: "Veicolo consegnato",
    RepairCaseStatus.INVOICED: "Veicolo consegnato",
}

CLOSED = (RepairCaseStatus.DELIVERED, RepairCaseStatus.INVOICED)
LINK_DAYS_AFTER_DELIVERY = 30
MESSAGE_MAX_LENGTH = 1000
CUSTOMER_MESSAGES_PER_HOUR = 20


def aware(value: datetime | None) -> datetime | None:
    if value is not None and value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value


def is_closed(case: RepairCase) -> bool:
    return case.status in CLOSED


def link_expired(case: RepairCase) -> bool:
    updated = aware(case.updated_at)
    return is_closed(case) and updated is not None and datetime.now(timezone.utc) - updated > timedelta(days=LINK_DAYS_AFTER_DELIVERY)


def steps_for(status: RepairCaseStatus) -> list[dict]:
    current = next(index for index, step in enumerate(STEPS) if status in step[2])
    return [
        {"code": code, "label": label, "done": index < current or status in CLOSED, "current": index == current}
        for index, (code, label, _) in enumerate(STEPS)
    ]


def customer_display_name(customer: Customer | None) -> str:
    if customer is None:
        return ""
    return customer.company_name or " ".join(filter(None, [customer.first_name, customer.last_name]))


def workshop_info(db: Session, tenant_id: UUID) -> dict:
    tenant = db.get(Tenant, tenant_id)
    company = db.scalar(select(TenantSettings).where(TenantSettings.tenant_id == tenant_id))
    address = None
    if company is not None:
        address = ", ".join(filter(None, [company.address, " ".join(filter(None, [company.postal_code, company.city])), company.province])) or None
    return {
        "chat_status": (company.chat_status if company else None) or "ONLINE",
        "name": (company.company_name if company else None) or (tenant.name if tenant else "Officina"),
        "phone": company.phone if company else None,
        "email": company.email if company else None,
        "address": address,
    }


def plate_spots(db: Session, tenant_id, vehicle: Vehicle | None) -> dict:
    from app.api.v1.renders import plate_spots_for

    return plate_spots_for(db, tenant_id, vehicle.make, vehicle.model) if vehicle else {}


def case_progress(db: Session, case: RepairCase) -> dict:
    """Status, steps, work done and estimate of a repair case, for customer eyes."""
    tenant_id = case.tenant_id
    vehicle = db.scalar(select(Vehicle).where(Vehicle.id == case.vehicle_id, Vehicle.tenant_id == tenant_id))
    tasks = db.execute(
        select(WorkOrderTask.description, WorkOrderTask.status)
        .join(WorkOrder, WorkOrder.id == WorkOrderTask.work_order_id)
        .where(WorkOrder.repair_case_id == case.id, WorkOrder.tenant_id == tenant_id, WorkOrderTask.tenant_id == tenant_id)
        .order_by(WorkOrder.created_at, WorkOrderTask.sort_order, WorkOrderTask.created_at)
    ).all()
    done = sum(1 for task in tasks if task.status == WorkTaskStatus.DONE)
    estimate = db.scalar(
        select(Estimate)
        .where(
            Estimate.repair_case_id == case.id, Estimate.tenant_id == tenant_id,
            Estimate.status.not_in([EstimateStatus.DRAFT, EstimateStatus.SUPERSEDED]),
        )
        .order_by(Estimate.created_at.desc())
        .limit(1)
    )
    estimate_info = None
    if estimate is not None:
        approval = db.scalar(select(EstimateApproval).where(EstimateApproval.estimate_id == estimate.id, EstimateApproval.tenant_id == tenant_id))
        estimate_info = {
            "estimate_number": estimate.estimate_number,
            "status": estimate.status.value,
            "total": str(estimate.total),
            "approval_path": f"/public/estimate/{approval.public_token}" if approval else None,
        }
    return {
        "case_number": case.case_number,
        "status": case.status.value,
        "status_text": STATUS_TEXT[case.status],
        "steps": steps_for(case.status),
        "closed": is_closed(case),
        "opened_at": case.opened_at or case.created_at,
        "updated_at": case.updated_at,
        "vehicle": {
            "license_plate": vehicle.license_plate if vehicle else "",
            "make": vehicle.make if vehicle else None,
            "model": vehicle.model if vehicle else None,
            "year": vehicle.year if vehicle else None,
            "color": vehicle.color_name if vehicle else None,
            "plate_spots": plate_spots(db, case.tenant_id, vehicle),
        },
        "tasks": [{"description": task.description, "status": task.status.value} for task in tasks],
        "tasks_done": done,
        "tasks_total": len(tasks),
        "estimate": estimate_info,
    }


def message_status(message: CaseMessage) -> str:
    """WhatsApp-like ticks: sent ✓, delivered ✓✓, read ✓✓ (blue)."""
    if message.read_at is not None:
        return "read"
    if message.delivered_at is not None:
        return "delivered"
    return "sent"


def message_dict(message: CaseMessage) -> dict:
    return {
        "id": str(message.id),
        "sender": message.sender,
        "author_name": message.author_name,
        "body": message.body,
        "created_at": message.created_at,
        "read": message.read_at is not None,
        "status": message_status(message),
    }


def mark_messages(messages, *, reader: str, read: bool) -> bool:
    """The other side's messages reached ``reader`` (delivered) or were seen (read)."""
    now = datetime.now(timezone.utc)
    changed = False
    for message in messages:
        if message.sender == reader:
            continue
        if message.delivered_at is None:
            message.delivered_at = now
            changed = True
        if read and message.read_at is None:
            message.read_at = now
            changed = True
    return changed


def list_messages(db: Session, case: RepairCase, *, reader: str, read: bool = True) -> list[dict]:
    """Messages of a case; the other side's ones become delivered, and read when the chat is open."""
    messages = db.scalars(
        select(CaseMessage)
        .where(CaseMessage.repair_case_id == case.id, CaseMessage.tenant_id == case.tenant_id)
        .order_by(CaseMessage.created_at, CaseMessage.id)
    ).all()
    if mark_messages(messages, reader=reader, read=read):
        db.commit()
    return [message_dict(message) for message in messages]


def new_message(db: Session, case: RepairCase, *, sender: str, author_name: str | None, body: str) -> CaseMessage:
    """Add a chat message, always stamped after the previous one so the thread keeps its order."""
    last = db.scalar(
        select(func.max(CaseMessage.created_at)).where(CaseMessage.repair_case_id == case.id, CaseMessage.tenant_id == case.tenant_id)
    )
    stamp = datetime.now(timezone.utc)
    last = aware(last)
    if last is not None and stamp <= last:
        stamp = last + timedelta(microseconds=1)
    message = CaseMessage(
        tenant_id=case.tenant_id, repair_case_id=case.id, sender=sender,
        author_name=(author_name or None) and author_name[:120], body=body, created_at=stamp,
    )
    db.add(message)
    db.commit()
    db.refresh(message)
    return message


def clean_body(body: str) -> str:
    text = (body or "").strip()
    if not text:
        raise ValueError("Scrivi un messaggio.")
    if len(text) > MESSAGE_MAX_LENGTH:
        raise ValueError(f"Messaggio troppo lungo (max {MESSAGE_MAX_LENGTH} caratteri).")
    return text


def customer_messages_last_hour(db: Session, case: RepairCase) -> int:
    since = datetime.now(timezone.utc) - timedelta(hours=1)
    return db.scalar(
        select(func.count(CaseMessage.id)).where(
            CaseMessage.repair_case_id == case.id, CaseMessage.tenant_id == case.tenant_id,
            CaseMessage.sender == "CUSTOMER", CaseMessage.created_at >= since,
        )
    ) or 0


def customer_markers(db: Session, case: RepairCase) -> list[dict]:
    """Damage pins of the case as the customer sees them (no internal notes)."""
    from app.models.renders import DamageMarker

    markers = db.scalars(
        select(DamageMarker)
        .where(DamageMarker.repair_case_id == case.id, DamageMarker.tenant_id == case.tenant_id)
        .order_by(DamageMarker.created_at, DamageMarker.id)
    ).all()
    return [
        {"id": str(marker.id), "view": marker.view, "x": float(marker.x), "y": float(marker.y), "operation": marker.operation, "area_label": marker.area_label}
        for marker in markers
    ]


def case_render(db: Session, case: RepairCase, view: str):
    """Studio picture of the case vehicle (same cache the workshop uses)."""
    from fastapi import HTTPException

    from app.api.v1.renders import serve_render

    vehicle = db.scalar(select(Vehicle).where(Vehicle.id == case.vehicle_id, Vehicle.tenant_id == case.tenant_id))
    if vehicle is None or not (vehicle.make and vehicle.model):
        raise HTTPException(status_code=404, detail="Vehicle not in render catalog")
    return serve_render(db, case.tenant_id, make=vehicle.make, model=vehicle.model, year=vehicle.year, color=vehicle.color_name, view=view)


CUSTOMER_PHOTO_EXCLUDED = ("DOCUMENT",)


def customer_photos(db: Session, case: RepairCase) -> list[dict]:
    """Photos of the case the customer may see (vehicle and damage pictures, no documents)."""
    from app.models.media import DB_STORAGE_PREFIX, Media, MediaType

    photos = db.scalars(
        select(Media)
        .where(
            Media.repair_case_id == case.id, Media.tenant_id == case.tenant_id, Media.media_type == MediaType.PHOTO,
            Media.storage_key.startswith(DB_STORAGE_PREFIX),
        )
        .order_by(Media.created_at, Media.id)
    ).all()
    return [
        {
            "id": str(photo.id), "category": photo.category.value,
            "damage_marker_id": str(photo.damage_marker_id) if photo.damage_marker_id else None,
            "created_at": photo.created_at,
        }
        for photo in photos if photo.category.value not in CUSTOMER_PHOTO_EXCLUDED
    ]


def customer_photo_content(db: Session, case: RepairCase, media_id):
    from fastapi import HTTPException, Response

    from app.models.media import Media, MediaType

    photo = db.scalar(select(Media).where(
        Media.id == media_id, Media.repair_case_id == case.id, Media.tenant_id == case.tenant_id, Media.media_type == MediaType.PHOTO,
    ))
    if photo is None or photo.category.value in CUSTOMER_PHOTO_EXCLUDED or not photo.in_database or not photo.content:
        raise HTTPException(status_code=404, detail="Photo not found")
    return Response(content=photo.content, media_type=photo.mime_type or "image/webp", headers={"Cache-Control": "private, max-age=86400"})
