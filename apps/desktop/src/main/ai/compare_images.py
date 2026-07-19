"""Temporary FastAPI surface for the local Chronicle AI service."""

from fastapi import APIRouter

from .model_engine import annotate_version, embed_text
from .schemas import (
    AnnotateRequest,
    EmbedTextRequest,
    EmbedTextResponse,
    HealthResponse,
    VersionAnnotation,
)


router = APIRouter()


@router.get("/health", response_model=HealthResponse)
async def health() -> HealthResponse:
    """Report process health without contacting an external provider."""

    return HealthResponse()


@router.post("/annotate", response_model=VersionAnnotation)
async def annotate(request: AnnotateRequest) -> VersionAnnotation:
    return await annotate_version(request)


@router.post("/embed-text", response_model=EmbedTextResponse)
async def create_text_embedding(request: EmbedTextRequest) -> EmbedTextResponse:
    return await embed_text(request)
