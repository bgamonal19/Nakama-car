"""Workshop tasks: worker note and link to the estimate line they come from.

Revision ID: 0024_task_notes
Revises: 0023_quick_items
"""
from alembic import op
import sqlalchemy as sa

revision = "0024_task_notes"
down_revision = "0023_quick_items"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("work_order_tasks", sa.Column("note", sa.Text(), nullable=True))
    op.add_column("work_order_tasks", sa.Column("estimate_line_id", sa.Uuid(), nullable=True))


def downgrade() -> None:
    op.drop_column("work_order_tasks", "estimate_line_id")
    op.drop_column("work_order_tasks", "note")
