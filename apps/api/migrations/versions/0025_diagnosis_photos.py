"""Check-in photos and fuel level recorded by the mechanic in the diagnosis.

Revision ID: 0025_diagnosis_photos
Revises: 0024_task_notes
"""
from alembic import op
import sqlalchemy as sa

revision = "0025_diagnosis_photos"
down_revision = "0024_task_notes"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("media", sa.Column("diagnosis_id", sa.Uuid(), sa.ForeignKey("diagnoses.id", ondelete="CASCADE"), nullable=True))
    op.create_index("ix_media_diagnosis_id", "media", ["diagnosis_id"])
    op.alter_column("media", "repair_case_id", existing_type=sa.Uuid(), nullable=True)
    op.add_column("diagnoses", sa.Column("fuel_level", sa.Integer(), nullable=True))


def downgrade() -> None:
    op.drop_column("diagnoses", "fuel_level")
    op.execute("DELETE FROM media WHERE repair_case_id IS NULL")
    op.alter_column("media", "repair_case_id", existing_type=sa.Uuid(), nullable=False)
    op.drop_index("ix_media_diagnosis_id", table_name="media")
    op.drop_column("media", "diagnosis_id")
