"""Local canonical preparation; these dictionaries are NOT DATEV wire payloads."""
import hashlib
import json
from decimal import Decimal
from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from app.models.datev import DatevLink
from app.models.billing import Invoice, InvoiceLine, InvoiceStatus
from app.models.garage import Customer, RepairCase, Vehicle, RepairCaseStatus
from app.models.estimating import Estimate, EstimateStatus
from app.services.audit import record_audit


def owned(db, model, entity_id, tenant):
    value = db.scalar(select(model).where(model.id == entity_id, model.tenant_id == tenant))
    if value is None:
        raise HTTPException(404, "Record not found")
    return value


def customer_data(customer):
    fields = ("first_name", "last_name", "company_name", "vat_number", "tax_code", "address",
              "city", "province", "postal_code", "country", "pec", "sdi")
    data = {field: getattr(customer, field) for field in fields}
    data["local_id"] = str(customer.id)
    missing = [f"customer.{field}" for field in ("address", "city", "postal_code", "country")
               if not (data[field] or "").strip()]
    if not any((data[f] or "").strip() for f in ("company_name", "first_name", "last_name")):
        missing.append("customer.name")
    if not any((data[f] or "").strip() for f in ("vat_number", "tax_code")):
        missing.append("customer.vat_number_or_tax_code")
    return data, missing


def prepare_invoice(db, invoice, tenant, config):
    case = owned(db, RepairCase, invoice.repair_case_id, tenant)
    customer = owned(db, Customer, case.customer_id, tenant)
    vehicle = owned(db, Vehicle, case.vehicle_id, tenant)
    estimate = owned(db, Estimate, invoice.estimate_id, tenant) if invoice.estimate_id else None
    customer_payload, missing = customer_data(customer)
    lines = db.scalars(select(InvoiceLine).where(InvoiceLine.invoice_id == invoice.id,
                       InvoiceLine.tenant_id == tenant).order_by(InvoiceLine.created_at, InvoiceLine.id)).all()
    mapped = []
    for line in lines:
        rate = format(line.vat_rate, ".2f")
        code = config.vat_codes.get(rate) if config else None
        if not code:
            missing.append(f"vat_code.{rate}")
        if not line.source_category:
            missing.append(f"line.{line.id}.source_category")
        if not line.description.strip() or line.quantity <= 0 or line.line_subtotal < 0 or line.vat_rate < 0:
            missing.append(f"line.{line.id}.invalid")
        if line.line_subtotal + line.line_vat != line.line_total:
            missing.append(f"line.{line.id}.totals")
        mapped.append({"local_id": str(line.id), "category": line.source_category,
                       "description": line.description, "quantity": str(line.quantity),
                       "unit_price": str(line.unit_price), "vat_rate": rate, "vat_code_id": code,
                       "subtotal": str(line.line_subtotal), "vat_total": str(line.line_vat),
                       "total": str(line.line_total)})
    if not lines:
        missing.append("invoice.lines")
    if any(sum((getattr(line, field) for line in lines), Decimal(0)) != getattr(invoice, target)
           for field, target in (("line_subtotal", "subtotal"), ("line_vat", "vat_total"), ("line_total", "total"))):
        missing.append("invoice.totals")
    if invoice.subtotal + invoice.vat_total != invoice.total:
        missing.append("invoice.totals")
    if invoice.status != InvoiceStatus.DRAFT:
        missing.append("invoice.must_be_draft")
    if not estimate or estimate.status != EstimateStatus.APPROVED:
        missing.append("estimate.must_be_approved")
    if estimate and estimate.repair_case_id != case.id:
        missing.append("estimate.case_mismatch")
    if case.status not in (RepairCaseStatus.READY, RepairCaseStatus.DELIVERED):
        missing.append("case.must_be_completed")
    for field in ("payment_method_id", "payment_type_id"):
        if not config or not getattr(config, field):
            missing.append(field)
    data = {"schema_version": 1, "customer": customer_payload, "lines": mapped,
            "payment_method_id": config.payment_method_id if config else None,
            "payment_type_id": config.payment_type_id if config else None,
            "subtotal": str(invoice.subtotal), "vat_total": str(invoice.vat_total), "total": str(invoice.total),
            "currency": estimate.currency if estimate else None,
            "references": {"invoice_id": str(invoice.id), "invoice_number": invoice.invoice_number,
                           "case_id": str(case.id), "case_number": case.case_number,
                           "estimate_id": str(estimate.id) if estimate else None,
                           "estimate_number": estimate.estimate_number if estimate else None,
                           "license_plate": vehicle.license_plate}}
    return data, sorted(set(missing))


def link_query(tenant, kind, local_id):
    return select(DatevLink).where(DatevLink.tenant_id == tenant, DatevLink.entity_type == kind,
                                  DatevLink.local_id == str(local_id))


def save_preparation(db, auth, kind, local_id, data):
    fingerprint = hashlib.sha256(json.dumps(data, sort_keys=True, separators=(",", ":")).encode()).hexdigest()
    query = link_query(auth.tenant_id, kind, local_id)
    link = db.scalar(query)
    if link is None:
        try:
            with db.begin_nested():
                link = DatevLink(tenant_id=auth.tenant_id, entity_type=kind, local_id=str(local_id),
                                 fingerprint=fingerprint, snapshot=data, status="prepared")
                db.add(link)
                db.flush()
        except IntegrityError:
            link = db.scalar(query)
            if link is None:
                raise
        else:
            record_audit(db, tenant_id=auth.tenant_id, user_id=auth.user_id, entity_type="datev",
                         entity_id=link.id, action="prepared", new_value={"fingerprint": fingerprint, "kind": kind})
    # An operation has one immutable snapshot. Changed data requires explicit reconciliation,
    # never a second automatic create, including after timeout/unknown remote outcomes.
    if link.fingerprint != fingerprint:
        record_audit(db, tenant_id=auth.tenant_id, user_id=auth.user_id, entity_type="datev",
                     entity_id=link.id, action="blocked", new_value={"code": "snapshot_changed"})
        db.commit()
        raise HTTPException(409, "DATEV preparation changed; reconciliation required")
    return link
