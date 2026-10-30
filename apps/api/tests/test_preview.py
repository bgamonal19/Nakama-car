"""Test copies (Railway PR environments, local run) use only an empty or test database, with demo data."""
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, func, select, text
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from app.api.v1.auth import settings
from app.db.base import Base
from app.db.deps import get_db
from app.main import app
from app.models.garage import Customer, Vehicle
from app.services import preview


@pytest.fixture
def engine():
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    yield engine
    engine.dispose()


def test_empty_database_is_claimed_once_and_then_accepted(engine):
    preview.claim_test_database(engine)
    Base.metadata.create_all(engine)
    preview.claim_test_database(engine)
    with engine.connect() as connection:
        assert connection.execute(text(f"SELECT count(*) FROM {preview.MARKER_TABLE}")).scalar() == 1


def test_real_database_is_refused(engine):
    Base.metadata.create_all(engine)
    with pytest.raises(preview.RealDatabaseError):
        preview.claim_test_database(engine)


@pytest.mark.parametrize("app_env,railway,expected", [
    ("local", None, False),
    ("local", "production", False),
    ("local", "extraordinary-adaptation-pr-106", True),
    ("preview", None, True),
])
def test_test_environment_detection(monkeypatch, app_env, railway, expected):
    monkeypatch.setattr(preview.get_settings(), "app_env", app_env)
    if railway:
        monkeypatch.setenv("RAILWAY_ENVIRONMENT_NAME", railway)
    else:
        monkeypatch.delenv("RAILWAY_ENVIRONMENT_NAME", raising=False)
    assert preview.is_test_environment() is expected


def test_demo_data_lets_the_tester_log_in(engine):
    Base.metadata.create_all(engine)
    with Session(engine) as db:
        assert preview.seed_demo_data(db) is True
        assert preview.seed_demo_data(db) is False
        assert db.scalar(select(func.count(Customer.id))) == 2
        assert db.scalar(select(func.count(Vehicle.id))) == 3

    def database():
        with Session(engine) as session:
            yield session

    app.dependency_overrides[get_db] = database
    try:
        c = TestClient(app)
        login = c.post("/api/v1/auth/login", json={"email": preview.DEMO_EMAIL, "password": preview.DEMO_PASSWORD})
        assert login.status_code == 200, login.text
        assert "ADMIN" in login.json()["roles"]
        assert login.json()["legal_required"] is False
    finally:
        app.dependency_overrides.pop(get_db, None)


def test_bootstrap_still_refuses_a_second_initialization(engine, monkeypatch):
    Base.metadata.create_all(engine)
    with Session(engine) as db:
        preview.seed_demo_data(db)

    def database():
        with Session(engine) as session:
            yield session

    app.dependency_overrides[get_db] = database
    monkeypatch.setattr(settings, "bootstrap_token", "t")
    try:
        response = TestClient(app).post("/api/v1/setup/bootstrap", headers={"X-Bootstrap-Token": "t"}, json={
            "admin_email": "other@example.com", "admin_password": "OtherPassword2026!", "first_name": "A", "last_name": "B",
        })
        assert response.status_code == 409
    finally:
        app.dependency_overrides.pop(get_db, None)
