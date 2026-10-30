"""Test copies of the app (Railway PR environments, local run on a Mac) with their own empty database.

A test copy must never touch the real database: before migrating, it checks that the database is either
empty or already marked as a test database, and refuses to start otherwise. A fresh test database gets
the demo workshop below so there is something to click on.
"""
import os

from sqlalchemy import Engine, inspect, select, text
from sqlalchemy.orm import Session

from app.core.config import get_settings

MARKER_TABLE = "nakama_test_database"
DEMO_EMAIL = "prova@example.com"
DEMO_PASSWORD = "ProvaNakama2026!"


class RealDatabaseError(RuntimeError):
    pass


def is_test_environment() -> bool:
    """APP_ENV=preview, or any Railway environment other than production (PR environments)."""
    if get_settings().app_env == "preview":
        return True
    railway_environment = os.environ.get("RAILWAY_ENVIRONMENT_NAME")
    return bool(railway_environment) and railway_environment != "production"


def claim_test_database(engine: Engine) -> None:
    """Mark an empty database as a test one; refuse a database that already holds real data."""
    tables = set(inspect(engine).get_table_names())
    if MARKER_TABLE in tables:
        return
    if tables:
        raise RealDatabaseError(
            "Test environment connected to a database that is not a test database "
            f"(tables found: {len(tables)}). Refusing to start: check DATABASE_URL."
        )
    with engine.begin() as connection:
        connection.execute(text(f"CREATE TABLE {MARKER_TABLE} (note VARCHAR(120))"))
        connection.execute(text(f"INSERT INTO {MARKER_TABLE} (note) VALUES ('test copy, safe to wipe')"))


def seed_demo_data(db: Session) -> bool:
    """Demo workshop with an admin and a few customers and vehicles. Does nothing once someone exists."""
    from app.api.v1.auth import create_workshop
    from app.models.garage import Customer, CustomerType, Vehicle
    from app.models.identity import User
    from app.schemas.auth import BootstrapRequest

    if db.scalar(select(User.id).limit(1)) is not None:
        return False
    tenant, _ = create_workshop(db, BootstrapRequest(
        admin_email=DEMO_EMAIL, admin_password=DEMO_PASSWORD, first_name="Prova", last_name="Nakama",
        company_name="NAKAMA CAR (PROVA)", accept_terms=True, accept_privacy=True,
    ))
    fleet = Customer(tenant_id=tenant.id, customer_type=CustomerType.COMPANY, company_name="Trasporti Prova Srl",
                     vat_number="01234567890", city="Milano", province="MI", email="flotta@example.com")
    private = Customer(tenant_id=tenant.id, customer_type=CustomerType.PRIVATE, first_name="Mario", last_name="Rossi",
                       city="Bergamo", province="BG", phone="+39 333 0000000")
    db.add_all([fleet, private])
    db.flush()
    db.add_all([
        Vehicle(tenant_id=tenant.id, customer_id=fleet.id, license_plate="GA123BC", make="Iveco", model="Daily",
                vehicle_category="VAN", fleet_number="12", year=2021),
        Vehicle(tenant_id=tenant.id, customer_id=fleet.id, license_plate="FT456DE", make="Scania", model="R450",
                vehicle_category="TRUCK", fleet_number="7", year=2019),
        Vehicle(tenant_id=tenant.id, customer_id=private.id, license_plate="EZ789FG", make="Fiat", model="Panda",
                vehicle_category="CAR", year=2018),
    ])
    db.commit()
    return True
