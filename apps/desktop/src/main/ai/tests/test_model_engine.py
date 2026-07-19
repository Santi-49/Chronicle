"""Unit tests for the model-agnostic LangChain operations."""

from typing import Any

import pytest

from apps.desktop.src.main.ai.model_engine import annotate_version, embed_text
from apps.desktop.src.main.ai.schemas import AnnotateRequest, EmbedTextRequest


IMAGE = {"base64": "aW1hZ2U=", "mediaType": "image/png"}


class FakeStructuredModel:
    def __init__(self, result: dict[str, Any]) -> None:
        self.result = result
        self.messages: list[dict[str, Any]] | None = None

    async def ainvoke(self, messages: list[dict[str, Any]]) -> dict[str, Any]:
        self.messages = messages
        return self.result


class FakeChatModel:
    def __init__(self, structured_model: FakeStructuredModel) -> None:
        self.structured_model = structured_model

    def with_structured_output(self, _schema: type[Any]) -> FakeStructuredModel:
        return self.structured_model


class FakeEmbeddings:
    async def aembed_query(self, text: str) -> list[float]:
        assert text == "navy background"
        return [0.1, 0.2, 0.3]


@pytest.mark.asyncio
async def test_first_version_uses_description_prompt() -> None:
    structured = FakeStructuredModel(
        {
            "summary": "A navy logo with a white tagline.",
            "changes": ["Navy background", "White logo and tagline"],
            "tags": ["navy", "logo", "tagline"],
            "confidence": None,
        }
    )
    chat_model = FakeChatModel(structured)
    factory_arguments: dict[str, Any] = {}

    def factory(**kwargs: Any) -> FakeChatModel:
        factory_arguments.update(kwargs)
        return chat_model

    result = await annotate_version(
        AnnotateRequest.model_validate(
            {
                "provider": "google_genai",
                "model": "gemini-2.5-flash",
                "apiKey": "secret",
                "fileName": "logo.png",
                "previous": None,
                "current": IMAGE,
            }
        ),
        model_factory=factory,
    )

    assert result.tags == ["navy", "logo", "tagline"]
    assert factory_arguments == {
        "model": "gemini-2.5-flash",
        "model_provider": "google_genai",
        "api_key": "secret",
        "temperature": 0,
    }
    assert structured.messages is not None
    user_content = structured.messages[1]["content"]
    assert "first captured version" in user_content[0]["text"]
    assert [block["type"] for block in user_content] == ["text", "image"]


@pytest.mark.asyncio
async def test_diff_sends_previous_image_before_current_image() -> None:
    structured = FakeStructuredModel(
        {
            "summary": "Background changed from navy to teal.",
            "changes": ["Background changed from navy to teal"],
            "tags": ["navy", "teal", "background"],
            "confidence": 0.9,
        }
    )
    chat_model = FakeChatModel(structured)

    await annotate_version(
        AnnotateRequest.model_validate(
            {
                "provider": "google_genai",
                "model": "gemini-2.5-flash",
                "apiKey": "secret",
                "fileName": "logo.png",
                "previous": {"base64": "cHJldmlvdXM=", "mediaType": "image/png"},
                "current": {"base64": "Y3VycmVudA==", "mediaType": "image/png"},
            }
        ),
        model_factory=lambda **_: chat_model,
    )

    assert structured.messages is not None
    content = structured.messages[1]["content"]
    assert content[1]["base64"] == "cHJldmlvdXM="
    assert content[2]["base64"] == "Y3VycmVudA=="


@pytest.mark.asyncio
async def test_embed_text_returns_model_identity_and_dimensions() -> None:
    result = await embed_text(
        EmbedTextRequest.model_validate(
            {
                "provider": "openai",
                "model": "text-embedding-3-small",
                "apiKey": "secret",
                "text": "navy background",
            }
        ),
        embeddings_factory=lambda **_: FakeEmbeddings(),
    )

    assert result.embedding == [0.1, 0.2, 0.3]
    assert result.provider == "openai"
    assert result.model == "text-embedding-3-small"
    assert result.dimensions == 3
