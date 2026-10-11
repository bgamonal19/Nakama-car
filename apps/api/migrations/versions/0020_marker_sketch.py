"""Hand-drawn damage outline (stylus / finger) on damage markers.

Revision ID: 0020_marker_sketch
Revises: 0019_integrations_telemetry
"""
from alembic import op
import sqlalchemy as sa

revision = "0020_marker_sketch"
down_revision = "0019_integrations_telemetry"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("damage_markers", sa.Column("sketch", sa.JSON(), nullable=True))


def downgrade() -> None:
    op.drop_column("damage_markers", "sketch")
