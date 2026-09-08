from uuid import UUID
from pydantic import BaseModel, ConfigDict, Field

from app.models.media import MediaCategory, MediaType


class MediaUploadRequest(BaseModel):
    filename: str = Field(min_length=1, max_length=255)
    mime_type: str = Field(min_length=3, max_length=120)
    category: MediaCategory
    media_type: MediaType = MediaType.PHOTO


class MediaUploadTarget(BaseModel):
    storage_key: str
    upload_url: str
    expires_in: int


class MediaCreate(BaseModel):
    storage_key: str
    original_filename: str | None = None
    mime_type: str | None = None
    size_bytes: int | None = Field(default=None, ge=0)
    width: int | None = Field(default=None, ge=0)
    height: int | None = Field(default=None, ge=0)
    category: MediaCategory
    media_type: MediaType = MediaType.PHOTO


class MediaRead(MediaCreate):
    id: UUID
    repair_case_id: UUID
    model_config = ConfigDict(from_attributes=True)


class MediaAccessUrl(BaseModel):
    url: str
    expires_in: int
