"""Workshop staff: my profile, quick diagnoses for the office, my work (tasks as buttons)."""
from datetime import date, datetime, timezone
from decimal import Decimal
from typing import Literal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Path, Query, status
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.api.v1.cases import next_case_number
from app.api.v1.estimates import apply_terms, calculate_line, recalculate, terms_of
from app.api.v1.renders import VIEW_PATTERN, plate_spots_for
from app.db.deps import get_db
from app.models.estimating import Estimate, EstimateLine, EstimateLineCategory, EstimateStatus, LaborRate, LaborType
from app.models.garage import Customer, RepairCase, RepairCaseStatus, Vehicle
from app.models.identity import User
from app.models.staff import Diagnosis, DiagnosisLine, DiagnosisStatus, QuickItem, UserProfile
from app.models.workshop import WorkOrder, WorkOrderStatus, WorkOrderTask, WorkTaskStatus
from app.schemas.estimating import EstimateLineCreate
from app.security.context import AuthContext, get_auth_context, require_permission
from app.services import staff
from app.services.audit import record_audit
from app.services.contracts import customer_display_name, find_active_contract
from app.services.tracking import case_render
from app.services.workshop import ensure_item_tasks

router = APIRouter(tags=["staff"])

CLOSED_ORDERS = (WorkOrderStatus.DELIVERED, WorkOrderStatus.INVOICED)
# Repair cases that have not reached the workshop yet (diagnosis, estimate, customer answer).
WAITING_CASES = (RepairCaseStatus.NEW, RepairCaseStatus.WAITING_APPROVAL)
# Where an estimate is in the flow office -> customer, as shown to the worker.
ESTIMATE_STAGE = {
    EstimateStatus.DRAFT: "OFFICE",      # the office is preparing the estimate
    EstimateStatus.SENT: "CUSTOMER",     # link sent, waiting for the customer
    EstimateStatus.REJECTED: "REJECTED",  # the customer said no
}


# ---------- my profile ----------

class ProfileUpdate(BaseModel):
    phone: str | None = Field(default=None, max_length=32)
    birth_date: date | None = None
    tax_code: str | None = Field(default=None, max_length=32)
    address: str | None = Field(default=None, max_length=255)
    city: str | None = Field(default=None, max_length=120)
    postal_code: str | None = Field(default=None, max_length=16)
    emergency_contact: str | None = Field(default=None, max_length=160)
    emergency_phone: str | None = Field(default=None, max_length=32)
    skills: str | None = Field(default=None, max_length=2000)
    notes: str | None = Field(default=None, max_length=2000)

    @field_validator("*", mode="before")
    @classmethod
    def blank_to_none(cls, value):
        if isinstance(value, str):
            value = value.strip()
            return value or None
        return value


PROFILE_FIELDS = list(ProfileUpdate.model_fields)


def profile_dict(profile: UserProfile | None) -> dict:
    return {field: getattr(profile, field) if profile else None for field in PROFILE_FIELDS} | {
        "work_area": profile.work_area if profile else None,
    }


def get_profile(db: Session, user_id) -> UserProfile | None:
    return db.scalar(select(UserProfile).where(UserProfile.user_id == user_id))


def me_dict(db: Session, auth: AuthContext) -> dict:
    user = db.get(User, auth.user_id)
    roles = staff.user_roles(db, auth.user_id, auth.tenant_id)
    profile = get_profile(db, auth.user_id)
    return {
        "id": str(user.id), "email": user.email, "first_name": user.first_name, "last_name": user.last_name,
        "roles": roles, "permissions": sorted(auth.permissions),
        "work_area": staff.area_for(roles, profile), "profile": profile_dict(profile),
    }


@router.get("/me")
def me(db: Session = Depends(get_db), auth: AuthContext = Depends(get_auth_context)):
    return me_dict(db, auth)


@router.put("/me/profile")
def update_my_profile(payload: ProfileUpdate, db: Session = Depends(get_db), auth: AuthContext = Depends(get_auth_context)):
    profile = get_profile(db, auth.user_id)
    if profile is None:
        profile = UserProfile(user_id=auth.user_id)
        db.add(profile)
    for field, value in payload.model_dump().items():
        setattr(profile, field, value)
    db.commit()
    return me_dict(db, auth)


class StaffAreaUpdate(BaseModel):
    work_area: Literal["BODY", "MECHANICAL", "ALL"]


def tenant_user(db: Session, auth: AuthContext, user_id: UUID) -> User:
    from app.models.identity import UserTenant

    user = db.scalar(select(User).join(UserTenant, UserTenant.user_id == User.id).where(User.id == user_id, UserTenant.tenant_id == auth.tenant_id))
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")
    return user


@router.get("/users/{user_id}/profile")
def user_profile(user_id: UUID, db: Session = Depends(get_db), auth: AuthContext = Depends(require_permission("users.manage"))):
    user = tenant_user(db, auth, user_id)
    roles = staff.user_roles(db, user.id, auth.tenant_id)
    profile = get_profile(db, user.id)
    return {"id": str(user.id), "first_name": user.first_name, "last_name": user.last_name, "email": user.email,
            "roles": roles, "work_area": staff.area_for(roles, profile), "profile": profile_dict(profile)}


@router.put("/users/{user_id}/area")
def set_user_area(user_id: UUID, payload: StaffAreaUpdate, db: Session = Depends(get_db), auth: AuthContext = Depends(require_permission("users.manage"))):
    """Main account decides whether a worker is meccanica or carrozzeria (ALL = both)."""
    user = tenant_user(db, auth, user_id)
    profile = get_profile(db, user.id)
    if profile is None:
        profile = UserProfile(user_id=user.id)
        db.add(profile)
    profile.work_area = payload.work_area
    db.commit()
    return user_profile(user_id, db, auth)


# ---------- quick-add list (workshop's own items) ----------

class QuickItemIn(BaseModel):
    name: str = Field(min_length=2, max_length=160)
    kind: Literal["PART", "MATERIAL", "SERVICE"] = "PART"
    labor_hours: Decimal = Field(default=Decimal("0"), ge=0, le=200)
    work_area: Literal["BODY", "MECHANICAL", "ALL"] | None = None


def quick_item_dict(item: QuickItem) -> dict:
    return {"id": str(item.id), "name": item.name, "kind": item.kind, "labor_hours": float(item.labor_hours),
            "work_area": item.work_area, "created_by": str(item.created_by) if item.created_by else None}


@router.get("/quick-items")
def list_quick_items(db: Session = Depends(get_db), auth: AuthContext = Depends(require_permission("work_order.read"))):
    """Items the workshop added itself; a worker only gets those of their area (or for both)."""
    area = staff.user_area(db, auth.user_id, auth.tenant_id)
    query = select(QuickItem).where(QuickItem.tenant_id == auth.tenant_id)
    if area:
        query = query.where((QuickItem.work_area == area) | QuickItem.work_area.is_(None))
    return [quick_item_dict(item) for item in db.scalars(query.order_by(QuickItem.name)).all()]


@router.post("/quick-items", status_code=status.HTTP_201_CREATED)
def create_quick_item(payload: QuickItemIn, db: Session = Depends(get_db), auth: AuthContext = Depends(require_permission("work_order.read"))):
    """Save a new quick-add item for everybody in the workshop (same name + kind is reused)."""
    name = " ".join(payload.name.split())
    existing = db.scalar(select(QuickItem).where(
        QuickItem.tenant_id == auth.tenant_id, QuickItem.kind == payload.kind, func.lower(QuickItem.name) == name.lower(),
    ))
    if existing is not None:
        return quick_item_dict(existing)
    area = None if payload.work_area == "ALL" else payload.work_area or staff.user_area(db, auth.user_id, auth.tenant_id)
    item = QuickItem(tenant_id=auth.tenant_id, name=name, kind=payload.kind, labor_hours=payload.labor_hours, work_area=area, created_by=auth.user_id)
    db.add(item)
    db.flush()
    record_audit(db, tenant_id=auth.tenant_id, user_id=auth.user_id, entity_type="quick_item", entity_id=item.id, action="created", new_value={"name": name, "kind": payload.kind})
    db.commit()
    db.refresh(item)
    return quick_item_dict(item)


@router.delete("/quick-items/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_quick_item(item_id: UUID, db: Session = Depends(get_db), auth: AuthContext = Depends(require_permission("work_order.read"))):
    """Remove an item: whoever added it, or the office."""
    item = db.scalar(select(QuickItem).where(QuickItem.id == item_id, QuickItem.tenant_id == auth.tenant_id))
    if item is None:
        raise HTTPException(status_code=404, detail="Elemento non trovato")
    if item.created_by != auth.user_id and "estimate.create" not in auth.permissions:
        raise HTTPException(status_code=403, detail="Solo chi l'ha aggiunto o l'ufficio può eliminarlo")
    db.delete(item)
    db.commit()


# ---------- quick diagnosis ----------

class DiagnosisLineIn(BaseModel):
    kind: Literal["PART", "MATERIAL", "SERVICE"] = "PART"
    description: str = Field(min_length=1, max_length=255)
    oem_code: str | None = Field(default=None, max_length=120)
    quantity: Decimal = Field(default=Decimal("1"), gt=0, le=9999)
    unit_price: Decimal | None = Field(default=None, ge=0)


class DiagnosisIn(BaseModel):
    license_plate: str = Field(min_length=2, max_length=20)
    work_type: Literal["BODY", "MECHANICAL"] | None = None
    mileage: int | None = Field(default=None, ge=0, le=5_000_000)
    complaint: str | None = Field(default=None, max_length=4000)
    findings: str | None = Field(default=None, max_length=8000)
    urgency: Literal["LOW", "NORMAL", "HIGH"] = "NORMAL"
    labor_hours: Decimal = Field(default=Decimal("0"), ge=0, le=999)
    repair_case_id: UUID | None = None
    lines: list[DiagnosisLineIn] = Field(default_factory=list, max_length=60)


class DiagnosisConvert(BaseModel):
    customer_id: UUID | None = None


class DiagnosisReject(BaseModel):
    note: str | None = Field(default=None, max_length=2000)


def is_manager(auth: AuthContext) -> bool:
    return "estimate.create" in auth.permissions


def find_vehicle(db: Session, tenant_id, plate: str) -> Vehicle | None:
    wanted = staff.normalize_plate(plate)
    for vehicle in db.scalars(select(Vehicle).where(Vehicle.tenant_id == tenant_id)).all():
        if staff.normalize_plate(vehicle.license_plate) == wanted:
            return vehicle
    return None


def open_case(db: Session, tenant_id, vehicle_id, work_type: str) -> RepairCase | None:
    return db.scalar(
        select(RepairCase).where(
            RepairCase.tenant_id == tenant_id, RepairCase.vehicle_id == vehicle_id, RepairCase.work_type == work_type,
            RepairCase.status.not_in([RepairCaseStatus.DELIVERED, RepairCaseStatus.INVOICED]),
        ).order_by(RepairCase.created_at.desc()).limit(1)
    )


def diagnosis_dict(db: Session, diagnosis: Diagnosis, names: dict | None = None) -> dict:
    lines = db.scalars(select(DiagnosisLine).where(DiagnosisLine.diagnosis_id == diagnosis.id, DiagnosisLine.tenant_id == diagnosis.tenant_id).order_by(DiagnosisLine.sort_order)).all()
    vehicle = db.get(Vehicle, diagnosis.vehicle_id) if diagnosis.vehicle_id else None
    customer = db.get(Customer, vehicle.customer_id) if vehicle and vehicle.customer_id else None
    if names is None:
        author = db.get(User, diagnosis.created_by)
        author_name = f"{author.first_name} {author.last_name}".strip() if author else ""
    else:
        author_name = names.get(diagnosis.created_by, "")
    case = db.get(RepairCase, diagnosis.repair_case_id) if diagnosis.repair_case_id else None
    estimate = db.get(Estimate, diagnosis.estimate_id) if diagnosis.estimate_id else None
    return {
        "id": str(diagnosis.id), "diagnosis_number": diagnosis.diagnosis_number, "status": diagnosis.status.value,
        "license_plate": diagnosis.license_plate, "work_type": diagnosis.work_type, "mileage": diagnosis.mileage,
        "complaint": diagnosis.complaint, "findings": diagnosis.findings, "urgency": diagnosis.urgency,
        "labor_hours": str(diagnosis.labor_hours), "created_at": diagnosis.created_at, "created_by": str(diagnosis.created_by),
        "author_name": author_name, "review_note": diagnosis.review_note,
        "vehicle": None if vehicle is None else {
            "id": str(vehicle.id), "make": vehicle.make, "model": vehicle.model, "customer_id": str(vehicle.customer_id) if vehicle.customer_id else None,
        },
        "customer_name": customer_display_name(customer) if customer else None,
        "case_number": case.case_number if case else None, "repair_case_id": str(case.id) if case else None,
        "estimate_number": estimate.estimate_number if estimate else None, "estimate_id": str(estimate.id) if estimate else None,
        "estimate_status": estimate.status.value if estimate else None,
        "lines": [{
            "id": str(line.id), "kind": line.kind, "description": line.description, "oem_code": line.oem_code,
            "quantity": str(line.quantity), "unit_price": None if line.unit_price is None else str(line.unit_price),
        } for line in lines],
    }


def get_diagnosis(db: Session, auth: AuthContext, diagnosis_id: UUID) -> Diagnosis:
    diagnosis = db.scalar(select(Diagnosis).where(Diagnosis.id == diagnosis_id, Diagnosis.tenant_id == auth.tenant_id))
    if diagnosis is None or (not is_manager(auth) and diagnosis.created_by != auth.user_id):
        raise HTTPException(status_code=404, detail="Diagnosis not found")
    return diagnosis


def write_diagnosis(db: Session, auth: AuthContext, diagnosis: Diagnosis, payload: DiagnosisIn) -> None:
    area = staff.user_area(db, auth.user_id, auth.tenant_id)
    plate = staff.normalize_plate(payload.license_plate)
    if len(plate) < 2:
        raise HTTPException(status_code=422, detail="Targa non valida")
    vehicle = find_vehicle(db, auth.tenant_id, plate)
    work_type = area or payload.work_type or "MECHANICAL"
    case = None
    if payload.repair_case_id:
        case = db.scalar(select(RepairCase).where(RepairCase.id == payload.repair_case_id, RepairCase.tenant_id == auth.tenant_id))
        if case is None:
            raise HTTPException(status_code=404, detail="Repair case not found")
    elif vehicle is not None:
        case = open_case(db, auth.tenant_id, vehicle.id, work_type)
    diagnosis.license_plate = plate
    diagnosis.vehicle_id = vehicle.id if vehicle else (case.vehicle_id if case else None)
    diagnosis.repair_case_id = case.id if case else None
    diagnosis.work_type = work_type
    diagnosis.mileage = payload.mileage
    diagnosis.complaint = (payload.complaint or "").strip() or None
    diagnosis.findings = (payload.findings or "").strip() or None
    diagnosis.urgency = payload.urgency
    diagnosis.labor_hours = payload.labor_hours
    for old in db.scalars(select(DiagnosisLine).where(DiagnosisLine.diagnosis_id == diagnosis.id)).all() if diagnosis.id else []:
        db.delete(old)
    db.flush()
    for index, line in enumerate(payload.lines):
        db.add(DiagnosisLine(
            tenant_id=auth.tenant_id, diagnosis_id=diagnosis.id, kind=line.kind, description=line.description.strip(),
            oem_code=(line.oem_code or "").strip() or None, quantity=line.quantity, unit_price=line.unit_price, sort_order=index,
        ))


@router.post("/diagnoses", status_code=status.HTTP_201_CREATED)
def create_diagnosis(payload: DiagnosisIn, db: Session = Depends(get_db), auth: AuthContext = Depends(require_permission("work_order.read"))):
    year = datetime.now(timezone.utc).year
    count = db.scalar(select(func.count(Diagnosis.id)).where(
        Diagnosis.tenant_id == auth.tenant_id, Diagnosis.diagnosis_number.like(f"NC-DIA-{year}-%"),
    )) or 0
    diagnosis = Diagnosis(tenant_id=auth.tenant_id, diagnosis_number=f"NC-DIA-{year}-{count + 1:05d}", created_by=auth.user_id, license_plate="", work_type="MECHANICAL")
    db.add(diagnosis)
    db.flush()
    write_diagnosis(db, auth, diagnosis, payload)
    record_audit(db, tenant_id=auth.tenant_id, user_id=auth.user_id, entity_type="diagnosis", entity_id=diagnosis.id,
                 action="created", new_value={"number": diagnosis.diagnosis_number, "plate": diagnosis.license_plate})
    db.commit()
    return diagnosis_dict(db, diagnosis)


@router.get("/diagnoses")
def list_diagnoses(
    status_filter: Literal["SENT", "CONVERTED", "REJECTED"] | None = Query(default=None, alias="status"),
    limit: int = Query(default=100, ge=1, le=300),
    db: Session = Depends(get_db),
    auth: AuthContext = Depends(require_permission("work_order.read")),
):
    """The office sees every diagnosis; a worker only their own."""
    query = select(Diagnosis).where(Diagnosis.tenant_id == auth.tenant_id)
    if not is_manager(auth):
        query = query.where(Diagnosis.created_by == auth.user_id)
    if status_filter:
        query = query.where(Diagnosis.status == DiagnosisStatus(status_filter))
    items = db.scalars(query.order_by(Diagnosis.created_at.desc()).limit(limit)).all()
    names = {user.id: f"{user.first_name} {user.last_name}".strip() for user in db.scalars(
        select(User).where(User.id.in_({item.created_by for item in items}))
    ).all()} if items else {}
    return [diagnosis_dict(db, item, names) for item in items]


@router.get("/diagnoses/{diagnosis_id}")
def read_diagnosis(diagnosis_id: UUID, db: Session = Depends(get_db), auth: AuthContext = Depends(require_permission("work_order.read"))):
    return diagnosis_dict(db, get_diagnosis(db, auth, diagnosis_id))


@router.put("/diagnoses/{diagnosis_id}")
def update_diagnosis(diagnosis_id: UUID, payload: DiagnosisIn, db: Session = Depends(get_db), auth: AuthContext = Depends(require_permission("work_order.read"))):
    diagnosis = get_diagnosis(db, auth, diagnosis_id)
    if diagnosis.status != DiagnosisStatus.SENT:
        raise HTTPException(status_code=409, detail="La diagnosi è già stata lavorata dall'ufficio")
    write_diagnosis(db, auth, diagnosis, payload)
    db.commit()
    return diagnosis_dict(db, diagnosis)


@router.delete("/diagnoses/{diagnosis_id}", status_code=204)
def delete_diagnosis(diagnosis_id: UUID, db: Session = Depends(get_db), auth: AuthContext = Depends(require_permission("work_order.read"))):
    diagnosis = get_diagnosis(db, auth, diagnosis_id)
    if diagnosis.status != DiagnosisStatus.SENT:
        raise HTTPException(status_code=409, detail="La diagnosi è già stata lavorata dall'ufficio")
    db.delete(diagnosis)
    db.commit()
    return None


def labor_rate(db: Session, tenant_id, work_type: str) -> Decimal:
    wanted = LaborType.BODY if work_type == "BODY" else LaborType.MECHANICAL
    rate = db.scalar(select(LaborRate).where(LaborRate.tenant_id == tenant_id, LaborRate.labor_type == wanted))
    return rate.hourly_rate if rate else Decimal("0")


@router.post("/diagnoses/{diagnosis_id}/estimate")
def diagnosis_to_estimate(
    diagnosis_id: UUID,
    payload: DiagnosisConvert,
    db: Session = Depends(get_db),
    auth: AuthContext = Depends(require_permission("estimate.create")),
):
    """The office turns a diagnosis into a draft estimate (vehicle and case are found or created)."""
    diagnosis = get_diagnosis(db, auth, diagnosis_id)
    if diagnosis.status != DiagnosisStatus.SENT:
        raise HTTPException(status_code=409, detail="Diagnosi già lavorata")
    customer = None
    if payload.customer_id:
        customer = db.scalar(select(Customer).where(Customer.id == payload.customer_id, Customer.tenant_id == auth.tenant_id))
        if customer is None:
            raise HTTPException(status_code=404, detail="Customer not found")
    vehicle = db.get(Vehicle, diagnosis.vehicle_id) if diagnosis.vehicle_id else find_vehicle(db, auth.tenant_id, diagnosis.license_plate)
    if vehicle is None:
        if customer is None:
            raise HTTPException(status_code=409, detail={"message": "Veicolo nuovo: scegli il cliente", "needs_customer": True})
        vehicle = Vehicle(tenant_id=auth.tenant_id, customer_id=customer.id, license_plate=diagnosis.license_plate, mileage=diagnosis.mileage)
        db.add(vehicle)
        db.flush()
    elif vehicle.customer_id is None:
        if customer is None:
            raise HTTPException(status_code=409, detail={"message": "Il veicolo non ha un cliente: sceglilo", "needs_customer": True})
        vehicle.customer_id = customer.id
    if diagnosis.mileage and (vehicle.mileage is None or diagnosis.mileage > vehicle.mileage):
        vehicle.mileage = diagnosis.mileage
    case = db.get(RepairCase, diagnosis.repair_case_id) if diagnosis.repair_case_id else open_case(db, auth.tenant_id, vehicle.id, diagnosis.work_type)
    if case is None:
        case = RepairCase(
            tenant_id=auth.tenant_id, case_number=next_case_number(db, auth.tenant_id), opened_at=datetime.now(timezone.utc),
            customer_id=vehicle.customer_id, vehicle_id=vehicle.id, work_type=diagnosis.work_type, mileage=diagnosis.mileage,
            customer_notes=diagnosis.complaint,
        )
        db.add(case)
        db.flush()

    year = datetime.now(timezone.utc).year
    count = db.scalar(select(func.count(Estimate.id)).where(Estimate.tenant_id == auth.tenant_id, Estimate.estimate_number.like(f"NC-P-{year}-%"))) or 0
    estimate = Estimate(
        tenant_id=auth.tenant_id, repair_case_id=case.id, estimate_number=f"NC-P-{year}-{count + 1:06d}",
        notes="\n".join(part for part in (
            f"Da diagnosi {diagnosis.diagnosis_number}", diagnosis.complaint and f"Richiesta: {diagnosis.complaint}",
            diagnosis.findings and f"Diagnosi: {diagnosis.findings}",
        ) if part),
    )
    apply_terms(estimate, find_active_contract(db, auth.tenant_id, case.customer_id))
    db.add(estimate)
    db.flush()
    terms = terms_of(estimate)
    lines: list[EstimateLineCreate] = []
    if diagnosis.labor_hours and diagnosis.labor_hours > 0:
        lines.append(EstimateLineCreate(
            category=EstimateLineCategory.BODY_LABOR if diagnosis.work_type == "BODY" else EstimateLineCategory.MECHANICAL_LABOR,
            description=f"Manodopera ({diagnosis.diagnosis_number})", labor_hours=diagnosis.labor_hours,
            labor_rate=labor_rate(db, auth.tenant_id, diagnosis.work_type),
        ))
    category = {"PART": EstimateLineCategory.PART, "MATERIAL": EstimateLineCategory.MATERIAL, "SERVICE": EstimateLineCategory.EXTERNAL_SERVICE}
    for line in db.scalars(select(DiagnosisLine).where(DiagnosisLine.diagnosis_id == diagnosis.id).order_by(DiagnosisLine.sort_order)).all():
        lines.append(EstimateLineCreate(
            category=category.get(line.kind, EstimateLineCategory.OTHER), description=line.description, part=line.description if line.kind == "PART" else None,
            oem_code=line.oem_code, quantity=line.quantity, unit_price=line.unit_price or Decimal("0"),
        ))
    for line in lines:
        subtotal, vat, total = calculate_line(line, terms)
        db.add(EstimateLine(tenant_id=auth.tenant_id, estimate_id=estimate.id, line_subtotal=subtotal, line_vat=vat, line_total=total, **line.model_dump()))
    db.flush()
    recalculate(db, estimate)
    diagnosis.status = DiagnosisStatus.CONVERTED
    diagnosis.vehicle_id, diagnosis.repair_case_id, diagnosis.estimate_id = vehicle.id, case.id, estimate.id
    diagnosis.reviewed_by, diagnosis.reviewed_at = auth.user_id, datetime.now(timezone.utc)
    record_audit(db, tenant_id=auth.tenant_id, user_id=auth.user_id, entity_type="diagnosis", entity_id=diagnosis.id,
                 action="converted", new_value={"estimate": estimate.estimate_number, "case": case.case_number})
    db.commit()
    return {"estimate_id": str(estimate.id), "estimate_number": estimate.estimate_number, "repair_case_id": str(case.id), "case_number": case.case_number}


@router.post("/diagnoses/{diagnosis_id}/reject")
def reject_diagnosis(diagnosis_id: UUID, payload: DiagnosisReject, db: Session = Depends(get_db), auth: AuthContext = Depends(require_permission("estimate.create"))):
    diagnosis = get_diagnosis(db, auth, diagnosis_id)
    if diagnosis.status != DiagnosisStatus.SENT:
        raise HTTPException(status_code=409, detail="Diagnosi già lavorata")
    diagnosis.status = DiagnosisStatus.REJECTED
    diagnosis.review_note = (payload.note or "").strip() or None
    diagnosis.reviewed_by, diagnosis.reviewed_at = auth.user_id, datetime.now(timezone.utc)
    db.commit()
    return diagnosis_dict(db, diagnosis)


# ---------- my work: vehicles waiting in my area, tasks as buttons ----------

def vehicle_details(db: Session, vehicle: Vehicle, case: RepairCase) -> dict:
    """Everything the worker needs to know about the car on the lift."""
    return {
        "make": vehicle.make, "model": vehicle.model, "version": vehicle.version, "year": vehicle.year,
        "color": vehicle.color_name, "paint_code": vehicle.paint_code, "vin": vehicle.vin, "fuel_type": vehicle.fuel_type,
        "engine_size": vehicle.engine_size, "power_kw": vehicle.power_kw, "category": vehicle.vehicle_category,
        "mileage": case.mileage or vehicle.mileage, "fuel_level": case.fuel_level_percent, "fleet_number": vehicle.fleet_number,
        "plate_spots": plate_spots_for(db, case.tenant_id, vehicle.make, vehicle.model),
    }


def task_dict(task: WorkOrderTask, names: dict) -> dict:
    return {
        "id": str(task.id), "task_type": task.task_type, "description": task.description, "status": task.status.value,
        "completed_by": names.get(task.completed_by) if task.completed_by else None, "completed_at": task.completed_at,
        "note": task.note, "estimate_line_id": str(task.estimate_line_id) if task.estimate_line_id else None,
    }


@router.get("/my-work")
def my_work(db: Session = Depends(get_db), auth: AuthContext = Depends(require_permission("work_order.read"))):
    """Open work orders of my area (with their tasks) and vehicles waiting for a diagnosis."""
    area = staff.user_area(db, auth.user_id, auth.tenant_id)
    query = (
        select(WorkOrder, RepairCase, Vehicle, Customer)
        .join(RepairCase, RepairCase.id == WorkOrder.repair_case_id)
        .join(Vehicle, Vehicle.id == RepairCase.vehicle_id)
        .join(Customer, Customer.id == RepairCase.customer_id)
        .where(WorkOrder.tenant_id == auth.tenant_id, WorkOrder.status.not_in(CLOSED_ORDERS))
    )
    if area:
        query = query.where(RepairCase.work_type == area)
    rows = db.execute(query.order_by(WorkOrder.created_at)).all()
    orders = [order for order, *_ in rows]
    # Older orders get one button per part/job of their estimate.
    if any([ensure_item_tasks(db, order) for order in orders]):
        db.commit()
    tasks_by_order: dict = {}
    if orders:
        for task in db.scalars(select(WorkOrderTask).where(
            WorkOrderTask.tenant_id == auth.tenant_id, WorkOrderTask.work_order_id.in_([order.id for order in orders]),
        ).order_by(WorkOrderTask.sort_order, WorkOrderTask.created_at)).all():
            if staff.task_in_area(task.task_type, area):
                tasks_by_order.setdefault(task.work_order_id, []).append(task)
    who = {task.completed_by for items in tasks_by_order.values() for task in items if task.completed_by}
    names = {user.id: f"{user.first_name} {user.last_name}".strip() for user in db.scalars(select(User).where(User.id.in_(who))).all()} if who else {}
    jobs = []
    for order, case, vehicle, customer in rows:
        tasks = tasks_by_order.get(order.id, [])
        jobs.append({
            "work_order_id": str(order.id), "work_order_number": order.work_order_number, "status": order.status.value,
            "priority": order.priority, "case_number": case.case_number, "repair_case_id": str(case.id), "work_type": case.work_type,
            "plate": vehicle.license_plate, "vehicle": " ".join(filter(None, [vehicle.make, vehicle.model])) or None,
            "color": vehicle.color_name, "customer_name": customer_display_name(customer), "request": case.customer_notes,
            "details": vehicle_details(db, vehicle, case), "internal_notes": case.internal_notes,
            "tasks": [task_dict(task, names) for task in tasks],
            "done": (done := sum(1 for task in tasks if task.status == WorkTaskStatus.DONE)), "total": len(tasks),
            # Approved by the customer and nobody has started yet.
            "is_new": done == 0 and order.status == WorkOrderStatus.APPROVED, "approved_at": order.created_at,
        })
    waiting_query = (
        select(RepairCase, Vehicle)
        .join(Vehicle, Vehicle.id == RepairCase.vehicle_id)
        .where(RepairCase.tenant_id == auth.tenant_id, RepairCase.status.in_(WAITING_CASES))
    )
    if area:
        waiting_query = waiting_query.where(RepairCase.work_type == area)
    with_order = set(db.scalars(select(WorkOrder.repair_case_id).where(WorkOrder.tenant_id == auth.tenant_id)).all())
    cases = [(case, vehicle) for case, vehicle in db.execute(waiting_query.order_by(RepairCase.created_at)).all() if case.id not in with_order]
    latest: dict = {}
    if cases:
        for estimate in db.scalars(select(Estimate).where(
            Estimate.tenant_id == auth.tenant_id, Estimate.repair_case_id.in_([case.id for case, _ in cases]),
        ).order_by(Estimate.created_at)).all():
            latest[estimate.repair_case_id] = estimate
    waiting, pending = [], []
    for case, vehicle in cases:
        item = {
            "repair_case_id": str(case.id), "case_number": case.case_number, "plate": vehicle.license_plate,
            "vehicle": " ".join(filter(None, [vehicle.make, vehicle.model])) or None, "request": case.customer_notes,
            "work_type": case.work_type, "mileage": case.mileage,
        }
        estimate = latest.get(case.id)
        if estimate is None:
            waiting.append(item)  # needs a diagnosis
        elif estimate.status in ESTIMATE_STAGE:
            pending.append(item | {"stage": ESTIMATE_STAGE[estimate.status], "estimate_number": estimate.estimate_number})
    jobs.sort(key=lambda job: (not job["is_new"],))
    return {"work_area": area, "jobs": jobs, "waiting": waiting, "pending": pending, "new_jobs": sum(1 for job in jobs if job["is_new"])}


class TaskToggle(BaseModel):
    done: bool


class TaskNote(BaseModel):
    note: str = Field(default="", max_length=1000)


def my_task(db: Session, auth: AuthContext, task_id: UUID) -> WorkOrderTask:
    """A task of this workshop that belongs to the worker's area (403 otherwise)."""
    task = db.scalar(select(WorkOrderTask).where(WorkOrderTask.id == task_id, WorkOrderTask.tenant_id == auth.tenant_id))
    if task is None:
        raise HTTPException(status_code=404, detail="Work task not found")
    area = staff.user_area(db, auth.user_id, auth.tenant_id)
    case = db.scalar(select(RepairCase).join(WorkOrder, WorkOrder.repair_case_id == RepairCase.id).where(WorkOrder.id == task.work_order_id))
    if area and (not staff.task_in_area(task.task_type, area) or (case and case.work_type != area)):
        raise HTTPException(status_code=403, detail="Questo lavoro non è della tua area")
    return task


@router.put("/my-work/tasks/{task_id}/note")
def save_task_note(task_id: UUID, payload: TaskNote, db: Session = Depends(get_db), auth: AuthContext = Depends(require_permission("work_order.update_status"))):
    """Short comment on one job (what was found, what is missing…); empty text removes it."""
    task = my_task(db, auth, task_id)
    old = task.note
    task.note = payload.note.strip() or None
    record_audit(db, tenant_id=auth.tenant_id, user_id=auth.user_id, entity_type="work_task", entity_id=task.id,
                 action="note_changed", field_name="note", old_value=old, new_value=task.note)
    db.commit()
    names = {task.completed_by: name} if task.completed_by and (name := user_name(db, task.completed_by)) else {}
    return task_dict(task, names)


def user_name(db: Session, user_id) -> str:
    user = db.get(User, user_id)
    return f"{user.first_name} {user.last_name}".strip() if user else ""


@router.get("/my-work/cases/{case_id}/renders/{view}")
def my_work_render(case_id: UUID, view: str = Path(pattern=VIEW_PATTERN), db: Session = Depends(get_db), auth: AuthContext = Depends(require_permission("case.read"))):
    """Studio picture of the vehicle the worker is repairing (no vehicle.read needed)."""
    case = db.scalar(select(RepairCase).where(RepairCase.id == case_id, RepairCase.tenant_id == auth.tenant_id))
    if case is None:
        raise HTTPException(status_code=404, detail="Repair case not found")
    return case_render(db, case, view)


@router.post("/my-work/tasks/{task_id}")
def toggle_task(task_id: UUID, payload: TaskToggle, db: Session = Depends(get_db), auth: AuthContext = Depends(require_permission("work_order.update_status"))):
    """Tick a task as done (or untick it if pressed by mistake)."""
    task = my_task(db, auth, task_id)
    old = task.status.value
    if payload.done:
        task.status, task.completed_by, task.completed_at = WorkTaskStatus.DONE, auth.user_id, datetime.now(timezone.utc)
    else:
        task.status, task.completed_by, task.completed_at = WorkTaskStatus.PENDING, None, None
    record_audit(db, tenant_id=auth.tenant_id, user_id=auth.user_id, entity_type="work_task", entity_id=task.id,
                 action="status_changed", field_name="status", old_value=old, new_value=task.status.value)
    db.commit()
    user = db.get(User, auth.user_id)
    return task_dict(task, {auth.user_id: f"{user.first_name} {user.last_name}".strip()} if user else {})
