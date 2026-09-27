from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.deps import get_db
from app.models.identity import TenantSettings
from app.schemas.settings import CompanySettings
from app.security.context import AuthContext, require_permission
from app.services.audit import record_audit

router = APIRouter(prefix="/settings/company", tags=["settings"])


@router.get("", response_model=CompanySettings)
def get_company_settings(
    db: Session = Depends(get_db),
    auth: AuthContext = Depends(require_permission("settings.manage")),
):
    settings = db.scalar(select(TenantSettings).where(TenantSettings.tenant_id == auth.tenant_id))
    return CompanySettings.model_validate(settings) if settings else CompanySettings()


@router.put("", response_model=CompanySettings)
def update_company_settings(
    payload: CompanySettings,
    db: Session = Depends(get_db),
    auth: AuthContext = Depends(require_permission("settings.manage")),
):
    settings = db.scalar(select(TenantSettings).where(TenantSettings.tenant_id == auth.tenant_id))
    old_value = None
    if settings is None:
        settings = TenantSettings(tenant_id=auth.tenant_id)
        db.add(settings)
    else:
        old_value = CompanySettings.model_validate(settings).model_dump(mode="json")
    data = payload.model_dump()
    data["country"] = data["country"].upper()
    for key, value in data.items():
        setattr(settings, key, value)
    db.flush()
    record_audit(
        db,
        tenant_id=auth.tenant_id,
        user_id=auth.user_id,
        entity_type="tenant_settings",
        entity_id=settings.id,
        action="created" if old_value is None else "updated",
        old_value=old_value,
        new_value=payload.model_dump(mode="json"),
    )
    db.commit()
    db.refresh(settings)
    return CompanySettings.model_validate(settings)
