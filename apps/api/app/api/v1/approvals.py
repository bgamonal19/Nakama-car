import secrets
from datetime import datetime, timezone
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.deps import get_db
from app.models.approval import EstimateApproval
from app.models.estimating import Estimate, EstimateLine, EstimateStatus
from app.models.garage import Customer, RepairCase, Vehicle
from app.schemas.approval import (
    EstimateShareResponse,
    PublicEstimateDecision,
    PublicEstimateLine,
    PublicEstimateRead,
)
from app.security.context import AuthContext, require_permission

router = APIRouter(tags=["estimate-approval"])


@router.post("/estimates/{estimate_id}/share", response_model=EstimateShareResponse)
def create_estimate_share(
    estimate_id: UUID,
    db: Session = Depends(get_db),
    auth: AuthContext = Depends(require_permission("estimate.read")),
):
    estimate = db.scalar(
        select(Estimate).where(Estimate.id == estimate_id, Estimate.tenant_id == auth.tenant_id)
    )
    if estimate is None:
        raise HTTPException(status_code=404, detail="Estimate not found")

    approval = db.scalar(
        select(EstimateApproval).where(
            EstimateApproval.estimate_id == estimate.id,
            EstimateApproval.tenant_id == auth.tenant_id,
        )
    )
    if approval is None:
        approval = EstimateApproval(
            tenant_id=auth.tenant_id,
            estimate_id=estimate.id,
            public_token=secrets.token_urlsafe(32),
        )
        db.add(approval)
        if estimate.status == EstimateStatus.DRAFT:
            estimate.status = EstimateStatus.SENT
        db.commit()
        db.refresh(approval)

    return EstimateShareResponse(
        public_token=approval.public_token,
        public_path=f"/public/estimate/{approval.public_token}",
    )


def get_public_context(db: Session, token: str):
    approval = db.scalar(
        select(EstimateApproval).where(EstimateApproval.public_token == token)
    )
    if approval is None:
        raise HTTPException(status_code=404, detail="Estimate link not found")

    estimate = db.scalar(
        select(Estimate).where(
            Estimate.id == approval.estimate_id,
            Estimate.tenant_id == approval.tenant_id,
        )
    )
    if estimate is None:
        raise HTTPException(status_code=404, detail="Estimate not found")

    case = db.scalar(
        select(RepairCase).where(
            RepairCase.id == estimate.repair_case_id,
            RepairCase.tenant_id == approval.tenant_id,
        )
    )
    if case is None:
        raise HTTPException(status_code=404, detail="Repair case not found")

    customer = db.scalar(
        select(Customer).where(
            Customer.id == case.customer_id,
            Customer.tenant_id == approval.tenant_id,
        )
    )
    vehicle = db.scalar(
        select(Vehicle).where(
            Vehicle.id == case.vehicle_id,
            Vehicle.tenant_id == approval.tenant_id,
        )
    )
    if customer is None or vehicle is None:
        raise HTTPException(status_code=404, detail="Customer or vehicle not found")

    return approval, estimate, customer, vehicle


@router.get("/public/estimate/{token}", response_model=PublicEstimateRead)
def public_estimate(token: str, db: Session = Depends(get_db)):
    approval, estimate, customer, vehicle = get_public_context(db, token)
    lines = db.scalars(
        select(EstimateLine)
        .where(
            EstimateLine.estimate_id == estimate.id,
            EstimateLine.tenant_id == approval.tenant_id,
        )
        .order_by(EstimateLine.created_at)
    ).all()

    customer_name = customer.company_name or f"{customer.first_name or ''} {customer.last_name or ''}".strip()
    vehicle_name = " ".join(filter(None, [vehicle.make, vehicle.model, vehicle.version]))

    return PublicEstimateRead(
        estimate_number=estimate.estimate_number,
        status=estimate.status.value,
        customer_name=customer_name,
        vehicle=vehicle_name,
        license_plate=vehicle.license_plate,
        subtotal=estimate.subtotal,
        vat_total=estimate.vat_total,
        total=estimate.total,
        lines=[
            PublicEstimateLine(
                description=line.description,
                quantity=line.quantity,
                line_total=line.line_total,
            )
            for line in lines
        ],
    )


@router.post("/public/estimate/{token}/decision")
def public_estimate_decision(
    token: str,
    payload: PublicEstimateDecision,
    request: Request,
    db: Session = Depends(get_db),
):
    approval, estimate, _, _ = get_public_context(db, token)
    if approval.responded_at is not None:
        raise HTTPException(status_code=409, detail="Estimate already answered")

    approval.accepted = payload.accepted
    approval.signature_name = payload.signature_name
    approval.customer_notes = payload.customer_notes
    approval.ip_address = request.client.host if request.client else None
    approval.user_agent = request.headers.get("user-agent")
    approval.responded_at = datetime.now(timezone.utc)
    estimate.status = EstimateStatus.APPROVED if payload.accepted else EstimateStatus.REJECTED
    db.commit()

    return {"status": "accepted" if payload.accepted else "rejected"}
