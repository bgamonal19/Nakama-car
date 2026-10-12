"""Photos stored in the database and linked to damage markers.

Revision ID: 0013_photos_on_damages
Revises: 0012_fleet_portal
"""
from alembic import op
import sqlalchemy as sa

revision = "0013_photos_on_damages"
down_revision = "0012_fleet_portal"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("media", sa.Column("damage_marker_id", sa.Uuid(), nullable=True))
    op.add_column("media", sa.Column("content", sa.LargeBinary(), nullable=True))
    op.create_index("ix_media_damage_marker_id", "media", ["damage_marker_id"])
    op.create_foreign_key(
        "fk_media_damage_marker_id_damage_markers", "media", "damage_markers",
        ["damage_marker_id"], ["id"], ondelete="SET NULL",
    )


def downgrade() -> None:
    op.drop_constraint("fk_media_damage_marker_id_damage_markers", "media", type_="foreignkey")
    op.drop_index("ix_media_damage_marker_id", table_name="media")
    op.drop_column("media", "content")
    op.drop_column("media", "damage_marker_id")
