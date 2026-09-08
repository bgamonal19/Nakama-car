from fastapi import APIRouter

from app.api.v1 import cases, customers, vehicles

api_router = APIRouter()
api_router.include_router(customers.router)
api_router.include_router(vehicles.router)
api_router.include_router(cases.router)


@api_router.get("/health", tags=["system"])
def api_health() -> dict[str, str]:
    return {"status": "ok", "api_version": "v1"}
