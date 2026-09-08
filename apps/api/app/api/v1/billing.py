from datetime import datetime, timezone
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.db.deps import get_db
from app.models.billing import Invoice, InvoiceStatus
from app.models.estimating import Estimate
from app.schemas.billing import InvoiceCreateFromEstimate, InvoiceRead, InvoiceStatusUpdate
from app.security.context import AuthContext, require_permission
from app.services.audit import record_audit

router = APIRouter(prefix="/invoices", tags=["billing"])


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
        )
    )
    if existing is not None:
        return existing

    year = datetime.now(timezone.utc).year
    count = db.scalar(
        select(func.count(Invoice.id)).where(
            Invoice.tenant_id == auth.tenant_id,
            Invoice.invoice_number.like(f"NC-F-{year}-%"),
        )
    ) or 0

    invoice = Invoice(
        tenant_id=auth.tenant_id,
        repair_case_id=estimate.repair_case_id,
        estimate_id=estimate.id,
        invoice_number=f"NC-F-{year}-{count + 1:06d}",
        subtotal=estimate.subtotal,
        vat_total=estimate.vat_total,
        total=estimate.total,
        notes=payload.notes,
    )
    db.add(invoice)
    db.commit()
    db.refresh(invoice)
    return invoice


@router.get("", response_model=list[InvoiceRead])
def list_invoices(
    db: Session = Depends(get_db),
    auth: AuthContext = Depends(require_permission("invoice.read")),
):
    return db.scalars(
        select(Invoice)
        .where(Invoice.tenant_id == auth.tenant_id)
        .order_by(Invoice.created_at.desc())
        .limit(100)
    ).all()


@router.patch("/{invoice_id}/status", response_model=InvoiceRead)
def update_invoice_status(
    invoice_id: UUID,
    payload: InvoiceStatusUpdate,
    db: Session = Depends(get_db),
    auth: AuthContext = Depends(require_permission("invoice.create")),
):
    invoice = db.scalar(
        select(Invoice).where(
            Invoice.id == invoice_id,
            Invoice.tenant_id == auth.tenant_id,
        )
    )
    if invoice is None:
        raise HTTPException(status_code=404, detail="Invoice not found")
    old_status = invoice.status.value
    invoice.status = payload.status
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
    return invoice
