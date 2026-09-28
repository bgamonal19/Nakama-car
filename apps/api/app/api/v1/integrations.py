"""Integrations: NAKAMA API keys for external systems, third-party keys, GPS telemetry intake."""
from datetime import datetime, timezone
from typing import Any
from uuid import UUID

from fastapi import APIRouter, Depends, Header, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.deps import get_db
from app.models.garage import Vehicle
from app.models.integrations import ApiKey, ExternalCredential, VehicleTelemetry
from app.security.context import AuthContext, require_permission
from app.services import integrations

router = APIRouter(tags=["integrations"])
MAX_EVENTS = 500
PROVIDERS = ("ONESYSTEC", "GPS", "OTHER")


class ApiKeyCreate(BaseModel):
    name: str = Field(min_length=2, max_length=120)


class CredentialCreate(BaseModel):
    provider: str = Field(pattern="^(ONESYSTEC|GPS|OTHER)$")
    label: str = Field(min_length=2, max_length=120)
    base_url: str | None = Field(default=None, max_length=255)
    secret: str = Field(min_length=4, max_length=2000)


class TelemetryBatch(BaseModel):
    source: str | None = Field(default=None, max_length=60)
    events: list[dict[str, Any]] = Field(min_length=1, max_length=MAX_EVENTS)


def key_dict(key: ApiKey) -> dict:
    return {
        "id": str(key.id), "name": key.name, "prefix": key.prefix, "scopes": key.scopes, "active": key.active,
        "last_used_at": key.last_used_at, "created_at": key.created_at,
    }


def credential_dict(item: ExternalCredential) -> dict:
    return {
        "id": str(item.id), "provider": item.provider, "label": item.label, "base_url": item.base_url,
        "secret_hint": f"••••{item.secret_last4}", "active": item.active, "created_at": item.created_at,
    }


# ---------- NAKAMA keys given to external systems ----------

@router.get("/integrations/api-keys")
def list_api_keys(db: Session = Depends(get_db), auth: AuthContext = Depends(require_permission("settings.manage"))):
    keys = db.scalars(select(ApiKey).where(ApiKey.tenant_id == auth.tenant_id).order_by(ApiKey.created_at.desc())).all()
    return [key_dict(key) for key in keys]


@router.post("/integrations/api-keys", status_code=status.HTTP_201_CREATED)
def create_api_key(payload: ApiKeyCreate, db: Session = Depends(get_db), auth: AuthContext = Depends(require_permission("settings.manage"))):
    full, prefix, digest = integrations.new_api_key()
    key = ApiKey(tenant_id=auth.tenant_id, name=payload.name.strip(), prefix=prefix, key_hash=digest, created_by=auth.user_id)
    db.add(key)
    db.commit()
    db.refresh(key)
    # The full key is returned only now: afterwards only its prefix is known.
    return {**key_dict(key), "api_key": full}


@router.delete("/integrations/api-keys/{key_id}")
def revoke_api_key(key_id: UUID, db: Session = Depends(get_db), auth: AuthContext = Depends(require_permission("settings.manage"))):
    key = db.scalar(select(ApiKey).where(ApiKey.id == key_id, ApiKey.tenant_id == auth.tenant_id))
    if key is None:
        raise HTTPException(status_code=404, detail="API key not found")
    key.active = False
    db.commit()
    return key_dict(key)


# ---------- keys of external services used by NAKAMA ----------

@router.get("/integrations/credentials")
def list_credentials(db: Session = Depends(get_db), auth: AuthContext = Depends(require_permission("settings.manage"))):
    items = db.scalars(select(ExternalCredential).where(ExternalCredential.tenant_id == auth.tenant_id, ExternalCredential.active.is_(True)).order_by(ExternalCredential.created_at.desc())).all()
    return [credential_dict(item) for item in items]


@router.post("/integrations/credentials", status_code=status.HTTP_201_CREATED)
def add_credential(payload: CredentialCreate, db: Session = Depends(get_db), auth: AuthContext = Depends(require_permission("settings.manage"))):
    secret = payload.secret.strip()
    item = ExternalCredential(
        tenant_id=auth.tenant_id, provider=payload.provider, label=payload.label.strip(),
        base_url=(payload.base_url or "").strip() or None,
        secret_encrypted=integrations.encrypt_secret(secret), secret_last4=secret[-4:],
    )
    db.add(item)
    db.commit()
    db.refresh(item)
    return credential_dict(item)


@router.delete("/integrations/credentials/{credential_id}", status_code=204)
def remove_credential(credential_id: UUID, db: Session = Depends(get_db), auth: AuthContext = Depends(require_permission("settings.manage"))):
    item = db.scalar(select(ExternalCredential).where(ExternalCredential.id == credential_id, ExternalCredential.tenant_id == auth.tenant_id))
    if item is None:
        raise HTTPException(status_code=404, detail="Credential not found")
    db.delete(item)
    db.commit()
    return None


# ---------- telemetry intake (external GPS systems, with a NAKAMA API key) ----------

def api_key_tenant(db: Session, x_api_key: str | None, authorization: str | None) -> ApiKey:
    raw = x_api_key or ""
    if not raw and authorization and authorization.lower().startswith("bearer "):
        raw = authorization[7:]
    raw = raw.strip()
    if not raw.startswith(integrations.KEY_PREFIX):
        raise HTTPException(status_code=401, detail="API key required")
    key = db.scalar(select(ApiKey).where(ApiKey.key_hash == integrations.hash_key(raw), ApiKey.active.is_(True)))
    if key is None or "telemetry:write" not in key.scopes.split():
        raise HTTPException(status_code=401, detail="Invalid API key")
    return key


@router.post("/telemetry")
def receive_telemetry(
    payload: TelemetryBatch,
    db: Session = Depends(get_db),
    x_api_key: str | None = Header(default=None),
    authorization: str | None = Header(default=None),
):
    """GPS / telematics readings: plate or VIN, odometer, position, warning lights, fault codes, driving style."""
    key = api_key_tenant(db, x_api_key, authorization)
    accepted, unknown = 0, []
    source = payload.source or key.name
    for event in payload.events:
        vehicle = integrations.find_vehicle(db, key.tenant_id, event)
        if vehicle is None:
            unknown.append(event.get("plate") or event.get("license_plate") or event.get("vin") or "?")
            continue
        integrations.store_reading(db, key.tenant_id, vehicle, event, source)
        accepted += 1
    key.last_used_at = datetime.now(timezone.utc)
    db.commit()
    return {"accepted": accepted, "unknown_vehicles": sorted(set(map(str, unknown)))[:50]}


@router.get("/vehicles/{vehicle_id}/telemetry")
def vehicle_telemetry(
    vehicle_id: UUID,
    limit: int = Query(50, ge=1, le=500),
    db: Session = Depends(get_db),
    auth: AuthContext = Depends(require_permission("vehicle.read")),
):
    vehicle = db.scalar(select(Vehicle).where(Vehicle.id == vehicle_id, Vehicle.tenant_id == auth.tenant_id))
    if vehicle is None:
        raise HTTPException(status_code=404, detail="Vehicle not found")
    readings = db.scalars(
        select(VehicleTelemetry)
        .where(VehicleTelemetry.vehicle_id == vehicle.id, VehicleTelemetry.tenant_id == auth.tenant_id)
        .order_by(VehicleTelemetry.recorded_at.desc())
        .limit(limit)
    ).all()
    return [integrations.reading_dict(reading) for reading in readings]
