from uuid import UUID

from sqlalchemy.orm import Session

import test_fleet_billing as fleet
import test_tracking as tracking_tests
from test_deletions import as_worker, started_case
from test_fleet_profile import excel
from test_users import client, payload  # noqa: F401  (pytest fixture)


def test_vehicle_profile_lists_repairs_and_maintenance(client):
    c, _, _ = client
    customer, vehicle, case = started_case(c)
    service = c.post("/api/v1/cases", json={"customer_id": customer["id"], "vehicle_id": vehicle["id"], "customer_notes": "Tagliando 60.000 km"}).json()

    response = c.get(f"/api/v1/vehicles/{vehicle['id']}/profile")
    assert response.status_code == 200, response.text
    data = response.json()
    assert data["license_plate"] == vehicle["license_plate"] and data["customer_name"] == "Univex Group"
    assert data["totals"] == {"cases": 2, "repairs": 1, "maintenance": 1, "open": 2}
    by_number = {item["case_number"]: item for item in data["history"]}
    assert by_number[service["case_number"]]["kind"] == "MAINTENANCE"
    repair = by_number[case["case_number"]]
    assert repair["kind"] == "REPAIR" and repair["tasks"] and repair["tasks"][0]["status"] == "DONE"
    assert data["maintenance"]["state"] == "UNKNOWN"
    assert c.get("/api/v1/vehicles/00000000-0000-0000-0000-000000000000/profile").status_code == 404


def test_delete_vehicle_without_history(client):
    c, _, _ = client
    vehicle = c.post("/api/v1/vehicles", json={"license_plate": "AB123CD"}).json()
    worker = as_worker(c)
    preview = c.get(f"/api/v1/vehicles/{vehicle['id']}/deletion", headers=worker).json()
    assert preview["has_history"] is False and preview["blocked"] is None
    assert c.delete(f"/api/v1/vehicles/{vehicle['id']}", headers=worker).status_code == 204
    assert c.get("/api/v1/vehicles/by-plate/AB123CD").status_code == 404


def test_vehicle_with_cases_needs_admin_and_invoices_block(client):
    c, engine, tenant = client
    customer, vehicle, case = started_case(c)
    assert c.delete(f"/api/v1/vehicles/{vehicle['id']}").status_code == 409
    worker = as_worker(c)
    assert c.delete(f"/api/v1/vehicles/{vehicle['id']}?force=true", headers=worker).status_code == 403

    other = c.post("/api/v1/vehicles", json={"license_plate": "IN123VC", "customer_id": customer["id"]}).json()
    billed = c.post("/api/v1/cases", json={"customer_id": customer["id"], "vehicle_id": other["id"]}).json()
    from app.models.billing import Invoice
    with Session(engine) as db:
        db.add(Invoice(tenant_id=UUID(tenant), repair_case_id=UUID(billed["id"]), customer_id=UUID(customer["id"]), invoice_number="FT-9"))
        db.commit()
    refused = c.delete(f"/api/v1/vehicles/{other['id']}?force=true")
    assert refused.status_code == 409 and "fatture" in refused.json()["detail"]

    deleted = c.delete(f"/api/v1/vehicles/{vehicle['id']}?force=true")
    assert deleted.status_code == 204, deleted.text
    assert c.get(f"/api/v1/cases/{case['id']}").status_code == 404
    assert c.get(f"/api/v1/customers/{customer['id']}").status_code == 200


def test_bulk_delete_preview_then_delete(client):
    c, _, _ = client
    customer, vehicle, _ = started_case(c)
    spare = [c.post("/api/v1/vehicles", json={"license_plate": plate, "customer_id": customer["id"]}).json() for plate in ("AA111AA", "BB222BB")]
    ids = [vehicle["id"], *[item["id"] for item in spare]]

    preview = c.post("/api/v1/vehicles/bulk-delete?dry_run=true", json={"ids": ids}).json()
    assert [item["license_plate"] for item in preview["deleted"]] == ["AA111AA", "BB222BB"]
    assert preview["with_history"] == [vehicle["license_plate"]] and preview["refused"][0]["id"] == vehicle["id"]
    assert c.get(f"/api/v1/customers/{customer['id']}/fleet").json()["totals"]["vehicles"] == 3

    worker = as_worker(c)
    partial = c.post("/api/v1/vehicles/bulk-delete", json={"ids": ids, "force": True}, headers=worker).json()
    assert len(partial["deleted"]) == 2 and "amministratore" in partial["refused"][0]["reason"]
    done = c.post("/api/v1/vehicles/bulk-delete", json={"ids": ids, "force": True}).json()
    assert [item["license_plate"] for item in done["deleted"]] == [vehicle["license_plate"]]
    assert c.get(f"/api/v1/customers/{customer['id']}/fleet").json()["totals"]["vehicles"] == 0


def test_import_reads_make_and_model_from_one_column_and_skips_titles(client):
    c, _, _ = client
    customer, _, _, _ = fleet.create_fleet_case(c)
    content = excel([
        ["Targa", "Veicolo", "Km"],
        ["AZIENDA", None, None],
        ["CT413YE", "FIAT Ducato 2.3 MJT", 1000],
        ["DK013LS", "Iveco", 2000],
    ])
    result = c.post(f"/api/v1/customers/{customer['id']}/fleet/import?filename=f.xlsx", content=content, headers={"Content-Type": "application/octet-stream"}).json()
    assert (result["created"], result["skipped"]) == (2, 1)
    vehicles = {item["license_plate"]: item for item in c.get(f"/api/v1/customers/{customer['id']}/fleet").json()["vehicles"]}
    assert (vehicles["CT413YE"]["make"], vehicles["CT413YE"]["model"]) == ("FIAT", "Ducato 2.3 MJT")
    assert (vehicles["DK013LS"]["make"], vehicles["DK013LS"]["model"]) == ("Iveco", None)

    headers = excel([["Targa", "Marca veicolo", "Modello / versione"], ["GG777GG", "Renault", "Master"]])
    c.post(f"/api/v1/customers/{customer['id']}/fleet/import?filename=f.xlsx", content=headers, headers={"Content-Type": "application/octet-stream"})
    assert c.get("/api/v1/vehicles/by-plate/GG777GG").json()["model"] == "Master"
