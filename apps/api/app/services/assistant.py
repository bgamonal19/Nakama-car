"""Read-only view of the whole workshop for an AI assistant (e.g. MY SECRETARY).

Everything is scoped to the tenant of the API key. Nothing here changes data: listing
messages does not mark them as read, opening a case does not touch it.
Secrets never leave: no password hashes, API keys, encrypted credentials or photo bytes.
"""
from datetime import date, datetime, timezone
from decimal import Decimal
from enum import Enum
from uuid import UUID

from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.models.approval import EstimateApproval
from app.models.billing import Invoice, InvoiceLine, InvoiceStatus
from app.models.contracts import ServiceContract
from app.models.estimating import Estimate, EstimateLine, EstimateStatus
from app.models.garage import Customer, RepairCase, RepairCaseStatus, Vehicle
from app.models.identity import Role, TenantSettings, User, UserRole, UserTenant
from app.models.media import Media
from app.models.renders import DamageMarker
from app.models.tracking import CaseMessage, CaseTrackingLink
from app.models.workshop import WorkOrder, WorkOrderTask, WorkTaskStatus
from app.services import integrations
from app.services.maintenance import maintenance_status
from app.services.tracking import STATUS_TEXT, case_parts

CLOSED_CASES = (RepairCaseStatus.DELIVERED, RepairCaseStatus.INVOICED)
WAITING_ESTIMATES = (EstimateStatus.READY, EstimateStatus.SENT, EstimateStatus.VIEWED)
MAX_LIMIT = 200


def value(item):
    """Plain JSON values: enums by name, money as text with 2 decimals."""
    if isinstance(item, Enum):
        return item.value
    if isinstance(item, Decimal):
        return str(item)
    if isinstance(item, UUID):
        return str(item)
    return item


def limit_of(limit: int | None, default: int = 50) -> int:
    return max(1, min(MAX_LIMIT, limit or default))


def like(text: str) -> str:
    return f"%{text.strip().lower()}%"


# ---------- serializers ----------

def customer_name(customer: Customer | None) -> str:
    if customer is None:
        return ""
    if customer.company_name:
        return customer.company_name
    return " ".join(part for part in (customer.first_name, customer.last_name) if part) or "Cliente"


def customer_summary(customer: Customer | None) -> dict | None:
    if customer is None:
        return None
    return {
        "id": str(customer.id), "name": customer_name(customer), "type": value(customer.customer_type),
        "phone": customer.phone, "email": customer.email,
    }


def customer_detail(customer: Customer) -> dict:
    return {
        **customer_summary(customer),
        "first_name": customer.first_name, "last_name": customer.last_name, "company_name": customer.company_name,
        "tax_code": customer.tax_code, "vat_number": customer.vat_number, "pec": customer.pec, "sdi": customer.sdi,
        "address": customer.address, "city": customer.city, "province": customer.province,
        "postal_code": customer.postal_code, "country": customer.country, "notes": customer.notes,
        "created_at": customer.created_at,
    }


def vehicle_summary(vehicle: Vehicle | None) -> dict | None:
    if vehicle is None:
        return None
    return {
        "id": str(vehicle.id), "license_plate": vehicle.license_plate, "make": vehicle.make, "model": vehicle.model,
        "year": vehicle.year, "color": vehicle.color_name, "mileage_km": vehicle.mileage,
        "category": vehicle.vehicle_category, "fleet_number": vehicle.fleet_number,
        "customer_id": str(vehicle.customer_id) if vehicle.customer_id else None,
    }


def vehicle_detail(db: Session, vehicle: Vehicle) -> dict:
    return {
        **vehicle_summary(vehicle),
        "vin": vehicle.vin, "version": vehicle.version, "paint_code": vehicle.paint_code, "fuel_type": vehicle.fuel_type,
        "engine_size": vehicle.engine_size, "power_kw": vehicle.power_kw,
        "maintenance": maintenance_status(vehicle),
        "telemetry": integrations.latest_reading(db, vehicle),
    }


def case_summary(case: RepairCase, customer: Customer | None, vehicle: Vehicle | None) -> dict:
    return {
        "id": str(case.id), "case_number": case.case_number, "status": value(case.status),
        "status_text": STATUS_TEXT.get(case.status, ""), "work_type": case.work_type or "BODY",
        "closed": case.status in CLOSED_CASES,
        "opened_at": case.opened_at or case.created_at, "updated_at": case.updated_at,
        "customer": customer_summary(customer), "vehicle": vehicle_summary(vehicle),
    }


def estimate_summary(estimate: Estimate) -> dict:
    return {
        "id": str(estimate.id), "estimate_number": estimate.estimate_number, "version": estimate.version,
        "status": value(estimate.status), "subtotal": value(estimate.subtotal), "vat_total": value(estimate.vat_total),
        "total": value(estimate.total), "currency": estimate.currency, "repair_case_id": str(estimate.repair_case_id),
        "created_at": estimate.created_at, "updated_at": estimate.updated_at,
    }


def estimate_line(line: EstimateLine) -> dict:
    return {
        "id": str(line.id), "category": value(line.category), "description": line.description,
        "operation": line.operation, "part": line.part, "oem_code": line.oem_code,
        "quantity": value(line.quantity), "unit_price": value(line.unit_price), "discount_percent": value(line.discount_percent),
        "labor_hours": value(line.labor_hours), "labor_rate": value(line.labor_rate),
        "paint_hours": value(line.paint_hours), "paint_rate": value(line.paint_rate), "materials": value(line.materials),
        "vat_rate": value(line.vat_rate), "line_total": value(line.line_total),
    }


def invoice_summary(invoice: Invoice, customer: Customer | None = None, today: date | None = None) -> dict:
    today = today or date.today()
    overdue = invoice.status == InvoiceStatus.ISSUED and invoice.due_date is not None and invoice.due_date < today
    return {
        "id": str(invoice.id), "invoice_number": invoice.invoice_number, "kind": invoice.invoice_kind,
        "status": value(invoice.status), "overdue": overdue,
        "issue_date": invoice.issue_date, "due_date": invoice.due_date, "paid_at": invoice.paid_at,
        "subtotal": value(invoice.subtotal), "vat_total": value(invoice.vat_total), "total": value(invoice.total),
        "period_month": invoice.period_month,
        "repair_case_id": str(invoice.repair_case_id) if invoice.repair_case_id else None,
        "customer": customer_summary(customer) if customer else ({"id": str(invoice.customer_id)} if invoice.customer_id else None),
    }


def contract_summary(contract: ServiceContract, customer: Customer | None) -> dict:
    return {
        "id": str(contract.id), "name": contract.name, "active": contract.is_active,
        "start_date": contract.start_date, "end_date": contract.end_date,
        "monthly_fee": value(contract.monthly_fee), "labor_included": contract.labor_included,
        "labor_discount_percent": value(contract.labor_discount_percent),
        "parts_markup_percent": value(contract.parts_markup_percent), "notes": contract.notes,
        "customer": customer_summary(customer),
    }


def message_item(message: CaseMessage) -> dict:
    return {
        "id": str(message.id), "sender": message.sender, "author_name": message.author_name, "body": message.body,
        "created_at": message.created_at, "read": message.read_at is not None,
    }


# ---------- loading helpers ----------

def _by_id(db: Session, model, tenant_id, ids) -> dict:
    ids = {item for item in ids if item}
    if not ids:
        return {}
    return {row.id: row for row in db.scalars(select(model).where(model.tenant_id == tenant_id, model.id.in_(ids))).all()}


def case_rows(db: Session, tenant_id, cases: list[RepairCase]) -> list[dict]:
    customers = _by_id(db, Customer, tenant_id, [case.customer_id for case in cases])
    vehicles = _by_id(db, Vehicle, tenant_id, [case.vehicle_id for case in cases])
    return [case_summary(case, customers.get(case.customer_id), vehicles.get(case.vehicle_id)) for case in cases]


def staff_names(db: Session, tenant_id) -> dict:
    rows = db.execute(
        select(User.id, User.first_name, User.last_name)
        .join(UserTenant, UserTenant.user_id == User.id)
        .where(UserTenant.tenant_id == tenant_id)
    ).all()
    return {row.id: f"{row.first_name} {row.last_name}".strip() for row in rows}


# ---------- queries ----------

def workshop(db: Session, tenant_id) -> dict:
    settings = db.scalar(select(TenantSettings).where(TenantSettings.tenant_id == tenant_id))
    return {
        "name": settings.company_name if settings else None,
        "phone": settings.phone if settings else None,
        "email": settings.email if settings else None,
        "address": " ".join(part for part in ((settings.address, settings.postal_code, settings.city) if settings else ()) if part) or None,
        "chat_status": settings.chat_status if settings else None,
    }


def summary(db: Session, tenant_id, today: date | None = None) -> dict:
    today = today or date.today()
    month_start = today.replace(day=1)
    by_status = dict(db.execute(
        select(RepairCase.status, func.count()).where(RepairCase.tenant_id == tenant_id).group_by(RepairCase.status)
    ).all())
    open_cases = {value(status): count for status, count in by_status.items() if status not in CLOSED_CASES}
    waiting = db.scalars(select(Estimate).where(Estimate.tenant_id == tenant_id, Estimate.status.in_(WAITING_ESTIMATES))).all()
    issued = db.scalars(select(Invoice).where(Invoice.tenant_id == tenant_id, Invoice.status == InvoiceStatus.ISSUED)).all()
    overdue = [invoice for invoice in issued if invoice.due_date and invoice.due_date < today]
    paid_month = db.scalar(select(func.coalesce(func.sum(Invoice.total), 0)).where(
        Invoice.tenant_id == tenant_id, Invoice.status == InvoiceStatus.PAID, Invoice.paid_at >= month_start,
    ))
    issued_month = db.scalar(select(func.coalesce(func.sum(Invoice.total), 0)).where(
        Invoice.tenant_id == tenant_id, Invoice.status.in_([InvoiceStatus.ISSUED, InvoiceStatus.PAID]), Invoice.issue_date >= month_start,
    ))
    unread = db.scalar(select(func.count()).select_from(CaseMessage).where(
        CaseMessage.tenant_id == tenant_id, CaseMessage.sender == "CUSTOMER", CaseMessage.read_at.is_(None),
    ))
    open_tasks = db.scalar(select(func.count()).select_from(WorkOrderTask).where(
        WorkOrderTask.tenant_id == tenant_id, WorkOrderTask.status.in_([WorkTaskStatus.PENDING, WorkTaskStatus.IN_PROGRESS, WorkTaskStatus.BLOCKED]),
    ))
    maintenance = {"DUE": 0, "SOON": 0}
    for vehicle in db.scalars(select(Vehicle).where(Vehicle.tenant_id == tenant_id)).all():
        state = maintenance_status(vehicle, today)["state"]
        if state in maintenance:
            maintenance[state] += 1
    return {
        "date": today,
        "workshop": workshop(db, tenant_id),
        "cases": {
            "open_total": sum(open_cases.values()), "open_by_status": open_cases,
            "ready_for_pickup": open_cases.get("READY", 0),
            "delivered_or_invoiced": sum(count for status, count in by_status.items() if status in CLOSED_CASES),
        },
        "estimates_waiting_customer": {"count": len(waiting), "total": str(sum((item.total for item in waiting), Decimal("0")))},
        "invoices_unpaid": {"count": len(issued), "total": str(sum((item.total for item in issued), Decimal("0")))},
        "invoices_overdue": {"count": len(overdue), "total": str(sum((item.total for item in overdue), Decimal("0")))},
        "revenue_this_month": {"invoiced": str(issued_month), "collected": str(paid_month)},
        "unread_customer_messages": unread,
        "open_work_tasks": open_tasks,
        "vehicles_maintenance": {"due": maintenance["DUE"], "soon": maintenance["SOON"]},
        "customers": db.scalar(select(func.count()).select_from(Customer).where(Customer.tenant_id == tenant_id)),
        "vehicles": db.scalar(select(func.count()).select_from(Vehicle).where(Vehicle.tenant_id == tenant_id)),
        "active_contracts": db.scalar(select(func.count()).select_from(ServiceContract).where(
            ServiceContract.tenant_id == tenant_id, ServiceContract.is_active.is_(True),
        )),
    }


def search(db: Session, tenant_id, q: str) -> dict:
    text = q.strip()
    pattern = like(text)
    plate = integrations.normalize_plate(text)
    customers = db.scalars(select(Customer).where(Customer.tenant_id == tenant_id, or_(
        func.lower(Customer.company_name).like(pattern), func.lower(Customer.first_name).like(pattern),
        func.lower(Customer.last_name).like(pattern), func.lower(Customer.email).like(pattern),
        Customer.phone.like(f"%{text}%"), func.lower(Customer.vat_number).like(pattern), func.lower(Customer.tax_code).like(pattern),
    )).limit(10)).all()
    vehicles = [
        vehicle for vehicle in db.scalars(select(Vehicle).where(Vehicle.tenant_id == tenant_id)).all()
        if (plate and plate in integrations.normalize_plate(vehicle.license_plate))
        or (vehicle.vin and text.upper() in vehicle.vin.upper())
        or text.lower() in f"{vehicle.make or ''} {vehicle.model or ''}".lower()
    ][:10]
    cases = db.scalars(select(RepairCase).where(RepairCase.tenant_id == tenant_id, func.lower(RepairCase.case_number).like(pattern)).limit(10)).all()
    estimates = db.scalars(select(Estimate).where(Estimate.tenant_id == tenant_id, func.lower(Estimate.estimate_number).like(pattern)).limit(10)).all()
    invoices = db.scalars(select(Invoice).where(Invoice.tenant_id == tenant_id, func.lower(Invoice.invoice_number).like(pattern)).limit(10)).all()
    return {
        "query": text,
        "customers": [customer_summary(customer) for customer in customers],
        "vehicles": [vehicle_summary(vehicle) for vehicle in vehicles],
        "cases": case_rows(db, tenant_id, list(cases)),
        "estimates": [estimate_summary(estimate) for estimate in estimates],
        "invoices": [invoice_summary(invoice) for invoice in invoices],
    }


def list_cases(db: Session, tenant_id, *, status: str | None, open_only: bool, work_type: str | None,
               customer_id: UUID | None, vehicle_id: UUID | None, limit: int, offset: int) -> list[dict]:
    query = select(RepairCase).where(RepairCase.tenant_id == tenant_id)
    if status:
        query = query.where(RepairCase.status == RepairCaseStatus(status))
    if open_only:
        query = query.where(RepairCase.status.not_in(CLOSED_CASES))
    if work_type:
        query = query.where(RepairCase.work_type == work_type)
    if customer_id:
        query = query.where(RepairCase.customer_id == customer_id)
    if vehicle_id:
        query = query.where(RepairCase.vehicle_id == vehicle_id)
    cases = db.scalars(query.order_by(RepairCase.updated_at.desc(), RepairCase.id).offset(offset).limit(limit)).all()
    return case_rows(db, tenant_id, list(cases))


def case_detail(db: Session, tenant_id, case: RepairCase) -> dict:
    customer = db.scalar(select(Customer).where(Customer.id == case.customer_id, Customer.tenant_id == tenant_id))
    vehicle = db.scalar(select(Vehicle).where(Vehicle.id == case.vehicle_id, Vehicle.tenant_id == tenant_id))
    names = staff_names(db, tenant_id)
    estimates = db.scalars(select(Estimate).where(Estimate.repair_case_id == case.id, Estimate.tenant_id == tenant_id).order_by(Estimate.created_at)).all()
    estimate_items = []
    for estimate in estimates:
        lines = db.scalars(select(EstimateLine).where(EstimateLine.estimate_id == estimate.id, EstimateLine.tenant_id == tenant_id).order_by(EstimateLine.created_at, EstimateLine.id)).all()
        approval = db.scalar(select(EstimateApproval).where(EstimateApproval.estimate_id == estimate.id, EstimateApproval.tenant_id == tenant_id))
        estimate_items.append({
            **estimate_summary(estimate), "notes": estimate.notes, "lines": [estimate_line(line) for line in lines],
            "customer_response": None if approval is None else {
                "accepted": approval.accepted, "signature_name": approval.signature_name,
                "customer_notes": approval.customer_notes, "responded_at": approval.responded_at,
            },
        })
    work_orders = []
    for order in db.scalars(select(WorkOrder).where(WorkOrder.repair_case_id == case.id, WorkOrder.tenant_id == tenant_id).order_by(WorkOrder.created_at)).all():
        tasks = db.scalars(select(WorkOrderTask).where(WorkOrderTask.work_order_id == order.id, WorkOrderTask.tenant_id == tenant_id).order_by(WorkOrderTask.sort_order, WorkOrderTask.created_at)).all()
        work_orders.append({
            "id": str(order.id), "work_order_number": order.work_order_number, "status": value(order.status),
            "priority": order.priority, "notes": order.notes,
            "tasks": [{
                "id": str(task.id), "type": task.task_type, "description": task.description, "status": value(task.status),
                "assigned_to": names.get(task.assigned_user_id) if task.assigned_user_id else None,
            } for task in tasks],
        })
    markers = db.scalars(select(DamageMarker).where(DamageMarker.repair_case_id == case.id, DamageMarker.tenant_id == tenant_id).order_by(DamageMarker.created_at, DamageMarker.id)).all()
    photos = db.scalars(select(Media).where(Media.repair_case_id == case.id, Media.tenant_id == tenant_id).order_by(Media.created_at)).all()
    messages = db.scalars(select(CaseMessage).where(CaseMessage.repair_case_id == case.id, CaseMessage.tenant_id == tenant_id).order_by(CaseMessage.created_at, CaseMessage.id)).all()
    invoices = db.scalars(select(Invoice).where(Invoice.repair_case_id == case.id, Invoice.tenant_id == tenant_id).order_by(Invoice.created_at)).all()
    link = db.scalar(select(CaseTrackingLink).where(CaseTrackingLink.repair_case_id == case.id, CaseTrackingLink.tenant_id == tenant_id))
    return {
        **case_summary(case, customer, vehicle),
        "mileage_km": case.mileage, "fuel_level_percent": case.fuel_level_percent,
        "customer_notes": case.customer_notes, "internal_notes": case.internal_notes,
        "damages": [{
            "id": str(marker.id), "view": marker.view, "area": marker.area_label, "operation": marker.operation,
            "notes": marker.notes, "hand_drawn": bool(marker.sketch),
            "photos": sum(1 for photo in photos if photo.damage_marker_id == marker.id),
        } for marker in markers],
        "parts_and_jobs": case_parts(db, case, include_draft=True),
        "estimates": estimate_items,
        "work_orders": work_orders,
        "photos": [{
            "id": str(photo.id), "type": value(photo.media_type), "category": value(photo.category),
            "file_name": photo.original_filename, "created_at": photo.created_at,
            "damage_id": str(photo.damage_marker_id) if photo.damage_marker_id else None,
        } for photo in photos],
        "messages": [message_item(message) for message in messages],
        "invoices": [invoice_summary(invoice, customer) for invoice in invoices],
        "customer_tracking_link_active": bool(link and link.active),
    }


def list_customers(db: Session, tenant_id, *, q: str | None, limit: int, offset: int) -> list[dict]:
    query = select(Customer).where(Customer.tenant_id == tenant_id)
    if q:
        pattern = like(q)
        query = query.where(or_(
            func.lower(Customer.company_name).like(pattern), func.lower(Customer.first_name).like(pattern),
            func.lower(Customer.last_name).like(pattern), func.lower(Customer.email).like(pattern), Customer.phone.like(f"%{q.strip()}%"),
        ))
    customers = db.scalars(query.order_by(Customer.created_at.desc(), Customer.id).offset(offset).limit(limit)).all()
    return [customer_summary(customer) for customer in customers]


def customer_full(db: Session, tenant_id, customer: Customer) -> dict:
    vehicles = db.scalars(select(Vehicle).where(Vehicle.customer_id == customer.id, Vehicle.tenant_id == tenant_id).order_by(Vehicle.license_plate)).all()
    cases = db.scalars(select(RepairCase).where(RepairCase.customer_id == customer.id, RepairCase.tenant_id == tenant_id).order_by(RepairCase.updated_at.desc()).limit(50)).all()
    invoices = db.scalars(select(Invoice).where(Invoice.customer_id == customer.id, Invoice.tenant_id == tenant_id).order_by(Invoice.created_at.desc()).limit(50)).all()
    contracts = db.scalars(select(ServiceContract).where(ServiceContract.customer_id == customer.id, ServiceContract.tenant_id == tenant_id).order_by(ServiceContract.start_date.desc())).all()
    return {
        **customer_detail(customer),
        "vehicles": [{**vehicle_summary(vehicle), "maintenance_state": maintenance_status(vehicle)["state"]} for vehicle in vehicles],
        "cases": case_rows(db, tenant_id, list(cases)),
        "invoices": [invoice_summary(invoice, customer) for invoice in invoices],
        "contracts": [contract_summary(contract, customer) for contract in contracts],
    }


def list_vehicles(db: Session, tenant_id, *, q: str | None, maintenance: str | None, limit: int, offset: int) -> list[dict]:
    vehicles = db.scalars(select(Vehicle).where(Vehicle.tenant_id == tenant_id).order_by(Vehicle.license_plate)).all()
    if q:
        plate = integrations.normalize_plate(q)
        text = q.strip().lower()
        vehicles = [
            vehicle for vehicle in vehicles
            if (plate and plate in integrations.normalize_plate(vehicle.license_plate))
            or text in f"{vehicle.make or ''} {vehicle.model or ''} {vehicle.vin or ''} {vehicle.fleet_number or ''}".lower()
        ]
    rows = []
    for vehicle in vehicles:
        state = maintenance_status(vehicle)
        if maintenance and state["state"] != maintenance:
            continue
        rows.append({**vehicle_summary(vehicle), "maintenance": state})
    return rows[offset:offset + limit]


def vehicle_full(db: Session, tenant_id, vehicle: Vehicle) -> dict:
    customer = db.scalar(select(Customer).where(Customer.id == vehicle.customer_id, Customer.tenant_id == tenant_id)) if vehicle.customer_id else None
    cases = db.scalars(select(RepairCase).where(RepairCase.vehicle_id == vehicle.id, RepairCase.tenant_id == tenant_id).order_by(RepairCase.updated_at.desc()).limit(50)).all()
    return {**vehicle_detail(db, vehicle), "customer": customer_summary(customer), "cases": case_rows(db, tenant_id, list(cases))}


def list_estimates(db: Session, tenant_id, *, status: str | None, waiting: bool, limit: int, offset: int) -> list[dict]:
    query = select(Estimate).where(Estimate.tenant_id == tenant_id)
    if status:
        query = query.where(Estimate.status == EstimateStatus(status))
    if waiting:
        query = query.where(Estimate.status.in_(WAITING_ESTIMATES))
    estimates = db.scalars(query.order_by(Estimate.updated_at.desc(), Estimate.id).offset(offset).limit(limit)).all()
    cases = _by_id(db, RepairCase, tenant_id, [estimate.repair_case_id for estimate in estimates])
    rows = case_rows(db, tenant_id, list(cases.values()))
    case_info = {row["id"]: row for row in rows}
    return [{**estimate_summary(estimate), "case": case_info.get(str(estimate.repair_case_id))} for estimate in estimates]


def estimate_full(db: Session, tenant_id, estimate: Estimate) -> dict:
    lines = db.scalars(select(EstimateLine).where(EstimateLine.estimate_id == estimate.id, EstimateLine.tenant_id == tenant_id).order_by(EstimateLine.created_at, EstimateLine.id)).all()
    case = db.scalar(select(RepairCase).where(RepairCase.id == estimate.repair_case_id, RepairCase.tenant_id == tenant_id))
    return {
        **estimate_summary(estimate), "notes": estimate.notes,
        "labor_included": estimate.labor_included, "labor_discount_percent": value(estimate.labor_discount_percent),
        "parts_markup_percent": value(estimate.parts_markup_percent),
        "lines": [estimate_line(line) for line in lines],
        "case": case_rows(db, tenant_id, [case])[0] if case else None,
    }


def list_invoices(db: Session, tenant_id, *, status: str | None, overdue: bool, date_from: date | None, date_to: date | None,
                  limit: int, offset: int) -> list[dict]:
    today = date.today()
    query = select(Invoice).where(Invoice.tenant_id == tenant_id)
    if status:
        query = query.where(Invoice.status == InvoiceStatus(status))
    if overdue:
        query = query.where(Invoice.status == InvoiceStatus.ISSUED, Invoice.due_date < today)
    if date_from:
        query = query.where(Invoice.issue_date >= date_from)
    if date_to:
        query = query.where(Invoice.issue_date <= date_to)
    invoices = db.scalars(query.order_by(Invoice.created_at.desc(), Invoice.id).offset(offset).limit(limit)).all()
    customers = _by_id(db, Customer, tenant_id, [invoice.customer_id for invoice in invoices])
    return [invoice_summary(invoice, customers.get(invoice.customer_id), today) for invoice in invoices]


def invoice_full(db: Session, tenant_id, invoice: Invoice) -> dict:
    customer = db.scalar(select(Customer).where(Customer.id == invoice.customer_id, Customer.tenant_id == tenant_id)) if invoice.customer_id else None
    lines = db.scalars(select(InvoiceLine).where(InvoiceLine.invoice_id == invoice.id, InvoiceLine.tenant_id == tenant_id).order_by(InvoiceLine.created_at, InvoiceLine.id)).all()
    return {
        **invoice_summary(invoice, customer), "payment_method": invoice.payment_method, "notes": invoice.notes,
        "lines": [{
            "description": line.description, "quantity": value(line.quantity), "unit_price": value(line.unit_price),
            "vat_rate": value(line.vat_rate), "line_total": value(line.line_total),
        } for line in lines],
    }


def list_contracts(db: Session, tenant_id, *, active_only: bool) -> list[dict]:
    query = select(ServiceContract).where(ServiceContract.tenant_id == tenant_id)
    if active_only:
        query = query.where(ServiceContract.is_active.is_(True))
    contracts = db.scalars(query.order_by(ServiceContract.start_date.desc())).all()
    customers = _by_id(db, Customer, tenant_id, [contract.customer_id for contract in contracts])
    rows = []
    for contract in contracts:
        vehicles = db.scalar(select(func.count()).select_from(Vehicle).where(Vehicle.customer_id == contract.customer_id, Vehicle.tenant_id == tenant_id))
        rows.append({**contract_summary(contract, customers.get(contract.customer_id)), "vehicles": vehicles})
    return rows


def list_messages(db: Session, tenant_id, *, unread_only: bool, limit: int) -> list[dict]:
    query = select(CaseMessage).where(CaseMessage.tenant_id == tenant_id)
    if unread_only:
        query = query.where(CaseMessage.sender == "CUSTOMER", CaseMessage.read_at.is_(None))
    messages = db.scalars(query.order_by(CaseMessage.created_at.desc(), CaseMessage.id).limit(limit)).all()
    cases = _by_id(db, RepairCase, tenant_id, [message.repair_case_id for message in messages])
    case_info = {row["id"]: row for row in case_rows(db, tenant_id, list(cases.values()))}
    return [{**message_item(message), "case": case_info.get(str(message.repair_case_id))} for message in messages]


def list_staff(db: Session, tenant_id) -> list[dict]:
    users = db.scalars(
        select(User).join(UserTenant, UserTenant.user_id == User.id).where(UserTenant.tenant_id == tenant_id).order_by(User.first_name, User.last_name)
    ).all()
    roles: dict = {}
    for user_id, name in db.execute(
        select(UserRole.user_id, Role.name).join(Role, Role.id == UserRole.role_id).where(UserRole.tenant_id == tenant_id)
    ).all():
        roles.setdefault(user_id, []).append(name)
    open_states = [WorkTaskStatus.PENDING, WorkTaskStatus.IN_PROGRESS, WorkTaskStatus.BLOCKED]
    tasks: dict = {}
    for task in db.scalars(select(WorkOrderTask).where(WorkOrderTask.tenant_id == tenant_id, WorkOrderTask.status.in_(open_states))).all():
        if task.assigned_user_id:
            tasks.setdefault(task.assigned_user_id, []).append({"id": str(task.id), "description": task.description, "status": value(task.status)})
    return [{
        "id": str(user.id), "name": f"{user.first_name} {user.last_name}".strip(), "email": user.email,
        "status": value(user.status), "roles": sorted(roles.get(user.id, [])), "open_tasks": tasks.get(user.id, []),
    } for user in users]


def now() -> datetime:
    return datetime.now(timezone.utc)
