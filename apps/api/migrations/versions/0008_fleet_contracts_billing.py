"""Fleet service contracts, heavy vehicles, contract pricing and full invoicing data.

Revision ID: 0008_fleet_contracts_billing
Revises: 0007_user_auth_version
"""
from alembic import op
import sqlalchemy as sa

revision = "0008_fleet_contracts_billing"
down_revision = "0007_user_auth_version"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "service_contracts",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("tenant_id", sa.Uuid(), nullable=False),
        sa.Column("customer_id", sa.Uuid(), nullable=False),
        sa.Column("name", sa.String(160), nullable=False),
        sa.Column("labor_included", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("labor_discount_percent", sa.Numeric(5, 2), nullable=False, server_default="0"),
        sa.Column("parts_markup_percent", sa.Numeric(5, 2), nullable=False, server_default="0"),
        sa.Column("monthly_fee", sa.Numeric(12, 2), nullable=False, server_default="0"),
        sa.Column("fee_vat_rate", sa.Numeric(5, 2), nullable=False, server_default="22"),
        sa.Column("fee_description", sa.String(255)),
        sa.Column("start_date", sa.Date(), nullable=False),
        sa.Column("end_date", sa.Date()),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("notes", sa.Text()),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["customer_id"], ["customers.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_service_contracts_tenant_id", "service_contracts", ["tenant_id"])
    op.create_index("ix_service_contracts_customer_id", "service_contracts", ["customer_id"])

    op.add_column("vehicles", sa.Column("vehicle_category", sa.String(20), nullable=False, server_default="CAR"))
    op.add_column("vehicles", sa.Column("fleet_number", sa.String(40)))

    op.add_column("estimates", sa.Column("contract_id", sa.Uuid()))
    op.add_column("estimates", sa.Column("labor_included", sa.Boolean(), nullable=False, server_default=sa.false()))
    op.add_column("estimates", sa.Column("labor_discount_percent", sa.Numeric(5, 2), nullable=False, server_default="0"))
    op.add_column("estimates", sa.Column("parts_markup_percent", sa.Numeric(5, 2), nullable=False, server_default="0"))
    op.create_foreign_key(
        "fk_estimates_contract_id_service_contracts", "estimates", "service_contracts",
        ["contract_id"], ["id"], ondelete="SET NULL",
    )
    op.create_index("ix_estimates_contract_id", "estimates", ["contract_id"])

    op.alter_column("invoices", "repair_case_id", existing_type=sa.Uuid(), nullable=True)
    op.add_column("invoices", sa.Column("customer_id", sa.Uuid()))
    op.add_column("invoices", sa.Column("invoice_kind", sa.String(20), nullable=False, server_default="REPAIR"))
    op.add_column("invoices", sa.Column("contract_id", sa.Uuid()))
    op.add_column("invoices", sa.Column("period_month", sa.String(7)))
    op.add_column("invoices", sa.Column("issue_date", sa.Date()))
    op.add_column("invoices", sa.Column("due_date", sa.Date()))
    op.add_column("invoices", sa.Column("payment_method", sa.String(8)))
    op.add_column("invoices", sa.Column("paid_at", sa.Date()))
    op.create_foreign_key(
        "fk_invoices_customer_id_customers", "invoices", "customers",
        ["customer_id"], ["id"], ondelete="RESTRICT",
    )
    op.create_foreign_key(
        "fk_invoices_contract_id_service_contracts", "invoices", "service_contracts",
        ["contract_id"], ["id"], ondelete="SET NULL",
    )
    op.create_index("ix_invoices_customer_id", "invoices", ["customer_id"])
    op.create_index("ix_invoices_contract_id", "invoices", ["contract_id"])
    op.create_unique_constraint(
        "uq_invoices_contract_period", "invoices", ["tenant_id", "contract_id", "period_month"]
    )
    # Existing repair invoices take their customer from the repair case, and invoices
    # already issued keep their creation day as issue date.
    op.execute(
        "UPDATE invoices SET customer_id = repair_cases.customer_id "
        "FROM repair_cases WHERE invoices.repair_case_id = repair_cases.id AND invoices.customer_id IS NULL"
    )
    op.execute(
        "UPDATE invoices SET issue_date = CAST(created_at AS DATE) "
        "WHERE issue_date IS NULL AND status IN ('ISSUED', 'PAID')"
    )

    for name, column in (
        ("address", sa.Column("address", sa.String(255))),
        ("city", sa.Column("city", sa.String(120))),
        ("province", sa.Column("province", sa.String(8))),
        ("postal_code", sa.Column("postal_code", sa.String(16))),
        ("country", sa.Column("country", sa.String(2), nullable=False, server_default="IT")),
        ("regime_fiscale", sa.Column("regime_fiscale", sa.String(4), nullable=False, server_default="RF01")),
        ("iban", sa.Column("iban", sa.String(34))),
        ("phone", sa.Column("phone", sa.String(32))),
        ("email", sa.Column("email", sa.String(255))),
    ):
        op.add_column("tenant_settings", column)


def downgrade() -> None:
    for name in ("email", "phone", "iban", "regime_fiscale", "country", "postal_code", "province", "city", "address"):
        op.drop_column("tenant_settings", name)

    op.drop_constraint("uq_invoices_contract_period", "invoices", type_="unique")
    op.drop_index("ix_invoices_contract_id", table_name="invoices")
    op.drop_index("ix_invoices_customer_id", table_name="invoices")
    op.drop_constraint("fk_invoices_contract_id_service_contracts", "invoices", type_="foreignkey")
    op.drop_constraint("fk_invoices_customer_id_customers", "invoices", type_="foreignkey")
    for name in ("paid_at", "payment_method", "due_date", "issue_date", "period_month", "contract_id", "invoice_kind", "customer_id"):
        op.drop_column("invoices", name)
    # Fee invoices have no repair case and must be removed before restoring NOT NULL.
    op.execute("DELETE FROM invoice_lines WHERE invoice_id IN (SELECT id FROM invoices WHERE repair_case_id IS NULL)")
    op.execute("DELETE FROM invoices WHERE repair_case_id IS NULL")
    op.alter_column("invoices", "repair_case_id", existing_type=sa.Uuid(), nullable=False)

    op.drop_index("ix_estimates_contract_id", table_name="estimates")
    op.drop_constraint("fk_estimates_contract_id_service_contracts", "estimates", type_="foreignkey")
    for name in ("parts_markup_percent", "labor_discount_percent", "labor_included", "contract_id"):
        op.drop_column("estimates", name)

    op.drop_column("vehicles", "fleet_number")
    op.drop_column("vehicles", "vehicle_category")

    op.drop_index("ix_service_contracts_customer_id", table_name="service_contracts")
    op.drop_index("ix_service_contracts_tenant_id", table_name="service_contracts")
    op.drop_table("service_contracts")
