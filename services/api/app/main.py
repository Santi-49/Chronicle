from contextlib import asynccontextmanager
from typing import Literal

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from app.api.v1.router import router
from app.core.config import settings
from app.core.redis import get_redis_client
from app.version import API_VERSION


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Warm up Redis connection on startup
    get_redis_client()
    yield
    # Graceful close on shutdown
    client = get_redis_client()
    await client.aclose()


class HealthResponse(BaseModel):
    status: Literal["ok"] = "ok"
    service: Literal["chronicle-control-plane"] = "chronicle-control-plane"
    version: str


app = FastAPI(
    title="Chronicle Control Plane API",
    summary="Optional accounts, sync, and installation registration for Chronicle.",
    description=(
        "Chronicle remains local-first: creative files and local history are not stored by this API."
    ),
    version=API_VERSION,
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(router)


@app.get("/health", response_model=HealthResponse, tags=["health"], operation_id="health")
async def health() -> HealthResponse:
    """Lightweight reachability check used before starting interactive sign-in."""
    return HealthResponse(version=API_VERSION)
