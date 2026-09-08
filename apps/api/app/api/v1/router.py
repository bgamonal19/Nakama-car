from fastapi import APIRouter

api_router = APIRouter()


@api_router.get("/health", tags=["system"])
def api_health() -> dict[str, str]:
    return {"status": "ok", "api_version": "v1"}
