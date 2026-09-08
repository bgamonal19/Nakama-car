from fastapi import APIRouter

from app.api.v1 import cases, customers, damages, estimates, media, vehicles, workshop

api_router = APIRouter()
api_router.include_router(customers.router)
api_router.include_router(vehicles.router)
api_router.include_router(cases.router)
api_router.include_router(media.router)
api_router.include_router(damages.router)
api_router.include_router(estimates.router)
api_router.include_router(workshop.router)


@api_router.get("/health", tags=["system"])
def api_health() -> dict[str, str]:
    return {"status": "ok", "api_version": "v1"}
