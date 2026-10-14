import test_fleet_billing as fleet
from test_users import client  # noqa: F401  (pytest fixture)

PASSWORD = "WorkerPassword2026!"


def worker(c, email, role):
    created = c.post("/api/v1/users", json={"email": email, "password": PASSWORD, "first_name": role.title(), "last_name": "Test", "role_code": role})
    assert created.status_code == 201, created.text
    other = c.__class__(c.app)
    login = other.post("/api/v1/auth/login", json={"email": email, "password": PASSWORD})
    assert login.status_code == 200, login.text
    other.headers["Authorization"] = "Bearer " + login.json()["access_token"]
    return other, login.json(), created.json()


def test_workers_area_profile_and_diagnosis_to_estimate(client):
    c, _, _ = client
    mechanic, session, mechanic_user = worker(c, "mec@example.com", "MECHANIC")
    body, body_session, _ = worker(c, "carr@example.com", "BODYSHOP")
    assert session["roles"] == ["MECHANIC"] and session["work_area"] == "MECHANICAL"
    assert body_session["work_area"] == "BODY"
    admin_me = c.get("/api/v1/me").json()
    assert admin_me["work_area"] is None and "ADMIN" in admin_me["roles"]

    # Personal profile.
    saved = mechanic.put("/api/v1/me/profile", json={"phone": " 345 111 2222 ", "city": "Milano", "birth_date": "1990-05-01", "skills": "Diagnosi elettronica"})
    assert saved.status_code == 200, saved.text
    assert saved.json()["profile"]["phone"] == "345 111 2222" and saved.json()["profile"]["city"] == "Milano"
    assert mechanic.get("/api/v1/me").json()["profile"]["birth_date"] == "1990-05-01"
    assert mechanic.get(f"/api/v1/users/{mechanic_user['id']}/profile").status_code == 403
    assert c.get(f"/api/v1/users/{mechanic_user['id']}/profile").json()["profile"]["skills"] == "Diagnosi elettronica"
    assert c.put(f"/api/v1/users/{mechanic_user['id']}/area", json={"work_area": "ALL"}).json()["work_area"] is None
    assert c.put(f"/api/v1/users/{mechanic_user['id']}/area", json={"work_area": "MECHANICAL"}).json()["work_area"] == "MECHANICAL"

    # Quick diagnosis for a vehicle the workshop does not know yet.
    assert c.put("/api/v1/settings/labor-rates/MECHANICAL", json={"labor_type": "MECHANICAL", "hourly_rate": "50"}).status_code == 200
    sent = mechanic.post("/api/v1/diagnoses", json={
        "license_plate": "ab 123 cd", "mileage": 120000, "complaint": "Rumore freni", "findings": "Pastiglie consumate",
        "urgency": "HIGH", "labor_hours": "2",
        "lines": [
            {"kind": "PART", "description": "Pastiglie anteriori", "oem_code": "BP-1", "quantity": "1", "unit_price": "60"},
            {"kind": "MATERIAL", "description": "Liquido freni", "quantity": "1"},
        ],
    })
    assert sent.status_code == 201, sent.text
    diagnosis = sent.json()
    assert diagnosis["license_plate"] == "AB123CD" and diagnosis["work_type"] == "MECHANICAL" and diagnosis["status"] == "SENT"
    assert len(diagnosis["lines"]) == 2 and diagnosis["author_name"] == "Mechanic Test"

    assert [d["id"] for d in mechanic.get("/api/v1/diagnoses").json()] == [diagnosis["id"]]
    assert body.get("/api/v1/diagnoses").json() == []
    assert body.get(f"/api/v1/diagnoses/{diagnosis['id']}").status_code == 404
    assert [d["id"] for d in c.get("/api/v1/diagnoses", params={"status": "SENT"}).json()] == [diagnosis["id"]]
    assert mechanic.post(f"/api/v1/diagnoses/{diagnosis['id']}/estimate", json={}).status_code == 403

    edited = mechanic.put(f"/api/v1/diagnoses/{diagnosis['id']}", json={
        "license_plate": "AB123CD", "labor_hours": "2.5", "lines": [{"kind": "PART", "description": "Pastiglie anteriori", "quantity": "1", "unit_price": "60"}],
    })
    assert edited.status_code == 200 and edited.json()["labor_hours"] == "2.50" and len(edited.json()["lines"]) == 1

    # The office needs a customer for a new vehicle, then gets a draft estimate.
    needs = c.post(f"/api/v1/diagnoses/{diagnosis['id']}/estimate", json={})
    assert needs.status_code == 409 and needs.json()["detail"]["needs_customer"] is True
    customer = c.post("/api/v1/customers", json={"first_name": "Luca"}).json()
    converted = c.post(f"/api/v1/diagnoses/{diagnosis['id']}/estimate", json={"customer_id": customer["id"]})
    assert converted.status_code == 200, converted.text
    estimate = c.get(f"/api/v1/estimates/{converted.json()['estimate_id']}").json()
    lines = c.get(f"/api/v1/estimates/{estimate['id']}/lines").json()
    assert {line["category"] for line in lines} == {"MECHANICAL_LABOR", "PART"}
    labor = next(line for line in lines if line["category"] == "MECHANICAL_LABOR")
    assert labor["labor_hours"] == "2.50" and labor["labor_rate"] == "50.00"
    assert estimate["subtotal"] == "185.00"
    after = mechanic.get(f"/api/v1/diagnoses/{diagnosis['id']}").json()
    assert after["status"] == "CONVERTED" and after["estimate_number"] == estimate["estimate_number"]
    assert mechanic.put(f"/api/v1/diagnoses/{diagnosis['id']}", json={"license_plate": "AB123CD"}).status_code == 409

    second = mechanic.post("/api/v1/diagnoses", json={"license_plate": "AB123CD", "complaint": "Spia motore"}).json()
    assert second["repair_case_id"] == converted.json()["repair_case_id"]  # same open case
    rejected = c.post(f"/api/v1/diagnoses/{second['id']}/reject", json={"note": "Già incluso"})
    assert rejected.json()["status"] == "REJECTED" and rejected.json()["review_note"] == "Già incluso"


def test_my_work_shows_my_area_and_tasks_toggle(client):
    c, _, _ = client
    mechanic, _, _ = worker(c, "mec2@example.com", "MECHANIC")
    body, _, _ = worker(c, "carr2@example.com", "BODYSHOP")
    customer = c.post("/api/v1/customers", json={"first_name": "Anna"}).json()
    vehicle = c.post("/api/v1/vehicles", json={"license_plate": "GM555MM", "customer_id": customer["id"]}).json()
    case = c.post("/api/v1/cases", json={"customer_id": customer["id"], "vehicle_id": vehicle["id"], "work_type": "MECHANICAL", "customer_notes": "Tagliando"}).json()
    estimate = c.post("/api/v1/estimates", json={"repair_case_id": case["id"]}).json()
    c.post(f"/api/v1/estimates/{estimate['id']}/lines", json=fleet.mechanical_line())
    assert c.patch(f"/api/v1/estimates/{estimate['id']}/status", json={"status": "APPROVED"}).status_code == 200
    order = c.post(f"/api/v1/work-orders/from-estimate/{estimate['id']}").json()
    mine, other = mechanic, body
    jobs = mine.get("/api/v1/my-work").json()["jobs"]
    assert [job["work_order_id"] for job in jobs] == [order["id"]]
    assert other.get("/api/v1/my-work").json()["jobs"] == []
    assert len(c.get("/api/v1/my-work").json()["jobs"]) == 1  # the office sees everything
    assert jobs[0]["request"] == "Tagliando" and jobs[0]["plate"] == "GM555MM"
    assert "PAINT" not in {t["task_type"] for t in jobs[0]["tasks"]}
    task = jobs[0]["tasks"][0]
    done = mine.post(f"/api/v1/my-work/tasks/{task['id']}", json={"done": True})
    assert done.status_code == 200 and done.json()["status"] == "DONE" and done.json()["completed_by"]
    assert mine.get("/api/v1/my-work").json()["jobs"][0]["done"] == 1
    undone = mine.post(f"/api/v1/my-work/tasks/{task['id']}", json={"done": False}).json()
    assert undone["status"] == "PENDING" and undone["completed_by"] is None
    assert other.post(f"/api/v1/my-work/tasks/{task['id']}", json={"done": True}).status_code == 403
    assert [w["case_number"] for w in other.get("/api/v1/cases").json()] == []
