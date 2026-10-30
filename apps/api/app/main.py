from contextlib import asynccontextmanager

from alembic import command
from alembic.config import Config
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.v1.router import api_router
from app.services import preview


def upgrade_database() -> None:
    """Keep the pilot database schema aligned even if Railway overrides Docker CMD."""
    config = Config("alembic.ini")
    command.upgrade(config, "head")


def prepare_test_copy() -> None:
    """PR environments and local runs: own empty database only, filled with demo data."""
    from app.db.session import SessionLocal, engine

    preview.claim_test_database(engine)
    upgrade_database()
    with SessionLocal() as db:
        preview.seed_demo_data(db)


@asynccontextmanager
async def lifespan(_: FastAPI):
    if preview.is_test_environment():
        prepare_test_copy()
    else:
        upgrade_database()
    yield


app = FastAPI(
    title="NAKAMA CAR ESTIMATE API",
    version="0.2.0",
    description="Multi-tenant estimating platform developed by ONE SISTEM.",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "https://web-theta-umber-70.vercel.app",
        "https://nakama-car-web-production.up.railway.app",
    ],
    # Vercel previews and the web copies of Railway PR environments (nakama-car-web-<environment>.up.railway.app).
    allow_origin_regex=r"https://.*\.vercel\.app|https://nakama-car-web-[a-z0-9-]+\.up\.railway\.app",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api_router, prefix="/api/v1")


@app.get("/health", tags=["system"])
def health_check() -> dict[str, str]:
    return {"status": "ok"}
