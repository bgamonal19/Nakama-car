import test_fleet_billing as fleet
from test_users import client  # noqa: F401  (pytest fixture)


def open_work_order(c, case):
    estimate = c.post("/api/v1/estimates", json={"repair_case_id": case["id"]}).json()
    c.post(f"/api/v1/estimates/{estimate['id']}/lines", json=fleet.mechanical_line())
    assert c.patch(f"/api/v1/estimates/{estimate['id']}/status", json={"status": "APPROVED"}).status_code == 200
    return c.post(f"/api/v1/work-orders/from-estimate/{estimate['id']}").json()


def test_tracking_link_progress_and_chat(client):
    c, _, _ = client
    _, _, _, case = fleet.create_fleet_case(c)
    order = open_work_order(c, case)
    base = f"/api/v1/cases/{case['id']}"

    assert c.get(base + "/tracking-link").json()["active"] is False
    link = c.post(base + "/tracking-link").json()
    assert link["active"] and link["public_path"] == f"/segui/{link['public_token']}"
    assert link["customer_name"] == "Univex Group"
    assert c.post(base + "/tracking-link").json()["public_token"] == link["public_token"]

    public = f"/api/v1/public/tracking/{link['public_token']}"
    anonymous = c.get(public, headers={"Authorization": ""})
    assert anonymous.status_code == 200, anonymous.text
    data = anonymous.json()
    assert data["case_number"] == case["case_number"]
    assert data["vehicle"]["license_plate"] == "FL123TR"
    assert data["tasks_total"] > 0 and data["tasks_done"] == 0
    assert [step["code"] for step in data["steps"]][0] == "ACCEPTED"
    assert data["closed"] is False
    assert "internal_notes" not in data and "unit_price" not in str(data)

    tasks = c.get(f"/api/v1/work-orders/{order['id']}/tasks").json()
    c.patch(f"/api/v1/work-orders/{order['id']}/tasks/{tasks[0]['id']}/status", json={"status": "DONE"})
    c.patch(f"/api/v1/work-orders/{order['id']}/status", json={"status": "IN_REPAIR"})
    data = c.get(public).json()
    assert data["tasks_done"] == 1
    current = next(step for step in data["steps"] if step["current"])
    assert current["code"] == "WORK"
    assert data["status_text"] == "Riparazione in corso"

    sent = c.post(public + "/messages", json={"body": "  Quando sarà pronta?  ", "author_name": "Luca"})
    assert sent.status_code == 201, sent.text
    assert sent.json()["body"] == "Quando sarà pronta?" and sent.json()["sender"] == "CUSTOMER"
    assert c.post(public + "/messages", json={"body": "   "}).status_code == 422
    unread = c.get("/api/v1/messages/unread").json()
    assert unread[0]["unread"] == 1 and unread[0]["plate"] == "FL123TR"

    staff = c.get(base + "/messages").json()
    assert staff[0]["author_name"] == "Luca"
    assert c.get("/api/v1/messages/unread").json() == []
    reply = c.post(base + "/messages", json={"body": "Domani alle 17"})
    assert reply.status_code == 201 and reply.json()["sender"] == "WORKSHOP"
    assert c.get(public).json()["unread"] == 1
    thread = c.get(public + "/messages").json()
    assert [message["sender"] for message in thread] == ["CUSTOMER", "WORKSHOP"]
    assert c.get(public).json()["unread"] == 0

    c.patch(f"/api/v1/work-orders/{order['id']}/status", json={"status": "DELIVERED"})
    closed = c.get(public).json()
    assert closed["closed"] is True and all(step["done"] for step in closed["steps"])
    assert c.post(public + "/messages", json={"body": "Grazie"}).status_code == 409

    old_token = link["public_token"]
    assert c.delete(base + "/tracking-link").json()["active"] is False
    assert c.get(public).status_code == 404
    renewed = c.post(base + "/tracking-link").json()
    assert renewed["public_token"] != old_token
    assert c.get(f"/api/v1/public/tracking/{renewed['public_token']}").status_code == 200


def test_tracking_link_is_tenant_scoped(client):
    c, _, _ = client
    assert c.get("/api/v1/public/tracking/not-a-token").status_code == 404
    assert c.post("/api/v1/cases/00000000-0000-0000-0000-000000000000/tracking-link").status_code == 404
