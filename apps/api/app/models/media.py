import enum
import uuid

from sqlalchemy import BigInteger, Enum, ForeignKey, Integer, LargeBinary, String, Uuid
from sqlalchemy.orm import Mapped, deferred, mapped_column

from app.db.base import Base, TenantOwnedMixin, TimestampMixin, UUIDPrimaryKeyMixin


class MediaType(str, enum.Enum):
    PHOTO = "PHOTO"
    DOCUMENT = "DOCUMENT"
    SIGNATURE = "SIGNATURE"
    PDF = "PDF"


class MediaCategory(str, enum.Enum):
    FRONT = "FRONT"
    REAR = "REAR"
    LEFT = "LEFT"
    RIGHT = "RIGHT"
    INTERIOR = "INTERIOR"
    DAMAGE = "DAMAGE"
    VIN = "VIN"
    ODOMETER = "ODOMETER"
    DOCUMENT = "DOCUMENT"
    OTHER = "OTHER"


class Media(Base, UUIDPrimaryKeyMixin, TenantOwnedMixin, TimestampMixin):
    __tablename__ = "media"

    repair_case_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("repair_cases.id", ondelete="CASCADE"), nullable=False, index=True
    )
    media_type: Mapped[MediaType] = mapped_column(
        Enum(MediaType, name="media_type"), nullable=False, default=MediaType.PHOTO
    )
    category: Mapped[MediaCategory] = mapped_column(
        Enum(MediaCategory, name="media_category"), nullable=False, index=True
    )
    storage_key: Mapped[str] = mapped_column(String(512), nullable=False, unique=True)
    original_filename: Mapped[str | None] = mapped_column(String(255))
    mime_type: Mapped[str | None] = mapped_column(String(120))
    size_bytes: Mapped[int | None] = mapped_column(BigInteger)
    width: Mapped[int | None] = mapped_column(Integer)
    height: Mapped[int | None] = mapped_column(Integer)
    uploaded_by: Mapped[uuid.UUID | None] = mapped_column(Uuid, nullable=True, index=True)
    # Pin on the 3D damage map this photo documents (optional).
    damage_marker_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("damage_markers.id", ondelete="SET NULL"), nullable=True, index=True
    )
    # Estimate line (part / service) this photo shows, e.g. the new part before fitting it.
    estimate_line_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("estimate_lines.id", ondelete="SET NULL"), nullable=True, index=True
    )
    # Photos kept in the database when no S3 storage is configured (compressed WebP).
    content: Mapped[bytes | None] = deferred(mapped_column(LargeBinary, nullable=True))

    @property
    def in_database(self) -> bool:
        return self.storage_key.startswith(DB_STORAGE_PREFIX)


DB_STORAGE_PREFIX = "db/"
