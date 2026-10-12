"""API keys for external systems, encrypted third-party credentials and GPS telemetry."""
import base64
import hashlib
import secrets
from datetime import datetime, timezone

from cryptography.fernet import Fernet, InvalidToken
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.models.garage import Vehicle
from app.models.integrations import VehicleTelemetry

KEY_PREFIX = "nk_live_"


def new_api_key() -> tuple[str, str, str]:
    """(full key shown once, visible prefix, sha256 hash stored)."""
    key = KEY_PREFIX + secrets.token_urlsafe(32)
    return key, key[: len(KEY_PREFIX) + 6], hash_key(key)


def hash_key(key: str) -> str:
    return hashlib.sha256(key.encode()).hexdigest()


def _fernet() -> Fernet:
    digest = hashlib.sha256((get_settings().jwt_secret + "|integrations").encode()).digest()
    return Fernet(base64.urlsafe_b64encode(digest))


def encrypt_secret(value: str) -> str:
    return _fernet().encrypt(value.encode()).decode()


def decrypt_secret(token: str) -> str | None:
    try:
        return _fernet().decrypt(token.encode()).decode()
    except InvalidToken:
        return None


def normalize_plate(value: str | None) -> str:
    return "".join(ch for ch in (value or "").upper() if ch.isalnum())


def find_vehicle(db: Session, tenant_id, event: dict) -> Vehicle | None:
    plate = normalize_plate(event.get("plate") or event.get("license_plate"))
    vin = (event.get("vin") or "").strip().upper()
    if plate:
        for vehicle in db.scalars(select(Vehicle).where(Vehicle.tenant_id == tenant_id)).all():
            if normalize_plate(vehicle.license_plate) == plate:
                return vehicle
    if vin:
        return db.scalar(select(Vehicle).where(Vehicle.tenant_id == tenant_id, Vehicle.vin == vin))
    return None


def _number(value):
    try:
        return float(value) if value is not None and value != "" else None
    except (TypeError, ValueError):
        return None


def _when(value) -> datetime:
    if isinstance(value, str) and value:
        try:
            parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
            return parsed if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)
        except ValueError:
            pass
    return datetime.now(timezone.utc)


def _names(value) -> list[str] | None:
    if value is None:
        return None
    items = value if isinstance(value, list) else [value]
    return [str(item).strip()[:60] for item in items if str(item).strip()][:40]


def store_reading(db: Session, tenant_id, vehicle: Vehicle, event: dict, source: str) -> VehicleTelemetry:
    odometer = _number(event.get("odometer_km"))
    reading = VehicleTelemetry(
        tenant_id=tenant_id, vehicle_id=vehicle.id, recorded_at=_when(event.get("recorded_at") or event.get("timestamp")),
        source=source[:60], odometer_km=int(odometer) if odometer is not None else None,
        latitude=_number(event.get("latitude") or event.get("lat")), longitude=_number(event.get("longitude") or event.get("lon")),
        speed_kmh=_number(event.get("speed_kmh")), fuel_level_percent=_number(event.get("fuel_level_percent")),
        battery_voltage=_number(event.get("battery_voltage")),
        engine_on=event.get("engine_on") if isinstance(event.get("engine_on"), bool) else None,
        warning_lights=_names(event.get("warning_lights")), dtc_codes=_names(event.get("dtc_codes")),
        driving=event.get("driving") if isinstance(event.get("driving"), dict) else None,
        raw=event,
    )
    db.add(reading)
    # The odometer keeps the maintenance plan (km to next service) up to date.
    if reading.odometer_km is not None and (vehicle.mileage is None or reading.odometer_km > vehicle.mileage):
        vehicle.mileage = reading.odometer_km
    return reading


def reading_dict(reading: VehicleTelemetry | None) -> dict | None:
    if reading is None:
        return None
    return {
        "recorded_at": reading.recorded_at,
        "source": reading.source,
        "odometer_km": reading.odometer_km,
        "latitude": reading.latitude,
        "longitude": reading.longitude,
        "speed_kmh": reading.speed_kmh,
        "fuel_level_percent": reading.fuel_level_percent,
        "battery_voltage": reading.battery_voltage,
        "engine_on": reading.engine_on,
        "warning_lights": reading.warning_lights or [],
        "dtc_codes": reading.dtc_codes or [],
        "driving": reading.driving or {},
    }


def latest_reading(db: Session, vehicle: Vehicle) -> dict | None:
    reading = db.scalar(
        select(VehicleTelemetry)
        .where(VehicleTelemetry.vehicle_id == vehicle.id, VehicleTelemetry.tenant_id == vehicle.tenant_id)
        .order_by(VehicleTelemetry.recorded_at.desc(), VehicleTelemetry.created_at.desc())
        .limit(1)
    )
    return reading_dict(reading)
