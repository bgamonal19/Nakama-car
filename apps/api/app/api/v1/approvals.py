import secrets
from datetime import datetime, timezone
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.deps import get_db
from app.models.approval import EstimateApproval
from app.models.estimating import Estimate, EstimateLine, EstimateStatus
from app.models.garage import Customer, RepairCase, RepairCaseStatus, Vehicle
from app.schemas.approval import (
    EstimateShareResponse,
    PublicEstimateDecision,
    PublicEstimateLine,
    PublicEstimateRead,
)
from app.security.context import AuthContext, require_permission
from app.services.access import LEGAL_VERSION, client_ip
from app.services.contracts import customer_display_name
from app.services.workshop import open_work_order

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
        case = db.scalar(
            select(RepairCase).where(
                RepairCase.id == estimate.repair_case_id,
                RepairCase.tenant_id == auth.tenant_id,
            )
        )
        if case is not None and case.status == RepairCaseStatus.NEW:
            case.status = RepairCaseStatus.WAITING_APPROVAL
        db.commit()
        db.refresh(approval)

    case = db.get(RepairCase, estimate.repair_case_id)
    customer = db.get(Customer, case.customer_id) if case else None
    vehicle = db.get(Vehicle, case.vehicle_id) if case else None
    return EstimateShareResponse(
        public_token=approval.public_token,
        public_path=f"/public/estimate/{approval.public_token}",
        estimate_number=estimate.estimate_number,
        total=estimate.total,
        customer_name=customer_display_name(customer) if customer else None,
        customer_phone=customer.phone if customer else None,
        customer_email=customer.email if customer else None,
        license_plate=vehicle.license_plate if vehicle else None,
        answered=approval.responded_at is not None,
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

    # Two separate boxes: privacy notice read (always), terms and conditions (to accept the estimate).
    if not payload.accept_privacy or (payload.accepted and not payload.accept_terms):
        raise HTTPException(status_code=422, detail="Accetta i termini e conferma di aver letto l'informativa privacy.")
    approval.accepted = payload.accepted
    approval.signature_name = payload.signature_name
    approval.customer_notes = payload.customer_notes
    now = datetime.now(timezone.utc)
    approval.legal_version = LEGAL_VERSION
    approval.privacy_accepted_at = now
    approval.terms_accepted_at = now if payload.accept_terms else None
    approval.ip_address = client_ip(request)
    approval.user_agent = request.headers.get("user-agent")
    approval.responded_at = datetime.now(timezone.utc)
    estimate.status = EstimateStatus.APPROVED if payload.accepted else EstimateStatus.REJECTED
    case = db.scalar(
        select(RepairCase).where(
            RepairCase.id == estimate.repair_case_id,
            RepairCase.tenant_id == approval.tenant_id,
        )
    )
    if payload.accepted:
        # Approved by the customer: the job goes straight to the workshop ("Il mio lavoro").
        open_work_order(db, estimate, None, "approved_by_customer")
    elif case is not None:
        case.status = RepairCaseStatus.NEW
    db.commit()

    return {"status": "accepted" if payload.accepted else "rejected"}
