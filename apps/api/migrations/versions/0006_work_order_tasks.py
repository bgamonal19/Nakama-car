"""work order tasks

Revision ID: 0006_work_order_tasks
Revises: 0005_billing_approval
"""
from alembic import op
import sqlalchemy as sa

revision = "0006_work_order_tasks"
down_revision = "0005_billing_approval"
branch_labels = None
depends_on = None


def upgrade() -> None:
    task_status = sa.Enum("PENDING", "IN_PROGRESS", "DONE", "BLOCKED", name="work_task_status")

    op.create_table(
        "work_order_tasks",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("tenant_id", sa.Uuid(), nullable=False),
        sa.Column("work_order_id", sa.Uuid(), nullable=False),
        sa.Column("task_type", sa.String(64), nullable=False),
        sa.Column("description", sa.String(255), nullable=False),
        sa.Column("status", task_status, nullable=False),
        sa.Column("assigned_user_id", sa.Uuid()),
        sa.Column("sort_order", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["work_order_id"], ["work_orders.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_work_order_tasks_tenant_id", "work_order_tasks", ["tenant_id"])
    op.create_index("ix_work_order_tasks_work_order_id", "work_order_tasks", ["work_order_id"])
    op.create_index("ix_work_order_tasks_assigned_user_id", "work_order_tasks", ["assigned_user_id"])


def downgrade() -> None:
    op.drop_table("work_order_tasks")
    sa.Enum(name="work_task_status").drop(op.get_bind(), checkfirst=True)
