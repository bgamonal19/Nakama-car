import test_fleet_billing as fleet
import test_tracking as tracking_tests
from test_users import client, payload  # noqa: F401  (pytest fixture)


def started_case(c):
    customer, contract, vehicle, case = fleet.create_fleet_case(c)
    order = tracking_tests.open_work_order(c, case)
    tasks = c.get(f"/api/v1/work-orders/{order['id']}/tasks").json()
    assert c.patch(f"/api/v1/work-orders/{order['id']}/tasks/{tasks[0]['id']}/status", json={"status": "DONE"}).status_code == 200
    return customer, vehicle, case


def as_worker(c, role_code="RECEPTION", email="reception@example.com"):
    assert c.post("/api/v1/users", json=payload(email=email, role_code=role_code)).status_code == 201
    login = c.post("/api/v1/auth/login", json={"email": email, "password": payload()["password"]}).json()
    return {"Authorization": "Bearer " + login["access_token"]}


def test_admin_force_deletes_case_in_progress(client):
    c, _, _ = client
    customer, vehicle, case = started_case(c)
    preview = c.get(f"/api/v1/cases/{case['id']}/deletion").json()
    assert preview["work_started"] is True and preview["work_orders"] == 1 and preview["blocked"] is None

    assert c.delete(f"/api/v1/cases/{case['id']}").status_code == 409
    worker = as_worker(c)
    refused = c.delete(f"/api/v1/cases/{case['id']}?force=true", headers=worker)
    assert refused.status_code == 403

    deleted = c.delete(f"/api/v1/cases/{case['id']}?force=true")
    assert deleted.status_code == 204, deleted.text
    assert c.get(f"/api/v1/cases/{case['id']}").status_code == 404
    assert c.get(f"/api/v1/customers/{customer['id']}").status_code == 200
    assert c.get(f"/api/v1/vehicles/by-plate/{vehicle['license_plate']}").status_code == 200


def test_admin_force_deletes_customer_with_history(client):
    c, _, _ = client
    customer, vehicle, case = started_case(c)
    preview = c.get(f"/api/v1/customers/{customer['id']}/deletion").json()
    assert preview["cases"] == 1 and preview["contracts"] == 1 and preview["vehicles"] == 1
    assert preview["has_history"] is True and preview["blocked"] is None

    worker = as_worker(c)
    assert c.delete(f"/api/v1/customers/{customer['id']}?force=true", headers=worker).status_code == 403
    deleted = c.delete(f"/api/v1/customers/{customer['id']}?force=true")
    assert deleted.status_code == 204, deleted.text
    assert c.get(f"/api/v1/customers/{customer['id']}").status_code == 404
    assert c.get(f"/api/v1/cases/{case['id']}").status_code == 404
    assert c.get(f"/api/v1/vehicles/by-plate/{vehicle['license_plate']}").json()["customer_id"] is None


def test_invoices_always_block_deletion(client):
    c, engine, tenant = client
    customer, _, case = started_case(c)
    from sqlalchemy.orm import Session
    from uuid import UUID
    from app.models.billing import Invoice
    with Session(engine) as db:
        db.add(Invoice(tenant_id=UUID(tenant), repair_case_id=UUID(case["id"]), customer_id=UUID(customer["id"]), invoice_number="FT-1"))
        db.commit()
    assert c.get(f"/api/v1/cases/{case['id']}/deletion").json()["blocked"]
    refused = c.delete(f"/api/v1/cases/{case['id']}?force=true")
    assert refused.status_code == 409 and "fatture" in refused.json()["detail"]
    refused = c.delete(f"/api/v1/customers/{customer['id']}?force=true")
    assert refused.status_code == 409 and "fatture" in refused.json()["detail"]


def test_admin_deletes_staff_account(client):
    c, _, _ = client
    worker = c.post("/api/v1/users", json=payload()).json()
    me = [u for u in c.get("/api/v1/users").json() if u["email"] == "admin@example.com"][0]
    assert c.delete(f"/api/v1/users/{me['id']}").status_code == 409

    login = c.post("/api/v1/auth/login", json={"email": "worker@example.com", "password": payload()["password"]}).json()
    headers = {"Authorization": "Bearer " + login["access_token"]}
    assert c.delete(f"/api/v1/users/{me['id']}", headers=headers).status_code == 403

    assert c.delete(f"/api/v1/users/{worker['id']}").status_code == 204
    assert [u["email"] for u in c.get("/api/v1/users").json()] == ["admin@example.com"]
    assert c.get("/api/v1/cases", headers=headers).status_code == 401
    assert c.post("/api/v1/auth/login", json={"email": "worker@example.com", "password": payload()["password"]}).status_code == 401
    # The e-mail is free again.
    assert c.post("/api/v1/users", json=payload()).status_code == 201


def test_admin_deletes_portal_account(client):
    c, _, _ = client
    customer = c.post("/api/v1/customers", json={"first_name": "Mario", "last_name": "Rossi"}).json()
    account = c.post(f"/api/v1/customers/{customer['id']}/portal-accounts", json={"email": "mario@example.com", "full_name": "Mario"}).json()
    worker = as_worker(c)
    assert c.delete(f"/api/v1/portal-accounts/{account['id']}", headers=worker).status_code == 403
    assert c.delete(f"/api/v1/portal-accounts/{account['id']}").status_code == 204
    assert c.get(f"/api/v1/customers/{customer['id']}/portal-accounts").json() == []
    assert c.post("/api/v1/portal/auth/login", json={"email": "mario@example.com", "password": account["temporary_password"]}).status_code == 401
