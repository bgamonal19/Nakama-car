"""Every kind of account must keep logging in: admin and mechanic on the workshop login, customers on the portal."""
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from app.api.v1.auth import settings
from app.cli import list_staff, reset_password
from app.db.base import Base
from app.db.deps import get_db
from app.main import app
from app.models.identity import User, UserStatus

ADMIN = ("admin@example.com", "TestPassword2026!")
MECHANIC = ("Mechanic@Example.com", "MechanicPassword2026!")


@pytest.fixture
def setup(monkeypatch):
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(engine)

    def database():
        with Session(engine) as session:
            yield session

    app.dependency_overrides[get_db] = database
    monkeypatch.setattr(settings, "bootstrap_token", "test-bootstrap-only")
    c = TestClient(app)
    boot = c.post("/api/v1/setup/bootstrap", headers={"X-Bootstrap-Token": "test-bootstrap-only"}, json={
        "admin_email": ADMIN[0], "admin_password": ADMIN[1], "first_name": "Test", "last_name": "Admin", "company_name": "Test Garage",
    })
    assert boot.status_code == 200
    admin = {"Authorization": "Bearer " + boot.json()["access_token"]}
    assert c.post("/api/v1/users", headers=admin, json={
        "email": MECHANIC[0], "password": MECHANIC[1], "first_name": "Luca", "last_name": "Meccanico", "role_code": "MECHANIC",
    }).status_code == 201
    customer = c.post("/api/v1/customers", headers=admin, json={"customer_type": "COMPANY", "company_name": "Univex", "email": "flotta@univex.example.com"}).json()
    access = c.post(f"/api/v1/customers/{customer['id']}/portal-accounts", headers=admin, json={"email": "flotta@univex.example.com", "full_name": "Univex"})
    assert access.status_code == 201
    yield c, engine, admin, access.json()["temporary_password"]
    app.dependency_overrides.pop(get_db, None)
    engine.dispose()


def login(c, email, password):
    return c.post("/api/v1/auth/login", json={"email": email, "password": password})


def test_admin_mechanic_and_customer_can_all_log_in(setup):
    c, _, _, customer_password = setup
    admin = login(c, *ADMIN)
    assert admin.status_code == 200, admin.text
    assert "ADMIN" in admin.json()["roles"] and "users.manage" in admin.json()["permissions"]

    mechanic = login(c, MECHANIC[0].lower(), MECHANIC[1])
    assert mechanic.status_code == 200, mechanic.text
    assert mechanic.json()["roles"] == ["MECHANIC"] and mechanic.json()["work_area"] == "MECHANICAL"

    portal = c.post("/api/v1/portal/auth/login", json={"email": "flotta@univex.example.com", "password": customer_password})
    assert portal.status_code == 200, portal.text


def test_each_login_rejects_the_other_kind_with_401(setup):
    """The web login pages fall back to the other login only on 401, so both must answer 401 (not 403/422/500)."""
    c, _, _, customer_password = setup
    assert login(c, "flotta@univex.example.com", customer_password).status_code == 401
    assert c.post("/api/v1/portal/auth/login", json={"email": ADMIN[0], "password": ADMIN[1]}).status_code == 401


def test_portal_access_with_a_staff_email_does_not_lock_the_staff_out(setup):
    c, _, admin, _ = setup
    customer = c.post("/api/v1/customers", headers=admin, json={"customer_type": "COMPANY", "company_name": "Prova", "email": "prova@example.com"}).json()
    c.post(f"/api/v1/customers/{customer['id']}/portal-accounts", headers=admin, json={"email": MECHANIC[0].lower(), "full_name": "Prova"})
    assert login(c, MECHANIC[0], MECHANIC[1]).status_code == 200
    assert login(c, *ADMIN).status_code == 200


def test_reset_password_recovers_a_locked_out_account(setup):
    c, engine, _, _ = setup
    with Session(engine) as db:
        user = db.scalar(select(User).where(User.email == MECHANIC[0].lower()))
        user.status = UserStatus.DISABLED
        db.commit()
    assert login(c, *MECHANIC).status_code == 401

    with Session(engine) as db:
        reset_password(db, " MECHANIC@example.com ", "BrandNewPassword2026!")
        assert any(line.startswith("mechanic@example.com  ACTIVE  MECHANIC") for line in list_staff(db))
    assert login(c, MECHANIC[0], "BrandNewPassword2026!").status_code == 200
    with Session(engine) as db, pytest.raises(LookupError):
        reset_password(db, "nobody@example.com", "BrandNewPassword2026!")
