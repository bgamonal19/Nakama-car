import uuid as uuid_module
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.db.deps import get_db
from app.models.garage import RepairCase
from app.models.media import DB_STORAGE_PREFIX, Media, MediaCategory, MediaType
from app.models.estimating import Estimate, EstimateLine
from app.models.renders import DamageMarker
from app.schemas.media import (
    MediaAccessUrl,
    MediaCreate,
    MediaLink,
    MediaRead,
    MediaUploadRequest,
    MediaUploadTarget,
)
from app.security.context import AuthContext, require_permission
from app.services.photos import MAX_UPLOAD_BYTES, PhotoError, prepare_photo
from app.services.storage import S3StorageService, StorageNotConfiguredError

router = APIRouter(prefix="/cases/{repair_case_id}/media", tags=["media"])
settings = get_settings()


def get_case_or_404(db: Session, tenant_id: UUID, repair_case_id: UUID) -> RepairCase:
    repair_case = db.scalar(
        select(RepairCase).where(
            RepairCase.id == repair_case_id,
            RepairCase.tenant_id == tenant_id,
        )
    )
    if repair_case is None:
        raise HTTPException(status_code=404, detail="Repair case not found")
    return repair_case


@router.post("/upload-target", response_model=MediaUploadTarget)
def create_upload_target(
    repair_case_id: UUID,
    payload: MediaUploadRequest,
    db: Session = Depends(get_db),
    auth: AuthContext = Depends(require_permission("case.update")),
):
    get_case_or_404(db, auth.tenant_id, repair_case_id)

    try:
        storage = S3StorageService()
    except StorageNotConfiguredError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc

    storage_key = storage.build_case_key(
        tenant_id=auth.tenant_id,
        repair_case_id=repair_case_id,
        filename=payload.filename,
    )
    upload_url = storage.create_upload_url(
        storage_key=storage_key,
        mime_type=payload.mime_type,
    )

    return MediaUploadTarget(
        storage_key=storage_key,
        upload_url=upload_url,
        expires_in=settings.s3_signed_url_ttl_seconds,
    )


@router.post("", response_model=MediaRead, status_code=status.HTTP_201_CREATED)
def register_media(
    repair_case_id: UUID,
    payload: MediaCreate,
    db: Session = Depends(get_db),
    auth: AuthContext = Depends(require_permission("case.update")),
):
    get_case_or_404(db, auth.tenant_id, repair_case_id)

    expected_prefix = f"tenants/{auth.tenant_id}/cases/{repair_case_id}/"
    if not payload.storage_key.startswith(expected_prefix):
        raise HTTPException(status_code=400, detail="Invalid storage key")

    media = Media(
        tenant_id=auth.tenant_id,
        repair_case_id=repair_case_id,
        uploaded_by=auth.user_id,
        **payload.model_dump(),
    )
    db.add(media)
    db.commit()
    db.refresh(media)
    return media


@router.get("", response_model=list[MediaRead])
def list_media(
    repair_case_id: UUID,
    db: Session = Depends(get_db),
    auth: AuthContext = Depends(require_permission("case.read")),
):
    get_case_or_404(db, auth.tenant_id, repair_case_id)

    return db.scalars(
        select(Media)
        .where(
            Media.tenant_id == auth.tenant_id,
            Media.repair_case_id == repair_case_id,
        )
        .order_by(Media.created_at.asc())
    ).all()


@router.get("/{media_id}/access-url", response_model=MediaAccessUrl)
def get_media_access_url(
    repair_case_id: UUID,
    media_id: UUID,
    db: Session = Depends(get_db),
    auth: AuthContext = Depends(require_permission("case.read")),
):
    media = db.scalar(
        select(Media).where(
            Media.id == media_id,
            Media.repair_case_id == repair_case_id,
            Media.tenant_id == auth.tenant_id,
        )
    )
    if media is None:
        raise HTTPException(status_code=404, detail="Media not found")

    try:
        storage = S3StorageService()
    except StorageNotConfiguredError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc

    return MediaAccessUrl(
        url=storage.create_download_url(storage_key=media.storage_key),
        expires_in=settings.s3_signed_url_ttl_seconds,
    )


def get_marker_or_404(db: Session, tenant_id: UUID, repair_case_id: UUID, marker_id: UUID) -> DamageMarker:
    marker = db.scalar(select(DamageMarker).where(
        DamageMarker.id == marker_id, DamageMarker.repair_case_id == repair_case_id, DamageMarker.tenant_id == tenant_id,
    ))
    if marker is None:
        raise HTTPException(status_code=404, detail="Damage marker not found")
    return marker


def get_line_or_404(db: Session, tenant_id: UUID, repair_case_id: UUID, line_id: UUID) -> EstimateLine:
    line = db.scalar(
        select(EstimateLine)
        .join(Estimate, Estimate.id == EstimateLine.estimate_id)
        .where(EstimateLine.id == line_id, EstimateLine.tenant_id == tenant_id, Estimate.repair_case_id == repair_case_id, Estimate.tenant_id == tenant_id)
    )
    if line is None:
        raise HTTPException(status_code=404, detail="Estimate line not found")
    return line


def get_media_or_404(db: Session, tenant_id: UUID, repair_case_id: UUID, media_id: UUID) -> Media:
    media = db.scalar(select(Media).where(Media.id == media_id, Media.repair_case_id == repair_case_id, Media.tenant_id == tenant_id))
    if media is None:
        raise HTTPException(status_code=404, detail="Media not found")
    return media


@router.post("/direct", response_model=MediaRead, status_code=status.HTTP_201_CREATED)
async def upload_photo_direct(
    repair_case_id: UUID,
    request: Request,
    category: MediaCategory = Query(MediaCategory.DAMAGE),
    damage_marker_id: UUID | None = Query(None),
    estimate_line_id: UUID | None = Query(None),
    filename: str | None = Query(None, max_length=255),
    db: Session = Depends(get_db),
    auth: AuthContext = Depends(require_permission("case.update")),
):
    """Photo sent as the raw request body; compressed and stored with the case."""
    get_case_or_404(db, auth.tenant_id, repair_case_id)
    if damage_marker_id is not None:
        get_marker_or_404(db, auth.tenant_id, repair_case_id, damage_marker_id)
    if estimate_line_id is not None:
        get_line_or_404(db, auth.tenant_id, repair_case_id, estimate_line_id)
    declared = int(request.headers.get("content-length") or 0)
    if declared > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail="Foto troppo grande (max 15 MB).")
    try:
        content, width, height = prepare_photo(await request.body())
    except PhotoError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    media = Media(
        tenant_id=auth.tenant_id, repair_case_id=repair_case_id, uploaded_by=auth.user_id,
        media_type=MediaType.PHOTO, category=category, damage_marker_id=damage_marker_id, estimate_line_id=estimate_line_id,
        storage_key=f"{DB_STORAGE_PREFIX}{auth.tenant_id}/{repair_case_id}/{uuid_module.uuid4().hex}.webp",
        original_filename=filename, mime_type="image/webp", size_bytes=len(content), width=width, height=height,
        content=content,
    )
    db.add(media)
    db.commit()
    db.refresh(media)
    return media


@router.get("/{media_id}/content")
def get_media_content(
    repair_case_id: UUID,
    media_id: UUID,
    db: Session = Depends(get_db),
    auth: AuthContext = Depends(require_permission("case.read")),
):
    media = get_media_or_404(db, auth.tenant_id, repair_case_id, media_id)
    if not media.in_database or not media.content:
        raise HTTPException(status_code=404, detail="Media not stored in the database")
    return Response(content=media.content, media_type=media.mime_type or "image/webp", headers={"Cache-Control": "private, max-age=86400"})


@router.patch("/{media_id}", response_model=MediaRead)
def link_media(
    repair_case_id: UUID,
    media_id: UUID,
    payload: MediaLink,
    db: Session = Depends(get_db),
    auth: AuthContext = Depends(require_permission("case.update")),
):
    media = get_media_or_404(db, auth.tenant_id, repair_case_id, media_id)
    fields = payload.model_dump(exclude_unset=True)
    if "damage_marker_id" in fields:
        if payload.damage_marker_id is not None:
            get_marker_or_404(db, auth.tenant_id, repair_case_id, payload.damage_marker_id)
        media.damage_marker_id = payload.damage_marker_id
    if "estimate_line_id" in fields:
        if payload.estimate_line_id is not None:
            get_line_or_404(db, auth.tenant_id, repair_case_id, payload.estimate_line_id)
        media.estimate_line_id = payload.estimate_line_id
    if payload.category is not None:
        media.category = payload.category
    db.commit()
    db.refresh(media)
    return media


@router.delete("/{media_id}", status_code=204)
def delete_media(
    repair_case_id: UUID,
    media_id: UUID,
    db: Session = Depends(get_db),
    auth: AuthContext = Depends(require_permission("case.update")),
):
    media = get_media_or_404(db, auth.tenant_id, repair_case_id, media_id)
    db.delete(media)
    db.commit()
    return None
