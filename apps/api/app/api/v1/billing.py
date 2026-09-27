from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
from io import BytesIO
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import StreamingResponse
from sqlalchemy import func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.db.deps import get_db
from app.models.billing import Invoice, InvoiceLine, InvoiceStatus
from app.models.contracts import ServiceContract
from app.models.estimating import Estimate, EstimateLine
from app.models.garage import Customer, RepairCase, RepairCaseStatus, Vehicle
from app.models.identity import TenantSettings
from app.schemas.billing import (
    InvoiceCreateFromEstimate,
    InvoiceDetail,
    InvoiceLineRead,
    InvoiceRead,
    InvoiceStatusUpdate,
    InvoiceUpdate,
)
from app.schemas.contracts import ContractFeeInvoiceCreate
from app.security.context import AuthContext, require_permission
from app.services.audit import record_audit
from app.services.contracts import customer_display_name
from app.services.fatturapa import FatturaPAError, build_fatturapa_xml
from app.services.pdf import build_invoice_pdf
from app.services.pricing import money

router = APIRouter(prefix="/invoices", tags=["billing"])
contract_router = APIRouter(prefix="/contracts", tags=["contracts"])

DEFAULT_PAYMENT_TERMS_DAYS = 30
MONTHS_IT = ["gennaio", "febbraio", "marzo", "aprile", "maggio", "giugno", "luglio", "agosto", "settembre", "ottobre", "novembre", "dicembre"]


def next_invoice_number(db: Session, tenant_id: UUID) -> str:
    year = datetime.now(timezone.utc).year
    prefix = f"NC-F-{year}-"
    last = db.scalar(
        select(func.max(Invoice.invoice_number)).where(
            Invoice.tenant_id == tenant_id,
            Invoice.invoice_number.like(f"{prefix}%"),
        )
    )
    sequence = int(last.rsplit("-", 1)[1]) + 1 if last else 1
    return f"{prefix}{sequence:06d}"


def get_tenant_invoice(db: Session, tenant_id: UUID, invoice_id: UUID) -> Invoice:
    invoice = db.scalar(select(Invoice).where(Invoice.id == invoice_id, Invoice.tenant_id == tenant_id))
    if invoice is None:
        raise HTTPException(status_code=404, detail="Invoice not found")
    return invoice


def invoice_context(db: Session, invoice: Invoice) -> tuple[Customer | None, Vehicle | None]:
    vehicle = None
    customer_id = invoice.customer_id
    if invoice.repair_case_id:
        case = db.scalar(
            select(RepairCase).where(RepairCase.id == invoice.repair_case_id, RepairCase.tenant_id == invoice.tenant_id)
        )
        if case is not None:
            customer_id = customer_id or case.customer_id
            vehicle = db.scalar(select(Vehicle).where(Vehicle.id == case.vehicle_id, Vehicle.tenant_id == invoice.tenant_id))
    customer = None
    if customer_id:
        customer = db.scalar(select(Customer).where(Customer.id == customer_id, Customer.tenant_id == invoice.tenant_id))
    return customer, vehicle


def to_read(invoice: Invoice, customer: Customer | None, vehicle: Vehicle | None, model=InvoiceRead):
    data = model.model_validate(invoice)
    data.customer_name = customer_display_name(customer)
    data.plate = vehicle.license_plate if vehicle is not None else None
    return data


def invoice_lines(db: Session, invoice: Invoice) -> list[InvoiceLine]:
    return list(db.scalars(
        select(InvoiceLine)
        .where(InvoiceLine.invoice_id == invoice.id, InvoiceLine.tenant_id == invoice.tenant_id)
        .order_by(InvoiceLine.created_at, InvoiceLine.id)
    ).all())


def detail(db: Session, invoice: Invoice) -> InvoiceDetail:
    customer, vehicle = invoice_context(db, invoice)
    data = to_read(invoice, customer, vehicle, InvoiceDetail)
    data.lines = [InvoiceLineRead.model_validate(line) for line in invoice_lines(db, invoice)]
    return data


def tenant_settings(db: Session, tenant_id: UUID) -> TenantSettings | None:
    return db.scalar(select(TenantSettings).where(TenantSettings.tenant_id == tenant_id))


@router.post("", response_model=InvoiceRead, status_code=status.HTTP_201_CREATED)
def create_invoice_from_estimate(
    payload: InvoiceCreateFromEstimate,
    db: Session = Depends(get_db),
    auth: AuthContext = Depends(require_permission("invoice.create")),
):
    estimate = db.scalar(
        select(Estimate).where(
            Estimate.id == payload.estimate_id,
            Estimate.tenant_id == auth.tenant_id,
        )
    )
    if estimate is None:
        raise HTTPException(status_code=404, detail="Estimate not found")

    existing = db.scalar(
        select(Invoice).where(
            Invoice.estimate_id == estimate.id,
            Invoice.tenant_id == auth.tenant_id,
            Invoice.status != InvoiceStatus.CANCELLED,
        )
    )
    if existing is not None:
        customer, vehicle = invoice_context(db, existing)
        return to_read(existing, customer, vehicle)

    case = db.scalar(
        select(RepairCase).where(RepairCase.id == estimate.repair_case_id, RepairCase.tenant_id == auth.tenant_id)
    )
    invoice = Invoice(
        tenant_id=auth.tenant_id,
        repair_case_id=estimate.repair_case_id,
        customer_id=case.customer_id if case else None,
        estimate_id=estimate.id,
        invoice_kind="REPAIR",
        invoice_number=next_invoice_number(db, auth.tenant_id),
        subtotal=estimate.subtotal,
        vat_total=estimate.vat_total,
        total=estimate.total,
        notes=payload.notes,
        payment_method="MP05" if estimate.contract_id else None,
    )
    db.add(invoice)
    db.flush()

    estimate_lines = db.scalars(
        select(EstimateLine)
        .where(
            EstimateLine.estimate_id == estimate.id,
            EstimateLine.tenant_id == auth.tenant_id,
        )
        .order_by(EstimateLine.created_at, EstimateLine.id)
    ).all()
    for line in estimate_lines:
        quantity = line.quantity if line.quantity else Decimal("1")
        unit_price = money(line.line_subtotal / quantity)
        description = line.description
        if money(unit_price * quantity) != line.line_subtotal:
            # Keep the electronic invoice arithmetic exact: bill the line as one unit.
            description = f"{line.description} (q.tà {line.quantity:g})"
            quantity, unit_price = Decimal("1"), line.line_subtotal
        db.add(
            InvoiceLine(
                tenant_id=auth.tenant_id,
                invoice_id=invoice.id,
                description=description[:255],
                quantity=quantity,
                unit_price=unit_price,
                vat_rate=line.vat_rate,
                line_subtotal=line.line_subtotal,
                line_vat=line.line_vat,
                line_total=line.line_total,
            )
        )

    record_audit(
        db,
        tenant_id=auth.tenant_id,
        user_id=auth.user_id,
        entity_type="invoice",
        entity_id=invoice.id,
        action="created",
        new_value={
            "invoice_number": invoice.invoice_number,
            "estimate_id": str(estimate.id),
            "subtotal": str(invoice.subtotal),
            "vat_total": str(invoice.vat_total),
            "total": str(invoice.total),
        },
    )
    db.commit()
    db.refresh(invoice)
    customer, vehicle = invoice_context(db, invoice)
    return to_read(invoice, customer, vehicle)


@contract_router.post("/{contract_id}/fee-invoices", response_model=InvoiceRead, status_code=status.HTTP_201_CREATED)
def create_contract_fee_invoice(
    contract_id: UUID,
    payload: ContractFeeInvoiceCreate,
    db: Session = Depends(get_db),
    auth: AuthContext = Depends(require_permission("invoice.create")),
):
    """Draft the monthly fee invoice of a fleet contract for one month (YYYY-MM)."""
    contract = db.scalar(
        select(ServiceContract).where(ServiceContract.id == contract_id, ServiceContract.tenant_id == auth.tenant_id)
    )
    if contract is None:
        raise HTTPException(status_code=404, detail="Contract not found")
    if contract.monthly_fee <= 0:
        raise HTTPException(status_code=409, detail="Contract has no monthly fee")
    year, month = (int(part) for part in payload.period_month.split("-"))
    first_day = date(year, month, 1)
    last_day = (first_day.replace(day=28) + timedelta(days=4)).replace(day=1) - timedelta(days=1)
    if first_day < contract.start_date.replace(day=1) or (contract.end_date and first_day > contract.end_date):
        raise HTTPException(status_code=409, detail="Period is outside the contract validity")
    existing = db.scalar(
        select(Invoice).where(
            Invoice.tenant_id == auth.tenant_id,
            Invoice.contract_id == contract.id,
            Invoice.period_month == payload.period_month,
        )
    )
    if existing is not None:
        raise HTTPException(status_code=409, detail="Fee invoice for this period already exists")

    subtotal = money(contract.monthly_fee)
    vat = money(subtotal * contract.fee_vat_rate / Decimal("100"))
    invoice = Invoice(
        tenant_id=auth.tenant_id,
        customer_id=contract.customer_id,
        contract_id=contract.id,
        invoice_kind="CONTRACT_FEE",
        period_month=payload.period_month,
        invoice_number=next_invoice_number(db, auth.tenant_id),
        subtotal=subtotal,
        vat_total=vat,
        total=subtotal + vat,
        payment_method="MP05",
    )
    db.add(invoice)
    db.flush()
    label = contract.fee_description or f"Canone manutenzione flotta — {contract.name}"
    db.add(InvoiceLine(
        tenant_id=auth.tenant_id,
        invoice_id=invoice.id,
        description=f"{label} ({MONTHS_IT[month - 1]} {year}, {first_day:%d/%m}–{last_day:%d/%m/%Y})"[:255],
        quantity=Decimal("1"),
        unit_price=subtotal,
        vat_rate=contract.fee_vat_rate,
        line_subtotal=subtotal,
        line_vat=vat,
        line_total=subtotal + vat,
    ))
    record_audit(
        db,
        tenant_id=auth.tenant_id,
        user_id=auth.user_id,
        entity_type="invoice",
        entity_id=invoice.id,
        action="created_contract_fee",
        new_value={"invoice_number": invoice.invoice_number, "contract_id": str(contract.id), "period_month": payload.period_month, "total": str(invoice.total)},
    )
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="Fee invoice for this period already exists")
    db.refresh(invoice)
    customer, _ = invoice_context(db, invoice)
    return to_read(invoice, customer, None)


@router.get("", response_model=list[InvoiceRead])
def list_invoices(
    q: str = "",
    status_filter: InvoiceStatus | None = Query(None, alias="status"),
    kind: str | None = Query(None, pattern="^(REPAIR|CONTRACT_FEE)$"),
    customer_id: UUID | None = None,
    offset: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=200),
    db: Session = Depends(get_db),
    auth: AuthContext = Depends(require_permission("invoice.read")),
):
    query = (
        select(Invoice, Customer, Vehicle)
        .outerjoin(RepairCase, RepairCase.id == Invoice.repair_case_id)
        .outerjoin(Customer, Customer.id == func.coalesce(Invoice.customer_id, RepairCase.customer_id))
        .outerjoin(Vehicle, Vehicle.id == RepairCase.vehicle_id)
        .where(Invoice.tenant_id == auth.tenant_id)
    )
    if status_filter is not None:
        query = query.where(Invoice.status == status_filter)
    if kind is not None:
        query = query.where(Invoice.invoice_kind == kind)
    if customer_id is not None:
        query = query.where(Customer.id == customer_id)
    if q.strip():
        term = q.strip()
        query = query.where(or_(
            Invoice.invoice_number.icontains(term, autoescape=True),
            Customer.company_name.icontains(term, autoescape=True),
            Customer.first_name.icontains(term, autoescape=True),
            Customer.last_name.icontains(term, autoescape=True),
            Vehicle.license_plate.icontains(term, autoescape=True),
        ))
    rows = db.execute(query.order_by(Invoice.created_at.desc(), Invoice.id.desc()).offset(offset).limit(limit)).all()
    return [to_read(invoice, customer, vehicle) for invoice, customer, vehicle in rows]


@router.get("/{invoice_id}", response_model=InvoiceDetail)
def get_invoice(
    invoice_id: UUID,
    db: Session = Depends(get_db),
    auth: AuthContext = Depends(require_permission("invoice.read")),
):
    return detail(db, get_tenant_invoice(db, auth.tenant_id, invoice_id))


@router.patch("/{invoice_id}", response_model=InvoiceDetail)
def update_invoice(
    invoice_id: UUID,
    payload: InvoiceUpdate,
    db: Session = Depends(get_db),
    auth: AuthContext = Depends(require_permission("invoice.create")),
):
    invoice = get_tenant_invoice(db, auth.tenant_id, invoice_id)
    changes = payload.model_dump(exclude_unset=True)
    if invoice.status == InvoiceStatus.CANCELLED:
        raise HTTPException(status_code=409, detail="Cancelled invoices cannot be edited")
    if invoice.status != InvoiceStatus.DRAFT and "issue_date" in changes and changes["issue_date"] != invoice.issue_date:
        raise HTTPException(status_code=409, detail="The date of an issued invoice cannot change")
    issue = changes.get("issue_date", invoice.issue_date)
    due = changes.get("due_date", invoice.due_date)
    if issue and due and due < issue:
        raise HTTPException(status_code=422, detail="due_date must not be before issue_date")
    old_value = {key: str(getattr(invoice, key)) if getattr(invoice, key) is not None else None for key in changes}
    for key, value in changes.items():
        setattr(invoice, key, value)
    record_audit(
        db,
        tenant_id=auth.tenant_id,
        user_id=auth.user_id,
        entity_type="invoice",
        entity_id=invoice.id,
        action="updated",
        old_value=old_value,
        new_value={key: str(value) if value is not None else None for key, value in changes.items()},
    )
    db.commit()
    db.refresh(invoice)
    return detail(db, invoice)


ALLOWED_TRANSITIONS = {
    InvoiceStatus.DRAFT: {InvoiceStatus.DRAFT, InvoiceStatus.ISSUED, InvoiceStatus.CANCELLED},
    InvoiceStatus.ISSUED: {InvoiceStatus.ISSUED, InvoiceStatus.PAID, InvoiceStatus.CANCELLED},
    InvoiceStatus.PAID: {InvoiceStatus.PAID, InvoiceStatus.ISSUED},
    InvoiceStatus.CANCELLED: {InvoiceStatus.CANCELLED},
}


@router.patch("/{invoice_id}/status", response_model=InvoiceRead)
def update_invoice_status(
    invoice_id: UUID,
    payload: InvoiceStatusUpdate,
    db: Session = Depends(get_db),
    auth: AuthContext = Depends(require_permission("invoice.create")),
):
    invoice = get_tenant_invoice(db, auth.tenant_id, invoice_id)
    if payload.status not in ALLOWED_TRANSITIONS[invoice.status]:
        raise HTTPException(status_code=409, detail=f"Invoice cannot move from {invoice.status.value} to {payload.status.value}")
    old_status = invoice.status.value
    invoice.status = payload.status
    today = date.today()
    if payload.status == InvoiceStatus.ISSUED:
        if invoice.issue_date is None:
            invoice.issue_date = today
        if invoice.due_date is None:
            invoice.due_date = invoice.issue_date + timedelta(days=DEFAULT_PAYMENT_TERMS_DAYS)
        invoice.paid_at = None
        repair_case = db.scalar(
            select(RepairCase).where(
                RepairCase.id == invoice.repair_case_id,
                RepairCase.tenant_id == auth.tenant_id,
            )
        ) if invoice.repair_case_id else None
        if repair_case is not None:
            repair_case.status = RepairCaseStatus.INVOICED
    elif payload.status == InvoiceStatus.PAID:
        invoice.paid_at = payload.paid_at or invoice.paid_at or today
    record_audit(
        db,
        tenant_id=auth.tenant_id,
        user_id=auth.user_id,
        entity_type="invoice",
        entity_id=invoice.id,
        action="status_changed",
        field_name="status",
        old_value=old_status,
        new_value=payload.status.value,
    )
    db.commit()
    db.refresh(invoice)
    customer, vehicle = invoice_context(db, invoice)
    return to_read(invoice, customer, vehicle)


@router.get("/{invoice_id}/pdf")
def invoice_pdf(
    invoice_id: UUID,
    db: Session = Depends(get_db),
    auth: AuthContext = Depends(require_permission("invoice.read")),
):
    invoice = get_tenant_invoice(db, auth.tenant_id, invoice_id)
    customer, vehicle = invoice_context(db, invoice)
    settings = tenant_settings(db, auth.tenant_id)
    pdf = build_invoice_pdf(
        invoice=invoice,
        lines=invoice_lines(db, invoice),
        customer=customer,
        vehicle=vehicle,
        company_name=(settings.company_name if settings and settings.company_name else "NAKAMA CAR"),
        settings=settings,
    )
    return StreamingResponse(
        BytesIO(pdf),
        media_type="application/pdf",
        headers={"Content-Disposition": f'inline; filename="{invoice.invoice_number}.pdf"'},
    )


@router.get("/{invoice_id}/fatturapa")
def invoice_fatturapa(
    invoice_id: UUID,
    db: Session = Depends(get_db),
    auth: AuthContext = Depends(require_permission("invoice.read")),
):
    """Download the FatturaPA XML to upload to the SdI (AdE portal or intermediary)."""
    invoice = get_tenant_invoice(db, auth.tenant_id, invoice_id)
    customer, _ = invoice_context(db, invoice)
    settings = tenant_settings(db, auth.tenant_id)
    try:
        filename, xml = build_fatturapa_xml(
            invoice=invoice,
            lines=invoice_lines(db, invoice),
            customer=customer,
            settings=settings,
            company_name=(settings.company_name if settings and settings.company_name else "NAKAMA CAR"),
        )
    except FatturaPAError as error:
        raise HTTPException(status_code=422, detail={"message": "Missing data for FatturaPA", "missing": error.missing})
    return StreamingResponse(
        BytesIO(xml),
        media_type="application/xml",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
