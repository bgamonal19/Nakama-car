import test_fleet_billing as fleet
from test_users import client  # noqa: F401  (pytest fixture)


def test_api_keys_telemetry_and_external_credentials(client):
    c, _, _ = client
    customer, _, vehicle, _ = fleet.create_fleet_case(c, plate="GP123SS")

    created = c.post("/api/v1/integrations/api-keys", json={"name": "OneSystec GPS"})
    assert created.status_code == 201, created.text
    key = created.json()["api_key"]
    assert key.startswith("nk_live_")
    listed = c.get("/api/v1/integrations/api-keys").json()
    assert listed[0]["prefix"] == key[:14] and "api_key" not in listed[0]

    gps = c.__class__(c.app)
    batch = {"source": "OneSystec", "events": [
        {"plate": "gp 123 ss", "recorded_at": "2026-09-28T10:00:00Z", "odometer_km": 152300, "lat": 45.4, "lon": 9.28,
         "speed_kmh": 54, "warning_lights": ["ENGINE", "ABS"], "dtc_codes": ["P0301"], "driving": {"harsh_braking": 3, "score": 72}},
        {"plate": "ZZ000ZZ", "odometer_km": 10},
    ]}
    assert gps.post("/api/v1/telemetry", json=batch).status_code == 401
    assert gps.post("/api/v1/telemetry", json=batch, headers={"X-API-Key": "nk_live_wrong"}).status_code == 401
    sent = gps.post("/api/v1/telemetry", json=batch, headers={"X-API-Key": key})
    assert sent.status_code == 200, sent.text
    assert sent.json() == {"accepted": 1, "unknown_vehicles": ["ZZ000ZZ"]}
    assert gps.post("/api/v1/telemetry", json={"events": [{"plate": "GP123SS", "odometer_km": 152400}]}, headers={"Authorization": f"Bearer {key}"}).json()["accepted"] == 1

    readings = c.get(f"/api/v1/vehicles/{vehicle['id']}/telemetry").json()
    assert readings[-1]["warning_lights"] == ["ENGINE", "ABS"] and readings[-1]["dtc_codes"] == ["P0301"]
    fleet_vehicles = c.get(f"/api/v1/customers/{customer['id']}/fleet-vehicles").json()
    assert fleet_vehicles[0]["mileage"] == 152400  # odometer keeps the maintenance plan up to date
    assert fleet_vehicles[0]["telemetry"]["odometer_km"] is not None

    key_id = listed[0]["id"]
    assert c.delete(f"/api/v1/integrations/api-keys/{key_id}").json()["active"] is False
    assert gps.post("/api/v1/telemetry", json=batch, headers={"X-API-Key": key}).status_code == 401

    saved = c.post("/api/v1/integrations/credentials", json={"provider": "ONESYSTEC", "label": "OneSystec", "base_url": "https://api.onesystec.example", "secret": "sk-abcdef123456"})
    assert saved.status_code == 201, saved.text
    assert saved.json()["secret_hint"] == "••••3456" and "secret" not in saved.json()
    assert c.get("/api/v1/integrations/credentials").json()[0]["label"] == "OneSystec"
    assert c.post("/api/v1/integrations/credentials", json={"provider": "FOO", "label": "x", "secret": "12345"}).status_code == 422
    assert c.delete(f"/api/v1/integrations/credentials/{saved.json()['id']}").status_code == 204


def test_secrets_are_encrypted():
    from app.services import integrations

    token = integrations.encrypt_secret("sk-secret-value")
    assert "sk-secret" not in token
    assert integrations.decrypt_secret(token) == "sk-secret-value"
