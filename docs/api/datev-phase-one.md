# DATEV / SBill: phase one

The existing FastAPI/SQLAlchemy billing API creates local invoice snapshots from estimates.
Next.js Fatture displays those records. Existing invoice status behavior is unchanged.
DATEV preparation is a separate provider/service/router and does not issue a local invoice,
change a case status, or send anything to SdI.

## Verified sources (25 September 2026)

- https://developer.datev.it/Docs/Autenticazione documents HTTPS OAuth at
  https://login.datev.it/connect/token, including client_credentials, form fields client_id,
  client_secret and scope. A tenant administrator must confirm that grant and scopes are
  permitted for their licensed application before setting client_credentials_confirmed.
- https://developer.datev.it/Docs/AuthKey requires Authorization-Key on resource requests;
  the key identifies the licensed organization. It is not sent to the OAuth server.
- https://developer.datev.it/Docs/Impresa describes SBill customers, documents, VAT and payment
  catalogs and exposes a Swagger reference. The exact licensed product, document schemas,
  archive identifiers, catalog codes and create-versus-SdI behavior remain unverified.

No inferred remote resource paths/payloads are implemented. The provider's customer and
create methods fail closed. There is no emission flag and no SdI transport. Even valid OAuth
credentials cannot enable document creation. OAuth success is explicitly reported as
**authentication only** with `sbill_connection: unverified`.

## Configuration

Set backend `DATEV_TENANTS` to a JSON object keyed by authenticated local tenant UUID. Each
value accepts base_url, token_url, client_id, client_secret, authorization_key, scope,
client_credentials_confirmed, payment_method_id, payment_type_id, and vat_codes.
Secrets use SecretStr and must be supplied via the hosting secret store, never the browser.
There is no default credential fallback across tenants. URLs must be HTTPS for token checks;
redirects are disabled, timeout is 15 seconds, and raw remote errors/tokens are never returned
or audited. Rate keys in vat_codes use two decimal places; values are verified DATEV catalog
IDs, not VAT percentages. Payment IDs are tenant defaults for this initial phase.

## Internal API (under /api/v1)

- POST /datev/connection: invoice.create permission; optional OAuth authentication check.
- POST /datev/customers/{id}/sync: invoice.create; validate and reserve a local customer link,
  then return 409 contract_unverified. No remote synchronization is claimed.
- GET /datev/invoices/{id}: invoice.read; readiness, missing fields, remote reference and gates.
- POST /datev/invoices/{id}/prepare: invoice.create; incomplete data returns status incomplete;
  complete data creates/reuses an immutable local snapshot, operation ID and SHA-256 hash.
- POST /datev/invoices/{id}/create: invoice.create; always 409 contract_unverified, audited.

Every resource lookup includes the authenticated tenant, including related customer, case,
vehicle, estimate and invoice lines. Unauthorized foreign resources return 404.
Canonical preparation includes fiscal identity/address, category, description, quantities,
net unit prices, VAT rates and verified codes, totals, payment IDs and case/estimate/plate
references. These are local fields, **not a DATEV wire schema**. New invoices retain line
category. Older lines without a category are blocked; no unreliable category inference or
historical data rewrite is performed. Approval, completed work and draft status are required.
This is a preliminary completeness check, not validation of the final electronic invoice schema.

## Idempotency and audit

Migration 0008 adds datev_links and nullable invoice_lines.source_category. A database unique
constraint on (tenant, entity type, local ID) reserves one operation across concurrent requests.
A second unique constraint reserves remote IDs per tenant/entity type. Insert races use a
savepoint and reread the winning reservation. Exact repeats return its original operation ID;
changed snapshots return 409 and require reconciliation. No automatic reset/retry endpoint is
provided. Snapshot data contains customer PII and follows existing tenant data retention policy;
audit records contain hashes/error codes only, never credentials or raw remote payloads.

## Before enabling external writes

Obtain and pin the exact licensed OpenAPI contract and catalog/archive IDs. Confirm the OAuth
grant and ownership of the authorization key. Implement and test typed wire adapters and
resource permission checks. Add a durable dispatch state machine with database locking,
remote reconciliation after timeout/crash, and verified remote idempotency/search semantics.
Local reservation alone cannot guarantee exactly-once external delivery. Add explicit reviewed
snapshot replacement, external status synchronization, and per-invoice payment overrides as
needed. Validate the full electronic document schema and use a controlled test tenant before
any production enablement. Keep SdI submission a separate explicit operation.

Apply `alembic upgrade head` before deploying this version; rollback removes integration
snapshots and the category column, without changing existing invoice records.
