"""Staff profiles, quick diagnoses from the workshop, who completed each task.

Revision ID: 0022_staff_diagnosis
Revises: 0021_datev_foundation
"""
from alembic import op
import sqlalchemy as sa

revision = "0022_staff_diagnosis"
down_revision = "0021_datev_foundation"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "user_profiles",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("user_id", sa.Uuid(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False, unique=True),
        sa.Column("phone", sa.String(32)),
        sa.Column("birth_date", sa.Date()),
        sa.Column("tax_code", sa.String(32)),
        sa.Column("address", sa.String(255)),
        sa.Column("city", sa.String(120)),
        sa.Column("postal_code", sa.String(16)),
        sa.Column("emergency_contact", sa.String(160)),
        sa.Column("emergency_phone", sa.String(32)),
        sa.Column("skills", sa.Text()),
        sa.Column("notes", sa.Text()),
        sa.Column("work_area", sa.String(12)),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_user_profiles_user_id", "user_profiles", ["user_id"])
    diagnosis_status = sa.Enum("SENT", "CONVERTED", "REJECTED", name="diagnosis_status")
    op.create_table(
        "diagnoses",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("tenant_id", sa.Uuid(), sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False),
        sa.Column("diagnosis_number", sa.String(40), nullable=False),
        sa.Column("created_by", sa.Uuid(), nullable=False),
        sa.Column("license_plate", sa.String(20), nullable=False),
        sa.Column("vehicle_id", sa.Uuid(), sa.ForeignKey("vehicles.id", ondelete="SET NULL")),
        sa.Column("repair_case_id", sa.Uuid(), sa.ForeignKey("repair_cases.id", ondelete="SET NULL")),
        sa.Column("estimate_id", sa.Uuid(), sa.ForeignKey("estimates.id", ondelete="SET NULL")),
        sa.Column("work_type", sa.String(12), nullable=False, server_default="MECHANICAL"),
        sa.Column("mileage", sa.Integer()),
        sa.Column("complaint", sa.Text()),
        sa.Column("findings", sa.Text()),
        sa.Column("urgency", sa.String(12), nullable=False, server_default="NORMAL"),
        sa.Column("labor_hours", sa.Numeric(8, 2), nullable=False, server_default="0"),
        sa.Column("status", diagnosis_status, nullable=False, server_default="SENT"),
        sa.Column("reviewed_by", sa.Uuid()),
        sa.Column("reviewed_at", sa.DateTime(timezone=True)),
        sa.Column("review_note", sa.Text()),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_diagnoses_tenant_id", "diagnoses", ["tenant_id"])
    op.create_index("ix_diagnoses_created_by", "diagnoses", ["created_by"])
    op.create_index("ix_diagnoses_license_plate", "diagnoses", ["license_plate"])
    op.create_table(
        "diagnosis_lines",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("tenant_id", sa.Uuid(), sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False),
        sa.Column("diagnosis_id", sa.Uuid(), sa.ForeignKey("diagnoses.id", ondelete="CASCADE"), nullable=False),
        sa.Column("kind", sa.String(12), nullable=False),
        sa.Column("description", sa.String(255), nullable=False),
        sa.Column("oem_code", sa.String(120)),
        sa.Column("quantity", sa.Numeric(10, 2), nullable=False, server_default="1"),
        sa.Column("unit_price", sa.Numeric(12, 2)),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_diagnosis_lines_tenant_id", "diagnosis_lines", ["tenant_id"])
    op.create_index("ix_diagnosis_lines_diagnosis_id", "diagnosis_lines", ["diagnosis_id"])
    op.add_column("work_order_tasks", sa.Column("completed_by", sa.Uuid(), nullable=True))
    op.add_column("work_order_tasks", sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    op.drop_column("work_order_tasks", "completed_at")
    op.drop_column("work_order_tasks", "completed_by")
    op.drop_table("diagnosis_lines")
    op.drop_table("diagnoses")
    op.drop_table("user_profiles")
    sa.Enum(name="diagnosis_status").drop(op.get_bind(), checkfirst=True)
