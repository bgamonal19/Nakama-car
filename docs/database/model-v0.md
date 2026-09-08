# Database Model v0

This document defines the planned core entities. Business tables will be introduced through Alembic migrations module by module.

## SaaS / Identity

- tenants
- tenant_settings
- users
- roles
- permissions
- user_tenants
- user_roles
- sessions
- audit_logs

## CRM / Vehicles

- customers
- vehicles
- vehicle_external_refs

## Repair workflow

- repair_cases
- media
- vehicle_areas
- damages
- damage_media

## Estimating

- labor_rates
- estimates
- estimate_versions
- estimate_lines
- estimate_approvals

## Workshop

- work_orders
- work_order_tasks
- work_order_events

## Billing

- invoices
- invoice_lines

## Cross-cutting rules

1. Tenant-owned rows include `tenant_id UUID NOT NULL`.
2. Primary keys use UUIDs.
3. Monetary values use NUMERIC/Decimal.
4. Approved estimate versions are immutable.
5. External provider identifiers never replace internal IDs.
6. Photos and PDFs live in object storage; PostgreSQL stores metadata and storage keys.
7. Sensitive price/hour/discount changes are audit logged.
