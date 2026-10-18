import test_fleet_billing as fleet
from test_users import client  # noqa: F401  (pytest fixture)


def test_delete_customer_created_by_mistake_keeps_vehicles(client):
    c, _, _ = client
    customer = c.post("/api/v1/customers", json={"first_name": "Mario", "last_name": "Errore"}).json()
    vehicle = c.post("/api/v1/vehicles", json={"license_plate": "AB123CD", "customer_id": customer["id"]}).json()
    created = c.post(f"/api/v1/customers/{customer['id']}/portal-accounts", json={"email": "mario@example.com", "full_name": "Mario"})
    assert created.status_code == 201, created.text

    deleted = c.delete(f"/api/v1/customers/{customer['id']}")
    assert deleted.status_code == 204, deleted.text
    assert c.get(f"/api/v1/customers/{customer['id']}").status_code == 404
    assert c.get("/api/v1/vehicles/by-plate/AB123CD").json()["customer_id"] is None
    assert c.delete(f"/api/v1/customers/{customer['id']}").status_code == 404

    # The portal login went with the customer, so the e-mail can be used again.
    other = c.post("/api/v1/customers", json={"first_name": "Mario", "last_name": "Giusto"}).json()
    again = c.post(f"/api/v1/customers/{other['id']}/portal-accounts", json={"email": "mario@example.com", "full_name": "Mario"})
    assert again.status_code == 201, again.text


def test_delete_customer_with_history_is_refused(client):
    c, _, _ = client
    customer, _, _, _ = fleet.create_fleet_case(c)
    refused = c.delete(f"/api/v1/customers/{customer['id']}")
    assert refused.status_code == 409
    assert "1 pratiche" in refused.json()["detail"] and "1 contratti" in refused.json()["detail"]
    assert c.get(f"/api/v1/customers/{customer['id']}").status_code == 200
