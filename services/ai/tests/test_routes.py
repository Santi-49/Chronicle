"""Tests for the HTTP surface; no external AI provider is contacted.

The annotate and embed-text routes delegate to engine coroutines.
Success-path tests patch those coroutines with lightweight in-process fakes
so the full FastAPI + Pydantic validation stack runs without network calls.
"""

from typing import Any
from unittest.mock import AsyncMock, patch

import pytest
from fastapi.testclient import TestClient

from chronicle_ai import routes
from chronicle_ai.main import app
from chronicle_ai.schemas import (
    AnnotateResponse,
    CostEstimate,
    EmbedTextResponse,
    TokenUsage,
    ValidateProviderModelResponse,
    VersionAnnotation,
)


client = TestClient(app)


# ---------------------------------------------------------------------------
# Shared fixtures
# ---------------------------------------------------------------------------

VALID_IMAGE = {"base64": "aW1hZ2U=", "mediaType": "image/png"}

ANNOTATE_PAYLOAD = {
    "provider": "test-provider",
    "model": "test-chat-model",
    "apiKey": "secret",
    "fileName": "logo.png",
    "previous": None,
    "current": VALID_IMAGE,
}

ANNOTATE_DIFF_PAYLOAD = {
    **ANNOTATE_PAYLOAD,
    "previous": {"base64": "cHJldmlvdXM=", "mediaType": "image/png"},
    "current": {"base64": "Y3VycmVudA==", "mediaType": "image/png"},
}

ANNOTATION_RESULT = AnnotateResponse(
    summary="Background changed from navy to teal.",
    changes=["Background changed from navy to teal"],
    tags=["navy", "teal", "background"],
    confidence=0.9,
    usage=TokenUsage(input_tokens=1200, output_tokens=80, total_tokens=1280),
    cost=CostEstimate(input_usd=0.00009, output_usd=0.000024, total_usd=0.000114),
)


# ---------------------------------------------------------------------------
# /health
# ---------------------------------------------------------------------------


def test_health_does_not_require_provider_configuration() -> None:
    response = client.get("/health")

    assert response.status_code == 200
    assert response.json() == {
        "status": "ok",
        "service": "chronicle-ai",
        "version": "0.1.0",
    }


# ---------------------------------------------------------------------------
# /annotate — validation rejections (no model call happens)
# ---------------------------------------------------------------------------


def test_annotate_rejects_invalid_base64_before_calling_provider() -> None:
    response = client.post(
        "/annotate",
        json={
            **ANNOTATE_PAYLOAD,
            "current": {"base64": "not base64!", "mediaType": "image/png"},
        },
    )

    assert response.status_code == 422


def test_annotate_rejects_unknown_fields() -> None:
    response = client.post(
        "/annotate",
        json={**ANNOTATE_PAYLOAD, "unexpected": True},
    )

    assert response.status_code == 422


def test_annotate_blank_api_key_without_env_default_is_configuration_error() -> None:
    # A blank key is treated as "unset"; with no CHRONICLE_AI_* default (cleared
    # by the autouse fixture) the engine reports a 400 configuration error and
    # never contacts a provider.
    response = client.post(
        "/annotate",
        json={**ANNOTATE_PAYLOAD, "apiKey": "   "},
    )

    assert response.status_code == 400
    assert response.json()["detail"]["code"] == "configuration_error"


def test_annotate_rejects_unsupported_media_type() -> None:
    response = client.post(
        "/annotate",
        json={
            **ANNOTATE_PAYLOAD,
            "current": {"base64": "aW1hZ2U=", "mediaType": "image/gif"},
        },
    )

    assert response.status_code == 422


def test_provider_errors_are_sanitized(monkeypatch) -> None:
    async def fail(_request):
        raise RuntimeError("provider leaked secret-key")

    monkeypatch.setattr(routes, "annotate_version", fail)
    response = client.post(
        "/annotate",
        json={
            "provider": "test-provider",
            "model": "test-chat-model",
            "apiKey": "secret-key",
            "fileName": "logo.png",
            "previous": None,
            "current": {"base64": "aW1hZ2U=", "mediaType": "image/png"},
        },
    )

    assert response.status_code == 502
    assert response.json() == {
        "detail": {
            "code": "provider_error",
            "message": "The AI provider rejected the request.",
        }
    }
    assert "secret-key" not in response.text


# ---------------------------------------------------------------------------
# /annotate — success path (first-version description)
# ---------------------------------------------------------------------------


@patch(
    "chronicle_ai.routes.annotate_version",
    new_callable=AsyncMock,
)
def test_annotate_first_version_returns_c3_annotation(mock_annotate: AsyncMock) -> None:
    """A valid first-version request calls annotate_version and returns C3 output."""
    mock_annotate.return_value = ANNOTATION_RESULT

    response = client.post("/annotate", json=ANNOTATE_PAYLOAD)

    assert response.status_code == 200
    body = response.json()
    assert body["summary"] == "Background changed from navy to teal."
    assert body["changes"] == ["Background changed from navy to teal"]
    assert body["tags"] == ["navy", "teal", "background"]
    assert body["confidence"] == 0.9
    # Token usage and estimated cost travel with the annotation (C3).
    assert body["usage"] == {"input_tokens": 1200, "output_tokens": 80, "total_tokens": 1280}
    assert body["cost"]["total_usd"] == 0.000114
    assert body["cost"]["currency"] == "USD"
    mock_annotate.assert_awaited_once()


# ---------------------------------------------------------------------------
# /annotate — success path (diff between two versions)
# ---------------------------------------------------------------------------


@patch(
    "chronicle_ai.routes.annotate_version",
    new_callable=AsyncMock,
)
def test_annotate_diff_passes_both_images(mock_annotate: AsyncMock) -> None:
    """A diff request includes previous and current; the model sees both."""
    mock_annotate.return_value = VersionAnnotation(
        summary="Background changed from navy to teal.",
        changes=["Background changed from navy to teal"],
        tags=["navy", "teal", "background"],
    )

    response = client.post("/annotate", json=ANNOTATE_DIFF_PAYLOAD)

    assert response.status_code == 200
    call_request = mock_annotate.call_args[0][0]
    assert call_request.previous is not None
    assert call_request.previous.base64 == "cHJldmlvdXM="
    assert call_request.current.base64 == "Y3VycmVudA=="


# ---------------------------------------------------------------------------
# /embed-text — success path
# ---------------------------------------------------------------------------


@patch(
    "chronicle_ai.routes.embed_text",
    new_callable=AsyncMock,
)
def test_embed_text_returns_vector_and_metadata(mock_embed: AsyncMock) -> None:
    mock_embed.return_value = EmbedTextResponse(
        embedding=[0.1, 0.2, 0.3],
        provider="openai",
        model="test-embed-model",
        dimensions=3,
    )

    response = client.post(
        "/embed-text",
        json={
            "provider": "openai",
            "model": "test-embed-model",
            "apiKey": "secret",
            "text": "navy background",
        },
    )

    assert response.status_code == 200
    body = response.json()
    assert body["embedding"] == [0.1, 0.2, 0.3]
    assert body["dimensions"] == 3
    assert body["provider"] == "openai"
    mock_embed.assert_awaited_once()


# ---------------------------------------------------------------------------
# /validate-provider-model
# ---------------------------------------------------------------------------


@patch("chronicle_ai.routes.validate_provider_model", new_callable=AsyncMock)
def test_validate_provider_model_reports_reachable_configuration(mock_validate: AsyncMock) -> None:
    response = client.post(
        "/validate-provider-model",
        json={
            "task": "embeddings",
            "provider": "openai",
            "model": "text-embedding-3-small",
            "apiKey": "secret",
        },
    )

    assert response.status_code == 200
    assert response.json() == ValidateProviderModelResponse(
        valid=True,
        reachable=True,
        task="embeddings",
        provider="openai",
        model="text-embedding-3-small",
        message="Provider and model are reachable.",
    ).model_dump()
    mock_validate.assert_awaited_once()


@patch("chronicle_ai.routes.validate_provider_model", new_callable=AsyncMock)
def test_validate_provider_model_sanitizes_rejected_config(mock_validate: AsyncMock) -> None:
    mock_validate.side_effect = RuntimeError("provider leaked secret-key")
    response = client.post(
        "/validate-provider-model",
        json={
            "task": "chat",
            "provider": "google",
            "model": "missing-model",
            "apiKey": "secret-key",
        },
    )

    assert response.status_code == 200
    assert response.json()["valid"] is False
    assert "secret-key" not in response.text


def test_validate_provider_model_requires_api_key() -> None:
    response = client.post(
        "/validate-provider-model",
        json={"task": "chat", "provider": "google", "model": "gemini-flash-latest"},
    )

    assert response.status_code == 422
