from decimal import Decimal

from app.api.v1.estimates import calculate_line
from app.models.estimating import EstimateLineCategory
from app.schemas.estimating import EstimateLineCreate


def test_calculate_line_parts_labor_paint_materials_and_vat():
    payload = EstimateLineCreate(
        category=EstimateLineCategory.BODY_LABOR,
        description="Riparazione paraurti",
        quantity=Decimal("2"),
        unit_price=Decimal("100"),
        discount_percent=Decimal("10"),
        labor_hours=Decimal("2.5"),
        labor_rate=Decimal("45"),
        paint_hours=Decimal("1.5"),
        paint_rate=Decimal("48"),
        materials=Decimal("25"),
        vat_rate=Decimal("22"),
    )

    subtotal, vat, total = calculate_line(payload)

    assert subtotal == Decimal("389.50")
    assert vat == Decimal("85.69")
    assert total == Decimal("475.19")


def test_calculate_line_rounds_money_to_cents():
    payload = EstimateLineCreate(
        category=EstimateLineCategory.PART,
        description="Ricambio",
        quantity=Decimal("1"),
        unit_price=Decimal("33.333"),
        vat_rate=Decimal("22"),
    )

    subtotal, vat, total = calculate_line(payload)

    assert subtotal == Decimal("33.33")
    assert vat == Decimal("7.33")
    assert total == Decimal("40.66")


def test_contract_terms_include_labor_and_mark_up_parts():
    from app.services.pricing import PricingTerms

    payload = EstimateLineCreate(
        category=EstimateLineCategory.MECHANICAL_LABOR,
        description="Tagliando",
        quantity=Decimal("2"),
        unit_price=Decimal("100"),
        discount_percent=Decimal("10"),
        labor_hours=Decimal("2.5"),
        labor_rate=Decimal("45"),
        materials=Decimal("25"),
        vat_rate=Decimal("22"),
    )
    included = PricingTerms(labor_included=True, parts_markup_percent=Decimal("5"))
    assert calculate_line(payload, included) == (Decimal("215.25"), Decimal("47.36"), Decimal("262.61"))
    discounted = PricingTerms(labor_discount_percent=Decimal("20"))
    assert calculate_line(payload, discounted) == (Decimal("295.00"), Decimal("64.90"), Decimal("359.90"))
