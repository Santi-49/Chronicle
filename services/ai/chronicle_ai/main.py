"""Application entry point for the local AI service."""

from pathlib import Path

from fastapi import FastAPI

from .routes import router
from .version import __version__

# Best-effort load the repository-root .env so `make run-ai` and standalone
# runs pick up the CHRONICLE_AI_* defaults. Shell env always wins (override=
# False), and python-dotenv is optional — tests run without a .env.
try:
    from dotenv import load_dotenv

    load_dotenv(Path(__file__).resolve().parents[3] / ".env", override=False)
except ModuleNotFoundError:  # pragma: no cover - dotenv is an install-time extra
    pass


app = FastAPI(
    title="Chronicle Local AI Service",
    version=__version__,
    description="Loopback-only annotation and text-embedding service.",
)
app.include_router(router)
