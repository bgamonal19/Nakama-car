"""Estimate pricing: public price list vs. fleet service contract terms."""
from dataclasses import dataclass
from decimal import ROUND_HALF_UP, Decimal

MONEY = Decimal("0.01")
HUNDRED = Decimal("100")


def money(value: Decimal) -> Decimal:
    return value.quantize(MONEY, rounding=ROUND_HALF_UP)


@dataclass(frozen=True, slots=True)
class PricingTerms:
    labor_included: bool = False
    labor_discount_percent: Decimal = Decimal("0")
    parts_markup_percent: Decimal = Decimal("0")

    @classmethod
    def from_source(cls, source) -> "PricingTerms":
        """Build terms from an Estimate or a ServiceContract (same attribute names)."""
        if source is None:
            return PUBLIC_TERMS
        return cls(
            labor_included=bool(source.labor_included),
            labor_discount_percent=Decimal(source.labor_discount_percent or 0),
            parts_markup_percent=Decimal(source.parts_markup_percent or 0),
        )


PUBLIC_TERMS = PricingTerms()


@dataclass(frozen=True, slots=True)
class LineAmounts:
    parts: Decimal
    labor: Decimal
    subtotal: Decimal
    vat: Decimal
    total: Decimal


def price_line(line, terms: PricingTerms = PUBLIC_TERMS) -> LineAmounts:
    """Price one estimate line.

    ``line`` is any object with the estimate line fields (schema or model).
    Parts and materials are charged at the entered price, minus the line discount,
    plus the contract markup. Labor (workshop and paint hours) is charged at 0 when
    the contract includes it, otherwise at the hourly rate minus the contract discount.
    """
    quantity = Decimal(line.quantity)
    discount = Decimal(line.discount_percent or 0) / HUNDRED
    markup = terms.parts_markup_percent / HUNDRED
    parts = quantity * Decimal(line.unit_price) * (Decimal("1") - discount)
    parts = (parts + Decimal(line.materials)) * (Decimal("1") + markup)
    labor = Decimal(line.labor_hours) * Decimal(line.labor_rate) + Decimal(line.paint_hours) * Decimal(line.paint_rate)
    if terms.labor_included:
        labor = Decimal("0")
    else:
        labor = labor * (Decimal("1") - terms.labor_discount_percent / HUNDRED)
    parts = money(parts)
    labor = money(labor)
    subtotal = parts + labor
    vat = money(subtotal * Decimal(line.vat_rate) / HUNDRED)
    return LineAmounts(parts=parts, labor=labor, subtotal=subtotal, vat=vat, total=subtotal + vat)
