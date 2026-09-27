import uuid
from datetime import date
from decimal import Decimal

from sqlalchemy import Boolean, Date, ForeignKey, Numeric, String, Text, Uuid
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, TenantOwnedMixin, TimestampMixin, UUIDPrimaryKeyMixin


class ServiceContract(Base, UUIDPrimaryKeyMixin, TenantOwnedMixin, TimestampMixin):
    """Fleet maintenance agreement with a business customer (e.g. a transport company).

    The contract drives how estimates for that customer are priced:
    - ``labor_included``: workshop labor is covered by the monthly fee and billed at 0.
    - ``labor_discount_percent``: discount on labor when it is not included.
    - ``parts_markup_percent``: parts and materials are billed at cost plus this markup.
    The ``monthly_fee`` is invoiced once per month through the billing module.
    """

    __tablename__ = "service_contracts"

    customer_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("customers.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    name: Mapped[str] = mapped_column(String(160), nullable=False)
    labor_included: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    labor_discount_percent: Mapped[Decimal] = mapped_column(Numeric(5, 2), nullable=False, default=0)
    parts_markup_percent: Mapped[Decimal] = mapped_column(Numeric(5, 2), nullable=False, default=0)
    monthly_fee: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False, default=0)
    fee_vat_rate: Mapped[Decimal] = mapped_column(Numeric(5, 2), nullable=False, default=22)
    fee_description: Mapped[str | None] = mapped_column(String(255))
    start_date: Mapped[date] = mapped_column(Date, nullable=False)
    end_date: Mapped[date | None] = mapped_column(Date)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    notes: Mapped[str | None] = mapped_column(Text)
