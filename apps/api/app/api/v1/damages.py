from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.deps import get_db
from app.models.damage import Damage
from app.models.garage import RepairCase
from app.schemas.damage import DamageRead, DamageUpsert
from app.security.context import AuthContext, require_permission

router = APIRouter(prefix="/cases/{repair_case_id}/damages", tags=["damages"])


def get_case(db: Session, tenant_id: UUID, repair_case_id: UUID) -> RepairCase:
    case = db.scalar(
        select(RepairCase).where(
            RepairCase.id == repair_case_id,
            RepairCase.tenant_id == tenant_id,
        )
    )
    if case is None:
        raise HTTPException(status_code=404, detail="Repair case not found")
    return case


@router.get("", response_model=list[DamageRead])
def list_damages(
    repair_case_id: UUID,
    db: Session = Depends(get_db),
    auth: AuthContext = Depends(require_permission("case.read")),
):
    get_case(db, auth.tenant_id, repair_case_id)
    return db.scalars(
        select(Damage)
        .where(Damage.tenant_id == auth.tenant_id, Damage.repair_case_id == repair_case_id)
        .order_by(Damage.vehicle_area_code)
    ).all()


@router.put("/{vehicle_area_code}", response_model=DamageRead)
def upsert_damage(
    repair_case_id: UUID,
    vehicle_area_code: str,
    payload: DamageUpsert,
    db: Session = Depends(get_db),
    auth: AuthContext = Depends(require_permission("case.update")),
):
    get_case(db, auth.tenant_id, repair_case_id)
    damage = db.scalar(
        select(Damage).where(
            Damage.tenant_id == auth.tenant_id,
            Damage.repair_case_id == repair_case_id,
            Damage.vehicle_area_code == vehicle_area_code,
        )
    )
    data = payload.model_dump()
    data["vehicle_area_code"] = vehicle_area_code
    if damage is None:
        damage = Damage(tenant_id=auth.tenant_id, repair_case_id=repair_case_id, **data)
        db.add(damage)
    else:
        for key, value in data.items():
            setattr(damage, key, value)
    db.commit()
    db.refresh(damage)
    return damage
