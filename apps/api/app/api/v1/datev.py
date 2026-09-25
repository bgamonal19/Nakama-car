from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.core.config import get_settings
from app.db.deps import get_db
from app.models.billing import Invoice
from app.models.garage import Customer
from app.providers.datev import DatevError, DatevSBillClient
from app.security.context import AuthContext, require_permission
from app.services.audit import record_audit
from app.services.datev import owned, customer_data, prepare_invoice, save_preparation, link_query

router = APIRouter(prefix="/datev", tags=["datev"])


def config(auth):
    return get_settings().datev_tenants.get(str(auth.tenant_id))


def blocked(db, auth, entity_id, code):
    record_audit(db, tenant_id=auth.tenant_id, user_id=auth.user_id, entity_type="datev",
                 entity_id=entity_id, action="blocked", new_value={"code": code})
    db.commit()
    raise HTTPException(409, detail={"code": code, "can_generate": False})


@router.post("/connection")
def connection(db: Session = Depends(get_db), auth: AuthContext = Depends(require_permission("invoice.create"))):
    try:
        result = DatevSBillClient(config(auth)).check_connection()
    except DatevError as exc:
        blocked(db, auth, None, exc.code)
    record_audit(db, tenant_id=auth.tenant_id, user_id=auth.user_id, entity_type="datev",
                 entity_id=None, action="authentication_checked", new_value=result)
    db.commit()
    return result


@router.get("/invoices/{invoice_id}")
def invoice_status(invoice_id: UUID, db: Session = Depends(get_db), auth: AuthContext = Depends(require_permission("invoice.read"))):
    invoice = owned(db, Invoice, invoice_id, auth.tenant_id)
    _, missing = prepare_invoice(db, invoice, auth.tenant_id, config(auth))
    link = db.scalar(link_query(auth.tenant_id, "invoice", invoice.id))
    return {"status": link.status if link else "not_prepared", "remote_id": link.remote_id if link else None,
            "missing_fields": missing, "can_prepare": not missing, "can_generate": False,
            "blockers": ["contract_unverified", "controlled_test_required"]}


@router.post("/customers/{customer_id}/sync")
def sync_customer(customer_id: UUID, db: Session = Depends(get_db), auth: AuthContext = Depends(require_permission("invoice.create"))):
    customer = owned(db, Customer, customer_id, auth.tenant_id)
    data, missing = customer_data(customer)
    if missing:
        blocked(db, auth, customer.id, "customer_data_incomplete")
    link = save_preparation(db, auth, "customer", customer.id, data)
    try:
        DatevSBillClient(config(auth)).sync_customer(data, str(link.id))
    except DatevError as exc:
        link.error_code = exc.code
        blocked(db, auth, customer.id, exc.code)


@router.post("/invoices/{invoice_id}/prepare")
def prepare(invoice_id: UUID, db: Session = Depends(get_db), auth: AuthContext = Depends(require_permission("invoice.create"))):
    invoice = owned(db, Invoice, invoice_id, auth.tenant_id)
    data, missing = prepare_invoice(db, invoice, auth.tenant_id, config(auth))
    if missing:
        # No incomplete snapshot is persisted, so missing fields can be corrected normally.
        return {"status": "incomplete", "missing_fields": missing, "can_generate": False}
    link = save_preparation(db, auth, "invoice", invoice.id, data)
    db.commit()
    return {"status": link.status, "operation_id": str(link.id), "fingerprint": link.fingerprint,
            "document": link.snapshot, "can_generate": False, "blockers": ["contract_unverified"]}


@router.post("/invoices/{invoice_id}/create")
def create(invoice_id: UUID, db: Session = Depends(get_db), auth: AuthContext = Depends(require_permission("invoice.create"))):
    invoice = owned(db, Invoice, invoice_id, auth.tenant_id)
    # Gate is unconditional, independently of UI, flags, credentials, or prior local status.
    blocked(db, auth, invoice.id, "contract_unverified")
