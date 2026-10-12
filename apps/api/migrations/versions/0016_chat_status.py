"""Workshop chat availability (online / paused / offline).

Revision ID: 0016_chat_status
Revises: 0015_plate_spots
"""
from alembic import op
import sqlalchemy as sa

revision = "0016_chat_status"
down_revision = "0015_plate_spots"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("tenant_settings", sa.Column("chat_status", sa.String(12), nullable=False, server_default="ONLINE"))


def downgrade() -> None:
    op.drop_column("tenant_settings", "chat_status")
