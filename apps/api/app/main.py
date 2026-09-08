from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.v1.router import api_router

app = FastAPI(
    title="NAKAMA CAR ESTIMATE API",
    version="0.2.0",
    description="Multi-tenant estimating platform developed by ONE SISTEM.",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "https://web-theta-umber-70.vercel.app"],
    allow_origin_regex=r"https://.*\.vercel\.app",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api_router, prefix="/api/v1")


@app.get("/health", tags=["system"])
def health_check() -> dict[str, str]:
    return {"status": "ok"}
