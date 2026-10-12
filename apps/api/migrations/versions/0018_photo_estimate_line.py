"""Photos linked to an estimate line (the part or service they show).

Revision ID: 0018_photo_estimate_line
Revises: 0017_case_work_type
"""
from alembic import op
import sqlalchemy as sa

revision = "0018_photo_estimate_line"
down_revision = "0017_case_work_type"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("media", sa.Column("estimate_line_id", sa.Uuid(), nullable=True))
    op.create_index("ix_media_estimate_line_id", "media", ["estimate_line_id"])
    op.create_foreign_key(
        "fk_media_estimate_line_id_estimate_lines", "media", "estimate_lines",
        ["estimate_line_id"], ["id"], ondelete="SET NULL",
    )


def downgrade() -> None:
    op.drop_constraint("fk_media_estimate_line_id_estimate_lines", "media", type_="foreignkey")
    op.drop_index("ix_media_estimate_line_id", table_name="media")
    op.drop_column("media", "estimate_line_id")
