"""damage estimating workshop core

Revision ID: 0004_damage_estimate_workshop
Revises: 0003_media_foundation
"""
from alembic import op
import sqlalchemy as sa

revision = "0004_damage_estimate_workshop"
down_revision = "0003_media_foundation"
branch_labels = None
depends_on = None


def upgrade() -> None:
    damage_operation = sa.Enum("NO_DAMAGE", "CHECK", "REPAIR", "REPLACE", "PAINT", name="damage_operation")
    labor_type = sa.Enum("BODY", "MECHANICAL", "PAINT", "ELECTRICAL", "DIAGNOSTIC", name="labor_type")
    estimate_status = sa.Enum("DRAFT", "READY", "SENT", "VIEWED", "APPROVED", "REJECTED", "EXPIRED", "SUPERSEDED", name="estimate_status")
    estimate_line_category = sa.Enum(
        "PART", "BODY_LABOR", "MECHANICAL_LABOR", "PAINT", "ELECTRICAL",
        "DIAGNOSTIC", "MATERIAL", "DISPOSAL", "EXTERNAL_SERVICE", "OTHER",
        name="estimate_line_category",
    )
    work_order_status = sa.Enum(
        "NEW", "WAITING_APPROVAL", "APPROVED", "WAITING_PARTS", "IN_REPAIR",
        "PAINTING", "ASSEMBLY", "QUALITY_CONTROL", "READY", "DELIVERED", "INVOICED",
        name="work_order_status",
    )

    for enum in (damage_operation, labor_type, estimate_status, estimate_line_category, work_order_status):
        enum.create(op.get_bind(), checkfirst=True)

    op.create_table(
        "vehicle_areas",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("code", sa.String(80), nullable=False),
        sa.Column("label_it", sa.String(160), nullable=False),
        sa.Column("sort_order", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("code"),
    )
    op.create_index("ix_vehicle_areas_code", "vehicle_areas", ["code"], unique=True)

    op.create_table(
        "damages",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("tenant_id", sa.Uuid(), nullable=False),
        sa.Column("repair_case_id", sa.Uuid(), nullable=False),
        sa.Column("vehicle_area_code", sa.String(80), nullable=False),
        sa.Column("operation", damage_operation, nullable=False),
        sa.Column("suspected_damage", sa.String(200)),
        sa.Column("notes", sa.Text()),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["repair_case_id"], ["repair_cases.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("repair_case_id", "vehicle_area_code", name="uq_damage_case_area"),
    )
    op.create_index("ix_damages_tenant_id", "damages", ["tenant_id"])
    op.create_index("ix_damages_repair_case_id", "damages", ["repair_case_id"])

    op.create_table(
        "labor_rates",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("tenant_id", sa.Uuid(), nullable=False),
        sa.Column("labor_type", labor_type, nullable=False),
        sa.Column("hourly_rate", sa.Numeric(12, 2), nullable=False),
        sa.Column("currency", sa.String(3), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("tenant_id", "labor_type", name="uq_labor_rates_tenant_type"),
    )
    op.create_index("ix_labor_rates_tenant_id", "labor_rates", ["tenant_id"])

    op.create_table(
        "estimates",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("tenant_id", sa.Uuid(), nullable=False),
        sa.Column("repair_case_id", sa.Uuid(), nullable=False),
        sa.Column("estimate_number", sa.String(40), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.Column("status", estimate_status, nullable=False),
        sa.Column("currency", sa.String(3), nullable=False),
        sa.Column("subtotal", sa.Numeric(12, 2), nullable=False),
        sa.Column("vat_total", sa.Numeric(12, 2), nullable=False),
        sa.Column("total", sa.Numeric(12, 2), nullable=False),
        sa.Column("notes", sa.Text()),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["repair_case_id"], ["repair_cases.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("tenant_id", "estimate_number", name="uq_estimates_tenant_number"),
    )
    op.create_index("ix_estimates_tenant_id", "estimates", ["tenant_id"])
    op.create_index("ix_estimates_repair_case_id", "estimates", ["repair_case_id"])

    op.create_table(
        "estimate_lines",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("tenant_id", sa.Uuid(), nullable=False),
        sa.Column("estimate_id", sa.Uuid(), nullable=False),
        sa.Column("category", estimate_line_category, nullable=False),
        sa.Column("operation", sa.String(120)),
        sa.Column("part", sa.String(160)),
        sa.Column("oem_code", sa.String(120)),
        sa.Column("description", sa.String(255), nullable=False),
        sa.Column("quantity", sa.Numeric(10, 2), nullable=False),
        sa.Column("unit_price", sa.Numeric(12, 2), nullable=False),
        sa.Column("discount_percent", sa.Numeric(5, 2), nullable=False),
        sa.Column("labor_hours", sa.Numeric(8, 2), nullable=False),
        sa.Column("labor_rate", sa.Numeric(12, 2), nullable=False),
        sa.Column("paint_hours", sa.Numeric(8, 2), nullable=False),
        sa.Column("paint_rate", sa.Numeric(12, 2), nullable=False),
        sa.Column("materials", sa.Numeric(12, 2), nullable=False),
        sa.Column("vat_rate", sa.Numeric(5, 2), nullable=False),
        sa.Column("line_subtotal", sa.Numeric(12, 2), nullable=False),
        sa.Column("line_vat", sa.Numeric(12, 2), nullable=False),
        sa.Column("line_total", sa.Numeric(12, 2), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["estimate_id"], ["estimates.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_estimate_lines_tenant_id", "estimate_lines", ["tenant_id"])
    op.create_index("ix_estimate_lines_estimate_id", "estimate_lines", ["estimate_id"])

    op.create_table(
        "work_orders",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("tenant_id", sa.Uuid(), nullable=False),
        sa.Column("repair_case_id", sa.Uuid(), nullable=False),
        sa.Column("estimate_id", sa.Uuid()),
        sa.Column("work_order_number", sa.String(40), nullable=False),
        sa.Column("status", work_order_status, nullable=False),
        sa.Column("priority", sa.String(20), nullable=False),
        sa.Column("notes", sa.Text()),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["repair_case_id"], ["repair_cases.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["estimate_id"], ["estimates.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("tenant_id", "work_order_number", name="uq_work_orders_tenant_number"),
    )
    op.create_index("ix_work_orders_tenant_id", "work_orders", ["tenant_id"])
    op.create_index("ix_work_orders_repair_case_id", "work_orders", ["repair_case_id"])
    op.create_index("ix_work_orders_estimate_id", "work_orders", ["estimate_id"])

    area_table = sa.table(
        "vehicle_areas",
        sa.column("id", sa.Uuid()),
        sa.column("code", sa.String()),
        sa.column("label_it", sa.String()),
        sa.column("sort_order", sa.Integer()),
    )
    import uuid
    areas = [
        ("FRONT_BUMPER", "Paraurti anteriore"),
        ("REAR_BUMPER", "Paraurti posteriore"),
        ("HOOD", "Cofano"),
        ("ROOF", "Tetto"),
        ("FRONT_LEFT_FENDER", "Parafango anteriore sinistro"),
        ("FRONT_RIGHT_FENDER", "Parafango anteriore destro"),
        ("FRONT_LEFT_DOOR", "Porta anteriore sinistra"),
        ("FRONT_RIGHT_DOOR", "Porta anteriore destra"),
        ("REAR_LEFT_DOOR", "Porta posteriore sinistra"),
        ("REAR_RIGHT_DOOR", "Porta posteriore destra"),
        ("LEFT_QUARTER", "Fiancata posteriore sinistra"),
        ("RIGHT_QUARTER", "Fiancata posteriore destra"),
        ("LEFT_HEADLIGHT", "Faro sinistro"),
        ("RIGHT_HEADLIGHT", "Faro destro"),
        ("LEFT_TAILLIGHT", "Fanale posteriore sinistro"),
        ("RIGHT_TAILLIGHT", "Fanale posteriore destro"),
        ("WINDSHIELD", "Parabrezza"),
        ("REAR_WINDOW", "Lunotto"),
        ("LEFT_MIRROR", "Specchio sinistro"),
        ("RIGHT_MIRROR", "Specchio destro"),
    ]
    op.bulk_insert(
        area_table,
        [
            {"id": uuid.uuid4(), "code": code, "label_it": label, "sort_order": index}
            for index, (code, label) in enumerate(areas, start=1)
        ],
    )


def downgrade() -> None:
    op.drop_table("work_orders")
    op.drop_table("estimate_lines")
    op.drop_table("estimates")
    op.drop_table("labor_rates")
    op.drop_table("damages")
    op.drop_table("vehicle_areas")
    sa.Enum(name="work_order_status").drop(op.get_bind(), checkfirst=True)
    sa.Enum(name="estimate_line_category").drop(op.get_bind(), checkfirst=True)
    sa.Enum(name="estimate_status").drop(op.get_bind(), checkfirst=True)
    sa.Enum(name="labor_type").drop(op.get_bind(), checkfirst=True)
    sa.Enum(name="damage_operation").drop(op.get_bind(), checkfirst=True)
