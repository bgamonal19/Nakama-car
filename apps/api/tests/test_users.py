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


def edit_payload(worker, **updates):
    return {"email": worker["email"], "first_name": worker["first_name"], "last_name": worker["last_name"], "role_code": worker["role_codes"][0], **updates}


def test_edit_worker_credentials_revokes_previous_session(client):
    c, engine, _ = client
    worker = c.post("/api/v1/users", json=payload()).json()
    old_token = c.post("/api/v1/auth/login", json={"email": worker["email"], "password": payload()["password"]}).json()["access_token"]
    response = c.patch(f'/api/v1/users/{worker["id"]}', json=edit_payload(worker, email="updated@example.com", first_name=" Nuovo ", password="NewPassword2026!"))
    assert response.status_code == 200
    assert response.json()["first_name"] == "Nuovo"
    assert "password_hash" not in response.json()
    assert c.get("/api/v1/cases", headers={"Authorization": "Bearer " + old_token}).status_code == 401
    assert c.post("/api/v1/auth/login", json={"email": worker["email"], "password": payload()["password"]}).status_code == 401
    assert c.post("/api/v1/auth/login", json={"email": "updated@example.com", "password": "NewPassword2026!"}).status_code == 200
    with Session(engine) as db:
        saved = db.scalar(select(User).where(User.email == "updated@example.com"))
        assert saved.auth_version == 1
        audit = db.scalar(select(AuditLog).where(AuditLog.entity_id == saved.id, AuditLog.action == "UPDATE"))
        assert set(audit.new_value["changed_fields"]) == {"email", "first_name", "password"}
        assert "NewPassword" not in str(audit.new_value)


def test_name_only_edit_preserves_password_and_session(client):
    c, engine, _ = client
    worker = c.post("/api/v1/users", json=payload()).json()
    login = c.post("/api/v1/auth/login", json={"email": worker["email"], "password": payload()["password"]}).json()
    assert c.patch(f'/api/v1/users/{worker["id"]}', json=edit_payload(worker, last_name="Bianchi")).status_code == 200
    assert c.post("/api/v1/auth/login", json={"email": worker["email"], "password": payload()["password"]}).status_code == 200
    # A valid mechanic session is forbidden, not expired, at the admin endpoint.
    assert c.get("/api/v1/users", headers={"Authorization": "Bearer " + login["access_token"]}).status_code == 403


def test_role_edit_revokes_old_permissions(client):
    c, _, _ = client
    worker = c.post("/api/v1/users", json=payload(role_code="ADMIN")).json()
    login_body = {"email": worker["email"], "password": payload()["password"]}
    old_token = c.post("/api/v1/auth/login", json=login_body).json()["access_token"]
    assert c.patch(f'/api/v1/users/{worker["id"]}', json=edit_payload(worker, role_code="MECHANIC")).status_code == 200
    assert c.get("/api/v1/users", headers={"Authorization": "Bearer " + old_token}).status_code == 401
    assert "users.manage" not in c.post("/api/v1/auth/login", json=login_body).json()["permissions"]


def test_last_admin_and_duplicate_email_protected(client):
    c, _, _ = client
    admin = c.get("/api/v1/users").json()[0]
    assert c.patch(f'/api/v1/users/{admin["id"]}', json=edit_payload(admin, role_code="MECHANIC")).status_code == 409
    worker = c.post("/api/v1/users", json=payload()).json()
    assert c.patch(f'/api/v1/users/{worker["id"]}', json=edit_payload(worker, email=admin["email"].upper())).status_code == 409
    assert c.patch(f'/api/v1/users/{worker["id"]}', json=edit_payload(worker, first_name="  ")).status_code == 422
    assert c.patch(f'/api/v1/users/{worker["id"]}', json=edit_payload(worker, password="short")).status_code == 422


def test_cross_tenant_user_edit_blocked(client):
    c, engine, _ = client
    with Session(engine) as db:
        tenant = Tenant(name="Other", slug="other-edit")
        user = User(email="other-edit@example.com", first_name="Other", last_name="User", password_hash="unused")
        db.add_all([tenant, user]); db.flush()
        uid = str(user.id)
        db.add(UserTenant(user_id=user.id, tenant_id=tenant.id, is_default=True)); db.commit()
    assert c.patch(f'/api/v1/users/{uid}', json={"email":"changed@example.com","first_name":"Other","last_name":"User","role_code":"ADMIN"}).status_code == 404


def test_worker_cannot_edit_any_account(client):
    c, _, _ = client
    worker = c.post("/api/v1/users", json=payload()).json()
    token = c.post("/api/v1/auth/login", json={"email":worker["email"],"password":payload()["password"]}).json()["access_token"]
    assert c.patch(f'/api/v1/users/{worker["id"]}', json=edit_payload(worker, role_code="ADMIN"), headers={"Authorization":"Bearer "+token}).status_code == 403
