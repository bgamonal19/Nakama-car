"""Number plate position per make/model and view.

Revision ID: 0015_plate_spots
Revises: 0014_message_delivered
"""
from alembic import op
import sqlalchemy as sa

revision = "0015_plate_spots"
down_revision = "0014_message_delivered"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "plate_spots",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("tenant_id", sa.Uuid(), nullable=False),
        sa.Column("model_key", sa.String(255), nullable=False),
        sa.Column("view", sa.String(30), nullable=False),
        sa.Column("x", sa.Numeric(6, 4), nullable=False),
        sa.Column("y", sa.Numeric(6, 4), nullable=False),
        sa.Column("width", sa.Numeric(6, 4), nullable=False),
        sa.Column("turn", sa.Numeric(6, 2), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("tenant_id", "model_key", "view", name="uq_plate_spots_tenant_model_view"),
    )
    op.create_index("ix_plate_spots_tenant_id", "plate_spots", ["tenant_id"])


def downgrade() -> None:
    op.drop_index("ix_plate_spots_tenant_id", table_name="plate_spots")
    op.drop_table("plate_spots")
