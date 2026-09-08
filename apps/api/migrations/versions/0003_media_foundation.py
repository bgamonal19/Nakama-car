"""media foundation

Revision ID: 0003_media_foundation
Revises: 0002_core_garage
"""
from alembic import op
import sqlalchemy as sa

revision = "0003_media_foundation"
down_revision = "0002_core_garage"
branch_labels = None
depends_on = None

def upgrade() -> None:
    media_type = sa.Enum("PHOTO", "DOCUMENT", "SIGNATURE", "PDF", name="media_type")
    media_category = sa.Enum(
        "FRONT", "REAR", "LEFT", "RIGHT", "INTERIOR", "DAMAGE",
        "VIN", "ODOMETER", "DOCUMENT", "OTHER",
        name="media_category",
    )
    media_type.create(op.get_bind(), checkfirst=True)
    media_category.create(op.get_bind(), checkfirst=True)

    op.create_table(
        "media",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("tenant_id", sa.Uuid(), nullable=False),
        sa.Column("repair_case_id", sa.Uuid(), nullable=False),
        sa.Column("media_type", media_type, nullable=False),
        sa.Column("category", media_category, nullable=False),
        sa.Column("storage_key", sa.String(512), nullable=False),
        sa.Column("original_filename", sa.String(255)),
        sa.Column("mime_type", sa.String(120)),
        sa.Column("size_bytes", sa.BigInteger()),
        sa.Column("width", sa.Integer()),
        sa.Column("height", sa.Integer()),
        sa.Column("uploaded_by", sa.Uuid()),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["repair_case_id"], ["repair_cases.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("storage_key"),
    )
    op.create_index("ix_media_tenant_id", "media", ["tenant_id"])
    op.create_index("ix_media_repair_case_id", "media", ["repair_case_id"])
    op.create_index("ix_media_category", "media", ["category"])
    op.create_index("ix_media_uploaded_by", "media", ["uploaded_by"])

def downgrade() -> None:
    op.drop_table("media")
    sa.Enum(name="media_category").drop(op.get_bind(), checkfirst=True)
    sa.Enum(name="media_type").drop(op.get_bind(), checkfirst=True)
