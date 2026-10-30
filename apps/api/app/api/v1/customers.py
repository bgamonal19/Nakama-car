from uuid import UUID
from pydantic import ValidationError
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response, status
from sqlalchemy import delete, func, or_, select, update
from sqlalchemy.orm import Session

from app.db.deps import get_db
from app.models.billing import Invoice
from app.models.contracts import ServiceContract, ServiceContractDocument
from app.models.garage import Customer, RepairCase, Vehicle
from app.models.portal import PortalAccount
from app.schemas.garage import CustomerCreate, CustomerRead, CustomerUpdate
from app.security.context import AuthContext, is_admin, require_permission
from app.services.audit import record_audit
from app.services.photos import MAX_UPLOAD_BYTES, PhotoError, prepare_photo
from app.services.tracking import customer_display_name

router = APIRouter(prefix="/customers", tags=["customers"])


@router.post("", response_model=CustomerRead, status_code=status.HTTP_201_CREATED)
def create_customer(
    payload: CustomerCreate,
    db: Session = Depends(get_db),
    auth: AuthContext = Depends(require_permission("customer.write")),
):
    customer = Customer(tenant_id=auth.tenant_id, **payload.model_dump())
    db.add(customer)
    db.commit()
    db.refresh(customer)
    return customer


@router.get("", response_model=list[CustomerRead])
def list_customers(
    q: str = "",
    offset: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=200),
    db: Session = Depends(get_db),
    auth: AuthContext = Depends(require_permission("customer.read")),
):
    return db.scalars(
        select(Customer)
        .where(Customer.tenant_id == auth.tenant_id,
            or_(Customer.first_name.icontains(q, autoescape=True), Customer.last_name.icontains(q, autoescape=True), Customer.company_name.icontains(q, autoescape=True), Customer.phone.icontains(q, autoescape=True), Customer.email.icontains(q, autoescape=True), Customer.vat_number.icontains(q, autoescape=True)))
        .order_by(Customer.created_at.desc(), Customer.id.desc())
        .offset(offset).limit(limit)
    ).all()


@router.get("/{customer_id}", response_model=CustomerRead)
def get_customer(
    customer_id: UUID,
    db: Session = Depends(get_db),
    auth: AuthContext = Depends(require_permission("customer.read")),
):
    customer = db.scalar(
        select(Customer).where(
            Customer.id == customer_id,
            Customer.tenant_id == auth.tenant_id,
        )
    )
    if customer is None:
        raise HTTPException(status_code=404, detail="Customer not found")
    return customer


@router.patch("/{customer_id}", response_model=CustomerRead)
def update_customer(
    customer_id: UUID,
    payload: CustomerUpdate,
    db: Session = Depends(get_db),
    auth: AuthContext = Depends(require_permission("customer.write")),
):
    customer = db.scalar(
        select(Customer).where(
            Customer.id == customer_id,
            Customer.tenant_id == auth.tenant_id,
        )
    )
    if customer is None:
        raise HTTPException(status_code=404, detail="Customer not found")
    changes = payload.model_dump(exclude_unset=True)
    # Validate the merged record before persisting a partial edit.
    try:
        CustomerCreate.model_validate({**CustomerRead.model_validate(customer).model_dump(), **changes})
    except ValidationError:
        raise HTTPException(status_code=422, detail="Customer identity and country are required")
    for key, value in changes.items():
        setattr(customer, key, value)
    db.commit()
    db.refresh(customer)
    return customer


def customer_deletion(db: Session, customer: Customer) -> dict:
    """What deleting the customer takes with it, and what stops it.

    Invoices (the customer's or its cases') always stop it. Repair cases and contracts need an
    administrator and ``force``; vehicles stay in the archive without an owner.
    """
    def count(model, *where) -> int:
        return db.scalar(select(func.count()).select_from(model).where(*where)) or 0

    case_ids = select(RepairCase.id).where(RepairCase.customer_id == customer.id)
    invoices = count(Invoice, or_(Invoice.customer_id == customer.id, Invoice.repair_case_id.in_(case_ids)))
    cases = count(RepairCase, RepairCase.customer_id == customer.id)
    contracts = count(ServiceContract, ServiceContract.customer_id == customer.id)
    return {
        "name": customer_display_name(customer),
        "cases": cases,
        "contracts": contracts,
        "portal_accounts": count(PortalAccount, PortalAccount.customer_id == customer.id),
        "vehicles": count(Vehicle, Vehicle.customer_id == customer.id),
        "invoices": invoices,
        "has_history": bool(cases or contracts),
        "blocked": f"Impossibile eliminare il cliente: ha {invoices} fatture, che restano in archivio." if invoices else None,
    }


def tenant_customer(db: Session, auth: AuthContext, customer_id: UUID) -> Customer:
    customer = db.scalar(select(Customer).where(Customer.id == customer_id, Customer.tenant_id == auth.tenant_id))
    if customer is None:
        raise HTTPException(status_code=404, detail="Customer not found")
    return customer


@router.get("/{customer_id}/deletion")
def preview_customer_deletion(
    customer_id: UUID,
    db: Session = Depends(get_db),
    auth: AuthContext = Depends(require_permission("customer.write")),
):
    return customer_deletion(db, tenant_customer(db, auth, customer_id))


@router.delete("/{customer_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_customer(
    customer_id: UUID,
    force: bool = Query(default=False),
    db: Session = Depends(get_db),
    auth: AuthContext = Depends(require_permission("customer.write")),
):
    """Remove a customer created by mistake, or (administrator, ``force``) one with history.

    Invoices always refuse it. With ``force`` its repair cases (and what hangs from them) and its
    contracts go too. Its vehicles are kept without an owner and its portal logins are removed.
    """
    from app.api.v1.cases import case_deletion, remove_case

    customer = tenant_customer(db, auth, customer_id)
    impact = customer_deletion(db, customer)
    if impact["blocked"]:
        raise HTTPException(status_code=409, detail=impact["blocked"])
    if impact["has_history"]:
        if not force:
            blocking = [f"{count} {label}" for count, label in ((impact["cases"], "pratiche"), (impact["contracts"], "contratti")) if count]
            raise HTTPException(
                status_code=409,
                detail="Impossibile eliminare il cliente: ha " + ", ".join(blocking) + ".",
            )
        if not is_admin(auth):
            raise HTTPException(status_code=403, detail="Solo un amministratore può eliminare un cliente con pratiche o contratti.")
    for case in db.scalars(select(RepairCase).where(RepairCase.customer_id == customer.id)).all():
        if case_deletion(db, case)["blocked"]:
            raise HTTPException(status_code=409, detail="Impossibile eliminare il cliente: una pratica ha fatture.")
        remove_case(db, case, auth, forced=True)
    for contract in db.scalars(select(ServiceContract).where(ServiceContract.customer_id == customer.id)).all():
        db.execute(delete(ServiceContractDocument).where(ServiceContractDocument.contract_id == contract.id))
        db.delete(contract)
    db.flush()
    db.execute(update(Vehicle).where(Vehicle.customer_id == customer.id).values(customer_id=None))
    for account in db.scalars(select(PortalAccount).where(PortalAccount.customer_id == customer.id)).all():
        db.delete(account)
    db.flush()
    record_audit(db, tenant_id=auth.tenant_id, user_id=auth.user_id, entity_type="customer", entity_id=customer.id,
                 action="deleted", old_value={"name": impact["name"], "cases": impact["cases"], "contracts": impact["contracts"]})
    db.delete(customer)
    db.commit()


LOGO_SIDE = 512


@router.put("/{customer_id}/logo", response_model=CustomerRead)
async def upload_customer_logo(
    customer_id: UUID,
    request: Request,
    db: Session = Depends(get_db),
    auth: AuthContext = Depends(require_permission("customer.write")),
):
    """Company logo (raw image body), resized and kept as WebP with the customer."""
    customer = tenant_customer(db, auth, customer_id)
    if int(request.headers.get("content-length") or 0) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail="Immagine troppo grande (max 15 MB).")
    try:
        content, _, _ = prepare_photo(await request.body(), max_side=LOGO_SIDE)
    except PhotoError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    customer.logo = content
    customer.logo_updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(customer)
    return customer


@router.get("/{customer_id}/logo")
def read_customer_logo(
    customer_id: UUID,
    db: Session = Depends(get_db),
    auth: AuthContext = Depends(require_permission("customer.read")),
):
    customer = tenant_customer(db, auth, customer_id)
    if not customer.logo:
        raise HTTPException(status_code=404, detail="Logo non presente")
    return Response(content=customer.logo, media_type="image/webp", headers={"Cache-Control": "private, max-age=86400"})


@router.delete("/{customer_id}/logo", response_model=CustomerRead)
def delete_customer_logo(
    customer_id: UUID,
    db: Session = Depends(get_db),
    auth: AuthContext = Depends(require_permission("customer.write")),
):
    customer = tenant_customer(db, auth, customer_id)
    customer.logo = None
    customer.logo_updated_at = None
    db.commit()
    db.refresh(customer)
    return customer
