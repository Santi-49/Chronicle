from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.v1.router import router
from app.core.config import settings
from app.core.redis import get_redis_client


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Warm up Redis connection on startup
    get_redis_client()
    yield
    # Graceful close on shutdown
    client = get_redis_client()
    await client.aclose()


app = FastAPI(
    title="Hackathon API",
    version="0.1.0",
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
