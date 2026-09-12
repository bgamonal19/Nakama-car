from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.db.deps import get_db
from app.models.garage import Customer, Vehicle
from app.schemas.garage import VehicleCreate, VehicleRead, VehicleUpdate
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
            or_(Vehicle.license_plate.icontains(q, autoescape=True), Vehicle.vin.icontains(q, autoescape=True), Vehicle.make.icontains(q, autoescape=True), Vehicle.model.icontains(q, autoescape=True)))
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
    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(vehicle, key, value)
    db.commit()
    db.refresh(vehicle)
    return vehicle
