"""Tests for the HTTP surface; no external AI provider is contacted."""

from fastapi.testclient import TestClient

from apps.desktop.src.main.ai.main import app


client = TestClient(app)


def test_health_does_not_require_provider_configuration() -> None:
    response = client.get("/health")

    assert response.status_code == 200
    assert response.json() == {
        "status": "ok",
        "service": "chronicle-ai",
        "version": "0.1.0",
    }


def test_annotate_rejects_invalid_base64_before_calling_provider() -> None:
    response = client.post(
        "/annotate",
        json={
            "provider": "google_genai",
            "model": "gemini-2.5-flash",
            "apiKey": "secret",
            "fileName": "logo.png",
            "previous": None,
            "current": {"base64": "not base64!", "mediaType": "image/png"},
        },
    )

    assert response.status_code == 422


def test_annotate_rejects_unknown_fields() -> None:
    response = client.post(
        "/annotate",
        json={
            "provider": "google_genai",
            "model": "gemini-2.5-flash",
            "apiKey": "secret",
            "fileName": "logo.png",
            "previous": None,
            "current": {"base64": "aW1hZ2U=", "mediaType": "image/png"},
            "unexpected": True,
        },
    )

    assert response.status_code == 422
