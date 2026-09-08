# NAKAMA CAR ESTIMATE

Professional SaaS platform for bodyshop intake, damage documentation, estimating and repair workflow management.

- Product: NAKAMA CAR ESTIMATE
- Pilot tenant: NAKAMA CAR (Italy)
- Developed by: ONE SISTEM
- Architecture: multi-tenant SaaS
- Initial locale: it-IT

## Stack

- Frontend: Next.js + TypeScript + Tailwind CSS
- Backend: FastAPI + Python
- Database: PostgreSQL
- ORM: SQLAlchemy
- API: REST
- Storage: S3-compatible object storage
- Deployment target: Vercel (web), Railway (API/PostgreSQL)

## Repository

- `apps/web` — frontend
- `apps/api` — backend
- `docs` — architecture and product decisions
- `infrastructure` — deployment/infrastructure notes

## Phase 0

This branch establishes project structure, tenant-aware backend foundations, provider abstractions and technical documentation. Functional business modules will be implemented incrementally.
