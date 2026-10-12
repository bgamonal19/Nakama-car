from datetime import date
from uuid import UUID

from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app.models.contracts import ServiceContract


def customer_display_name(customer) -> str:
    if customer is None:
        return ""
    return customer.company_name or " ".join(filter(None, [customer.first_name, customer.last_name])) or ""


def find_active_contract(db: Session, tenant_id: UUID, customer_id: UUID, on_date: date | None = None) -> ServiceContract | None:
    """Return the customer's contract in force on ``on_date`` (today by default)."""
    day = on_date or date.today()
    return db.scalar(
        select(ServiceContract)
        .where(
            ServiceContract.tenant_id == tenant_id,
            ServiceContract.customer_id == customer_id,
            ServiceContract.is_active.is_(True),
            ServiceContract.start_date <= day,
            or_(ServiceContract.end_date.is_(None), ServiceContract.end_date >= day),
        )
        .order_by(ServiceContract.start_date.desc(), ServiceContract.created_at.desc())
        .limit(1)
    )
