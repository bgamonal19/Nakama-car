"""API keys for external systems, external service credentials and vehicle telemetry.

Revision ID: 0019_integrations_telemetry
Revises: 0018_photo_estimate_line
"""
from alembic import op
import sqlalchemy as sa

revision = "0019_integrations_telemetry"
down_revision = "0018_photo_estimate_line"
branch_labels = None
depends_on = None


def timestamps():
    return [
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    ]


def upgrade() -> None:
    op.create_table(
        "api_keys",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("tenant_id", sa.Uuid(), nullable=False),
        sa.Column("name", sa.String(120), nullable=False),
        sa.Column("prefix", sa.String(20), nullable=False),
        sa.Column("key_hash", sa.String(64), nullable=False),
        sa.Column("scopes", sa.String(255), nullable=False, server_default="telemetry:write"),
        sa.Column("active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("last_used_at", sa.DateTime(timezone=True)),
        sa.Column("created_by", sa.Uuid()),
        *timestamps(),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_api_keys_tenant_id", "api_keys", ["tenant_id"])
    op.create_index("ix_api_keys_key_hash", "api_keys", ["key_hash"], unique=True)
    op.create_table(
        "external_credentials",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("tenant_id", sa.Uuid(), nullable=False),
        sa.Column("provider", sa.String(40), nullable=False),
        sa.Column("label", sa.String(120), nullable=False),
        sa.Column("base_url", sa.String(255)),
        sa.Column("secret_encrypted", sa.Text(), nullable=False),
        sa.Column("secret_last4", sa.String(8), nullable=False),
        sa.Column("active", sa.Boolean(), nullable=False, server_default=sa.true()),
        *timestamps(),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_external_credentials_tenant_id", "external_credentials", ["tenant_id"])
    op.create_table(
        "vehicle_telemetry",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("tenant_id", sa.Uuid(), nullable=False),
        sa.Column("vehicle_id", sa.Uuid(), nullable=False),
        sa.Column("recorded_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("source", sa.String(60)),
        sa.Column("odometer_km", sa.Integer()),
        sa.Column("latitude", sa.Float()),
        sa.Column("longitude", sa.Float()),
        sa.Column("speed_kmh", sa.Float()),
        sa.Column("fuel_level_percent", sa.Float()),
        sa.Column("battery_voltage", sa.Float()),
        sa.Column("engine_on", sa.Boolean()),
        sa.Column("warning_lights", sa.JSON()),
        sa.Column("dtc_codes", sa.JSON()),
        sa.Column("driving", sa.JSON()),
        sa.Column("raw", sa.JSON()),
        *timestamps(),
        sa.ForeignKeyConstraint(["vehicle_id"], ["vehicles.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_vehicle_telemetry_tenant_id", "vehicle_telemetry", ["tenant_id"])
    op.create_index("ix_vehicle_telemetry_vehicle_id", "vehicle_telemetry", ["vehicle_id"])
    op.create_index("ix_vehicle_telemetry_recorded_at", "vehicle_telemetry", ["recorded_at"])


def downgrade() -> None:
    op.drop_index("ix_vehicle_telemetry_recorded_at", table_name="vehicle_telemetry")
    op.drop_index("ix_vehicle_telemetry_vehicle_id", table_name="vehicle_telemetry")
    op.drop_index("ix_vehicle_telemetry_tenant_id", table_name="vehicle_telemetry")
    op.drop_table("vehicle_telemetry")
    op.drop_index("ix_external_credentials_tenant_id", table_name="external_credentials")
    op.drop_table("external_credentials")
    op.drop_index("ix_api_keys_key_hash", table_name="api_keys")
    op.drop_index("ix_api_keys_tenant_id", table_name="api_keys")
    op.drop_table("api_keys")
