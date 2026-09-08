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
