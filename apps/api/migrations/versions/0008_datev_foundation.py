"""Isolated DATEV preparation and remote identity links."""
from alembic import op
import sqlalchemy as sa
revision = "0008_datev_foundation"
down_revision = "0007_user_auth_version"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table("datev_links",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("tenant_id", sa.Uuid(), nullable=False),
        sa.Column("entity_type", sa.String(20), nullable=False),
        sa.Column("local_id", sa.String(36), nullable=False),
        sa.Column("remote_id", sa.String(255)),
        sa.Column("status", sa.String(32), nullable=False),
        sa.Column("fingerprint", sa.String(64), nullable=False),
        sa.Column("snapshot", sa.JSON(), nullable=False),
        sa.Column("error_code", sa.String(64)),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("tenant_id", "entity_type", "local_id", name="uq_datev_local"),
        sa.UniqueConstraint("tenant_id", "entity_type", "remote_id", name="uq_datev_remote"))
    op.create_index("ix_datev_links_tenant_id", "datev_links", ["tenant_id"])
    op.add_column("invoice_lines", sa.Column("source_category", sa.String(32)))


def downgrade():
    op.drop_column("invoice_lines", "source_category")
    op.drop_table("datev_links")
