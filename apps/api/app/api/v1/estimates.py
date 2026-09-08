from datetime import datetime, timezone
from decimal import Decimal, ROUND_HALF_UP
from io import BytesIO
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import StreamingResponse
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.db.deps import get_db
from app.models.estimating import Estimate, EstimateLine, EstimateStatus, LaborRate
from app.models.garage import Customer, RepairCase, Vehicle
from app.models.identity import TenantSettings
from app.schemas.estimating import (
    EstimateCreate,
    EstimateLineCreate,
    EstimateLineRead,
    EstimateRead,
    EstimateStatusUpdate,
    LaborRateRead,
    LaborRateUpsert,
)
from app.security.context import AuthContext, require_permission
from app.services.audit import record_audit
from app.services.pdf import build_estimate_pdf

router = APIRouter(tags=["estimates"])
MONEY = Decimal("0.01")


def money(value: Decimal) -> Decimal:
    return value.quantize(MONEY, rounding=ROUND_HALF_UP)


def get_tenant_estimate(db: Session, tenant_id: UUID, estimate_id: UUID) -> Estimate:
    estimate = db.scalar(
        select(Estimate).where(Estimate.id == estimate_id, Estimate.tenant_id == tenant_id)
    )
    if estimate is None:
        raise HTTPException(status_code=404, detail="Estimate not found")
    return estimate


def recalculate(db: Session, estimate: Estimate) -> None:
    lines = db.scalars(
        select(EstimateLine).where(
            EstimateLine.tenant_id == estimate.tenant_id,
            EstimateLine.estimate_id == estimate.id,
        )
    ).all()
    subtotal = sum((line.line_subtotal for line in lines), Decimal("0"))
    vat_total = sum((line.line_vat for line in lines), Decimal("0"))
    estimate.subtotal = money(subtotal)
    estimate.vat_total = money(vat_total)
    estimate.total = money(subtotal + vat_total)


def calculate_line(payload: EstimateLineCreate) -> tuple[Decimal, Decimal, Decimal]:
    parts = payload.quantity * payload.unit_price
    parts_after_discount = parts * (Decimal("1") - payload.discount_percent / Decimal("100"))
    labor = payload.labor_hours * payload.labor_rate
    paint = payload.paint_hours * payload.paint_rate
    subtotal = money(parts_after_discount + labor + paint + payload.materials)
    vat = money(subtotal * payload.vat_rate / Decimal("100"))
    return subtotal, vat, money(subtotal + vat)


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
    if rate is None:
        rate = LaborRate(tenant_id=auth.tenant_id, **payload.model_dump())
        db.add(rate)
    else:
        rate.hourly_rate = payload.hourly_rate
        rate.currency = payload.currency
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
    db.add(estimate)
    db.commit()
    db.refresh(estimate)
    return estimate


@router.get("/estimates", response_model=list[EstimateRead])
def list_estimates(
    db: Session = Depends(get_db),
    auth: AuthContext = Depends(require_permission("estimate.read")),
):
    return db.scalars(
        select(Estimate)
        .where(Estimate.tenant_id == auth.tenant_id)
        .order_by(Estimate.created_at.desc())
        .limit(200)
    ).all()


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


@router.get("/estimates/{estimate_id}/lines", response_model=list[EstimateLineRead])
def list_estimate_lines(
    estimate_id: UUID,
    db: Session = Depends(get_db),
    auth: AuthContext = Depends(require_permission("estimate.read")),
):
    get_tenant_estimate(db, auth.tenant_id, estimate_id)
    return db.scalars(
        select(EstimateLine)
        .where(EstimateLine.estimate_id == estimate_id, EstimateLine.tenant_id == auth.tenant_id)
        .order_by(EstimateLine.created_at)
    ).all()


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

    subtotal, vat, total = calculate_line(payload)
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
    return line


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
    pdf = build_estimate_pdf(
        estimate=estimate,
        lines=lines,
        customer=customer,
        vehicle=vehicle,
        company_name=(settings.company_name if settings and settings.company_name else "NAKAMA CAR"),
    )

    filename = f"{estimate.estimate_number}.pdf"
    return StreamingResponse(
        BytesIO(pdf),
        media_type="application/pdf",
        headers={"Content-Disposition": f'inline; filename="{filename}"'},
    )
