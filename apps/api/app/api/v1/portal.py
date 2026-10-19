"""Fleet customer portal: the workshop creates logins, the customer follows its vehicles."""
import re
import secrets
import string
from dataclasses import dataclass
from datetime import date, datetime, timedelta, timezone
from io import BytesIO
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Path, status
from fastapi.responses import StreamingResponse
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.api.v1.billing import invoice_context, invoice_lines, tenant_settings
from app.core.config import get_settings
from app.db.deps import get_db
from app.models.approval import EstimateApproval
from app.models.billing import Invoice, InvoiceStatus
from app.models.contracts import ServiceContract
from app.models.estimating import Estimate, EstimateStatus
from app.models.garage import Customer, RepairCase, Vehicle
from app.models.portal import PortalAccount
from app.models.tracking import CaseMessage
from app.security.context import AuthContext, require_permission
from app.security.passwords import hash_password, verify_password
from app.services import fleet, tracking
from app.services.pdf import build_invoice_pdf
from app.services.integrations import latest_reading
from app.services.maintenance import maintenance_status

router = APIRouter(tags=["portal"])
settings = get_settings()
bearer = HTTPBearer(auto_error=False)
PORTAL_TOKEN_HOURS = 12


# ---------- schemas ----------

class PortalAccountCreate(BaseModel):
    email: EmailStr
    full_name: str = Field(min_length=2, max_length=160)


class PortalAccountUpdate(BaseModel):
    active: bool | None = None
    full_name: str | None = Field(default=None, min_length=2, max_length=160)


class MaintenanceUpdate(BaseModel):
    mileage: int | None = Field(default=None, ge=0)
    service_interval_km: int | None = Field(default=None, ge=0, le=500000)
    service_interval_months: int | None = Field(default=None, ge=0, le=120)
    last_service_date: date | None = None
    last_service_km: int | None = Field(default=None, ge=0)
    next_service_date: date | None = None
    next_service_km: int | None = Field(default=None, ge=0)


class PortalLogin(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=200)


class PasswordChange(BaseModel):
    current_password: str = Field(min_length=1, max_length=200)
    new_password: str = Field(min_length=10, max_length=200)


class MessageCreate(BaseModel):
    body: str = Field(min_length=1, max_length=tracking.MESSAGE_MAX_LENGTH)


class PortalVehicleCreate(BaseModel):
    license_plate: str = Field(min_length=4, max_length=20)
    make: str | None = Field(default=None, max_length=120)
    model: str | None = Field(default=None, max_length=120)
    year: int | None = Field(default=None, ge=1950, le=2100)
    fleet_number: str | None = Field(default=None, max_length=40)
    vin: str | None = Field(default=None, max_length=32)
    mileage: int | None = Field(default=None, ge=0)
    fuel_type: str | None = Field(default=None, max_length=40)


class PortalProfileUpdate(BaseModel):
    """Contact data the customer keeps up to date; tax data stays with the workshop."""
    full_name: str | None = Field(default=None, min_length=2, max_length=160)
    phone: str | None = Field(default=None, max_length=32)
    email: EmailStr | None = None
    pec: EmailStr | None = None
    address: str | None = Field(default=None, max_length=255)
    city: str | None = Field(default=None, max_length=120)
    province: str | None = Field(default=None, max_length=8)
    postal_code: str | None = Field(default=None, max_length=16)


CUSTOMER_CONTACT_FIELDS = ("phone", "email", "pec", "address", "city", "province", "postal_code")


# The customer sees estimates once the workshop has sent them, and only issued invoices.
CUSTOMER_ESTIMATES = (EstimateStatus.SENT, EstimateStatus.VIEWED, EstimateStatus.APPROVED, EstimateStatus.REJECTED, EstimateStatus.EXPIRED)
CUSTOMER_INVOICES = (InvoiceStatus.ISSUED, InvoiceStatus.PAID)


# ---------- helpers ----------

def temporary_password() -> str:
    alphabet = string.ascii_letters + string.digits
    while True:
        value = "".join(secrets.choice(alphabet) for _ in range(12))
        if any(c.isdigit() for c in value) and any(c.isupper() for c in value) and any(c.islower() for c in value):
            return value


def account_dict(account: PortalAccount) -> dict:
    return {
        "id": str(account.id),
        "customer_id": str(account.customer_id),
        "email": account.email,
        "full_name": account.full_name,
        "active": account.active,
        "must_change_password": account.must_change_password,
        "last_login_at": account.last_login_at,
        "created_at": account.created_at,
    }


def staff_customer(db: Session, tenant_id: UUID, customer_id: UUID) -> Customer:
    customer = db.scalar(select(Customer).where(Customer.id == customer_id, Customer.tenant_id == tenant_id))
    if customer is None:
        raise HTTPException(status_code=404, detail="Customer not found")
    return customer


def staff_account(db: Session, tenant_id: UUID, account_id: UUID) -> PortalAccount:
    account = db.scalar(select(PortalAccount).where(PortalAccount.id == account_id, PortalAccount.tenant_id == tenant_id))
    if account is None:
        raise HTTPException(status_code=404, detail="Portal account not found")
    return account


def open_case(db: Session, vehicle: Vehicle) -> RepairCase | None:
    return db.scalar(
        select(RepairCase)
        .where(RepairCase.vehicle_id == vehicle.id, RepairCase.tenant_id == vehicle.tenant_id, RepairCase.status.not_in(tracking.CLOSED))
        .order_by(RepairCase.created_at.desc())
        .limit(1)
    )


def vehicle_summary(db: Session, vehicle: Vehicle) -> dict:
    case = open_case(db, vehicle)
    current = None
    if case is not None:
        progress = tracking.case_progress(db, case)
        current = {
            "id": str(case.id),
            "case_number": case.case_number,
            "status": case.status.value,
            "status_text": progress["status_text"],
            "tasks_done": progress["tasks_done"],
            "tasks_total": progress["tasks_total"],
            "opened_at": progress["opened_at"],
        }
    return {
        "id": str(vehicle.id),
        "license_plate": vehicle.license_plate,
        "make": vehicle.make,
        "model": vehicle.model,
        "year": vehicle.year,
        "fleet_number": vehicle.fleet_number,
        "vehicle_category": vehicle.vehicle_category,
        "mileage": vehicle.mileage,
        "color": vehicle.color_name,
        "maintenance": maintenance_status(vehicle),
        "telemetry": latest_reading(db, vehicle),
        "current_case": current,
    }


# ---------- staff side ----------

@router.get("/customers/{customer_id}/portal-accounts")
def list_portal_accounts(customer_id: UUID, db: Session = Depends(get_db), auth: AuthContext = Depends(require_permission("customer.read"))):
    staff_customer(db, auth.tenant_id, customer_id)
    accounts = db.scalars(
        select(PortalAccount).where(PortalAccount.customer_id == customer_id, PortalAccount.tenant_id == auth.tenant_id).order_by(PortalAccount.created_at)
    ).all()
    return [account_dict(account) for account in accounts]


@router.post("/customers/{customer_id}/portal-accounts", status_code=status.HTTP_201_CREATED)
def create_portal_account(customer_id: UUID, payload: PortalAccountCreate, db: Session = Depends(get_db), auth: AuthContext = Depends(require_permission("customer.write"))):
    staff_customer(db, auth.tenant_id, customer_id)
    email = payload.email.lower()
    if db.scalar(select(PortalAccount.id).where(func.lower(PortalAccount.email) == email)):
        raise HTTPException(status_code=409, detail="Esiste già un accesso con questa email.")
    password = temporary_password()
    account = PortalAccount(
        tenant_id=auth.tenant_id, customer_id=customer_id, email=email, full_name=payload.full_name.strip(),
        password_hash=hash_password(password), active=True, must_change_password=True,
    )
    db.add(account)
    db.commit()
    db.refresh(account)
    # The temporary password is shown only once, to hand it to the customer.
    return {**account_dict(account), "temporary_password": password}


@router.patch("/portal-accounts/{account_id}")
def update_portal_account(account_id: UUID, payload: PortalAccountUpdate, db: Session = Depends(get_db), auth: AuthContext = Depends(require_permission("customer.write"))):
    account = staff_account(db, auth.tenant_id, account_id)
    if payload.full_name is not None:
        account.full_name = payload.full_name.strip()
    if payload.active is not None and payload.active != account.active:
        account.active = payload.active
        account.auth_version += 1
    db.commit()
    db.refresh(account)
    return account_dict(account)


@router.post("/portal-accounts/{account_id}/reset-password")
def reset_portal_password(account_id: UUID, db: Session = Depends(get_db), auth: AuthContext = Depends(require_permission("customer.write"))):
    account = staff_account(db, auth.tenant_id, account_id)
    password = temporary_password()
    account.password_hash = hash_password(password)
    account.must_change_password = True
    account.auth_version += 1
    db.commit()
    db.refresh(account)
    return {**account_dict(account), "temporary_password": password}


@router.get("/customers/{customer_id}/fleet-vehicles")
def staff_fleet_vehicles(customer_id: UUID, db: Session = Depends(get_db), auth: AuthContext = Depends(require_permission("vehicle.read"))):
    staff_customer(db, auth.tenant_id, customer_id)
    vehicles = db.scalars(
        select(Vehicle).where(Vehicle.customer_id == customer_id, Vehicle.tenant_id == auth.tenant_id).order_by(Vehicle.fleet_number, Vehicle.license_plate)
    ).all()
    return [vehicle_summary(db, vehicle) for vehicle in vehicles]


@router.patch("/vehicles/{vehicle_id}/maintenance")
def update_maintenance(vehicle_id: UUID, payload: MaintenanceUpdate, db: Session = Depends(get_db), auth: AuthContext = Depends(require_permission("vehicle.write"))):
    vehicle = db.scalar(select(Vehicle).where(Vehicle.id == vehicle_id, Vehicle.tenant_id == auth.tenant_id))
    if vehicle is None:
        raise HTTPException(status_code=404, detail="Vehicle not found")
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(vehicle, field, value)
    db.commit()
    db.refresh(vehicle)
    return vehicle_summary(db, vehicle)


# ---------- customer side ----------

@dataclass(frozen=True, slots=True)
class PortalContext:
    account_id: UUID
    tenant_id: UUID
    customer_id: UUID


def portal_token(account: PortalAccount) -> str:
    now = datetime.now(timezone.utc)
    return jwt.encode({
        "sub": str(account.id),
        "tenant_id": str(account.tenant_id),
        "customer_id": str(account.customer_id),
        "type": "portal",
        "auth_version": account.auth_version,
        "iat": int(now.timestamp()),
        "exp": int((now + timedelta(hours=PORTAL_TOKEN_HOURS)).timestamp()),
    }, settings.jwt_secret, algorithm=settings.jwt_algorithm)


def get_portal_context(credentials: HTTPAuthorizationCredentials | None = Depends(bearer), db: Session = Depends(get_db)) -> PortalContext:
    if credentials is None:
        raise HTTPException(status_code=401, detail="Authentication required")
    try:
        payload = jwt.decode(credentials.credentials, settings.jwt_secret, algorithms=[settings.jwt_algorithm])
        if payload.get("type") != "portal":
            raise ValueError("wrong token")
        account = db.get(PortalAccount, UUID(payload["sub"]))
        if account is None or not account.active or account.auth_version != payload.get("auth_version"):
            raise ValueError("revoked")
        return PortalContext(account_id=account.id, tenant_id=account.tenant_id, customer_id=account.customer_id)
    except (JWTError, KeyError, ValueError):
        raise HTTPException(status_code=401, detail="Invalid token")


def portal_vehicle(db: Session, context: PortalContext, vehicle_id: UUID) -> Vehicle:
    vehicle = db.scalar(select(Vehicle).where(
        Vehicle.id == vehicle_id, Vehicle.tenant_id == context.tenant_id, Vehicle.customer_id == context.customer_id,
    ))
    if vehicle is None:
        raise HTTPException(status_code=404, detail="Vehicle not found")
    return vehicle


def portal_case(db: Session, context: PortalContext, case_id: UUID) -> RepairCase:
    case = db.scalar(select(RepairCase).where(
        RepairCase.id == case_id, RepairCase.tenant_id == context.tenant_id, RepairCase.customer_id == context.customer_id,
    ))
    if case is None:
        raise HTTPException(status_code=404, detail="Repair case not found")
    return case


@router.post("/portal/auth/login")
def portal_login(payload: PortalLogin, db: Session = Depends(get_db)):
    account = db.scalar(select(PortalAccount).where(func.lower(PortalAccount.email) == payload.email.lower()))
    if account is None or not account.active or not verify_password(account.password_hash, payload.password):
        raise HTTPException(status_code=401, detail="Email o password non corretti.")
    account.last_login_at = datetime.now(timezone.utc)
    db.commit()
    return {"access_token": portal_token(account), "full_name": account.full_name, "must_change_password": account.must_change_password}


@router.post("/portal/password")
def portal_change_password(payload: PasswordChange, db: Session = Depends(get_db), context: PortalContext = Depends(get_portal_context)):
    account = db.get(PortalAccount, context.account_id)
    if not verify_password(account.password_hash, payload.current_password):
        raise HTTPException(status_code=400, detail="La password attuale non è corretta.")
    if payload.new_password == payload.current_password:
        raise HTTPException(status_code=400, detail="La nuova password deve essere diversa.")
    account.password_hash = hash_password(payload.new_password)
    account.must_change_password = False
    account.auth_version += 1
    db.commit()
    db.refresh(account)
    return {"access_token": portal_token(account), "full_name": account.full_name, "must_change_password": False}


@router.get("/portal/me")
def portal_me(db: Session = Depends(get_db), context: PortalContext = Depends(get_portal_context)):
    account = db.get(PortalAccount, context.account_id)
    customer = db.scalar(select(Customer).where(Customer.id == context.customer_id, Customer.tenant_id == context.tenant_id))
    contract = db.scalar(
        select(ServiceContract)
        .where(ServiceContract.customer_id == context.customer_id, ServiceContract.tenant_id == context.tenant_id, ServiceContract.is_active.is_(True))
        .order_by(ServiceContract.start_date.desc())
        .limit(1)
    )
    unread = db.scalar(
        select(func.count(CaseMessage.id))
        .join(RepairCase, RepairCase.id == CaseMessage.repair_case_id)
        .where(
            RepairCase.customer_id == context.customer_id, CaseMessage.tenant_id == context.tenant_id,
            CaseMessage.sender == "WORKSHOP", CaseMessage.read_at.is_(None),
        )
    ) or 0
    return {
        "full_name": account.full_name,
        "email": account.email,
        "must_change_password": account.must_change_password,
        "customer_name": tracking.customer_display_name(customer),
        "contract": {
            "name": contract.name, "start_date": contract.start_date, "end_date": contract.end_date,
            "labor_included": contract.labor_included,
        } if contract else None,
        "workshop": tracking.workshop_info(db, context.tenant_id),
        "unread": unread,
    }


@router.get("/portal/vehicles")
def portal_vehicles(db: Session = Depends(get_db), context: PortalContext = Depends(get_portal_context)):
    vehicles = db.scalars(
        select(Vehicle).where(Vehicle.customer_id == context.customer_id, Vehicle.tenant_id == context.tenant_id).order_by(Vehicle.fleet_number, Vehicle.license_plate)
    ).all()
    return [vehicle_summary(db, vehicle) for vehicle in vehicles]


@router.get("/portal/fleet")
def portal_fleet(db: Session = Depends(get_db), context: PortalContext = Depends(get_portal_context)):
    """The customer's whole fleet with jobs to do and jobs done, plate by plate."""
    customer = db.scalar(select(Customer).where(Customer.id == context.customer_id, Customer.tenant_id == context.tenant_id))
    return fleet.fleet_profile(db, customer)


@router.get("/portal/vehicles/{vehicle_id}")
def portal_vehicle_detail(vehicle_id: UUID, db: Session = Depends(get_db), context: PortalContext = Depends(get_portal_context)):
    vehicle = portal_vehicle(db, context, vehicle_id)
    cases = db.scalars(
        select(RepairCase)
        .where(RepairCase.vehicle_id == vehicle.id, RepairCase.tenant_id == context.tenant_id, RepairCase.customer_id == context.customer_id)
        .order_by(RepairCase.created_at.desc())
        .limit(50)
    ).all()
    history = []
    for case in cases:
        progress = tracking.case_progress(db, case)
        history.append({
            "id": str(case.id),
            "case_number": case.case_number,
            "status": case.status.value,
            "status_text": progress["status_text"],
            "closed": progress["closed"],
            "opened_at": progress["opened_at"],
            "updated_at": progress["updated_at"],
            "mileage": case.mileage,
            "customer_notes": case.customer_notes,
            "tasks": progress["tasks"],
            "estimate": progress["estimate"],
        })
    return {**vehicle_summary(db, vehicle), "vin": vehicle.vin, "fuel_type": vehicle.fuel_type, "history": history}


@router.get("/portal/cases/{case_id}")
def portal_case_detail(case_id: UUID, db: Session = Depends(get_db), context: PortalContext = Depends(get_portal_context)):
    return tracking.case_progress(db, portal_case(db, context, case_id))


@router.get("/portal/cases/{case_id}/messages")
def portal_case_messages(case_id: UUID, read: bool = True, db: Session = Depends(get_db), context: PortalContext = Depends(get_portal_context)):
    return tracking.list_messages(db, portal_case(db, context, case_id), reader="CUSTOMER", read=read)


@router.post("/portal/cases/{case_id}/messages", status_code=status.HTTP_201_CREATED)
def portal_send_message(case_id: UUID, payload: MessageCreate, db: Session = Depends(get_db), context: PortalContext = Depends(get_portal_context)):
    case = portal_case(db, context, case_id)
    if tracking.is_closed(case):
        raise HTTPException(status_code=409, detail="La pratica è chiusa: contatta l'officina per telefono.")
    try:
        body = tracking.clean_body(payload.body)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    if tracking.customer_messages_last_hour(db, case) >= tracking.CUSTOMER_MESSAGES_PER_HOUR:
        raise HTTPException(status_code=429, detail="Troppi messaggi: riprova tra poco.")
    account = db.get(PortalAccount, context.account_id)
    message = tracking.new_message(db, case, sender="CUSTOMER", author_name=account.full_name, body=body)
    return tracking.message_dict(message)


@router.get("/portal/cases/{case_id}/damage-markers")
def portal_case_markers(case_id: UUID, db: Session = Depends(get_db), context: PortalContext = Depends(get_portal_context)):
    return tracking.customer_markers(db, portal_case(db, context, case_id))


@router.get("/portal/cases/{case_id}/renders/{view}")
def portal_case_render(
    case_id: UUID,
    view: str = Path(pattern="^(front|front-3-4|side|rear-3-4|rear|rear-3-4-right|side-right|front-3-4-right|top)$"),
    db: Session = Depends(get_db),
    context: PortalContext = Depends(get_portal_context),
):
    return tracking.case_render(db, portal_case(db, context, case_id), view)


@router.get("/portal/cases/{case_id}/photos")
def portal_case_photos(case_id: UUID, db: Session = Depends(get_db), context: PortalContext = Depends(get_portal_context)):
    return tracking.customer_photos(db, portal_case(db, context, case_id))


@router.get("/portal/cases/{case_id}/photos/{media_id}")
def portal_case_photo(case_id: UUID, media_id: UUID, db: Session = Depends(get_db), context: PortalContext = Depends(get_portal_context)):
    return tracking.customer_photo_content(db, portal_case(db, context, case_id), media_id)


@router.post("/portal/vehicles", status_code=status.HTTP_201_CREATED)
def portal_add_vehicle(payload: PortalVehicleCreate, db: Session = Depends(get_db), context: PortalContext = Depends(get_portal_context)):
    """The customer can add vehicles to its fleet; editing and deleting stay with the workshop."""
    plate = " ".join(payload.license_plate.upper().split())
    compact = re.sub(r"[^A-Z0-9]", "", plate)
    if not 5 <= len(compact) <= 10:
        raise HTTPException(status_code=422, detail="Targa non valida.")
    existing = db.scalar(select(Vehicle.id).where(
        Vehicle.tenant_id == context.tenant_id,
        func.replace(func.replace(func.upper(Vehicle.license_plate), " ", ""), "-", "") == compact,
    ))
    if existing:
        raise HTTPException(status_code=409, detail="Questa targa è già registrata in officina: contatta l'officina.")
    data = {key: (value.strip() or None) if isinstance(value, str) else value for key, value in payload.model_dump(exclude={"license_plate"}).items()}
    if data.get("vin"):
        data["vin"] = data["vin"].upper()
    vehicle = Vehicle(tenant_id=context.tenant_id, customer_id=context.customer_id, license_plate=plate, **data)
    db.add(vehicle)
    db.commit()
    db.refresh(vehicle)
    return vehicle_summary(db, vehicle)


@router.get("/portal/estimates")
def portal_estimates(db: Session = Depends(get_db), context: PortalContext = Depends(get_portal_context)):
    rows = db.execute(
        select(Estimate, RepairCase, Vehicle)
        .join(RepairCase, RepairCase.id == Estimate.repair_case_id)
        .join(Vehicle, Vehicle.id == RepairCase.vehicle_id)
        .where(
            Estimate.tenant_id == context.tenant_id, RepairCase.tenant_id == context.tenant_id,
            RepairCase.customer_id == context.customer_id, Estimate.status.in_(CUSTOMER_ESTIMATES),
        )
        .order_by(Estimate.created_at.desc())
        .limit(200)
    ).all()
    result = []
    for estimate, case, vehicle in rows:
        approval = db.scalar(
            select(EstimateApproval)
            .where(EstimateApproval.estimate_id == estimate.id, EstimateApproval.tenant_id == context.tenant_id, EstimateApproval.responded_at.is_(None))
            .order_by(EstimateApproval.created_at.desc())
            .limit(1)
        )
        pending = estimate.status in (EstimateStatus.SENT, EstimateStatus.VIEWED)
        result.append({
            "id": str(estimate.id),
            "estimate_number": estimate.estimate_number,
            "status": estimate.status.value,
            "total": str(estimate.total),
            "created_at": estimate.created_at,
            "case_number": case.case_number,
            "vehicle_id": str(vehicle.id),
            "license_plate": vehicle.license_plate,
            "vehicle": " ".join(filter(None, [vehicle.make, vehicle.model])) or None,
            "approval_path": f"/public/estimate/{approval.public_token}" if approval is not None and pending else None,
        })
    return result


def portal_invoice_query(context: PortalContext):
    return (
        select(Invoice)
        .outerjoin(RepairCase, RepairCase.id == Invoice.repair_case_id)
        .where(
            Invoice.tenant_id == context.tenant_id, Invoice.status.in_(CUSTOMER_INVOICES),
            or_(Invoice.customer_id == context.customer_id, (Invoice.customer_id.is_(None)) & (RepairCase.customer_id == context.customer_id)),
        )
    )


@router.get("/portal/invoices")
def portal_invoices(db: Session = Depends(get_db), context: PortalContext = Depends(get_portal_context)):
    invoices = db.scalars(portal_invoice_query(context).order_by(Invoice.issue_date.desc(), Invoice.created_at.desc()).limit(300)).all()
    result = []
    for invoice in invoices:
        _, vehicle = invoice_context(db, invoice)
        result.append({
            "id": str(invoice.id),
            "invoice_number": invoice.invoice_number,
            "status": invoice.status.value,
            "kind": invoice.invoice_kind,
            "period_month": invoice.period_month,
            "issue_date": invoice.issue_date,
            "due_date": invoice.due_date,
            "paid_at": invoice.paid_at,
            "total": str(invoice.total),
            "license_plate": vehicle.license_plate if vehicle is not None else None,
        })
    return result


@router.get("/portal/invoices/{invoice_id}/pdf")
def portal_invoice_pdf(invoice_id: UUID, db: Session = Depends(get_db), context: PortalContext = Depends(get_portal_context)):
    invoice = db.scalar(portal_invoice_query(context).where(Invoice.id == invoice_id))
    if invoice is None:
        raise HTTPException(status_code=404, detail="Invoice not found")
    customer, vehicle = invoice_context(db, invoice)
    company = tenant_settings(db, context.tenant_id)
    pdf = build_invoice_pdf(
        invoice=invoice, lines=invoice_lines(db, invoice), customer=customer, vehicle=vehicle,
        company_name=(company.company_name if company and company.company_name else "NAKAMA CAR"), settings=company,
    )
    return StreamingResponse(BytesIO(pdf), media_type="application/pdf", headers={"Content-Disposition": f'inline; filename="{invoice.invoice_number}.pdf"'})


@router.get("/portal/conversations")
def portal_conversations(db: Session = Depends(get_db), context: PortalContext = Depends(get_portal_context)):
    """One chat per repair: open repairs always, closed ones while they still have messages."""
    cases = db.execute(
        select(RepairCase, Vehicle)
        .join(Vehicle, Vehicle.id == RepairCase.vehicle_id)
        .where(RepairCase.tenant_id == context.tenant_id, RepairCase.customer_id == context.customer_id)
        .order_by(RepairCase.created_at.desc())
        .limit(100)
    ).all()
    result = []
    for case, vehicle in cases:
        last = db.scalar(
            select(CaseMessage).where(CaseMessage.repair_case_id == case.id, CaseMessage.tenant_id == context.tenant_id)
            .order_by(CaseMessage.created_at.desc(), CaseMessage.id.desc()).limit(1)
        )
        closed = tracking.is_closed(case)
        if closed and last is None:
            continue
        unread = db.scalar(select(func.count(CaseMessage.id)).where(
            CaseMessage.repair_case_id == case.id, CaseMessage.tenant_id == context.tenant_id,
            CaseMessage.sender == "WORKSHOP", CaseMessage.read_at.is_(None),
        )) or 0
        result.append({
            "case_id": str(case.id),
            "case_number": case.case_number,
            "closed": closed,
            "status_text": tracking.STATUS_TEXT[case.status],
            "license_plate": vehicle.license_plate,
            "vehicle": " ".join(filter(None, [vehicle.make, vehicle.model])) or None,
            "unread": unread,
            "last_message": tracking.message_dict(last) if last is not None else None,
        })
    result.sort(key=lambda item: (item["closed"], -(tracking.aware(item["last_message"]["created_at"]).timestamp() if item["last_message"] else 0)))
    return result


def portal_profile_dict(account: PortalAccount, customer: Customer) -> dict:
    return {
        "account": {"full_name": account.full_name, "email": account.email, "last_login_at": account.last_login_at},
        "customer": {
            "display_name": tracking.customer_display_name(customer),
            "customer_type": customer.customer_type.value,
            "company_name": customer.company_name,
            "first_name": customer.first_name,
            "last_name": customer.last_name,
            "vat_number": customer.vat_number,
            "tax_code": customer.tax_code,
            "sdi": customer.sdi,
            **{field: getattr(customer, field) for field in CUSTOMER_CONTACT_FIELDS},
        },
    }


def portal_customer(db: Session, context: PortalContext) -> Customer:
    customer = db.scalar(select(Customer).where(Customer.id == context.customer_id, Customer.tenant_id == context.tenant_id))
    if customer is None:
        raise HTTPException(status_code=404, detail="Customer not found")
    return customer


@router.get("/portal/profile")
def portal_profile(db: Session = Depends(get_db), context: PortalContext = Depends(get_portal_context)):
    return portal_profile_dict(db.get(PortalAccount, context.account_id), portal_customer(db, context))


@router.patch("/portal/profile")
def portal_update_profile(payload: PortalProfileUpdate, db: Session = Depends(get_db), context: PortalContext = Depends(get_portal_context)):
    account = db.get(PortalAccount, context.account_id)
    customer = portal_customer(db, context)
    data = payload.model_dump(exclude_unset=True)
    if "full_name" in data:
        if not (data["full_name"] or "").strip():
            raise HTTPException(status_code=422, detail="Il nome è obbligatorio.")
        account.full_name = data.pop("full_name").strip()
    for field, value in data.items():
        if isinstance(value, str):
            value = value.strip() or None
        if field in ("email", "pec") and value:
            value = value.lower()
        if field == "province" and value:
            value = value.upper()
        setattr(customer, field, value)
    db.commit()
    db.refresh(account)
    db.refresh(customer)
    return portal_profile_dict(account, customer)
