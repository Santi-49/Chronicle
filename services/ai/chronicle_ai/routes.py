"""Temporary FastAPI surface for the local Chronicle AI service."""

from fastapi import APIRouter, HTTPException
from pydantic import ValidationError

from .engine import annotate_version, embed_text
from .schemas import (
    AnnotateRequest,
    EmbedTextRequest,
    EmbedTextResponse,
    HealthResponse,
    ServiceErrorResponse,
    VersionAnnotation,
)


router = APIRouter()


@router.get("/health", response_model=HealthResponse)
async def health() -> HealthResponse:
    """Report process health without contacting an external provider."""

    return HealthResponse()


ERROR_RESPONSES = {
    502: {"model": ServiceErrorResponse, "description": "Provider or model output error"},
    503: {"model": ServiceErrorResponse, "description": "Provider integration unavailable"},
    504: {"model": ServiceErrorResponse, "description": "Provider timeout"},
}


@router.post("/annotate", response_model=VersionAnnotation, responses=ERROR_RESPONSES)
async def annotate(request: AnnotateRequest) -> VersionAnnotation:
    try:
        return await annotate_version(request)
    except ValidationError as error:
        raise HTTPException(
            status_code=502,
            detail={"code": "invalid_model_output", "message": "The AI returned invalid data."},
        ) from error
    except ImportError as error:
        raise HTTPException(
            status_code=503,
            detail={"code": "provider_unavailable", "message": "The provider is not installed."},
        ) from error
    except TimeoutError as error:
        raise HTTPException(
            status_code=504,
            detail={"code": "provider_timeout", "message": "The AI provider timed out."},
        ) from error
    except Exception as error:
        # Provider SDK errors must not expose request data or the BYOK key.
        raise HTTPException(
            status_code=502,
            detail={"code": "provider_error", "message": "The AI provider rejected the request."},
        ) from error


@router.post("/embed-text", response_model=EmbedTextResponse, responses=ERROR_RESPONSES)
async def create_text_embedding(request: EmbedTextRequest) -> EmbedTextResponse:
    try:
        return await embed_text(request)
    except ImportError as error:
        raise HTTPException(
            status_code=503,
            detail={"code": "provider_unavailable", "message": "The provider is not installed."},
        ) from error
    except TimeoutError as error:
        raise HTTPException(
            status_code=504,
            detail={"code": "provider_timeout", "message": "The embedding provider timed out."},
        ) from error
    except Exception as error:
        raise HTTPException(
            status_code=502,
            detail={"code": "provider_error", "message": "The embedding provider rejected the request."},
        ) from error
