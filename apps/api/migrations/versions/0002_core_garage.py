"""core garage

Revision ID: 0002_core_garage
Revises: 0001_identity_foundation
"""
from alembic import op
import sqlalchemy as sa

revision = "0002_core_garage"
down_revision = "0001_identity_foundation"
branch_labels = None
depends_on = None

def upgrade() -> None:
    customer_type = sa.Enum("PRIVATE", "COMPANY", name="customer_type")
    case_status = sa.Enum("NEW","WAITING_APPROVAL","APPROVED","WAITING_PARTS","IN_REPAIR","PAINTING","ASSEMBLY","QUALITY_CONTROL","READY","DELIVERED","INVOICED", name="repair_case_status")
    case_status.create(op.get_bind(), checkfirst=True)

    op.create_table("customers",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("tenant_id", sa.Uuid(), nullable=False),
        sa.Column("customer_type", customer_type, nullable=False),
        sa.Column("first_name", sa.String(120)), sa.Column("last_name", sa.String(120)),
        sa.Column("company_name", sa.String(180)), sa.Column("tax_code", sa.String(32)),
        sa.Column("vat_number", sa.String(32)), sa.Column("address", sa.String(255)),
        sa.Column("city", sa.String(120)), sa.Column("province", sa.String(8)),
        sa.Column("postal_code", sa.String(16)), sa.Column("country", sa.String(2), nullable=False),
        sa.Column("phone", sa.String(32)), sa.Column("email", sa.String(255)),
        sa.Column("pec", sa.String(255)), sa.Column("sdi", sa.String(16)), sa.Column("notes", sa.Text()),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.PrimaryKeyConstraint("id"))
    op.create_index("ix_customers_tenant_id", "customers", ["tenant_id"])

    op.create_table("vehicles",
        sa.Column("id", sa.Uuid(), nullable=False), sa.Column("tenant_id", sa.Uuid(), nullable=False),
        sa.Column("customer_id", sa.Uuid()), sa.Column("license_plate", sa.String(20), nullable=False),
        sa.Column("vin", sa.String(32)), sa.Column("make", sa.String(120)), sa.Column("model", sa.String(120)),
        sa.Column("version", sa.String(160)), sa.Column("year", sa.Integer()), sa.Column("mileage", sa.Integer()),
        sa.Column("color_name", sa.String(120)), sa.Column("paint_code", sa.String(64)),
        sa.Column("external_vehicle_id", sa.String(255)), sa.Column("vehicle_data_provider", sa.String(64)),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["customer_id"], ["customers.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"), sa.UniqueConstraint("tenant_id","license_plate"))
    op.create_index("ix_vehicles_tenant_id", "vehicles", ["tenant_id"])
    op.create_index("ix_vehicles_customer_id", "vehicles", ["customer_id"])
    op.create_index("ix_vehicles_vin", "vehicles", ["vin"])

    op.create_table("repair_cases",
        sa.Column("id", sa.Uuid(), nullable=False), sa.Column("tenant_id", sa.Uuid(), nullable=False),
        sa.Column("case_number", sa.String(40), nullable=False), sa.Column("customer_id", sa.Uuid(), nullable=False),
        sa.Column("vehicle_id", sa.Uuid(), nullable=False), sa.Column("status", case_status, nullable=False),
        sa.Column("mileage", sa.Integer()), sa.Column("fuel_level_percent", sa.Integer()),
        sa.Column("customer_notes", sa.Text()), sa.Column("internal_notes", sa.Text()),
        sa.Column("opened_at", sa.DateTime(timezone=True)),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["customer_id"], ["customers.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["vehicle_id"], ["vehicles.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"), sa.UniqueConstraint("tenant_id","case_number"))
    op.create_index("ix_repair_cases_tenant_id", "repair_cases", ["tenant_id"])
    op.create_index("ix_repair_cases_customer_id", "repair_cases", ["customer_id"])
    op.create_index("ix_repair_cases_vehicle_id", "repair_cases", ["vehicle_id"])
    op.create_index("ix_repair_cases_status", "repair_cases", ["status"])

def downgrade() -> None:
    op.drop_table("repair_cases")
    op.drop_table("vehicles")
    op.drop_table("customers")
    sa.Enum(name="repair_case_status").drop(op.get_bind(), checkfirst=True)
    sa.Enum(name="customer_type").drop(op.get_bind(), checkfirst=True)
