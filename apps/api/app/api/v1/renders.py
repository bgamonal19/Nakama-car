from datetime import datetime, timezone
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.db.deps import get_db
from app.models.garage import RepairCase
from app.models.renders import DamageMarker, VehicleRender
from app.providers import carimage
from app.schemas.renders import DamageMarkerCreate, DamageMarkerRead, RenderAvailability
from app.security.context import AuthContext, require_permission
from app.services.audit import record_audit

router = APIRouter(tags=["renders"])


def renders_this_month(db: Session, tenant_id: UUID) -> int:
    start = datetime.now(timezone.utc).replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    return db.scalar(
        select(func.count(VehicleRender.id)).where(
            VehicleRender.tenant_id == tenant_id, VehicleRender.created_at >= start
        )
    ) or 0


@router.get("/renders/info", response_model=RenderAvailability)
def render_info(
    color: str | None = None,
    db: Session = Depends(get_db),
    auth: AuthContext = Depends(require_permission("vehicle.read")),
):
    return RenderAvailability(
        configured=carimage.get_render_provider() is not None,
        views=list(carimage.VIEWS),
        color=carimage.normalize_color(color),
        used_this_month=renders_this_month(db, auth.tenant_id),
        monthly_limit=get_settings().car_image_monthly_limit,
        webp=carimage.webp_supported(),
    )


@router.get("/renders/car")
def render_car(
    make: str = Query(min_length=1, max_length=120),
    model: str = Query(min_length=1, max_length=120),
    view: str = Query(pattern="^(front|front-3-4|side|rear-3-4|rear|rear-3-4-right|side-right|front-3-4-right|top)$"),
    year: int | None = Query(None, ge=1950, le=2100),
    color: str | None = None,
    db: Session = Depends(get_db),
    auth: AuthContext = Depends(require_permission("vehicle.read")),
):
    """Studio picture of the vehicle; each make/model/year/color/view is paid once."""
    return serve_render(db, auth.tenant_id, make=make, model=model, year=year, color=color, view=view)


VIEW_PATTERN = "^(front|front-3-4|side|rear-3-4|rear|rear-3-4-right|side-right|front-3-4-right|top)$"


def serve_render(db: Session, tenant_id: UUID, *, make: str, model: str, year: int | None, color: str | None, view: str) -> Response:
    """Studio picture from the tenant cache, bought once from the provider when missing."""
    provider = carimage.get_render_provider()
    if provider is None:
        raise HTTPException(status_code=503, detail="Vehicle renders not configured")
    paint = carimage.normalize_color(color)
    make_clean, model_clean = make.strip(), carimage.clean_model(model) or model.strip()
    key = "|".join([make_clean.lower(), model_clean.lower(), str(year or ""), paint, view])
    cached = db.scalar(select(VehicleRender).where(VehicleRender.tenant_id == tenant_id, VehicleRender.render_key == key))
    if cached is None:
        # Same model, colour and view already paid for another model year: reuse it.
        cached = db.scalar(
            select(VehicleRender)
            .where(
                VehicleRender.tenant_id == tenant_id,
                func.lower(VehicleRender.make) == make_clean.lower(),
                func.lower(VehicleRender.model) == model_clean.lower(),
                VehicleRender.color == paint,
                VehicleRender.view == view,
                VehicleRender.found.is_(True),
            )
            .order_by(VehicleRender.created_at.desc())
            .limit(1)
        )
    headers = {"Cache-Control": "private, max-age=86400"}
    if cached is not None:
        if not cached.found or not cached.content:
            raise HTTPException(status_code=404, detail="Vehicle not in render catalog")
        if not carimage.is_processed(cached.mime_type):
            # Renders stored before the WebP conversion are shrunk once, on first read.
            cached.content, cached.mime_type = carimage.to_webp(cached.content, cached.mime_type)
            db.commit()
        return Response(content=cached.content, media_type=(cached.mime_type or "image/webp").split(";")[0], headers=headers)
    if renders_this_month(db, tenant_id) >= get_settings().car_image_monthly_limit:
        raise HTTPException(status_code=429, detail="Monthly render limit reached")

    content, mime, found = None, None, True
    # Try the exact model and year, then without the year, then the base model name.
    attempts = [(name, when) for name in carimage.model_candidates(model_clean) for when in dict.fromkeys([year, None])]
    try:
        for index, (name, when) in enumerate(attempts):
            try:
                content, mime = provider.render(make=make_clean, model=name, year=when, color=paint, view=view)
                break
            except carimage.RenderNotFound:
                if index == len(attempts) - 1:
                    raise
    except carimage.RenderNotFound:
        found = False
    except carimage.RenderError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    if content is not None:
        content, mime = carimage.to_webp(content, mime)

    db.add(VehicleRender(
        tenant_id=tenant_id, render_key=key, make=make_clean, model=model_clean, year=year,
        color=paint, view=view, found=found, mime_type=mime, content=content,
    ))
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
    if not found:
        raise HTTPException(status_code=404, detail="Vehicle not in render catalog")
    return Response(content=content, media_type=(mime or "image/webp").split(";")[0], headers=headers)


def get_case(db: Session, tenant_id: UUID, repair_case_id: UUID) -> RepairCase:
    case = db.scalar(select(RepairCase).where(RepairCase.id == repair_case_id, RepairCase.tenant_id == tenant_id))
    if case is None:
        raise HTTPException(status_code=404, detail="Repair case not found")
    return case


@router.get("/cases/{repair_case_id}/damage-markers", response_model=list[DamageMarkerRead])
def list_markers(
    repair_case_id: UUID,
    db: Session = Depends(get_db),
    auth: AuthContext = Depends(require_permission("case.read")),
):
    get_case(db, auth.tenant_id, repair_case_id)
    return db.scalars(
        select(DamageMarker)
        .where(DamageMarker.tenant_id == auth.tenant_id, DamageMarker.repair_case_id == repair_case_id)
        .order_by(DamageMarker.created_at, DamageMarker.id)
    ).all()


@router.post("/cases/{repair_case_id}/damage-markers", response_model=DamageMarkerRead, status_code=status.HTTP_201_CREATED)
def create_marker(
    repair_case_id: UUID,
    payload: DamageMarkerCreate,
    db: Session = Depends(get_db),
    auth: AuthContext = Depends(require_permission("case.update")),
):
    get_case(db, auth.tenant_id, repair_case_id)
    marker = DamageMarker(tenant_id=auth.tenant_id, repair_case_id=repair_case_id, **payload.model_dump())
    db.add(marker)
    db.flush()
    record_audit(
        db, tenant_id=auth.tenant_id, user_id=auth.user_id, entity_type="damage_marker", entity_id=marker.id,
        action="created", new_value={"view": payload.view, "operation": payload.operation, "area": payload.area_label},
    )
    db.commit()
    db.refresh(marker)
    return marker


@router.delete("/cases/{repair_case_id}/damage-markers/{marker_id}", status_code=204)
def delete_marker(
    repair_case_id: UUID,
    marker_id: UUID,
    db: Session = Depends(get_db),
    auth: AuthContext = Depends(require_permission("case.update")),
):
    marker = db.scalar(select(DamageMarker).where(
        DamageMarker.id == marker_id, DamageMarker.repair_case_id == repair_case_id, DamageMarker.tenant_id == auth.tenant_id,
    ))
    if marker is None:
        raise HTTPException(status_code=404, detail="Damage marker not found")
    record_audit(
        db, tenant_id=auth.tenant_id, user_id=auth.user_id, entity_type="damage_marker", entity_id=marker.id,
        action="deleted", old_value={"view": marker.view, "operation": marker.operation, "area": marker.area_label},
    )
    from app.models.media import Media

    for media in db.scalars(select(Media).where(Media.damage_marker_id == marker.id, Media.tenant_id == auth.tenant_id)).all():
        media.damage_marker_id = None
    db.delete(marker)
    db.commit()
    return None
