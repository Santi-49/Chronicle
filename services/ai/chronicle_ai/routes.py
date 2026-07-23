"""Temporary FastAPI surface for the local Chronicle AI service."""

from fastapi import APIRouter, HTTPException
from pydantic import ValidationError

from .engine import ConfigurationError, annotate_version, embed_text, validate_provider_model
from .schemas import (
    AnnotateRequest,
    AnnotateResponse,
    EmbedTextRequest,
    EmbedTextResponse,
    HealthResponse,
    ServiceErrorResponse,
    ValidateProviderModelRequest,
    ValidateProviderModelResponse,
)
from .version import __version__


router = APIRouter()


@router.get("/health", response_model=HealthResponse)
async def health() -> HealthResponse:
    """Report process health without contacting an external provider."""

    return HealthResponse(version=__version__)


ERROR_RESPONSES = {
    400: {"model": ServiceErrorResponse, "description": "No provider/model/key configured"},
    401: {"model": ServiceErrorResponse, "description": "Provider rejected the credential"},
    413: {"model": ServiceErrorResponse, "description": "Provider rejected the request size"},
    429: {"model": ServiceErrorResponse, "description": "Provider quota or rate limit reached"},
    502: {"model": ServiceErrorResponse, "description": "Provider or model output error"},
    503: {"model": ServiceErrorResponse, "description": "Provider integration unavailable"},
    504: {"model": ServiceErrorResponse, "description": "Provider timeout"},
}

def _provider_error(error: Exception, operation: str) -> HTTPException:
    """Classify safe recovery cases without returning provider text or credentials."""

    response = getattr(error, "response", None)
    raw_status = (
        getattr(error, "status_code", None)
        or getattr(response, "status_code", None)
        or getattr(error, "status", None)
        or getattr(error, "code", None)
    )
    raw_status = getattr(raw_status, "value", raw_status)
    try:
        status = int(raw_status)
    except (TypeError, ValueError):
        status = None
    normalized = str(error).lower()

    if status == 429 or any(
        marker in normalized
        for marker in ("resource_exhausted", "quota", "rate limit", "too many requests")
    ):
        return HTTPException(
            status_code=429,
            detail={
                "code": "provider_quota_exceeded",
                "message": (
                    "The AI provider quota or rate limit was reached. "
                    "This job requires a manual retry."
                ),
            },
        )
    if status in (401, 403) or any(
        marker in normalized
        for marker in ("invalid api key", "api key not valid", "unauthorized", "forbidden")
    ):
        return HTTPException(
            status_code=401,
            detail={
                "code": "provider_auth_error",
                "message": "The AI provider rejected the configured credential.",
            },
        )
    if status == 413 or "request too large" in normalized:
        return HTTPException(
            status_code=413,
            detail={
                "code": "provider_request_too_large",
                "message": "The AI provider rejected the image because the request is too large.",
            },
        )
    return HTTPException(
        status_code=502,
        detail={
            "code": "provider_error",
            "message": f"The {operation} provider rejected the request.",
        },
    )


@router.post("/annotate", response_model=AnnotateResponse, responses=ERROR_RESPONSES)
async def annotate(request: AnnotateRequest) -> AnnotateResponse:
    try:
        return await annotate_version(request)
    except ConfigurationError as error:
        raise HTTPException(
            status_code=400,
            detail={"code": "configuration_error", "message": str(error)},
        ) from error
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
        raise _provider_error(error, "AI") from error


@router.post("/embed-text", response_model=EmbedTextResponse, responses=ERROR_RESPONSES)
async def create_text_embedding(request: EmbedTextRequest) -> EmbedTextResponse:
    try:
        return await embed_text(request)
    except ConfigurationError as error:
        raise HTTPException(
            status_code=400,
            detail={"code": "configuration_error", "message": str(error)},
        ) from error
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
        raise _provider_error(error, "embedding") from error


@router.post("/validate-provider-model", response_model=ValidateProviderModelResponse)
async def validate_configuration(
    request: ValidateProviderModelRequest,
) -> ValidateProviderModelResponse:
    """Probe a provider/model/key with the real operation used by its task."""

    values = {
        "task": request.task,
        "provider": request.provider,
        "model": request.model,
    }
    try:
        await validate_provider_model(request)
        return ValidateProviderModelResponse(
            **values,
            valid=True,
            reachable=True,
            message="Provider and model are reachable.",
        )
    except (ConfigurationError, ValidationError):
        return ValidateProviderModelResponse(
            **values,
            valid=False,
            reachable=True,
            message="The provider/model configuration is not valid for this task.",
        )
    except ImportError:
        return ValidateProviderModelResponse(
            **values,
            valid=False,
            reachable=False,
            message="The provider integration is not installed.",
        )
    except TimeoutError:
        return ValidateProviderModelResponse(
            **values,
            valid=False,
            reachable=False,
            message="The provider or model could not be reached.",
        )
    except Exception as error:
        classified = _provider_error(error, "AI" if request.task == "chat" else "embedding")
        return ValidateProviderModelResponse(
            **values,
            valid=False,
            reachable=True,
            message=classified.detail["message"],
        )
