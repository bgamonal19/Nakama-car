"""Company logo of a customer, shown on its record and in its portal.

Revision ID: 0026_customer_logo
Revises: 0025_diagnosis_photos
"""
from alembic import op
import sqlalchemy as sa

revision = "0026_customer_logo"
down_revision = "0025_diagnosis_photos"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("customers", sa.Column("logo", sa.LargeBinary(), nullable=True))
    op.add_column("customers", sa.Column("logo_updated_at", sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    op.drop_column("customers", "logo_updated_at")
    op.drop_column("customers", "logo")
