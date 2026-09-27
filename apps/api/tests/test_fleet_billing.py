from decimal import Decimal

from test_users import client  # noqa: F401  (pytest fixture)


def create_fleet_case(c, plate="FL123TR"):
    customer = c.post("/api/v1/customers", json={
        "customer_type": "COMPANY", "company_name": "Univex Group", "vat_number": "IT01234567890",
        "address": "Via Roma 1", "city": "Milano", "province": "MI", "postal_code": "20100", "sdi": "ABC1234",
    }).json()
    contract = c.post("/api/v1/contracts", json={
        "customer_id": customer["id"], "name": "Manutenzione flotta Univex", "labor_included": True,
        "parts_markup_percent": "5", "monthly_fee": "7000", "start_date": "2026-01-01",
    })
    assert contract.status_code == 201, contract.text
    vehicle = c.post("/api/v1/vehicles", json={
        "license_plate": plate, "customer_id": customer["id"], "vehicle_category": "TRUCK", "fleet_number": "U-17",
    })
    assert vehicle.status_code == 201, vehicle.text
    case = c.post("/api/v1/cases", json={
        "customer_id": customer["id"], "vehicle_id": vehicle.json()["id"], "customer_notes": "Rumore freni",
    }).json()
    return customer, contract.json(), vehicle.json(), case


def mechanical_line(**overrides):
    return {
        "category": "MECHANICAL_LABOR", "description": "Sostituzione pastiglie", "quantity": "2",
        "unit_price": "100", "labor_hours": "3", "labor_rate": "50", "vat_rate": "22", **overrides,
    }


def test_contract_pricing_includes_labor_and_marks_up_parts(client):
    c, _, _ = client
    customer, contract, vehicle, case = create_fleet_case(c)
    assert vehicle["vehicle_category"] == "TRUCK"
    assert c.get(f"/api/v1/contracts/active?customer_id={customer['id']}").json()["id"] == contract["id"]

    estimate = c.post("/api/v1/estimates", json={"repair_case_id": case["id"]}).json()
    assert estimate["contract_id"] == contract["id"]
    assert estimate["labor_included"] is True

    line = c.post(f"/api/v1/estimates/{estimate['id']}/lines", json=mechanical_line())
    assert line.status_code == 201, line.text
    assert Decimal(line.json()["parts_amount"]) == Decimal("210.00")
    assert Decimal(line.json()["labor_amount"]) == Decimal("0.00")
    saved = c.get(f"/api/v1/estimates/{estimate['id']}").json()
    assert Decimal(saved["subtotal"]) == Decimal("210.00")
    assert Decimal(saved["vat_total"]) == Decimal("46.20")

    public = c.patch(f"/api/v1/estimates/{estimate['id']}/pricing", json={"apply_contract": False})
    assert public.status_code == 200, public.text
    assert Decimal(public.json()["subtotal"]) == Decimal("350.00")
    back = c.patch(f"/api/v1/estimates/{estimate['id']}/pricing", json={"apply_contract": True}).json()
    assert Decimal(back["subtotal"]) == Decimal("210.00")

    listed = c.get("/api/v1/estimates?q=FL123").json()
    assert listed[0]["contract_name"] == "Manutenzione flotta Univex"
    assert listed[0]["plate"] == "FL123TR"


def test_public_customer_is_not_affected_by_contracts(client):
    c, _, _ = client
    create_fleet_case(c)
    customer = c.post("/api/v1/customers", json={"first_name": "Mario", "last_name": "Rossi"}).json()
    vehicle = c.post("/api/v1/vehicles", json={"license_plate": "AB123CD", "customer_id": customer["id"]}).json()
    case = c.post("/api/v1/cases", json={"customer_id": customer["id"], "vehicle_id": vehicle["id"]}).json()
    estimate = c.post("/api/v1/estimates", json={"repair_case_id": case["id"]}).json()
    assert estimate["contract_id"] is None
    c.post(f"/api/v1/estimates/{estimate['id']}/lines", json=mechanical_line())
    assert Decimal(c.get(f"/api/v1/estimates/{estimate['id']}").json()["subtotal"]) == Decimal("350.00")
    assert c.patch(f"/api/v1/estimates/{estimate['id']}/pricing", json={"apply_contract": True}).status_code == 409
    assert c.post("/api/v1/estimates", json={"repair_case_id": case["id"], "apply_contract": True}).status_code == 409


def test_mechanical_work_order_gets_mechanical_checklist(client):
    c, _, _ = client
    _, _, _, case = create_fleet_case(c)
    estimate = c.post("/api/v1/estimates", json={"repair_case_id": case["id"]}).json()
    c.post(f"/api/v1/estimates/{estimate['id']}/lines", json=mechanical_line())
    assert c.patch(f"/api/v1/estimates/{estimate['id']}/status", json={"status": "APPROVED"}).status_code == 200
    order = c.post(f"/api/v1/work-orders/from-estimate/{estimate['id']}").json()
    task_types = [task["task_type"] for task in c.get(f"/api/v1/work-orders/{order['id']}/tasks").json()]
    assert "DIAGNOSTIC" in task_types and "ROAD_TEST" in task_types
    assert "PAINT" not in task_types
    listed = c.get("/api/v1/work-orders?q=U-17").json()
    assert listed[0]["plate"] == "FL123TR"
    assert listed[0]["customer_request"] == "Rumore freni"


def test_monthly_fee_invoice_status_rules_pdf_and_fatturapa(client):
    c, _, _ = client
    _, contract, _, _ = create_fleet_case(c)
    fee = c.post(f"/api/v1/contracts/{contract['id']}/fee-invoices", json={"period_month": "2026-10"})
    assert fee.status_code == 201, fee.text
    invoice = fee.json()
    assert invoice["invoice_kind"] == "CONTRACT_FEE"
    assert invoice["customer_name"] == "Univex Group"
    assert Decimal(invoice["subtotal"]) == Decimal("7000.00")
    assert Decimal(invoice["total"]) == Decimal("8540.00")
    assert c.post(f"/api/v1/contracts/{contract['id']}/fee-invoices", json={"period_month": "2026-10"}).status_code == 409
    assert c.post(f"/api/v1/contracts/{contract['id']}/fee-invoices", json={"period_month": "2025-12"}).status_code == 409
    assert c.post(f"/api/v1/contracts/{contract['id']}/fee-invoices", json={"period_month": "2026-13"}).status_code == 422
    assert c.get("/api/v1/invoices?kind=CONTRACT_FEE").json()[0]["id"] == invoice["id"]

    path = f"/api/v1/invoices/{invoice['id']}"
    assert c.patch(path + "/status", json={"status": "PAID"}).status_code == 409
    missing = c.get(path + "/fatturapa")
    assert missing.status_code == 422
    assert "fattura emessa (stato ISSUED)" in missing.json()["detail"]["missing"]

    issued = c.patch(path + "/status", json={"status": "ISSUED"}).json()
    assert issued["issue_date"] and issued["due_date"]
    assert c.patch(path + "/status", json={"status": "DRAFT"}).status_code == 409
    assert c.patch(path, json={"issue_date": "2020-01-01"}).status_code == 409

    company = c.put("/api/v1/settings/company", json={
        "company_name": "NAKAMA CAR SRLS", "vat_number": "12345678901", "tax_code": "12345678901",
        "address": "Via Tirso 1", "city": "San Giuliano Milanese", "province": "MI", "postal_code": "20098",
        "iban": "IT60X0542811101000000123456",
    })
    assert company.status_code == 200, company.text
    xml = c.get(path + "/fatturapa")
    assert xml.status_code == 200, xml.text
    body = xml.text
    assert "<Numero>" + invoice["invoice_number"] + "</Numero>" in body
    assert "<CodiceDestinatario>ABC1234</CodiceDestinatario>" in body
    assert "<ImponibileImporto>7000.00</ImponibileImporto>" in body
    assert "<Imposta>1540.00</Imposta>" in body
    assert "<IBAN>IT60X0542811101000000123456</IBAN>" in body

    pdf = c.get(path + "/pdf")
    assert pdf.status_code == 200
    assert pdf.content.startswith(b"%PDF")
    paid = c.patch(path + "/status", json={"status": "PAID"}).json()
    assert paid["paid_at"]
    detail = c.get(path).json()
    assert len(detail["lines"]) == 1 and "ottobre 2026" in detail["lines"][0]["description"]


def test_repair_invoice_keeps_exact_line_arithmetic(client):
    c, _, _ = client
    _, _, _, case = create_fleet_case(c)
    estimate = c.post("/api/v1/estimates", json={"repair_case_id": case["id"], "apply_contract": False}).json()
    c.post(f"/api/v1/estimates/{estimate['id']}/lines", json=mechanical_line(quantity="3", unit_price="10.01", labor_hours="0"))
    invoice = c.post("/api/v1/invoices", json={"estimate_id": estimate["id"]}).json()
    lines = c.get(f"/api/v1/invoices/{invoice['id']}").json()["lines"]
    for line in lines:
        assert (Decimal(line["unit_price"]) * Decimal(line["quantity"])).quantize(Decimal("0.01")) == Decimal(line["line_subtotal"])
    assert c.get("/api/v1/invoices?q=FL123").json()[0]["plate"] == "FL123TR"
