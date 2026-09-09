import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool
from jose import jwt

from app.main import app
from app.db.base import Base
from app.db.deps import get_db
from app.core.config import get_settings
from app.models.identity import User, UserTenant, UserRole, AuditLog, Tenant, Role
from app.security.passwords import verify_password
from app.api.v1.auth import settings


@pytest.fixture
def client(monkeypatch):
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(engine)
    def database():
        with Session(engine) as session:
            yield session
    app.dependency_overrides[get_db] = database
    monkeypatch.setattr(settings, "bootstrap_token", "test-bootstrap-only")
    c = TestClient(app)
    response = c.post("/api/v1/setup/bootstrap", headers={"X-Bootstrap-Token": "test-bootstrap-only"}, json={
        "admin_email": "admin@example.com", "admin_password": "TestPassword2026!",
        "first_name": "Test", "last_name": "Admin", "company_name": "Test Garage"
    })
    assert response.status_code == 200
    c.headers["Authorization"] = "Bearer " + response.json()["access_token"]
    yield c, engine, response.json()["tenant_id"]
    app.dependency_overrides.pop(get_db, None)
    engine.dispose()


def payload(**updates):
    return {"email": "worker@example.com", "password": "WorkerPassword2026!", "first_name": " Mario ", "last_name": " Rossi ", "role_code": "MECHANIC", **updates}


def test_create_worker_login_and_permissions(client):
    c, engine, tenant = client
    response = c.post("/api/v1/users", json=payload())
    assert response.status_code == 201
    worker = response.json()
    assert worker["first_name"] == "Mario"
    assert worker["role_codes"] == ["MECHANIC"]
    assert "password" not in worker and "password_hash" not in worker
    with Session(engine) as db:
        saved = db.scalar(select(User).where(User.email == "worker@example.com"))
        assert saved.password_hash != payload()["password"]
        assert verify_password(saved.password_hash, payload()["password"])
        member = db.scalar(select(UserTenant).where(UserTenant.user_id == saved.id))
        assert str(member.tenant_id) == tenant
        audit = db.scalar(select(AuditLog).where(AuditLog.entity_id == saved.id))
        assert audit.new_value == {"role_code": "MECHANIC"}
    login = c.post("/api/v1/auth/login", json={"email": "worker@example.com", "password": payload()["password"]})
    assert login.status_code == 200
    permissions = login.json()["permissions"]
    assert "work_order.update_status" in permissions
    assert "users.manage" not in permissions
    c.headers["Authorization"] = "Bearer " + login.json()["access_token"]
    assert c.get("/api/v1/users").status_code == 403
    assert c.post("/api/v1/users", json=payload(email="other@example.com")).status_code == 403


def test_duplicate_email_and_invalid_profile(client):
    c, _, _ = client
    assert c.post("/api/v1/users", json=payload()).status_code == 201
    assert c.post("/api/v1/users", json=payload(email="WORKER@example.com")).status_code == 409
    assert c.post("/api/v1/users", json=payload(email="new@example.com", role_code="UNKNOWN")).status_code == 404
    assert len(c.get("/api/v1/users").json()) == 2


@pytest.mark.parametrize("updates", [{"first_name": "  "}, {"last_name": ""}, {"password": "short"}, {"email": "invalid"}])
def test_invalid_worker_profile(client, updates):
    c, _, _ = client
    assert c.post("/api/v1/users", json=payload(**updates)).status_code == 422


def test_worker_directory_is_tenant_scoped(client):
    c, engine, _ = client
    with Session(engine) as db:
        tenant = Tenant(name="Other", slug="other")
        user = User(email="private@example.com", first_name="Other", last_name="Worker", password_hash="unused")
        db.add_all([tenant, user]); db.flush()
        db.add(UserTenant(user_id=user.id, tenant_id=tenant.id, is_default=True))
        db.add(Role(tenant_id=tenant.id, code="FOREIGN_ROLE", name="Other role"))
        db.commit()
    assert all(u["email"] != "private@example.com" for u in c.get("/api/v1/users").json())
    assert c.post("/api/v1/users", json=payload(role_code="FOREIGN_ROLE")).status_code == 404
