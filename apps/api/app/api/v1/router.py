from fastapi import APIRouter

from app.api.v1 import approvals, audit, auth, billing, cases, company, contracts, customers, damages, dashboard, estimates, media, renders, tracking, users, vehicles, workshop

api_router = APIRouter()
api_router.include_router(auth.router)
api_router.include_router(users.router)
api_router.include_router(audit.router)
api_router.include_router(dashboard.router)
api_router.include_router(customers.router)
api_router.include_router(contracts.router)
api_router.include_router(billing.contract_router)
api_router.include_router(vehicles.router)
api_router.include_router(cases.router)
api_router.include_router(media.router)
api_router.include_router(damages.router)
api_router.include_router(renders.router)
api_router.include_router(estimates.router)
api_router.include_router(approvals.router)
api_router.include_router(workshop.router)
api_router.include_router(billing.router)
api_router.include_router(company.router)
api_router.include_router(tracking.router)


@api_router.get("/health", tags=["system"])
def api_health() -> dict[str, str]:
    return {"status": "ok", "api_version": "v1"}
