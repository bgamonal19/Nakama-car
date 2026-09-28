"""Work type of a repair case: bodywork or mechanical.

Revision ID: 0017_case_work_type
Revises: 0016_chat_status
"""
from alembic import op
import sqlalchemy as sa

revision = "0017_case_work_type"
down_revision = "0016_chat_status"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("repair_cases", sa.Column("work_type", sa.String(12), nullable=False, server_default="BODY"))


def downgrade() -> None:
    op.drop_column("repair_cases", "work_type")
