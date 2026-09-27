"""Vehicle renders cache and damage markers on pictures.

Revision ID: 0010_vehicle_renders_markers
Revises: 0009_plate_lookup
"""
from alembic import op
import sqlalchemy as sa

revision = "0010_vehicle_renders_markers"
down_revision = "0009_plate_lookup"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "vehicle_renders",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("tenant_id", sa.Uuid(), nullable=False),
        sa.Column("render_key", sa.String(255), nullable=False),
        sa.Column("make", sa.String(120), nullable=False),
        sa.Column("model", sa.String(120), nullable=False),
        sa.Column("year", sa.Integer()),
        sa.Column("color", sa.String(20), nullable=False),
        sa.Column("view", sa.String(30), nullable=False),
        sa.Column("found", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("mime_type", sa.String(60)),
        sa.Column("content", sa.LargeBinary()),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("tenant_id", "render_key", name="uq_vehicle_renders_tenant_key"),
    )
    op.create_index("ix_vehicle_renders_tenant_id", "vehicle_renders", ["tenant_id"])
    op.create_table(
        "damage_markers",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("tenant_id", sa.Uuid(), nullable=False),
        sa.Column("repair_case_id", sa.Uuid(), nullable=False),
        sa.Column("view", sa.String(30), nullable=False),
        sa.Column("x", sa.Numeric(6, 4), nullable=False),
        sa.Column("y", sa.Numeric(6, 4), nullable=False),
        sa.Column("operation", sa.String(20), nullable=False),
        sa.Column("area_label", sa.String(160), nullable=False),
        sa.Column("notes", sa.Text()),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["repair_case_id"], ["repair_cases.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_damage_markers_tenant_id", "damage_markers", ["tenant_id"])
    op.create_index("ix_damage_markers_repair_case_id", "damage_markers", ["repair_case_id"])


def downgrade() -> None:
    op.drop_index("ix_damage_markers_repair_case_id", table_name="damage_markers")
    op.drop_index("ix_damage_markers_tenant_id", table_name="damage_markers")
    op.drop_table("damage_markers")
    op.drop_index("ix_vehicle_renders_tenant_id", table_name="vehicle_renders")
    op.drop_table("vehicle_renders")
