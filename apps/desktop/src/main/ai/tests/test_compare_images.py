"""Tests for the HTTP surface; no external AI provider is contacted.

The annotate and embed-text routes delegate to model_engine coroutines.
Success-path tests patch those coroutines with lightweight in-process fakes
so the full FastAPI + Pydantic validation stack runs without network calls.
"""

from typing import Any
from unittest.mock import AsyncMock, patch

import pytest
from fastapi.testclient import TestClient

from apps.desktop.src.main.ai import compare_images
from apps.desktop.src.main.ai.main import app
from apps.desktop.src.main.ai.schemas import EmbedTextResponse, VersionAnnotation


client = TestClient(app)


# ---------------------------------------------------------------------------
# Shared fixtures
# ---------------------------------------------------------------------------

VALID_IMAGE = {"base64": "aW1hZ2U=", "mediaType": "image/png"}

ANNOTATE_PAYLOAD = {
    "provider": "google_genai",
    "model": "gemini-2.5-flash",
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

ANNOTATION_RESULT = VersionAnnotation(
    summary="Background changed from navy to teal.",
    changes=["Background changed from navy to teal"],
    tags=["navy", "teal", "background"],
    confidence=0.9,
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


def test_annotate_rejects_blank_api_key() -> None:
    response = client.post(
        "/annotate",
        json={**ANNOTATE_PAYLOAD, "apiKey": "   "},
    )

    assert response.status_code == 422


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

    monkeypatch.setattr(compare_images, "annotate_version", fail)
    response = client.post(
        "/annotate",
        json={
            "provider": "google_genai",
            "model": "gemini-2.5-flash",
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
    "apps.desktop.src.main.ai.compare_images.annotate_version",
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
    mock_annotate.assert_awaited_once()


# ---------------------------------------------------------------------------
# /annotate — success path (diff between two versions)
# ---------------------------------------------------------------------------


@patch(
    "apps.desktop.src.main.ai.compare_images.annotate_version",
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
    "apps.desktop.src.main.ai.compare_images.embed_text",
    new_callable=AsyncMock,
)
def test_embed_text_returns_vector_and_metadata(mock_embed: AsyncMock) -> None:
    mock_embed.return_value = EmbedTextResponse(
        embedding=[0.1, 0.2, 0.3],
        provider="openai",
        model="text-embedding-3-small",
        dimensions=3,
    )

    response = client.post(
        "/embed-text",
        json={
            "provider": "openai",
            "model": "text-embedding-3-small",
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
