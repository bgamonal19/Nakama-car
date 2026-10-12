"""Fleet customer portal accounts and vehicle maintenance plan.

Revision ID: 0012_fleet_portal
Revises: 0011_case_tracking_chat
"""
from alembic import op
import sqlalchemy as sa

revision = "0012_fleet_portal"
down_revision = "0011_case_tracking_chat"
branch_labels = None
depends_on = None

VEHICLE_COLUMNS = [
    ("service_interval_km", sa.Integer()),
    ("service_interval_months", sa.Integer()),
    ("last_service_date", sa.Date()),
    ("last_service_km", sa.Integer()),
    ("next_service_date", sa.Date()),
    ("next_service_km", sa.Integer()),
]


def upgrade() -> None:
    op.create_table(
        "portal_accounts",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("tenant_id", sa.Uuid(), nullable=False),
        sa.Column("customer_id", sa.Uuid(), nullable=False),
        sa.Column("email", sa.String(255), nullable=False),
        sa.Column("full_name", sa.String(160), nullable=False),
        sa.Column("password_hash", sa.String(255), nullable=False),
        sa.Column("auth_version", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("must_change_password", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("last_login_at", sa.DateTime(timezone=True)),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["customer_id"], ["customers.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_portal_accounts_tenant_id", "portal_accounts", ["tenant_id"])
    op.create_index("ix_portal_accounts_customer_id", "portal_accounts", ["customer_id"])
    op.create_index("ix_portal_accounts_email", "portal_accounts", ["email"], unique=True)
    for name, column_type in VEHICLE_COLUMNS:
        op.add_column("vehicles", sa.Column(name, column_type, nullable=True))


def downgrade() -> None:
    for name, _ in reversed(VEHICLE_COLUMNS):
        op.drop_column("vehicles", name)
    op.drop_index("ix_portal_accounts_email", table_name="portal_accounts")
    op.drop_index("ix_portal_accounts_customer_id", table_name="portal_accounts")
    op.drop_index("ix_portal_accounts_tenant_id", table_name="portal_accounts")
    op.drop_table("portal_accounts")
