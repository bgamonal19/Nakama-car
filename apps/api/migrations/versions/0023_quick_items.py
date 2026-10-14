"""Workshop's own quick-add items (parts, materials, jobs) for the diagnosis.

Revision ID: 0023_quick_items
Revises: 0022_staff_diagnosis
"""
from alembic import op
import sqlalchemy as sa

revision = "0023_quick_items"
down_revision = "0022_staff_diagnosis"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "quick_items",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("tenant_id", sa.Uuid(), sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False),
        sa.Column("name", sa.String(160), nullable=False),
        sa.Column("kind", sa.String(12), nullable=False),
        sa.Column("work_area", sa.String(12)),
        sa.Column("labor_hours", sa.Numeric(6, 2), nullable=False, server_default="0"),
        sa.Column("created_by", sa.Uuid()),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_quick_items_tenant_id", "quick_items", ["tenant_id"])


def downgrade() -> None:
    op.drop_index("ix_quick_items_tenant_id", table_name="quick_items")
    op.drop_table("quick_items")
