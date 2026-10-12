import uuid
from datetime import datetime

from sqlalchemy import JSON, Boolean, DateTime, Float, ForeignKey, Integer, String, Text, Uuid
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, TenantOwnedMixin, TimestampMixin, UUIDPrimaryKeyMixin


class ApiKey(Base, UUIDPrimaryKeyMixin, TenantOwnedMixin, TimestampMixin):
    """Key given to an external system (e.g. OneSystec GPS) to send data to NAKAMA. Only its hash is stored."""

    __tablename__ = "api_keys"

    name: Mapped[str] = mapped_column(String(120), nullable=False)
    prefix: Mapped[str] = mapped_column(String(20), nullable=False)
    key_hash: Mapped[str] = mapped_column(String(64), nullable=False, unique=True, index=True)
    scopes: Mapped[str] = mapped_column(String(255), nullable=False, default="telemetry:write")
    active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    last_used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_by: Mapped[uuid.UUID | None] = mapped_column(Uuid, nullable=True)


class ExternalCredential(Base, UUIDPrimaryKeyMixin, TenantOwnedMixin, TimestampMixin):
    """API key of an external service (e.g. OneSystec) that NAKAMA uses; stored encrypted."""

    __tablename__ = "external_credentials"

    provider: Mapped[str] = mapped_column(String(40), nullable=False)
    label: Mapped[str] = mapped_column(String(120), nullable=False)
    base_url: Mapped[str | None] = mapped_column(String(255))
    secret_encrypted: Mapped[str] = mapped_column(Text, nullable=False)
    secret_last4: Mapped[str] = mapped_column(String(8), nullable=False)
    active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)


class VehicleTelemetry(Base, UUIDPrimaryKeyMixin, TenantOwnedMixin, TimestampMixin):
    """One reading sent by a GPS / telematics box for a vehicle."""

    __tablename__ = "vehicle_telemetry"

    vehicle_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("vehicles.id", ondelete="CASCADE"), nullable=False, index=True)
    recorded_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, index=True)
    source: Mapped[str | None] = mapped_column(String(60))
    odometer_km: Mapped[int | None] = mapped_column(Integer)
    latitude: Mapped[float | None] = mapped_column(Float)
    longitude: Mapped[float | None] = mapped_column(Float)
    speed_kmh: Mapped[float | None] = mapped_column(Float)
    fuel_level_percent: Mapped[float | None] = mapped_column(Float)
    battery_voltage: Mapped[float | None] = mapped_column(Float)
    engine_on: Mapped[bool | None] = mapped_column(Boolean)
    warning_lights: Mapped[list | None] = mapped_column(JSON)
    dtc_codes: Mapped[list | None] = mapped_column(JSON)
    driving: Mapped[dict | None] = mapped_column(JSON)
    raw: Mapped[dict | None] = mapped_column(JSON)
