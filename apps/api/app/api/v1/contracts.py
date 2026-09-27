from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.deps import get_db
from app.models.contracts import ServiceContract
from app.models.garage import Customer
from app.schemas.contracts import ServiceContractCreate, ServiceContractRead, ServiceContractUpdate
from app.security.context import AuthContext, require_permission
from app.services.audit import record_audit
from app.services.contracts import customer_display_name, find_active_contract

router = APIRouter(prefix="/contracts", tags=["contracts"])

AUDITED_FIELDS = (
    "name", "labor_included", "labor_discount_percent", "parts_markup_percent", "monthly_fee",
    "fee_vat_rate", "fee_description", "start_date", "end_date", "is_active",
)


def snapshot(contract: ServiceContract) -> dict:
    return {field: str(getattr(contract, field)) if getattr(contract, field) is not None else None for field in AUDITED_FIELDS}


def to_read(contract: ServiceContract, customer: Customer | None) -> ServiceContractRead:
    data = ServiceContractRead.model_validate(contract)
    data.customer_name = customer_display_name(customer)
    return data


def get_tenant_contract(db: Session, tenant_id: UUID, contract_id: UUID) -> ServiceContract:
    contract = db.scalar(
        select(ServiceContract).where(ServiceContract.id == contract_id, ServiceContract.tenant_id == tenant_id)
    )
    if contract is None:
        raise HTTPException(status_code=404, detail="Contract not found")
    return contract


def get_tenant_customer(db: Session, tenant_id: UUID, customer_id: UUID) -> Customer:
    customer = db.scalar(select(Customer).where(Customer.id == customer_id, Customer.tenant_id == tenant_id))
    if customer is None:
        raise HTTPException(status_code=404, detail="Customer not found")
    return customer


@router.get("", response_model=list[ServiceContractRead])
def list_contracts(
    customer_id: UUID | None = None,
    active_only: bool = False,
    offset: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=200),
    db: Session = Depends(get_db),
    auth: AuthContext = Depends(require_permission("customer.read")),
):
    query = (
        select(ServiceContract, Customer)
        .join(Customer, Customer.id == ServiceContract.customer_id)
        .where(ServiceContract.tenant_id == auth.tenant_id, Customer.tenant_id == auth.tenant_id)
    )
    if customer_id is not None:
        query = query.where(ServiceContract.customer_id == customer_id)
    if active_only:
        query = query.where(ServiceContract.is_active.is_(True))
    rows = db.execute(
        query.order_by(ServiceContract.is_active.desc(), ServiceContract.start_date.desc(), ServiceContract.id)
        .offset(offset).limit(limit)
    ).all()
    return [to_read(contract, customer) for contract, customer in rows]


@router.get("/active", response_model=ServiceContractRead | None)
def get_active_contract(
    customer_id: UUID,
    db: Session = Depends(get_db),
    auth: AuthContext = Depends(require_permission("customer.read")),
):
    customer = get_tenant_customer(db, auth.tenant_id, customer_id)
    contract = find_active_contract(db, auth.tenant_id, customer.id)
    return to_read(contract, customer) if contract else None


@router.post("", response_model=ServiceContractRead, status_code=status.HTTP_201_CREATED)
def create_contract(
    payload: ServiceContractCreate,
    db: Session = Depends(get_db),
    auth: AuthContext = Depends(require_permission("customer.write")),
):
    customer = get_tenant_customer(db, auth.tenant_id, payload.customer_id)
    contract = ServiceContract(tenant_id=auth.tenant_id, **payload.model_dump())
    db.add(contract)
    db.flush()
    record_audit(
        db,
        tenant_id=auth.tenant_id,
        user_id=auth.user_id,
        entity_type="service_contract",
        entity_id=contract.id,
        action="created",
        new_value={"customer_id": str(customer.id), **snapshot(contract)},
    )
    db.commit()
    db.refresh(contract)
    return to_read(contract, customer)


@router.get("/{contract_id}", response_model=ServiceContractRead)
def get_contract(
    contract_id: UUID,
    db: Session = Depends(get_db),
    auth: AuthContext = Depends(require_permission("customer.read")),
):
    contract = get_tenant_contract(db, auth.tenant_id, contract_id)
    return to_read(contract, get_tenant_customer(db, auth.tenant_id, contract.customer_id))


@router.patch("/{contract_id}", response_model=ServiceContractRead)
def update_contract(
    contract_id: UUID,
    payload: ServiceContractUpdate,
    db: Session = Depends(get_db),
    auth: AuthContext = Depends(require_permission("customer.write")),
):
    contract = get_tenant_contract(db, auth.tenant_id, contract_id)
    changes = payload.model_dump(exclude_unset=True)
    required = ("name", "labor_included", "labor_discount_percent", "parts_markup_percent", "monthly_fee", "fee_vat_rate", "start_date", "is_active")
    if any(changes.get(key, "") is None for key in required):
        raise HTTPException(status_code=422, detail="Required contract fields cannot be empty")
    start = changes.get("start_date", contract.start_date)
    end = changes["end_date"] if "end_date" in changes else contract.end_date
    if end is not None and end < start:
        raise HTTPException(status_code=422, detail="end_date must not be before start_date")
    old_value = snapshot(contract)
    for key, value in changes.items():
        setattr(contract, key, value)
    record_audit(
        db,
        tenant_id=auth.tenant_id,
        user_id=auth.user_id,
        entity_type="service_contract",
        entity_id=contract.id,
        action="updated",
        old_value=old_value,
        new_value=snapshot(contract),
    )
    db.commit()
    db.refresh(contract)
    return to_read(contract, get_tenant_customer(db, auth.tenant_id, contract.customer_id))
