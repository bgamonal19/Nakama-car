from datetime import datetime, timezone
from decimal import Decimal, ROUND_HALF_UP
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.db.deps import get_db
from app.models.estimating import Estimate, EstimateLine, LaborRate
from app.models.garage import RepairCase
from app.schemas.estimating import (
    EstimateCreate,
    EstimateLineCreate,
    EstimateLineRead,
    EstimateRead,
    LaborRateRead,
    LaborRateUpsert,
)
from app.security.context import AuthContext, require_permission

router = APIRouter(tags=["estimates"])
MONEY = Decimal("0.01")


def money(value: Decimal) -> Decimal:
    return value.quantize(MONEY, rounding=ROUND_HALF_UP)


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


@router.get("/estimates/{estimate_id}", response_model=EstimateRead)
def get_estimate(
    estimate_id: UUID,
    db: Session = Depends(get_db),
    auth: AuthContext = Depends(require_permission("estimate.read")),
):
    estimate = db.scalar(
        select(Estimate).where(Estimate.id == estimate_id, Estimate.tenant_id == auth.tenant_id)
    )
    if estimate is None:
        raise HTTPException(status_code=404, detail="Estimate not found")
    return estimate


@router.get("/estimates/{estimate_id}/lines", response_model=list[EstimateLineRead])
def list_estimate_lines(
    estimate_id: UUID,
    db: Session = Depends(get_db),
    auth: AuthContext = Depends(require_permission("estimate.read")),
):
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
    estimate = db.scalar(
        select(Estimate).where(Estimate.id == estimate_id, Estimate.tenant_id == auth.tenant_id)
    )
    if estimate is None:
        raise HTTPException(status_code=404, detail="Estimate not found")
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
    recalculate(db, estimate)
    db.commit()
    db.refresh(line)
    return line
