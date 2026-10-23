"""Access log (who/when/how entered the app) and acceptance of terms + privacy notice.

Revision ID: 0027_access_log_legal
Revises: 0026_customer_logo
"""
from alembic import op
import sqlalchemy as sa

revision = "0027_access_log_legal"
down_revision = "0026_customer_logo"
branch_labels = None
depends_on = None

LEGAL_TABLES = ("users", "portal_accounts", "estimate_approvals")


def upgrade() -> None:
    op.create_table(
        "access_logs",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("tenant_id", sa.Uuid(), nullable=False),
        sa.Column("account_type", sa.String(length=12), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=True),
        sa.Column("portal_account_id", sa.Uuid(), nullable=True),
        sa.Column("email", sa.String(length=255), nullable=False),
        sa.Column("event", sa.String(length=32), nullable=False),
        sa.Column("method", sa.String(length=32), nullable=False),
        sa.Column("client", sa.String(length=16), nullable=False),
        sa.Column("ip_address", sa.String(length=64), nullable=True),
        sa.Column("user_agent", sa.String(length=512), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_access_logs")),
    )
    op.create_index(op.f("ix_access_logs_tenant_id"), "access_logs", ["tenant_id"])
    op.create_index(op.f("ix_access_logs_user_id"), "access_logs", ["user_id"])
    op.create_index(op.f("ix_access_logs_portal_account_id"), "access_logs", ["portal_account_id"])
    op.create_index(op.f("ix_access_logs_created_at"), "access_logs", ["created_at"])
    for table in LEGAL_TABLES:
        op.add_column(table, sa.Column("legal_version", sa.String(length=20), nullable=True))
        op.add_column(table, sa.Column("terms_accepted_at", sa.DateTime(timezone=True), nullable=True))
        op.add_column(table, sa.Column("privacy_accepted_at", sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    for table in LEGAL_TABLES:
        op.drop_column(table, "privacy_accepted_at")
        op.drop_column(table, "terms_accepted_at")
        op.drop_column(table, "legal_version")
    op.drop_index(op.f("ix_access_logs_created_at"), table_name="access_logs")
    op.drop_index(op.f("ix_access_logs_portal_account_id"), table_name="access_logs")
    op.drop_index(op.f("ix_access_logs_user_id"), table_name="access_logs")
    op.drop_index(op.f("ix_access_logs_tenant_id"), table_name="access_logs")
    op.drop_table("access_logs")
