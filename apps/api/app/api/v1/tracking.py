"""Customer tracking link + chat for a repair case (staff side and public side)."""
import secrets
from datetime import datetime, timezone
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Path, status
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.db.deps import get_db
from app.models.garage import Customer, RepairCase, Vehicle
from app.models.identity import User
from app.models.tracking import CaseMessage, CaseTrackingLink
from app.security.context import AuthContext, require_permission
from app.services import tracking

router = APIRouter(tags=["tracking"])


class MessageCreate(BaseModel):
    body: str = Field(min_length=1, max_length=tracking.MESSAGE_MAX_LENGTH)
    author_name: str | None = Field(default=None, max_length=120)


def get_case(db: Session, tenant_id: UUID, case_id: UUID) -> RepairCase:
    case = db.scalar(select(RepairCase).where(RepairCase.id == case_id, RepairCase.tenant_id == tenant_id))
    if case is None:
        raise HTTPException(status_code=404, detail="Repair case not found")
    return case


def link_payload(db: Session, case: RepairCase, link: CaseTrackingLink | None) -> dict:
    customer = db.scalar(select(Customer).where(Customer.id == case.customer_id, Customer.tenant_id == case.tenant_id))
    return {
        "active": bool(link and link.active),
        "public_token": link.public_token if link and link.active else None,
        "public_path": f"/segui/{link.public_token}" if link and link.active else None,
        "last_viewed_at": link.last_viewed_at if link else None,
        "customer_name": tracking.customer_display_name(customer),
        "customer_phone": customer.phone if customer else None,
        "customer_email": customer.email if customer else None,
    }


@router.get("/cases/{case_id}/tracking-link")
def get_tracking_link(case_id: UUID, db: Session = Depends(get_db), auth: AuthContext = Depends(require_permission("case.read"))):
    case = get_case(db, auth.tenant_id, case_id)
    link = db.scalar(select(CaseTrackingLink).where(CaseTrackingLink.repair_case_id == case.id, CaseTrackingLink.tenant_id == auth.tenant_id))
    return link_payload(db, case, link)


@router.post("/cases/{case_id}/tracking-link")
def create_tracking_link(case_id: UUID, db: Session = Depends(get_db), auth: AuthContext = Depends(require_permission("case.update"))):
    case = get_case(db, auth.tenant_id, case_id)
    link = db.scalar(select(CaseTrackingLink).where(CaseTrackingLink.repair_case_id == case.id, CaseTrackingLink.tenant_id == auth.tenant_id))
    if link is None:
        link = CaseTrackingLink(tenant_id=auth.tenant_id, repair_case_id=case.id, public_token=secrets.token_urlsafe(24), active=True)
        db.add(link)
    elif not link.active:
        # A revoked link is never reused: a new address is issued.
        link.public_token = secrets.token_urlsafe(24)
        link.active = True
        link.last_viewed_at = None
    db.commit()
    db.refresh(link)
    return link_payload(db, case, link)


@router.delete("/cases/{case_id}/tracking-link")
def revoke_tracking_link(case_id: UUID, db: Session = Depends(get_db), auth: AuthContext = Depends(require_permission("case.update"))):
    case = get_case(db, auth.tenant_id, case_id)
    link = db.scalar(select(CaseTrackingLink).where(CaseTrackingLink.repair_case_id == case.id, CaseTrackingLink.tenant_id == auth.tenant_id))
    if link is not None:
        link.active = False
        db.commit()
    return link_payload(db, case, link)


@router.get("/cases/{case_id}/messages")
def staff_messages(case_id: UUID, read: bool = True, db: Session = Depends(get_db), auth: AuthContext = Depends(require_permission("case.read"))):
    return tracking.list_messages(db, get_case(db, auth.tenant_id, case_id), reader="WORKSHOP", read=read)


@router.post("/cases/{case_id}/messages", status_code=status.HTTP_201_CREATED)
def staff_send_message(case_id: UUID, payload: MessageCreate, db: Session = Depends(get_db), auth: AuthContext = Depends(require_permission("case.update"))):
    case = get_case(db, auth.tenant_id, case_id)
    try:
        body = tracking.clean_body(payload.body)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    user = db.get(User, auth.user_id)
    message = tracking.new_message(db, case, sender="WORKSHOP", author_name=user.first_name if user else None, body=body)
    return tracking.message_dict(message)


@router.get("/messages/unread")
def unread_messages(db: Session = Depends(get_db), auth: AuthContext = Depends(require_permission("case.read"))):
    """Cases with customer messages the workshop has not read yet."""
    rows = db.execute(
        select(
            RepairCase.id, RepairCase.case_number, Vehicle.license_plate,
            func.count(CaseMessage.id), func.max(CaseMessage.created_at),
        )
        .join(RepairCase, RepairCase.id == CaseMessage.repair_case_id)
        .join(Vehicle, Vehicle.id == RepairCase.vehicle_id)
        .where(CaseMessage.tenant_id == auth.tenant_id, CaseMessage.sender == "CUSTOMER", CaseMessage.read_at.is_(None))
        .group_by(RepairCase.id, RepairCase.case_number, Vehicle.license_plate)
        .order_by(func.max(CaseMessage.created_at).desc())
    ).all()
    # The workshop app received them: customers see the double tick.
    pending = db.scalars(select(CaseMessage).where(
        CaseMessage.tenant_id == auth.tenant_id, CaseMessage.sender == "CUSTOMER", CaseMessage.delivered_at.is_(None),
    )).all()
    if tracking.mark_messages(pending, reader="WORKSHOP", read=False):
        db.commit()
    return [
        {"repair_case_id": str(row[0]), "case_number": row[1], "plate": row[2], "unread": row[3], "last_at": row[4]}
        for row in rows
    ]


# ---- public side (no login: the token is the key) ----

def public_case(db: Session, token: str) -> tuple[CaseTrackingLink, RepairCase]:
    link = db.scalar(select(CaseTrackingLink).where(CaseTrackingLink.public_token == token))
    if link is None or not link.active:
        raise HTTPException(status_code=404, detail="Link non valido")
    case = db.scalar(select(RepairCase).where(RepairCase.id == link.repair_case_id, RepairCase.tenant_id == link.tenant_id))
    if case is None or tracking.link_expired(case):
        raise HTTPException(status_code=404, detail="Link scaduto")
    return link, case


@router.get("/public/tracking/{token}")
def public_tracking(token: str, db: Session = Depends(get_db)):
    link, case = public_case(db, token)
    customer = db.scalar(select(Customer).where(Customer.id == case.customer_id, Customer.tenant_id == case.tenant_id))
    progress = tracking.case_progress(db, case)
    link.last_viewed_at = datetime.now(timezone.utc)
    db.commit()
    unread = db.scalar(
        select(func.count(CaseMessage.id)).where(
            CaseMessage.repair_case_id == case.id, CaseMessage.tenant_id == case.tenant_id,
            CaseMessage.sender == "WORKSHOP", CaseMessage.read_at.is_(None),
        )
    ) or 0
    first_name = (customer.first_name or customer.company_name or "") if customer else ""
    return {**progress, "customer_name": first_name, "workshop": tracking.workshop_info(db, case.tenant_id), "unread": unread}


@router.get("/public/tracking/{token}/messages")
def public_messages(token: str, read: bool = True, db: Session = Depends(get_db)):
    _, case = public_case(db, token)
    return tracking.list_messages(db, case, reader="CUSTOMER", read=read)


@router.post("/public/tracking/{token}/messages", status_code=status.HTTP_201_CREATED)
def public_send_message(token: str, payload: MessageCreate, db: Session = Depends(get_db)):
    _, case = public_case(db, token)
    if tracking.is_closed(case):
        raise HTTPException(status_code=409, detail="La pratica è chiusa: contatta l'officina per telefono.")
    try:
        body = tracking.clean_body(payload.body)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    if tracking.customer_messages_last_hour(db, case) >= tracking.CUSTOMER_MESSAGES_PER_HOUR:
        raise HTTPException(status_code=429, detail="Troppi messaggi: riprova tra poco.")
    customer = db.scalar(select(Customer).where(Customer.id == case.customer_id, Customer.tenant_id == case.tenant_id))
    name = (payload.author_name or "").strip() or tracking.customer_display_name(customer) or "Cliente"
    message = tracking.new_message(db, case, sender="CUSTOMER", author_name=name, body=body)
    return tracking.message_dict(message)


VIEW = Path(pattern="^(front|front-3-4|side|rear-3-4|rear|rear-3-4-right|side-right|front-3-4-right|top)$")


@router.get("/public/tracking/{token}/damage-markers")
def public_markers(token: str, db: Session = Depends(get_db)):
    _, case = public_case(db, token)
    return tracking.customer_markers(db, case)


@router.get("/public/tracking/{token}/renders/{view}")
def public_render(token: str, view: str = VIEW, db: Session = Depends(get_db)):
    _, case = public_case(db, token)
    return tracking.case_render(db, case, view)


@router.get("/public/tracking/{token}/photos")
def public_photos(token: str, db: Session = Depends(get_db)):
    _, case = public_case(db, token)
    return tracking.customer_photos(db, case)


@router.get("/public/tracking/{token}/photos/{media_id}")
def public_photo(token: str, media_id: UUID, db: Session = Depends(get_db)):
    _, case = public_case(db, token)
    return tracking.customer_photo_content(db, case, media_id)
