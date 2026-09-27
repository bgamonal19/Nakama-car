import re
from datetime import datetime, timedelta, timezone
from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.db.deps import get_db
from app.models.garage import Customer, Vehicle
from app.models.lookup import VehicleLookup
from app.providers import targa
from app.schemas.garage import PlateLookupResult, VehicleCreate, VehicleRead, VehicleUpdate
from app.security.context import AuthContext, require_permission

router = APIRouter(prefix="/vehicles", tags=["vehicles"])


@router.post("", response_model=VehicleRead, status_code=status.HTTP_201_CREATED)
def create_vehicle(
    payload: VehicleCreate,
    db: Session = Depends(get_db),
    auth: AuthContext = Depends(require_permission("vehicle.write")),
):
    plate = payload.license_plate.strip().upper()

    existing = db.scalar(
        select(Vehicle).where(
            Vehicle.tenant_id == auth.tenant_id,
            func.upper(Vehicle.license_plate) == plate,
        )
    )
    if existing:
        raise HTTPException(status_code=409, detail="Vehicle plate already exists")

    if payload.customer_id:
        owner = db.scalar(
            select(Customer).where(
                Customer.id == payload.customer_id,
                Customer.tenant_id == auth.tenant_id,
            )
        )
        if owner is None:
            raise HTTPException(status_code=404, detail="Customer not found")

    data = payload.model_dump()
    data["license_plate"] = plate
    vehicle = Vehicle(tenant_id=auth.tenant_id, **data)
    db.add(vehicle)
    db.commit()
    db.refresh(vehicle)
    return vehicle


@router.get("/by-plate/{license_plate}", response_model=VehicleRead)
def get_vehicle_by_plate(
    license_plate: str,
    db: Session = Depends(get_db),
    auth: AuthContext = Depends(require_permission("vehicle.read")),
):
    plate = license_plate.strip().upper()
    vehicle = db.scalar(
        select(Vehicle).where(
            Vehicle.tenant_id == auth.tenant_id,
            func.upper(Vehicle.license_plate) == plate,
        )
    )
    if vehicle is None:
        raise HTTPException(status_code=404, detail="Vehicle not found")
    return vehicle


NEGATIVE_CACHE_DAYS = 7


def month_start() -> datetime:
    now = datetime.now(timezone.utc)
    return now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)


def monthly_lookups(db: Session, tenant_id: UUID) -> int:
    return db.scalar(
        select(func.count(VehicleLookup.id)).where(
            VehicleLookup.tenant_id == tenant_id,
            VehicleLookup.created_at >= month_start(),
        )
    ) or 0


def lookup_result(plate: str, payload: dict, source: str, cached: bool) -> PlateLookupResult:
    return PlateLookupResult(license_plate=plate, source=source, cached=cached, **{
        key: payload.get(key) for key in (
            "make", "model", "version", "year", "vin", "fuel_type", "engine_size", "power_kw", "doors",
        )
    })


@router.get("/plate-data/{license_plate}", response_model=PlateLookupResult)
def lookup_plate_data(
    license_plate: str,
    db: Session = Depends(get_db),
    auth: AuthContext = Depends(require_permission("vehicle.write")),
):
    """Make/model/version for an Italian plate from the external provider.

    Each real lookup costs one credit, so results are cached per plate and the
    monthly number of lookups is capped by PLATE_LOOKUP_MONTHLY_LIMIT.
    """
    plate = re.sub(r"[^A-Z0-9]", "", license_plate.upper())
    if not 5 <= len(plate) <= 8:
        raise HTTPException(status_code=422, detail="Invalid plate")
    settings = get_settings()
    provider = targa.get_vehicle_data_provider()
    if provider is None:
        raise HTTPException(status_code=503, detail="Plate lookup not configured")

    previous = db.scalar(
        select(VehicleLookup)
        .where(VehicleLookup.tenant_id == auth.tenant_id, VehicleLookup.license_plate == plate)
        .order_by(VehicleLookup.created_at.desc())
        .limit(1)
    )
    if previous is not None:
        created = previous.created_at if previous.created_at.tzinfo else previous.created_at.replace(tzinfo=timezone.utc)
        age = datetime.now(timezone.utc) - created
        if previous.found and age < timedelta(days=settings.plate_lookup_cache_days):
            return lookup_result(plate, previous.payload or {}, previous.provider, cached=True)
        if not previous.found and age < timedelta(days=NEGATIVE_CACHE_DAYS):
            raise HTTPException(status_code=404, detail="Plate not found")

    if monthly_lookups(db, auth.tenant_id) >= settings.plate_lookup_monthly_limit:
        raise HTTPException(status_code=429, detail="Monthly plate lookup limit reached")

    try:
        vehicle = provider.find_by_plate(plate, "IT")
    except targa.PlateLookupError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc

    payload = None
    if vehicle is not None:
        payload = {
            "make": vehicle.make, "model": vehicle.model, "version": vehicle.version, "year": vehicle.year,
            "vin": vehicle.vin, "fuel_type": vehicle.fuel_type, "engine_size": vehicle.engine_size,
            "power_kw": vehicle.power_kw, "doors": vehicle.doors, "external_id": vehicle.external_id,
        }
    db.add(VehicleLookup(
        tenant_id=auth.tenant_id,
        license_plate=plate,
        provider=getattr(provider, "name", "provider"),
        found=vehicle is not None,
        payload=payload,
    ))
    db.commit()
    if payload is None:
        raise HTTPException(status_code=404, detail="Plate not found")
    return lookup_result(plate, payload, getattr(provider, "name", "provider"), cached=False)


@router.get("", response_model=list[VehicleRead])
def list_vehicles(
    q: str = "",
    offset: int = Query(0, ge=0),
    limit: int = Query(200, ge=1, le=200),
    db: Session = Depends(get_db),
    auth: AuthContext = Depends(require_permission("vehicle.read")),
):
    return db.scalars(
        select(Vehicle)
        .where(Vehicle.tenant_id == auth.tenant_id,
            or_(Vehicle.license_plate.icontains(q, autoescape=True), Vehicle.vin.icontains(q, autoescape=True), Vehicle.make.icontains(q, autoescape=True), Vehicle.model.icontains(q, autoescape=True), Vehicle.fleet_number.icontains(q, autoescape=True)))
        .order_by(Vehicle.created_at.desc(), Vehicle.id.desc())
        .offset(offset).limit(limit)
    ).all()


@router.patch("/{vehicle_id}", response_model=VehicleRead)
def update_vehicle(
    vehicle_id: UUID,
    payload: VehicleUpdate,
    db: Session = Depends(get_db),
    auth: AuthContext = Depends(require_permission("vehicle.write")),
):
    vehicle = db.scalar(
        select(Vehicle).where(
            Vehicle.id == vehicle_id,
            Vehicle.tenant_id == auth.tenant_id,
        )
    )
    if vehicle is None:
        raise HTTPException(status_code=404, detail="Vehicle not found")
    if payload.customer_id:
        owner = db.scalar(
            select(Customer).where(
                Customer.id == payload.customer_id,
                Customer.tenant_id == auth.tenant_id,
            )
        )
        if owner is None:
            raise HTTPException(status_code=404, detail="Customer not found")
    changes = payload.model_dump(exclude_unset=True)
    if changes.get("vehicle_category", "") is None:
        # The category is mandatory; an empty value keeps the current one.
        changes.pop("vehicle_category")
    for key, value in changes.items():
        setattr(vehicle, key, value)
    db.commit()
    db.refresh(vehicle)
    return vehicle
