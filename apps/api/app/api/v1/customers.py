from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
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
    db: Session = Depends(get_db),
    auth: AuthContext = Depends(require_permission("customer.read")),
):
    return db.scalars(
        select(Customer)
        .where(Customer.tenant_id == auth.tenant_id)
        .order_by(Customer.created_at.desc())
        .limit(100)
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
    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(customer, key, value)
    db.commit()
    db.refresh(customer)
    return customer
