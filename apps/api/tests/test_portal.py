from datetime import date, timedelta

import test_fleet_billing as fleet
import test_tracking as tracking_tests
from test_users import client  # noqa: F401  (pytest fixture)


def test_fleet_portal_login_vehicles_maintenance_and_chat(client):
    c, _, _ = client
    customer, _, vehicle, case = fleet.create_fleet_case(c)
    order = tracking_tests.open_work_order(c, case)
    c.patch(f"/api/v1/work-orders/{order['id']}/status", json={"status": "IN_REPAIR"})

    created = c.post(f"/api/v1/customers/{customer['id']}/portal-accounts", json={"email": "Flotta@Univex.example.com", "full_name": "Ufficio flotta"})
    assert created.status_code == 201, created.text
    account = created.json()
    temporary = account["temporary_password"]
    assert len(temporary) == 12 and account["email"] == "flotta@univex.example.com"
    assert c.post(f"/api/v1/customers/{customer['id']}/portal-accounts", json={"email": "flotta@univex.example.com", "full_name": "Altro"}).status_code == 409
    assert "temporary_password" not in c.get(f"/api/v1/customers/{customer['id']}/portal-accounts").json()[0]

    last = date.today() - timedelta(days=350)
    plan = c.patch(f"/api/v1/vehicles/{vehicle['id']}/maintenance", json={
        "mileage": 118500, "service_interval_km": 20000, "service_interval_months": 12,
        "last_service_date": last.isoformat(), "last_service_km": 100000,
    })
    assert plan.status_code == 200, plan.text
    assert plan.json()["maintenance"]["km_left"] == 1500
    assert plan.json()["maintenance"]["state"] == "SOON"

    portal = c.__class__(c.app)
    assert portal.post("/api/v1/portal/auth/login", json={"email": "flotta@univex.example.com", "password": "wrong"}).status_code == 401
    login = portal.post("/api/v1/portal/auth/login", json={"email": "FLOTTA@univex.example.com", "password": temporary})
    assert login.status_code == 200, login.text
    assert login.json()["must_change_password"] is True
    portal.headers["Authorization"] = "Bearer " + login.json()["access_token"]

    # A portal token never opens the workshop API.
    assert portal.get("/api/v1/cases").status_code == 401
    assert c.get("/api/v1/portal/me").status_code == 401

    me = portal.get("/api/v1/portal/me").json()
    assert me["customer_name"] == "Univex Group" and me["contract"]["name"] == "Manutenzione flotta Univex"
    vehicles = portal.get("/api/v1/portal/vehicles").json()
    assert len(vehicles) == 1
    assert vehicles[0]["current_case"]["case_number"] == case["case_number"]
    assert vehicles[0]["current_case"]["status_text"] == "Riparazione in corso"
    assert vehicles[0]["maintenance"]["next_service_km"] == 120000
    detail = portal.get(f"/api/v1/portal/vehicles/{vehicle['id']}").json()
    assert detail["history"][0]["tasks"]

    sent = portal.post(f"/api/v1/portal/cases/{case['id']}/messages", json={"body": "Serve il mezzo entro venerdì"})
    assert sent.status_code == 201 and sent.json()["author_name"] == "Ufficio flotta"
    assert c.get("/api/v1/messages/unread").json()[0]["unread"] == 1
    c.post(f"/api/v1/cases/{case['id']}/messages", json={"body": "Pronto giovedì"})
    assert portal.get("/api/v1/portal/me").json()["unread"] == 1
    assert len(portal.get(f"/api/v1/portal/cases/{case['id']}/messages").json()) == 2

    # Other customers' data stays hidden.
    other = c.post("/api/v1/customers", json={"first_name": "Mario", "last_name": "Rossi"}).json()
    other_vehicle = c.post("/api/v1/vehicles", json={"license_plate": "ZZ999ZZ", "customer_id": other["id"]}).json()
    other_case = c.post("/api/v1/cases", json={"customer_id": other["id"], "vehicle_id": other_vehicle["id"]}).json()
    assert portal.get(f"/api/v1/portal/vehicles/{other_vehicle['id']}").status_code == 404
    assert portal.get(f"/api/v1/portal/cases/{other_case['id']}/messages").status_code == 404

    changed = portal.post("/api/v1/portal/password", json={"current_password": temporary, "new_password": "NuovaPassword2026"})
    assert changed.status_code == 200
    assert portal.get("/api/v1/portal/me").status_code == 401  # old session revoked
    portal.headers["Authorization"] = "Bearer " + changed.json()["access_token"]
    assert portal.get("/api/v1/portal/me").json()["must_change_password"] is False

    assert c.patch(f"/api/v1/portal-accounts/{account['id']}", json={"active": False}).json()["active"] is False
    assert portal.get("/api/v1/portal/me").status_code == 401
    assert portal.post("/api/v1/portal/auth/login", json={"email": "flotta@univex.example.com", "password": "NuovaPassword2026"}).status_code == 401
