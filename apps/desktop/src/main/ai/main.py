"""Application entry point for the temporary local AI service."""

from fastapi import FastAPI

from .compare_images import router


app = FastAPI(
    title="Chronicle Local AI Service",
    version="0.1.0",
    description="Loopback-only annotation and text-embedding service.",
)
app.include_router(router)
