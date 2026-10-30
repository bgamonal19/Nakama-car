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
    assert saved.json()["profile"]["phone"] == "345 111 2222"
    # Data minimisation: birth date, tax code and home address are no longer asked nor stored.
    assert not {"birth_date", "tax_code", "address", "city", "postal_code"} & set(mechanic.get("/api/v1/me").json()["profile"])
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

    # The estimate list shows which diagnosis it came from and when it arrived.
    listed = next(e for e in c.get("/api/v1/estimates").json() if e["id"] == estimate["id"])
    assert listed["diagnosis_number"] == diagnosis["diagnosis_number"] and listed["diagnosis_at"] and listed["created_at"]

    # A diagnosis that never became an estimate can be closed by its mechanic, or deleted (even once rejected).
    third = mechanic.post("/api/v1/diagnoses", json={"license_plate": "AB123CD", "complaint": "Cliente rinuncia"}).json()
    assert body.post(f"/api/v1/diagnoses/{third['id']}/reject", json={}).status_code == 404
    assert mechanic.post(f"/api/v1/diagnoses/{third['id']}/reject", json={"note": "Il cliente non procede"}).json()["status"] == "REJECTED"
    assert mechanic.delete(f"/api/v1/diagnoses/{third['id']}").status_code == 204
    assert c.delete(f"/api/v1/diagnoses/{second['id']}").status_code == 204
    assert c.delete(f"/api/v1/diagnoses/{diagnosis['id']}").status_code == 409  # it already has an estimate


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


def test_flow_mechanic_office_customer_back_to_mechanic(client):
    """Diagnosis -> office estimate -> link to the customer -> approval -> job appears to the mechanic."""
    c, _, _ = client
    mechanic, _, _ = worker(c, "mec3@example.com", "MECHANIC")
    customer = c.post("/api/v1/customers", json={"first_name": "Marco", "phone": "345 000 1111", "email": "marco@example.com"}).json()
    vehicle = c.post("/api/v1/vehicles", json={"license_plate": "FL123OW", "customer_id": customer["id"]}).json()
    case = c.post("/api/v1/cases", json={"customer_id": customer["id"], "vehicle_id": vehicle["id"], "work_type": "MECHANICAL"}).json()

    # 1. Vehicle arrived: the mechanic must diagnose it.
    work = mechanic.get("/api/v1/my-work").json()
    assert [w["plate"] for w in work["waiting"]] == ["FL123OW"] and work["pending"] == [] and work["new_jobs"] == 0

    sent = mechanic.post("/api/v1/diagnoses", json={"license_plate": "FL123OW", "labor_hours": "1", "lines": [{"kind": "PART", "description": "Filtro olio", "unit_price": "15"}]}).json()
    assert sent["repair_case_id"] == case["id"]

    # 2. The office turns it into an estimate: the vehicle is now "at the office".
    converted = c.post(f"/api/v1/diagnoses/{sent['id']}/estimate", json={}).json()
    work = mechanic.get("/api/v1/my-work").json()
    assert work["waiting"] == [] and [(p["plate"], p["stage"]) for p in work["pending"]] == [("FL123OW", "OFFICE")]

    # 3. Link sent to the customer (contacts for WhatsApp / e-mail come back too).
    share = c.post(f"/api/v1/estimates/{converted['estimate_id']}/share").json()
    assert share["customer_phone"] == "345 000 1111" and share["customer_email"] == "marco@example.com"
    assert share["estimate_number"] == converted["estimate_number"] and share["answered"] is False
    assert mechanic.get("/api/v1/my-work").json()["pending"][0]["stage"] == "CUSTOMER"
    assert mechanic.get(f"/api/v1/diagnoses/{sent['id']}").json()["estimate_status"] == "SENT"

    # 4. The customer approves from the link: the job lands in the mechanic's list, marked new.
    token = share["public_token"]
    assert c.post(f"/api/v1/public/estimate/{token}/decision", json={"accepted": True, "signature_name": "Marco Rossi", "accept_terms": True, "accept_privacy": True}).status_code == 200
    work = mechanic.get("/api/v1/my-work").json()
    assert work["pending"] == [] and work["new_jobs"] == 1
    job = work["jobs"][0]
    assert job["plate"] == "FL123OW" and job["is_new"] is True and job["tasks"]
    assert c.get(f"/api/v1/cases/{case['id']}").json()["status"] == "APPROVED"
    assert c.post(f"/api/v1/work-orders/from-estimate/{converted['estimate_id']}").json()["id"] == job["work_order_id"]  # no duplicate

    # 5. First task ticked: no longer new.
    mechanic.post(f"/api/v1/my-work/tasks/{job['tasks'][0]['id']}", json={"done": True})
    assert mechanic.get("/api/v1/my-work").json()["new_jobs"] == 0


def test_customer_rejection_is_shown_and_office_approval_opens_job(client):
    c, _, _ = client
    mechanic, _, _ = worker(c, "mec4@example.com", "MECHANIC")
    customer = c.post("/api/v1/customers", json={"first_name": "Sara"}).json()
    vehicle = c.post("/api/v1/vehicles", json={"license_plate": "RJ000AA", "customer_id": customer["id"]}).json()
    case = c.post("/api/v1/cases", json={"customer_id": customer["id"], "vehicle_id": vehicle["id"], "work_type": "MECHANICAL"}).json()
    estimate = c.post("/api/v1/estimates", json={"repair_case_id": case["id"]}).json()
    token = c.post(f"/api/v1/estimates/{estimate['id']}/share").json()["public_token"]
    assert c.post(f"/api/v1/public/estimate/{token}/decision", json={"accepted": False, "signature_name": "Sara Bianchi", "accept_privacy": True}).status_code == 200
    work = mechanic.get("/api/v1/my-work").json()
    assert work["waiting"] == [] and work["pending"][0]["stage"] == "REJECTED" and work["jobs"] == []

    # Office approval (customer said yes by phone) also opens the job.
    other = c.post("/api/v1/vehicles", json={"license_plate": "PH111BB", "customer_id": customer["id"]}).json()
    case2 = c.post("/api/v1/cases", json={"customer_id": customer["id"], "vehicle_id": other["id"], "work_type": "MECHANICAL"}).json()
    estimate2 = c.post("/api/v1/estimates", json={"repair_case_id": case2["id"]}).json()
    assert c.patch(f"/api/v1/estimates/{estimate2['id']}/status", json={"status": "APPROVED"}).status_code == 200
    assert [job["plate"] for job in mechanic.get("/api/v1/my-work").json()["jobs"]] == ["PH111BB"]


def test_quick_items_are_saved_for_the_workshop(client):
    c, _, _ = client
    mechanic, _, _ = worker(c, "mec5@example.com", "MECHANIC")
    body, _, _ = worker(c, "carr5@example.com", "BODYSHOP")
    saved = mechanic.post("/api/v1/quick-items", json={"name": "  Sensore  ABS posteriore ", "kind": "PART", "labor_hours": "1.5"})
    assert saved.status_code == 201, saved.text
    item = saved.json()
    assert item["name"] == "Sensore ABS posteriore" and item["work_area"] == "MECHANICAL" and item["labor_hours"] == 1.5
    # Same name again: reused, not duplicated.
    assert mechanic.post("/api/v1/quick-items", json={"name": "sensore abs posteriore", "kind": "PART"}).json()["id"] == item["id"]
    both = body.post("/api/v1/quick-items", json={"name": "Nastro carta", "kind": "MATERIAL", "work_area": "ALL"}).json()
    assert both["work_area"] is None
    assert [i["name"] for i in mechanic.get("/api/v1/quick-items").json()] == ["Nastro carta", "Sensore ABS posteriore"]
    assert [i["name"] for i in body.get("/api/v1/quick-items").json()] == ["Nastro carta"]
    assert len(c.get("/api/v1/quick-items").json()) == 2  # the office sees all
    assert body.delete(f"/api/v1/quick-items/{item['id']}").status_code == 403
    assert mechanic.delete(f"/api/v1/quick-items/{item['id']}").status_code == 204
    assert c.delete(f"/api/v1/quick-items/{both['id']}").status_code == 204
    assert c.get("/api/v1/quick-items").json() == []


def test_job_shows_vehicle_parts_as_buttons_and_notes(client):
    c, _, _ = client
    mechanic, _, _ = worker(c, "mec6@example.com", "MECHANIC")
    body, _, _ = worker(c, "carr6@example.com", "BODYSHOP")
    customer = c.post("/api/v1/customers", json={"first_name": "Gino"}).json()
    vehicle = c.post("/api/v1/vehicles", json={"license_plate": "EX030XG", "customer_id": customer["id"], "make": "Renault", "model": "Trafic", "vin": "VF1FL000123456789", "color_name": "Bianco"}).json()
    case = c.post("/api/v1/cases", json={"customer_id": customer["id"], "vehicle_id": vehicle["id"], "work_type": "MECHANICAL", "mileage": 150000}).json()
    sent = mechanic.post("/api/v1/diagnoses", json={"license_plate": "EX030XG", "labor_hours": "2", "lines": [
        {"kind": "PART", "description": "Pastiglie anteriori", "quantity": "1", "unit_price": "60"},
        {"kind": "MATERIAL", "description": "Liquido freni"},
    ]}).json()
    converted = c.post(f"/api/v1/diagnoses/{sent['id']}/estimate", json={}).json()
    assert c.patch(f"/api/v1/estimates/{converted['estimate_id']}/status", json={"status": "APPROVED"}).status_code == 200

    job = mechanic.get("/api/v1/my-work").json()["jobs"][0]
    assert job["details"]["vin"] == "VF1FL000123456789" and job["details"]["mileage"] == 150000 and job["details"]["make"] == "Renault"
    descriptions = [task["description"] for task in job["tasks"]]
    assert "Sostituzione Pastiglie anteriori" in descriptions
    assert not any("Liquido freni" in text for text in descriptions)  # materials are not a job to tick
    assert descriptions.index("Sostituzione Pastiglie anteriori") < descriptions.index("Controllo qualità")
    item = next(task for task in job["tasks"] if task["description"] == "Sostituzione Pastiglie anteriori")
    assert item["estimate_line_id"] and item["task_type"] == "ITEM_MECHANICAL"

    # Note on a button, then removed.
    noted = mechanic.put(f"/api/v1/my-work/tasks/{item['id']}/note", json={"note": "  Dischi al limite, avvisare ufficio "})
    assert noted.status_code == 200 and noted.json()["note"] == "Dischi al limite, avvisare ufficio"
    again = next(task for task in mechanic.get("/api/v1/my-work").json()["jobs"][0]["tasks"] if task["id"] == item["id"])
    assert again["note"] == "Dischi al limite, avvisare ufficio"
    assert body.put(f"/api/v1/my-work/tasks/{item['id']}/note", json={"note": "x"}).status_code == 403
    assert mechanic.put(f"/api/v1/my-work/tasks/{item['id']}/note", json={"note": ""}).json()["note"] is None

    # The worker may load the vehicle picture of the job (without vehicle.read).
    assert mechanic.get(f"/api/v1/my-work/cases/{case['id']}/renders/front").status_code != 403
    assert mechanic.get(f"/api/v1/my-work/cases/{case['id']}/renders/nope").status_code == 422


def png_bytes() -> bytes:
    from io import BytesIO

    from PIL import Image

    buffer = BytesIO()
    Image.new("RGB", (64, 48), (200, 30, 30)).save(buffer, format="PNG")
    return buffer.getvalue()


def test_diagnosis_check_in_photos_and_fuel_level(client):
    c, _, _ = client
    mechanic, _, _ = worker(c, "mec7@example.com", "MECHANIC")
    other, _, _ = worker(c, "mec8@example.com", "MECHANIC")
    sent = mechanic.post("/api/v1/diagnoses", json={"license_plate": "NW001FT", "fuel_level": 25, "mileage": 98000, "complaint": "Spia olio"}).json()
    assert sent["fuel_level"] == 25 and sent["photos"] == [] and sent["repair_case_id"] is None
    assert mechanic.post("/api/v1/diagnoses", json={"license_plate": "NW002FT", "fuel_level": 120}).status_code == 422

    up = mechanic.post(f"/api/v1/diagnoses/{sent['id']}/photos", params={"category": "FRONT", "filename": "davanti.png"}, content=png_bytes(), headers={"Content-Type": "image/png"})
    assert up.status_code == 201, up.text
    photo = up.json()
    assert photo["category"] == "FRONT"
    assert mechanic.post(f"/api/v1/diagnoses/{sent['id']}/photos", content=b"not an image").status_code == 422
    assert other.post(f"/api/v1/diagnoses/{sent['id']}/photos", content=png_bytes()).status_code == 404  # not their diagnosis
    shown = mechanic.get(f"/api/v1/diagnoses/{sent['id']}/photos/{photo['id']}")
    assert shown.status_code == 200 and shown.headers["content-type"].startswith("image/")
    assert c.get(f"/api/v1/diagnoses/{sent['id']}").json()["photos"] == [photo]  # the office sees them

    # Converted: the vehicle gets a case with the fuel level, and the photos join that case.
    customer = c.post("/api/v1/customers", json={"first_name": "Elio"}).json()
    converted = c.post(f"/api/v1/diagnoses/{sent['id']}/estimate", json={"customer_id": customer["id"]}).json()
    case = c.get(f"/api/v1/cases/{converted['repair_case_id']}").json()
    assert case["fuel_level_percent"] == 25 and case["mileage"] == 98000
    media = c.get(f"/api/v1/cases/{converted['repair_case_id']}/media").json()
    assert [item["id"] for item in media] == [photo["id"]]
    # After the office worked it, the mechanic can no longer remove evidence.
    assert mechanic.delete(f"/api/v1/diagnoses/{sent['id']}/photos/{photo['id']}").status_code == 409

    second = mechanic.post("/api/v1/diagnoses", json={"license_plate": "NW003FT"}).json()
    extra = mechanic.post(f"/api/v1/diagnoses/{second['id']}/photos", content=png_bytes()).json()
    assert mechanic.delete(f"/api/v1/diagnoses/{second['id']}/photos/{extra['id']}").status_code == 204
    assert mechanic.get(f"/api/v1/diagnoses/{second['id']}").json()["photos"] == []


def test_numbers_stay_unique_after_deleting_records(client):
    """Deleting a case must not make the next estimate, case or diagnosis reuse an existing number."""
    c, _, _ = client
    mechanic, _, _ = worker(c, "mec-num@example.com", "MECHANIC")
    customer = c.post("/api/v1/customers", json={"company_name": "Numeri Srl", "customer_type": "COMPANY"}).json()
    cases, estimates = [], []
    for plate in ("NU111AA", "NU222BB"):
        vehicle = c.post("/api/v1/vehicles", json={"license_plate": plate, "customer_id": customer["id"]}).json()
        case = c.post("/api/v1/cases", json={"customer_id": customer["id"], "vehicle_id": vehicle["id"], "work_type": "MECHANICAL"}).json()
        cases.append(case)
        estimates.append(c.post("/api/v1/estimates", json={"repair_case_id": case["id"]}).json())
    assert c.delete(f"/api/v1/cases/{cases[0]['id']}").status_code == 204

    # Only one estimate is left, but its number is the second: a count would hand it out again.
    again = c.post("/api/v1/estimates", json={"repair_case_id": cases[1]["id"]})
    assert again.status_code == 201, again.text
    assert again.json()["estimate_number"] > estimates[1]["estimate_number"]

    # A received diagnosis for a new vehicle becomes an estimate (and a case) without clashing.
    diagnosis = mechanic.post("/api/v1/diagnoses", json={"license_plate": "NU333CC", "complaint": "Turbina"}).json()
    converted = c.post(f"/api/v1/diagnoses/{diagnosis['id']}/estimate", json={"customer_id": customer["id"]})
    assert converted.status_code == 200, converted.text
    assert converted.json()["case_number"] > cases[1]["case_number"]


def test_diagnosis_keeps_make_model_and_known_plates_fill_in(client):
    c, _, _ = client
    mechanic, _, _ = worker(c, "mec-van@example.com", "MECHANIC")
    assert mechanic.get("/api/v1/diagnoses/vehicle/GE027AM").status_code == 404

    # A van never seen before: make/model typed in Diagnosi register the vehicle (no customer yet).
    sent = mechanic.post("/api/v1/diagnoses", json={"license_plate": "GE 027 AM", "make": " Iveco ", "model": "Daily", "complaint": "Turbina"})
    assert sent.status_code == 201, sent.text
    assert sent.json()["vehicle"]["make"] == "Iveco" and sent.json()["vehicle"]["model"] == "Daily"
    known = mechanic.get("/api/v1/diagnoses/vehicle/ge-027-am")
    assert known.status_code == 200 and known.json()["model"] == "Daily" and known.json()["customer_name"] is None
    assert c.get("/api/v1/vehicles/by-plate/GE 027 AM").json()["make"] == "Iveco"

    # The office makes the estimate: the case shows the van's make and model.
    customer = c.post("/api/v1/customers", json={"customer_type": "COMPANY", "company_name": "Gamonal Trasporti"}).json()
    converted = c.post(f"/api/v1/diagnoses/{sent.json()['id']}/estimate", json={"customer_id": customer["id"]})
    assert converted.status_code == 200, converted.text
    case = next(item for item in c.get("/api/v1/cases").json() if item["id"] == converted.json()["repair_case_id"])
    assert case["vehicle_make"] == "Iveco" and case["vehicle_model"] == "Daily" and case["plate"] == "GE027AM"
    assert mechanic.get("/api/v1/diagnoses/vehicle/GE027AM").json()["customer_name"] == "Gamonal Trasporti"

    # A registered vehicle keeps its data: a different model typed later does not overwrite it.
    mechanic.post("/api/v1/diagnoses", json={"license_plate": "GE027AM", "make": "Fiat", "model": "Ducato"})
    assert c.get("/api/v1/vehicles/by-plate/GE027AM").json()["model"] == "Daily"


def test_mechanic_looks_up_new_plates_and_does_not_see_estimates(client, monkeypatch):
    from app.providers import targa
    from test_plate_lookup import FakeProvider

    c, _, _ = client
    mechanic, _, _ = worker(c, "mec-targa@example.com", "MECHANIC")
    body, _, _ = worker(c, "body-targa@example.com", "BODYSHOP")

    # Diagnosi: a plate never seen asks the external provider, cached like the office lookup.
    assert mechanic.get("/api/v1/vehicles/plate-data/AB123CD").status_code == 403
    assert mechanic.get("/api/v1/diagnoses/plate-data/AB123CD").status_code == 503
    fake = FakeProvider()
    monkeypatch.setattr(targa, "get_vehicle_data_provider", lambda: fake)
    found = mechanic.get("/api/v1/diagnoses/plate-data/ab 123 cd")
    assert found.status_code == 200, found.text
    assert found.json()["make"] == "Fiat" and found.json()["model"] == "PANDA"
    assert c.get("/api/v1/vehicles/plate-data/AB123CD").json()["cached"] is True
    assert mechanic.get("/api/v1/diagnoses/plate-data/ZZ999ZZ").status_code == 404
    assert fake.calls == 2

    # Estimates stay with the office: the mechanic cannot list or open them, the body shop still can.
    customer = c.post("/api/v1/customers", json={"first_name": "Mario"}).json()
    vehicle = c.post("/api/v1/vehicles", json={"customer_id": customer["id"], "license_plate": "EF456GH"}).json()
    case = c.post("/api/v1/cases", json={"customer_id": customer["id"], "vehicle_id": vehicle["id"], "work_type": "MECHANICAL"}).json()
    estimate = c.post("/api/v1/estimates", json={"repair_case_id": case["id"]}).json()
    assert mechanic.get("/api/v1/estimates").status_code == 403
    assert mechanic.get(f"/api/v1/estimates/{estimate['id']}").status_code == 403
    assert mechanic.get(f"/api/v1/estimates/{estimate['id']}/pdf").status_code == 403
    assert body.get("/api/v1/estimates").status_code == 200
    assert c.get(f"/api/v1/estimates/{estimate['id']}").status_code == 200


def test_mechanic_saves_plate_data_on_a_registered_vehicle(client, monkeypatch):
    from app.providers import targa
    from test_plate_lookup import FakeProvider

    c, _, _ = client
    mechanic, _, _ = worker(c, "mec-save@example.com", "MECHANIC")
    customer = c.post("/api/v1/customers", json={"first_name": "Flotta"}).json()
    c.post("/api/v1/vehicles", json={"customer_id": customer["id"], "license_plate": "FG133WJ", "make": "Renault", "model": "Trafic"})
    fake = FakeProvider()
    monkeypatch.setattr(targa, "get_vehicle_data_provider", lambda: fake)

    saved = mechanic.post("/api/v1/diagnoses/vehicle/fg 133 wj/plate-data")
    assert saved.status_code == 200, saved.text
    assert saved.json()["saved"] is True and saved.json()["make"] == "Fiat"
    known = mechanic.get("/api/v1/diagnoses/vehicle/FG133WJ").json()
    assert known["make"] == "Fiat" and known["model"] == "PANDA" and known["year"] == 2015
    assert known["customer_name"]

    # The next search of the same plate is served from the cache: no new credit.
    assert mechanic.post("/api/v1/diagnoses/vehicle/FG133WJ/plate-data").json()["cached"] is True
    assert fake.calls == 1
    # A plate not registered only answers, nothing to save.
    assert mechanic.post("/api/v1/diagnoses/vehicle/AB123CD/plate-data").json()["saved"] is False
