from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.db.deps import get_db
from app.models.garage import RepairCase
from app.models.media import Media
from app.schemas.media import (
    MediaAccessUrl,
    MediaCreate,
    MediaRead,
    MediaUploadRequest,
    MediaUploadTarget,
)
from app.security.context import AuthContext, require_permission
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
