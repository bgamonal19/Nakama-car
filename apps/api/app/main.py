from fastapi import FastAPI

from app.api.v1.router import api_router

app = FastAPI(
    title="NAKAMA CAR ESTIMATE API",
    version="0.1.0",
    description="Multi-tenant estimating platform developed by ONE SISTEM.",
)

app.include_router(api_router, prefix="/api/v1")


@app.get("/health", tags=["system"])
def health_check() -> dict[str, str]:
    return {"status": "ok"}
