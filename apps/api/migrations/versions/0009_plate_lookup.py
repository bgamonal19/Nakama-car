"""Plate lookup cache/usage and vehicle technical data.

Revision ID: 0009_plate_lookup
Revises: 0008_fleet_contracts_billing
"""
from alembic import op
import sqlalchemy as sa

revision = "0009_plate_lookup"
down_revision = "0008_fleet_contracts_billing"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "vehicle_lookups",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("tenant_id", sa.Uuid(), nullable=False),
        sa.Column("license_plate", sa.String(20), nullable=False),
        sa.Column("provider", sa.String(40), nullable=False),
        sa.Column("found", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("payload", sa.JSON()),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_vehicle_lookups_tenant_id", "vehicle_lookups", ["tenant_id"])
    op.create_index("ix_vehicle_lookups_license_plate", "vehicle_lookups", ["license_plate"])
    op.add_column("vehicles", sa.Column("fuel_type", sa.String(40)))
    op.add_column("vehicles", sa.Column("engine_size", sa.String(20)))
    op.add_column("vehicles", sa.Column("power_kw", sa.Integer()))


def downgrade() -> None:
    op.drop_column("vehicles", "power_kw")
    op.drop_column("vehicles", "engine_size")
    op.drop_column("vehicles", "fuel_type")
    op.drop_index("ix_vehicle_lookups_license_plate", table_name="vehicle_lookups")
    op.drop_index("ix_vehicle_lookups_tenant_id", table_name="vehicle_lookups")
    op.drop_table("vehicle_lookups")
