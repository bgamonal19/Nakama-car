"""Revoke sessions after user credential or role changes."""
from alembic import op
import sqlalchemy as sa

revision = "0007_user_auth_version"
down_revision = "0006_work_order_tasks"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("users", sa.Column("auth_version", sa.Integer(), nullable=False, server_default="0"))


def downgrade() -> None:
    op.drop_column("users", "auth_version")
