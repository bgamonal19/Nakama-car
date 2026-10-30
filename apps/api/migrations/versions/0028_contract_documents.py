"""Files kept with a fleet contract (signed contract, annexes).

Revision ID: 0028_contract_documents
Revises: 0027_access_log_legal
"""
from alembic import op
import sqlalchemy as sa

revision = "0028_contract_documents"
down_revision = "0027_access_log_legal"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "service_contract_documents",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("tenant_id", sa.Uuid(), nullable=False),
        sa.Column("contract_id", sa.Uuid(), sa.ForeignKey("service_contracts.id", ondelete="CASCADE"), nullable=False),
        sa.Column("filename", sa.String(255), nullable=False),
        sa.Column("content_type", sa.String(120), nullable=False),
        sa.Column("size_bytes", sa.Integer(), nullable=False),
        sa.Column("uploaded_by", sa.Uuid(), nullable=True),
        sa.Column("content", sa.LargeBinary(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_service_contract_documents_tenant_id", "service_contract_documents", ["tenant_id"])
    op.create_index("ix_service_contract_documents_contract_id", "service_contract_documents", ["contract_id"])


def downgrade() -> None:
    op.drop_index("ix_service_contract_documents_contract_id", table_name="service_contract_documents")
    op.drop_index("ix_service_contract_documents_tenant_id", table_name="service_contract_documents")
    op.drop_table("service_contract_documents")
