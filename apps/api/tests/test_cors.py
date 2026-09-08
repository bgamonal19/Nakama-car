import pytest
from fastapi.testclient import TestClient

from app.main import app


# No lifespan context: these requests must not require database migrations.
client = TestClient(app)
WEB_ORIGIN = "https://nakama-car-web-production.up.railway.app"


def test_railway_web_can_read_health():
    response = client.get("/api/v1/health", headers={"Origin": WEB_ORIGIN})
    assert response.status_code == 200
    assert response.json()["status"] == "ok"
    assert response.headers["access-control-allow-origin"] == WEB_ORIGIN


@pytest.mark.parametrize("path,headers", [
    ("/auth/login", "content-type"),
    ("/setup/bootstrap", "content-type,x-bootstrap-token"),
    ("/cases", "content-type,authorization"),
])
def test_railway_web_can_preflight_operational_requests(path, headers):
    response = client.options(f"/api/v1{path}", headers={
        "Origin": WEB_ORIGIN,
        "Access-Control-Request-Method": "POST",
        "Access-Control-Request-Headers": headers,
    })
    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == WEB_ORIGIN
    assert response.headers["access-control-allow-credentials"] == "true"


@pytest.mark.parametrize("origin", [
    "https://unrelated-production.up.railway.app",
    WEB_ORIGIN + ".example.com",
])
def test_other_railway_sites_are_not_allowed(origin):
    response = client.options("/api/v1/cases", headers={
        "Origin": origin,
        "Access-Control-Request-Method": "POST",
        "Access-Control-Request-Headers": "authorization,content-type",
    })
    assert response.status_code == 400
    assert "access-control-allow-origin" not in response.headers


def test_cors_does_not_bypass_case_authentication():
    response = client.get("/api/v1/cases", headers={"Origin": WEB_ORIGIN})
    assert response.status_code in (401, 403)
    assert response.headers["access-control-allow-origin"] == WEB_ORIGIN
