"""billing and public approval

Revision ID: 0005_billing_approval
Revises: 0004_damage_estimate_workshop
"""
from alembic import op
import sqlalchemy as sa

revision = "0005_billing_approval"
down_revision = "0004_damage_estimate_workshop"
branch_labels = None
depends_on = None


def upgrade() -> None:
    invoice_status = sa.Enum("DRAFT", "ISSUED", "PAID", "CANCELLED", name="invoice_status")
    invoice_status.create(op.get_bind(), checkfirst=True)

    op.create_table(
        "estimate_approvals",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("tenant_id", sa.Uuid(), nullable=False),
        sa.Column("estimate_id", sa.Uuid(), nullable=False),
        sa.Column("public_token", sa.String(96), nullable=False),
        sa.Column("customer_name", sa.String(180)),
        sa.Column("accepted", sa.Boolean()),
        sa.Column("signature_name", sa.String(180)),
        sa.Column("customer_notes", sa.Text()),
        sa.Column("ip_address", sa.String(64)),
        sa.Column("user_agent", sa.String(512)),
        sa.Column("responded_at", sa.DateTime(timezone=True)),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["estimate_id"], ["estimates.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("public_token"),
    )
    op.create_index("ix_estimate_approvals_tenant_id", "estimate_approvals", ["tenant_id"])
    op.create_index("ix_estimate_approvals_estimate_id", "estimate_approvals", ["estimate_id"])
    op.create_index("ix_estimate_approvals_public_token", "estimate_approvals", ["public_token"], unique=True)

    op.create_table(
        "invoices",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("tenant_id", sa.Uuid(), nullable=False),
        sa.Column("repair_case_id", sa.Uuid(), nullable=False),
        sa.Column("estimate_id", sa.Uuid()),
        sa.Column("invoice_number", sa.String(40), nullable=False),
        sa.Column("status", invoice_status, nullable=False),
        sa.Column("subtotal", sa.Numeric(12, 2), nullable=False),
        sa.Column("vat_total", sa.Numeric(12, 2), nullable=False),
        sa.Column("total", sa.Numeric(12, 2), nullable=False),
        sa.Column("notes", sa.Text()),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["repair_case_id"], ["repair_cases.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["estimate_id"], ["estimates.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("tenant_id", "invoice_number", name="uq_invoices_tenant_number"),
    )
    op.create_index("ix_invoices_tenant_id", "invoices", ["tenant_id"])
    op.create_index("ix_invoices_repair_case_id", "invoices", ["repair_case_id"])
    op.create_index("ix_invoices_estimate_id", "invoices", ["estimate_id"])

    op.create_table(
        "invoice_lines",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("tenant_id", sa.Uuid(), nullable=False),
        sa.Column("invoice_id", sa.Uuid(), nullable=False),
        sa.Column("description", sa.String(255), nullable=False),
        sa.Column("quantity", sa.Numeric(10, 2), nullable=False),
        sa.Column("unit_price", sa.Numeric(12, 2), nullable=False),
        sa.Column("vat_rate", sa.Numeric(5, 2), nullable=False),
        sa.Column("line_subtotal", sa.Numeric(12, 2), nullable=False),
        sa.Column("line_vat", sa.Numeric(12, 2), nullable=False),
        sa.Column("line_total", sa.Numeric(12, 2), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["invoice_id"], ["invoices.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_invoice_lines_tenant_id", "invoice_lines", ["tenant_id"])
    op.create_index("ix_invoice_lines_invoice_id", "invoice_lines", ["invoice_id"])


def downgrade() -> None:
    op.drop_table("invoice_lines")
    op.drop_table("invoices")
    op.drop_table("estimate_approvals")
    sa.Enum(name="invoice_status").drop(op.get_bind(), checkfirst=True)
