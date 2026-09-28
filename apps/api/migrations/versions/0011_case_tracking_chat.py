"""Customer tracking link and chat for repair cases.

Revision ID: 0011_case_tracking_chat
Revises: 0010_vehicle_renders_markers
"""
from alembic import op
import sqlalchemy as sa

revision = "0011_case_tracking_chat"
down_revision = "0010_vehicle_renders_markers"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "case_tracking_links",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("tenant_id", sa.Uuid(), nullable=False),
        sa.Column("repair_case_id", sa.Uuid(), nullable=False),
        sa.Column("public_token", sa.String(96), nullable=False),
        sa.Column("active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("last_viewed_at", sa.DateTime(timezone=True)),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["repair_case_id"], ["repair_cases.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_case_tracking_links_tenant_id", "case_tracking_links", ["tenant_id"])
    op.create_index("ix_case_tracking_links_repair_case_id", "case_tracking_links", ["repair_case_id"], unique=True)
    op.create_index("ix_case_tracking_links_public_token", "case_tracking_links", ["public_token"], unique=True)
    op.create_table(
        "case_messages",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("tenant_id", sa.Uuid(), nullable=False),
        sa.Column("repair_case_id", sa.Uuid(), nullable=False),
        sa.Column("sender", sa.String(12), nullable=False),
        sa.Column("author_name", sa.String(120)),
        sa.Column("body", sa.Text(), nullable=False),
        sa.Column("read_at", sa.DateTime(timezone=True)),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["repair_case_id"], ["repair_cases.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_case_messages_tenant_id", "case_messages", ["tenant_id"])
    op.create_index("ix_case_messages_repair_case_id", "case_messages", ["repair_case_id"])


def downgrade() -> None:
    op.drop_index("ix_case_messages_repair_case_id", table_name="case_messages")
    op.drop_index("ix_case_messages_tenant_id", table_name="case_messages")
    op.drop_table("case_messages")
    op.drop_index("ix_case_tracking_links_public_token", table_name="case_tracking_links")
    op.drop_index("ix_case_tracking_links_repair_case_id", table_name="case_tracking_links")
    op.drop_index("ix_case_tracking_links_tenant_id", table_name="case_tracking_links")
    op.drop_table("case_tracking_links")
