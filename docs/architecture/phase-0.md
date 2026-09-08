# Phase 0 — Foundation

## Objectives

Phase 0 establishes a secure, extensible foundation before business modules are implemented.

### In scope

- Monorepo structure
- Next.js frontend shell
- FastAPI backend shell
- Versioned REST API
- PostgreSQL + SQLAlchemy base
- Tenant-aware persistence conventions
- Environment configuration
- Provider abstraction contracts
- S3-compatible storage configuration contract
- Architecture documentation

### Explicitly out of scope

- Customer CRUD
- Vehicle CRUD
- Acceptance workflow
- Damage map UI
- Estimate calculation engine
- PDF generation
- Work orders
- Billing
- DAT or GT Motive implementation
- AI damage analysis implementation

## Multi-tenancy rule

Every tenant-owned business table MUST contain a non-null `tenant_id`.
Application services MUST resolve tenant context before querying tenant-owned data.
No repository method may expose an unscoped tenant-owned query in application code.

A later migration should enable PostgreSQL Row Level Security as a defense-in-depth layer.

## Money

All monetary values must use PostgreSQL NUMERIC and Python Decimal.
Never use binary floating point for prices, taxes, discounts or totals.

## Provider strategy

External automotive data must be accessed through provider contracts:

- VehicleDataProvider
- PartsProvider
- LaborTimesProvider
- RepairCalculationProvider

The product must remain usable without a connected provider by allowing manual data entry.

## AI rule

DamageAnalysisService may only create suggestions.
AI output must never directly approve an estimate or create an authoritative repair decision.

## Security baseline

- HTTPS in production
- Argon2id password hashing
- Role/permission checks
- Tenant isolation
- Audit logging
- Private object storage
- Signed media URLs
- Secrets via environment variables
- Backups and tested restore procedures
