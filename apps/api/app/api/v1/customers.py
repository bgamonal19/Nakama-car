from uuid import UUID
from pydantic import ValidationError
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app.db.deps import get_db
from app.models.garage import Customer
from app.schemas.garage import CustomerCreate, CustomerRead, CustomerUpdate
from app.security.context import AuthContext, require_permission

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
