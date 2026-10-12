"""Delivered time of chat messages (double tick).

Revision ID: 0014_message_delivered
Revises: 0013_photos_on_damages
"""
from alembic import op
import sqlalchemy as sa

revision = "0014_message_delivered"
down_revision = "0013_photos_on_damages"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("case_messages", sa.Column("delivered_at", sa.DateTime(timezone=True), nullable=True))
    # Messages already read were obviously delivered too.
    op.execute("UPDATE case_messages SET delivered_at = read_at WHERE read_at IS NOT NULL")


def downgrade() -> None:
    op.drop_column("case_messages", "delivered_at")
