import test_fleet_billing as fleet
import test_tracking as tracking_tests
from test_users import client  # noqa: F401  (pytest fixture)


def test_delete_case_never_carried_out(client):
    c, _, _ = client
    customer, _, vehicle, case = fleet.create_fleet_case(c)
    estimate = c.post("/api/v1/estimates", json={"repair_case_id": case["id"]}).json()
    assert c.patch(f"/api/v1/estimates/{estimate['id']}/status", json={"status": "REJECTED"}).status_code == 200
    assert c.get("/api/v1/cases").json()[0]["estimate_status"] == "REJECTED"

    deleted = c.delete(f"/api/v1/cases/{case['id']}")
    assert deleted.status_code == 204, deleted.text
    assert c.get(f"/api/v1/cases/{case['id']}").status_code == 404
    assert c.delete(f"/api/v1/cases/{case['id']}").status_code == 404
    # Customer and vehicle stay.
    assert c.get(f"/api/v1/customers/{customer['id']}").status_code == 200
    assert c.get(f"/api/v1/vehicles/by-plate/{vehicle['license_plate']}").status_code == 200


def test_delete_case_with_work_done_is_refused(client):
    c, _, _ = client
    _, _, _, case = fleet.create_fleet_case(c)
    order = tracking_tests.open_work_order(c, case)
    tasks = c.get(f"/api/v1/work-orders/{order['id']}/tasks").json()
    assert c.patch(f"/api/v1/work-orders/{order['id']}/tasks/{tasks[0]['id']}/status", json={"status": "DONE"}).status_code == 200

    refused = c.delete(f"/api/v1/cases/{case['id']}")
    assert refused.status_code == 409
    assert "iniziati" in refused.json()["detail"]
    assert c.get(f"/api/v1/cases/{case['id']}").status_code == 200


def test_rejected_estimate_can_go_back_to_pending(client):
    c, _, _ = client
    _, _, _, case = fleet.create_fleet_case(c)
    estimate = c.post("/api/v1/estimates", json={"repair_case_id": case["id"]}).json()
    assert c.patch(f"/api/v1/estimates/{estimate['id']}/status", json={"status": "REJECTED"}).json()["status"] == "REJECTED"
    assert c.patch(f"/api/v1/estimates/{estimate['id']}/status", json={"status": "SENT"}).json()["status"] == "SENT"
    assert c.get("/api/v1/cases").json()[0]["estimate_status"] == "SENT"
