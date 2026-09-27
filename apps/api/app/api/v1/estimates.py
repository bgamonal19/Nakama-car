from datetime import datetime, timezone
from decimal import Decimal
from io import BytesIO
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.db.deps import get_db
from app.models.contracts import ServiceContract
from app.models.estimating import Estimate, EstimateLine, EstimateStatus, LaborRate
from app.models.garage import Customer, RepairCase, Vehicle
from app.models.identity import TenantSettings
from app.schemas.estimating import (
    EstimateCreate,
    EstimateLineCreate,
    EstimateLineRead,
    EstimateListItem,
    EstimateRead,
    EstimateStatusUpdate,
    LaborRateRead,
    LaborRateUpsert,
)
from app.security.context import AuthContext, require_permission
from app.services.audit import record_audit
from app.services.contracts import customer_display_name, find_active_contract
from app.services.pdf import build_estimate_pdf
from app.services.pricing import PUBLIC_TERMS, PricingTerms, money, price_line

router = APIRouter(tags=["estimates"])


class EstimatePricingUpdate(BaseModel):
    apply_contract: bool


def terms_of(estimate: Estimate) -> PricingTerms:
    return PricingTerms.from_source(estimate)


def line_read(line: EstimateLine, terms: PricingTerms) -> EstimateLineRead:
    data = EstimateLineRead.model_validate(line)
    amounts = price_line(line, terms)
    data.parts_amount = amounts.parts
    data.labor_amount = amounts.labor
    return data


def apply_terms(estimate: Estimate, contract: ServiceContract | None) -> None:
    terms = PricingTerms.from_source(contract) if contract else PUBLIC_TERMS
    estimate.contract_id = contract.id if contract else None
    estimate.labor_included = terms.labor_included
    estimate.labor_discount_percent = terms.labor_discount_percent
    estimate.parts_markup_percent = terms.parts_markup_percent


def get_tenant_estimate(db: Session, tenant_id: UUID, estimate_id: UUID) -> Estimate:
    estimate = db.scalar(
        select(Estimate).where(Estimate.id == estimate_id, Estimate.tenant_id == tenant_id)
    )
    if estimate is None:
        raise HTTPException(status_code=404, detail="Estimate not found")
    return estimate


def recalculate(db: Session, estimate: Estimate, reprice: bool = False) -> None:
    lines = db.scalars(
        select(EstimateLine).where(
            EstimateLine.tenant_id == estimate.tenant_id,
            EstimateLine.estimate_id == estimate.id,
        )
    ).all()
    if reprice:
        terms = terms_of(estimate)
        for line in lines:
            amounts = price_line(line, terms)
            line.line_subtotal, line.line_vat, line.line_total = amounts.subtotal, amounts.vat, amounts.total
    subtotal = sum((line.line_subtotal for line in lines), Decimal("0"))
    vat_total = sum((line.line_vat for line in lines), Decimal("0"))
    estimate.subtotal = money(subtotal)
    estimate.vat_total = money(vat_total)
    estimate.total = money(subtotal + vat_total)


def calculate_line(payload: EstimateLineCreate, terms: PricingTerms = PUBLIC_TERMS):
    """Return (subtotal, vat, total) for a line under the given pricing terms."""
    amounts = price_line(payload, terms)
    return amounts.subtotal, amounts.vat, money(amounts.total)


@router.get("/settings/labor-rates", response_model=list[LaborRateRead])
def list_labor_rates(
    db: Session = Depends(get_db),
    auth: AuthContext = Depends(require_permission("settings.manage")),
):
    return db.scalars(
        select(LaborRate).where(LaborRate.tenant_id == auth.tenant_id).order_by(LaborRate.labor_type)
    ).all()


@router.put("/settings/labor-rates/{labor_type}", response_model=LaborRateRead)
def upsert_labor_rate(
    labor_type: str,
    payload: LaborRateUpsert,
    db: Session = Depends(get_db),
    auth: AuthContext = Depends(require_permission("settings.manage")),
):
    rate = db.scalar(
        select(LaborRate).where(
            LaborRate.tenant_id == auth.tenant_id,
            LaborRate.labor_type == payload.labor_type,
        )
    )
    old_value = None
    if rate is None:
        rate = LaborRate(tenant_id=auth.tenant_id, **payload.model_dump())
        db.add(rate)
        db.flush()
    else:
        old_value = {"hourly_rate": str(rate.hourly_rate), "currency": rate.currency}
        rate.hourly_rate = payload.hourly_rate
        rate.currency = payload.currency
    record_audit(
        db,
        tenant_id=auth.tenant_id,
        user_id=auth.user_id,
        entity_type="labor_rate",
        entity_id=rate.id,
        action="created" if old_value is None else "updated",
        old_value=old_value,
        new_value={"hourly_rate": str(payload.hourly_rate), "currency": payload.currency, "labor_type": payload.labor_type.value},
    )
    db.commit()
    db.refresh(rate)
    return rate


@router.post("/estimates", response_model=EstimateRead, status_code=status.HTTP_201_CREATED)
def create_estimate(
    payload: EstimateCreate,
    db: Session = Depends(get_db),
    auth: AuthContext = Depends(require_permission("estimate.create")),
):
    case = db.scalar(
        select(RepairCase).where(
            RepairCase.id == payload.repair_case_id,
            RepairCase.tenant_id == auth.tenant_id,
        )
    )
    if case is None:
        raise HTTPException(status_code=404, detail="Repair case not found")

    year = datetime.now(timezone.utc).year
    count = db.scalar(
        select(func.count(Estimate.id)).where(
            Estimate.tenant_id == auth.tenant_id,
            Estimate.estimate_number.like(f"NC-P-{year}-%"),
        )
    ) or 0

    estimate = Estimate(
        tenant_id=auth.tenant_id,
        repair_case_id=payload.repair_case_id,
        estimate_number=f"NC-P-{year}-{count + 1:06d}",
        notes=payload.notes,
    )
    contract = None
    if payload.apply_contract is not False:
        contract = find_active_contract(db, auth.tenant_id, case.customer_id)
        if payload.apply_contract and contract is None:
            raise HTTPException(status_code=409, detail="Customer has no active service contract")
    apply_terms(estimate, contract)
    db.add(estimate)
    db.commit()
    db.refresh(estimate)
    return estimate


@router.get("/estimates", response_model=list[EstimateListItem])
def list_estimates(
    q: str = "",
    status_filter: EstimateStatus | None = Query(None, alias="status"),
    repair_case_id: UUID | None = None,
    offset: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=200),
    db: Session = Depends(get_db),
    auth: AuthContext = Depends(require_permission("estimate.read")),
):
    query = (
        select(Estimate, RepairCase, Vehicle, Customer, ServiceContract)
        .join(RepairCase, RepairCase.id == Estimate.repair_case_id)
        .join(Vehicle, Vehicle.id == RepairCase.vehicle_id)
        .join(Customer, Customer.id == RepairCase.customer_id)
        .outerjoin(ServiceContract, ServiceContract.id == Estimate.contract_id)
        .where(Estimate.tenant_id == auth.tenant_id, RepairCase.tenant_id == auth.tenant_id)
    )
    if status_filter is not None:
        query = query.where(Estimate.status == status_filter)
    if repair_case_id is not None:
        query = query.where(Estimate.repair_case_id == repair_case_id)
    if q.strip():
        term = q.strip()
        query = query.where(or_(
            Estimate.estimate_number.icontains(term, autoescape=True),
            RepairCase.case_number.icontains(term, autoescape=True),
            Vehicle.license_plate.icontains(term, autoescape=True),
            Vehicle.fleet_number.icontains(term, autoescape=True),
            Customer.company_name.icontains(term, autoescape=True),
            Customer.first_name.icontains(term, autoescape=True),
            Customer.last_name.icontains(term, autoescape=True),
        ))
    rows = db.execute(query.order_by(Estimate.created_at.desc(), Estimate.id.desc()).offset(offset).limit(limit)).all()
    items = []
    for estimate, case, vehicle, customer, contract in rows:
        item = EstimateListItem.model_validate(estimate)
        item.case_number = case.case_number
        item.plate = vehicle.license_plate
        item.customer_name = customer_display_name(customer)
        item.contract_name = contract.name if contract else None
        items.append(item)
    return items


@router.get("/estimates/{estimate_id}", response_model=EstimateRead)
def get_estimate(
    estimate_id: UUID,
    db: Session = Depends(get_db),
    auth: AuthContext = Depends(require_permission("estimate.read")),
):
    return get_tenant_estimate(db, auth.tenant_id, estimate_id)


@router.patch("/estimates/{estimate_id}/status", response_model=EstimateRead)
def update_estimate_status(
    estimate_id: UUID,
    payload: EstimateStatusUpdate,
    db: Session = Depends(get_db),
    auth: AuthContext = Depends(require_permission("estimate.approve")),
):
    estimate = get_tenant_estimate(db, auth.tenant_id, estimate_id)
    if estimate.status == EstimateStatus.APPROVED and payload.status != EstimateStatus.APPROVED:
        raise HTTPException(status_code=409, detail="Approved estimates are immutable")
    old_status = estimate.status.value
    estimate.status = payload.status
    record_audit(
        db,
        tenant_id=auth.tenant_id,
        user_id=auth.user_id,
        entity_type="estimate",
        entity_id=estimate.id,
        action="status_changed",
        field_name="status",
        old_value=old_status,
        new_value=payload.status.value,
    )
    db.commit()
    db.refresh(estimate)
    return estimate


@router.patch("/estimates/{estimate_id}/pricing", response_model=EstimateRead)
def update_estimate_pricing(
    estimate_id: UUID,
    payload: EstimatePricingUpdate,
    db: Session = Depends(get_db),
    auth: AuthContext = Depends(require_permission("estimate.change_price")),
):
    """Switch a draft estimate between public prices and the customer's contract terms."""
    estimate = get_tenant_estimate(db, auth.tenant_id, estimate_id)
    if estimate.status == EstimateStatus.APPROVED:
        raise HTTPException(status_code=409, detail="Approved estimates cannot be edited")
    contract = None
    if payload.apply_contract:
        case = db.scalar(select(RepairCase).where(RepairCase.id == estimate.repair_case_id, RepairCase.tenant_id == auth.tenant_id))
        contract = find_active_contract(db, auth.tenant_id, case.customer_id) if case else None
        if contract is None:
            raise HTTPException(status_code=409, detail="Customer has no active service contract")
    old_value = {"contract_id": str(estimate.contract_id) if estimate.contract_id else None, "total": str(estimate.total)}
    apply_terms(estimate, contract)
    recalculate(db, estimate, reprice=True)
    record_audit(
        db,
        tenant_id=auth.tenant_id,
        user_id=auth.user_id,
        entity_type="estimate",
        entity_id=estimate.id,
        action="pricing_changed",
        field_name="contract_id",
        old_value=old_value,
        new_value={"contract_id": str(contract.id) if contract else None, "total": str(estimate.total)},
    )
    db.commit()
    db.refresh(estimate)
    return estimate


@router.get("/estimates/{estimate_id}/lines", response_model=list[EstimateLineRead])
def list_estimate_lines(
    estimate_id: UUID,
    db: Session = Depends(get_db),
    auth: AuthContext = Depends(require_permission("estimate.read")),
):
    estimate = get_tenant_estimate(db, auth.tenant_id, estimate_id)
    terms = terms_of(estimate)
    lines = db.scalars(
        select(EstimateLine)
        .where(EstimateLine.estimate_id == estimate_id, EstimateLine.tenant_id == auth.tenant_id)
        .order_by(EstimateLine.created_at, EstimateLine.id)
    ).all()
    return [line_read(line, terms) for line in lines]


@router.post("/estimates/{estimate_id}/lines", response_model=EstimateLineRead, status_code=201)
def add_estimate_line(
    estimate_id: UUID,
    payload: EstimateLineCreate,
    db: Session = Depends(get_db),
    auth: AuthContext = Depends(require_permission("estimate.create")),
):
    estimate = get_tenant_estimate(db, auth.tenant_id, estimate_id)
    if estimate.status == EstimateStatus.APPROVED:
        raise HTTPException(status_code=409, detail="Approved estimates cannot be edited")

    subtotal, vat, total = calculate_line(payload, terms_of(estimate))
    line = EstimateLine(
        tenant_id=auth.tenant_id,
        estimate_id=estimate_id,
        line_subtotal=subtotal,
        line_vat=vat,
        line_total=total,
        **payload.model_dump(),
    )
    db.add(line)
    db.flush()
    record_audit(
        db,
        tenant_id=auth.tenant_id,
        user_id=auth.user_id,
        entity_type="estimate_line",
        entity_id=line.id,
        action="created",
        new_value={
            "description": line.description,
            "quantity": str(line.quantity),
            "unit_price": str(line.unit_price),
            "labor_hours": str(line.labor_hours),
            "labor_rate": str(line.labor_rate),
            "paint_hours": str(line.paint_hours),
            "paint_rate": str(line.paint_rate),
            "materials": str(line.materials),
            "vat_rate": str(line.vat_rate),
        },
    )
    recalculate(db, estimate)
    db.commit()
    db.refresh(line)
    return line_read(line, terms_of(estimate))


@router.put("/estimates/{estimate_id}/lines/{line_id}", response_model=EstimateLineRead)
def update_estimate_line(
    estimate_id: UUID,
    line_id: UUID,
    payload: EstimateLineCreate,
    db: Session = Depends(get_db),
    auth: AuthContext = Depends(require_permission("estimate.change_price")),
):
    estimate = get_tenant_estimate(db, auth.tenant_id, estimate_id)
    if estimate.status == EstimateStatus.APPROVED:
        raise HTTPException(status_code=409, detail="Approved estimates cannot be edited")

    line = db.scalar(
        select(EstimateLine).where(
            EstimateLine.id == line_id,
            EstimateLine.estimate_id == estimate_id,
            EstimateLine.tenant_id == auth.tenant_id,
        )
    )
    if line is None:
        raise HTTPException(status_code=404, detail="Estimate line not found")

    old_value = {
        "description": line.description,
        "quantity": str(line.quantity),
        "unit_price": str(line.unit_price),
        "discount_percent": str(line.discount_percent),
        "labor_hours": str(line.labor_hours),
        "labor_rate": str(line.labor_rate),
        "paint_hours": str(line.paint_hours),
        "paint_rate": str(line.paint_rate),
        "materials": str(line.materials),
        "vat_rate": str(line.vat_rate),
    }

    subtotal, vat, total = calculate_line(payload, terms_of(estimate))
    for key, value in payload.model_dump().items():
        setattr(line, key, value)
    line.line_subtotal = subtotal
    line.line_vat = vat
    line.line_total = total

    record_audit(
        db,
        tenant_id=auth.tenant_id,
        user_id=auth.user_id,
        entity_type="estimate_line",
        entity_id=line.id,
        action="updated",
        old_value=old_value,
        new_value={
            "description": line.description,
            "quantity": str(line.quantity),
            "unit_price": str(line.unit_price),
            "discount_percent": str(line.discount_percent),
            "labor_hours": str(line.labor_hours),
            "labor_rate": str(line.labor_rate),
            "paint_hours": str(line.paint_hours),
            "paint_rate": str(line.paint_rate),
            "materials": str(line.materials),
            "vat_rate": str(line.vat_rate),
        },
    )
    recalculate(db, estimate)
    db.commit()
    db.refresh(line)
    return line_read(line, terms_of(estimate))


@router.delete("/estimates/{estimate_id}/lines/{line_id}", status_code=204)
def delete_estimate_line(
    estimate_id: UUID,
    line_id: UUID,
    db: Session = Depends(get_db),
    auth: AuthContext = Depends(require_permission("estimate.create")),
):
    estimate = get_tenant_estimate(db, auth.tenant_id, estimate_id)
    if estimate.status == EstimateStatus.APPROVED:
        raise HTTPException(status_code=409, detail="Approved estimates cannot be edited")

    line = db.scalar(
        select(EstimateLine).where(
            EstimateLine.id == line_id,
            EstimateLine.estimate_id == estimate_id,
            EstimateLine.tenant_id == auth.tenant_id,
        )
    )
    if line is None:
        raise HTTPException(status_code=404, detail="Estimate line not found")
    record_audit(
        db,
        tenant_id=auth.tenant_id,
        user_id=auth.user_id,
        entity_type="estimate_line",
        entity_id=line.id,
        action="deleted",
        old_value={
            "description": line.description,
            "line_total": str(line.line_total),
        },
    )
    db.delete(line)
    db.flush()
    recalculate(db, estimate)
    db.commit()
    return None


@router.get("/estimates/{estimate_id}/pdf")
def estimate_pdf(
    estimate_id: UUID,
    db: Session = Depends(get_db),
    auth: AuthContext = Depends(require_permission("estimate.read")),
):
    estimate = get_tenant_estimate(db, auth.tenant_id, estimate_id)
    case = db.scalar(
        select(RepairCase).where(
            RepairCase.id == estimate.repair_case_id,
            RepairCase.tenant_id == auth.tenant_id,
        )
    )
    if case is None:
        raise HTTPException(status_code=404, detail="Repair case not found")

    customer = db.scalar(
        select(Customer).where(Customer.id == case.customer_id, Customer.tenant_id == auth.tenant_id)
    )
    vehicle = db.scalar(
        select(Vehicle).where(Vehicle.id == case.vehicle_id, Vehicle.tenant_id == auth.tenant_id)
    )
    if customer is None or vehicle is None:
        raise HTTPException(status_code=404, detail="Customer or vehicle not found")

    lines = db.scalars(
        select(EstimateLine)
        .where(EstimateLine.estimate_id == estimate_id, EstimateLine.tenant_id == auth.tenant_id)
        .order_by(EstimateLine.created_at)
    ).all()
    settings = db.scalar(select(TenantSettings).where(TenantSettings.tenant_id == auth.tenant_id))
    contract = db.get(ServiceContract, estimate.contract_id) if estimate.contract_id else None
    pdf = build_estimate_pdf(
        estimate=estimate,
        lines=lines,
        customer=customer,
        vehicle=vehicle,
        company_name=(settings.company_name if settings and settings.company_name else "NAKAMA CAR"),
        settings=settings,
        terms=terms_of(estimate),
        contract_name=contract.name if contract and contract.tenant_id == auth.tenant_id else None,
    )

    filename = f"{estimate.estimate_number}.pdf"
    return StreamingResponse(
        BytesIO(pdf),
        media_type="application/pdf",
        headers={"Content-Disposition": f'inline; filename="{filename}"'},
    )
