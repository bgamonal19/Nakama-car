"""Customer fleet profile, vehicle profile and fleet import from Excel/CSV."""
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.deps import get_db
from app.models.garage import Customer, Vehicle
from app.security.context import AuthContext, require_permission
from app.services import fleet

router = APIRouter(tags=["fleet"])


def tenant_customer(db: Session, tenant_id: UUID, customer_id: UUID) -> Customer:
    customer = db.scalar(select(Customer).where(Customer.id == customer_id, Customer.tenant_id == tenant_id))
    if customer is None:
        raise HTTPException(status_code=404, detail="Customer not found")
    return customer


@router.get("/customers/{customer_id}/fleet")
def customer_fleet(customer_id: UUID, db: Session = Depends(get_db), auth: AuthContext = Depends(require_permission("vehicle.read"))):
    return fleet.fleet_profile(db, tenant_customer(db, auth.tenant_id, customer_id))


@router.get("/vehicles/{vehicle_id}/profile")
def vehicle_profile(vehicle_id: UUID, db: Session = Depends(get_db), auth: AuthContext = Depends(require_permission("vehicle.read"))):
    vehicle = db.scalar(select(Vehicle).where(Vehicle.id == vehicle_id, Vehicle.tenant_id == auth.tenant_id))
    if vehicle is None:
        raise HTTPException(status_code=404, detail="Vehicle not found")
    return fleet.vehicle_profile(db, vehicle)


@router.post("/customers/{customer_id}/fleet/import")
async def import_customer_fleet(
    customer_id: UUID,
    request: Request,
    filename: str = Query("", max_length=255),
    dry_run: bool = False,
    db: Session = Depends(get_db),
    auth: AuthContext = Depends(require_permission("vehicle.write")),
):
    """The raw file is the request body; with dry_run=true the result is only a preview."""
    customer = tenant_customer(db, auth.tenant_id, customer_id)
    content = await request.body()
    try:
        return fleet.import_fleet(db, customer, content, filename, dry_run)
    except fleet.ImportFileError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.get("/fleet-import/template")
def fleet_import_template(auth: AuthContext = Depends(require_permission("vehicle.read"))):
    return Response(
        content=fleet.template_workbook(),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": 'attachment; filename="modello-flotta.xlsx"'},
    )
