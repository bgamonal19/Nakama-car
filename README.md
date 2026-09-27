# NAKAMA CAR ESTIMATE

Professional multi-tenant SaaS for bodyshop intake, damage documentation, estimating, customer approval, workshop execution and billing.

- Product: **NAKAMA CAR ESTIMATE**
- Pilot tenant: **NAKAMA CAR (Italy)**
- Developed by: **ONE SISTEM**
- Architecture: **multi-tenant SaaS**
- Initial locale: **it-IT**
- Currency: **EUR**

## Current MVP

The MVP now contains a complete operational core:

- Secure operator login with JWT tenant context.
- One-time tenant/bootstrap initialization.
- RBAC roles: ADMIN, RECEPTION, BODYSHOP, PAINTER, MECHANIC, ACCOUNTING.
- Customer and vehicle directories.
- Guided vehicle intake flow: plate, customer, vehicle, photos, damage areas, operations and estimate.
- Photo upload through signed S3-compatible URLs.
- Vehicle damage map with repair / replace / paint / check operations.
- Configurable hourly labor rates.
- Estimate engine with parts, labor, paint, materials, VAT and totals.
- Estimate approval state and approved-estimate immutability.
- Professional estimate PDF generation.
- Public customer estimate page with accept/reject decision and signature name.
- Work-order conversion from approved estimates.
- Workshop status workflow and work-order tasks.
- Invoice creation from estimate snapshots and invoice lifecycle.
- Live dashboard metrics and recent practices.
- Tenant audit log for critical estimate, work-order and invoice changes.
- Responsive web UI for desktop, tablet and mobile.
- CI with PostgreSQL migrations, API tests and Next.js production build.

### Officina meccanica + flotte (release 2)

The same platform now runs a **mechanical workshop** for two kinds of customers:

- **Public customers** (privati e aziende): estimates priced from the normal hourly rates and part prices.
- **Fleet customers with a service contract** (e.g. Univex Group, Gamonal Trasporti):
  - `Contratti flotta` page: monthly fee, labor included (or a labor discount), parts/materials markup %.
  - Estimates for a contract customer automatically snapshot the contract terms: labor is billed at 0 when
    included, parts at cost + markup. A draft estimate can be switched between contract and public prices.
  - Monthly fee invoices generated per contract and month (`YYYY-MM`), one per period.
- Vehicles have a type (car, van, truck, tractor, trailer, bus…) and a fleet number, searchable everywhere.
- Intake wizard: pick an existing customer (so fleet trucks are not registered as new customers), vehicle
  type, customer request/symptoms, frequent mechanical operations; the bodyshop damage map is optional.
- Work orders get a mechanical checklist (diagnosis, parts, repair, road test) or the bodyshop checklist,
  depending on the estimate lines; the list shows plate, fleet number, customer and request.
- Estimates page: search/filter and full line editor (add, edit, delete lines, reject).
- Invoices: detail, issue/paid/cancel rules (issued invoices never return to draft), dates, payment method,
  courtesy PDF and **FatturaPA XML (FPR12)** to upload to the SdI through the AdE portal or an intermediary.
- Settings: workshop fiscal data (P.IVA, C.F., address, regime fiscale, IBAN, PEC/SDI).
- Case record: photo gallery with upload and the case estimates.

## Stack

- Frontend: Next.js 15 + React 19 + TypeScript + Tailwind CSS
- Backend: FastAPI + Python 3.12
- Database: PostgreSQL
- ORM: SQLAlchemy 2
- Migrations: Alembic
- API: REST
- Authentication: JWT + Argon2 password hashing
- Storage: S3-compatible object storage
- PDF: ReportLab
- Deployment: Vercel (web), Railway (API/PostgreSQL)

## Repository

- `apps/web` — frontend
- `apps/api` — backend
- `docs` — architecture and product decisions
- `infrastructure` — deployment/infrastructure notes
- `.github/workflows` — CI

## Required production environment variables

### Railway API

```env
APP_ENV=production
DATABASE_URL=postgresql+psycopg://...
JWT_SECRET=<long-random-secret>
JWT_ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=30
BOOTSTRAP_TOKEN=<one-time-random-bootstrap-secret>

S3_ENDPOINT=
S3_REGION=
S3_BUCKET=
S3_ACCESS_KEY_ID=
S3_SECRET_ACCESS_KEY=
S3_SIGNED_URL_TTL_SECONDS=900
```

The API Docker container runs `alembic upgrade head` before starting Uvicorn.

### Vercel Web

```env
NEXT_PUBLIC_API_URL=https://<railway-api-domain>/api/v1
```

Because this variable is public by design, it must contain only the API base URL and never a secret.

## Going live as a mechanical workshop

1. Deploy: the API container runs `alembic upgrade head` (migration `0008_fleet_contracts_billing`).
2. `Impostazioni` → fill the workshop fiscal data (needed for PDF headers and FatturaPA XML) and hourly rates.
3. `Clienti` → create the fleet companies with P.IVA, address and SDI code/PEC.
4. `Contratti flotta` → create one contract per fleet company (fee, labor included, parts markup).
5. Every month: `Contratti flotta` → *Fattura canone* → `Fatture` → issue → download XML → send to SdI.

## First production initialization

1. Deploy the API and web.
2. Set a strong `BOOTSTRAP_TOKEN` on Railway.
3. Open `/setup` on the Vercel web app.
4. Enter the bootstrap token and create the first NAKAMA CAR administrator.
5. After initialization, the bootstrap endpoint refuses to create a second initial user.
6. Rotate or remove `BOOTSTRAP_TOKEN` in Railway after the first administrator has been created.
7. Use `/login` for normal operator access.

## External data providers

The product intentionally does **not** invent OEM part codes, OEM prices, repair times or vehicle identification data. Those values remain manual until a licensed provider such as DAT or GT Motive is integrated.

## Pilot status

This repository is intended to run NAKAMA CAR as the first tenant while preserving tenant isolation so the same platform can later be commercialized by ONE SISTEM as SaaS for additional bodyshops.
