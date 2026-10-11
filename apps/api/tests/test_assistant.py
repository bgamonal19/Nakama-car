import test_fleet_billing as fleet
from test_users import client  # noqa: F401  (pytest fixture)


def assistant_key(c, name="MY SECRETARY"):
    created = c.post("/api/v1/integrations/api-keys", json={"name": name, "scopes": ["assistant:read"]})
    assert created.status_code == 201, created.text
    assert created.json()["scopes"] == "assistant:read"
    return created.json()["api_key"]


def test_assistant_reads_all_workshop_data(client):
    c, _, _ = client
    customer, contract, vehicle, case = fleet.create_fleet_case(c, plate="GP777AI")
    estimate = c.post("/api/v1/estimates", json={"repair_case_id": case["id"]}).json()
    assert c.post(f"/api/v1/estimates/{estimate['id']}/lines", json=fleet.mechanical_line()).status_code in (200, 201)
    c.post(f"/api/v1/cases/{case['id']}/damage-markers", json={"view": "side", "x": 0.4, "y": 0.5, "operation": "REPAIR", "area_label": "Lato sinistro", "sketch": [[[0.1, 0.1], [0.2, 0.2]]]})
    token = c.post(f"/api/v1/cases/{case['id']}/tracking-link").json()["public_token"]
    assert c.post(f"/api/v1/public/tracking/{token}/messages", json={"body": "Quando è pronto?", "author_name": "Univex"}).status_code in (200, 201)

    key = assistant_key(c)
    bot = c.__class__(c.app)
    headers = {"X-API-Key": key}

    # No key, a wrong key or a GPS key cannot read; the assistant key cannot send telemetry.
    assert bot.get("/api/v1/assistant/summary").status_code == 401
    assert bot.get("/api/v1/assistant/summary", headers={"X-API-Key": "nk_live_wrong"}).status_code == 401
    gps = c.post("/api/v1/integrations/api-keys", json={"name": "GPS"}).json()
    assert gps["scopes"] == "telemetry:write"
    assert bot.get("/api/v1/assistant/summary", headers={"X-API-Key": gps["api_key"]}).status_code == 401
    assert bot.post("/api/v1/telemetry", json={"events": [{"plate": "GP777AI", "odometer_km": 1}]}, headers=headers).status_code == 401
    assert c.post("/api/v1/integrations/api-keys", json={"name": "x", "scopes": ["admin"]}).status_code == 422

    info = bot.get("/api/v1/assistant", headers={"Authorization": f"Bearer {key}"})
    assert info.status_code == 200 and info.json()["read_only"] is True
    tools = bot.get("/api/v1/assistant/tools", headers=headers).json()["tools"]
    assert {tool["name"] for tool in tools} >= {"nakama_summary", "nakama_search", "nakama_get_case", "nakama_get_vehicle"}
    assert all(tool["input_schema"]["type"] == "object" and tool["http"]["method"] == "GET" for tool in tools)

    summary = bot.get("/api/v1/assistant/summary", headers=headers).json()
    assert summary["cases"]["open_total"] == 1
    assert summary["unread_customer_messages"] == 1
    assert summary["active_contracts"] == 1

    found = bot.get("/api/v1/assistant/search", params={"q": "gp 777"}, headers=headers).json()
    assert [item["license_plate"] for item in found["vehicles"]] == ["GP777AI"]
    assert bot.get("/api/v1/assistant/search", params={"q": "univex"}, headers=headers).json()["customers"][0]["id"] == customer["id"]

    cases = bot.get("/api/v1/assistant/cases", params={"open": "true"}, headers=headers).json()
    assert cases[0]["id"] == case["id"] and cases[0]["vehicle"]["license_plate"] == "GP777AI"
    detail = bot.get(f"/api/v1/assistant/cases/{case['id']}", headers=headers).json()
    assert detail["customer_notes"] == "Rumore freni"
    assert detail["damages"][0]["hand_drawn"] is True
    assert detail["estimates"][0]["lines"][0]["description"] == "Sostituzione pastiglie"
    assert detail["messages"][0]["body"] == "Quando è pronto?"
    assert detail["customer_tracking_link_active"] is True

    # Reading through the assistant does not mark customer messages as read.
    unread = bot.get("/api/v1/assistant/messages", params={"unread": "true"}, headers=headers).json()
    assert len(unread) == 1 and unread[0]["case"]["case_number"] == case["case_number"]
    assert len(c.get("/api/v1/messages/unread").json()) == 1

    full_customer = bot.get(f"/api/v1/assistant/customers/{customer['id']}", headers=headers).json()
    assert full_customer["vat_number"] == "IT01234567890" and full_customer["contracts"][0]["id"] == contract["id"]
    full_vehicle = bot.get(f"/api/v1/assistant/vehicles/{vehicle['id']}", headers=headers).json()
    assert full_vehicle["maintenance"]["state"] == "UNKNOWN" and full_vehicle["customer"]["id"] == customer["id"]
    assert bot.get("/api/v1/assistant/estimates", params={"status": "DRAFT"}, headers=headers).json()[0]["id"] == estimate["id"]
    assert bot.get(f"/api/v1/assistant/estimates/{estimate['id']}", headers=headers).json()["lines"]
    assert bot.get("/api/v1/assistant/invoices", headers=headers).status_code == 200
    assert bot.get("/api/v1/assistant/contracts", headers=headers).json()[0]["vehicles"] == 1
    staff = bot.get("/api/v1/assistant/staff", headers=headers).json()
    assert staff[0]["email"] == "admin@example.com" and "password_hash" not in staff[0]
    assert bot.get("/api/v1/assistant/vehicles", params={"maintenance": "DUE"}, headers=headers).json() == []
    assert bot.get("/api/v1/assistant/cases/00000000-0000-0000-0000-000000000000", headers=headers).status_code == 404

    # Revoked key stops working at once.
    key_id = next(item["id"] for item in c.get("/api/v1/integrations/api-keys").json() if item["name"] == "MY SECRETARY")
    c.delete(f"/api/v1/integrations/api-keys/{key_id}")
    assert bot.get("/api/v1/assistant/summary", headers=headers).status_code == 401
