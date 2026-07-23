"""Unit tests for the model-agnostic LangChain operations.

All LangChain calls are replaced by in-process fakes so no external provider
is contacted and no API key is required.
"""

from typing import Any

import pytest

from chronicle_ai.engine import annotate_version, embed_text, validate_provider_model
from chronicle_ai.schemas import AnnotateRequest, EmbedTextRequest, ValidateProviderModelRequest


IMAGE = {"base64": "aW1hZ2U=", "mediaType": "image/png", "format": "png"}


# ---------------------------------------------------------------------------
# Test doubles
# ---------------------------------------------------------------------------


class FakeStructuredModel:
    """Captures the messages list and returns a pre-built result dict."""

    def __init__(self, result: dict[str, Any]) -> None:
        self.result = result
        self.messages: list[dict[str, Any]] | None = None

    async def ainvoke(self, messages: list[dict[str, Any]]) -> dict[str, Any]:
        self.messages = messages
        return self.result


class FakeChatModel:
    def __init__(self, structured_model: FakeStructuredModel) -> None:
        self.structured_model = structured_model

    def with_structured_output(self, _schema: type[Any], **_kwargs: Any) -> FakeStructuredModel:
        return self.structured_model


class FakeEmbeddings:
    async def aembed_query(self, text: str) -> list[float]:
        assert text == "navy background"
        return [0.1, 0.2, 0.3]


# ---------------------------------------------------------------------------
# annotate_version — first-version path
# ---------------------------------------------------------------------------


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
                "provider": "test-provider",
                "model": "test-chat-model",
                "apiKey": "secret",
                "fileName": "logo.png",
                "format": "png",
                "previous": None,
                "current": IMAGE,
            }
        ),
        model_factory=factory,
    )

    # Correct output values are propagated
    assert result.tags == ["navy", "logo", "tagline"]

    # Provider credentials are forwarded verbatim
    assert factory_arguments == {
        "model": "test-chat-model",
        "model_provider": "test-provider",
        "api_key": "secret",
        "temperature": 0,
    }

    # First-version prompt must contain "first captured version"
    assert structured.messages is not None
    system_text = structured.messages[0]["content"]
    user_content = structured.messages[1]["content"]
    assert "lowercase slug" in system_text
    assert "geometric-shapes" in system_text
    assert "first captured version" in user_content[0]["text"]

    # One text block + one image block
    assert [block["type"] for block in user_content] == ["text", "image_url"]


# ---------------------------------------------------------------------------
# annotate_version — diff path (two images)
# ---------------------------------------------------------------------------


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
                "provider": "test-provider",
                "model": "test-chat-model",
                "apiKey": "secret",
                "fileName": "logo.png",
                "format": "png",
                "previous": {"base64": "cHJldmlvdXM=", "mediaType": "image/png", "format": "png"},
                "current": {"base64": "Y3VycmVudA==", "mediaType": "image/png", "format": "png"},
            }
        ),
        model_factory=lambda **_: chat_model,
    )

    assert structured.messages is not None
    content = structured.messages[1]["content"]

    # Order: text, previous image, current image
    assert [block["type"] for block in content] == ["text", "image_url", "image_url"]

    # Data-URLs carry the correct payloads in the right order
    prev_url = content[1]["image_url"]["url"]
    curr_url = content[2]["image_url"]["url"]
    assert prev_url == "data:image/png;base64,cHJldmlvdXM="
    assert curr_url == "data:image/png;base64,Y3VycmVudA=="


@pytest.mark.asyncio
async def test_diff_prompt_instructs_change_description() -> None:
    """The version-diff prompt must reference the previous/current wording."""
    structured = FakeStructuredModel(
        {
            "summary": "Background changed from navy to teal.",
            "changes": ["Background changed from navy to teal"],
            "tags": ["navy", "teal", "background"],
            "confidence": None,
        }
    )
    chat_model = FakeChatModel(structured)

    await annotate_version(
        AnnotateRequest.model_validate(
            {
                "provider": "test-provider",
                "model": "test-chat-model",
                "apiKey": "secret",
                "fileName": "banner.png",
                "format": "png",
                "previous": {"base64": "cHJldmlvdXM=", "mediaType": "image/png", "format": "png"},
                "current": {"base64": "Y3VycmVudA==", "mediaType": "image/png", "format": "png"},
            }
        ),
        model_factory=lambda **_: chat_model,
    )

    assert structured.messages is not None
    user_text = structured.messages[1]["content"][0]["text"]
    # The diff prompt tells the model which image is which
    assert "previous version" in user_text and "current version" in user_text


# ---------------------------------------------------------------------------
# annotate_version — already-parsed result (VersionAnnotation instance path)
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_annotate_accepts_version_annotation_instance_from_model() -> None:
    """with_structured_output may return a VersionAnnotation directly."""
    from chronicle_ai.schemas import VersionAnnotation

    expected = VersionAnnotation(
        summary="Logo updated.",
        changes=["Logo updated"],
        tags=["logo", "update", "branding"],
        confidence=0.8,
    )

    class FakeStructuredModelInstance:
        async def ainvoke(self, _: Any) -> VersionAnnotation:
            return expected

    class FakeChatModelInstance:
        def with_structured_output(self, _: type[Any], **__: Any) -> FakeStructuredModelInstance:
            return FakeStructuredModelInstance()

    result = await annotate_version(
        AnnotateRequest.model_validate(
            {
                "provider": "test-provider",
                "model": "test-chat-model",
                "apiKey": "secret",
                "fileName": "logo.png",
                "format": "png",
                "previous": None,
                "current": IMAGE,
            }
        ),
        model_factory=lambda **_: FakeChatModelInstance(),
    )

    # The engine now wraps the annotation in an AnnotateResponse (adding usage/
    # cost), so compare the annotation fields rather than object identity.
    assert result.summary == expected.summary
    assert result.changes == expected.changes
    assert result.tags == expected.tags
    assert result.confidence == expected.confidence
    assert result.usage is None


# ---------------------------------------------------------------------------
# embed_text
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_embed_text_returns_model_identity_and_dimensions() -> None:
    result = await embed_text(
        EmbedTextRequest.model_validate(
            {
                "provider": "openai",
                "model": "test-embed-model",
                "apiKey": "secret",
                "text": "navy background",
            }
        ),
        embeddings_factory=lambda **_: FakeEmbeddings(),
    )

    assert result.embedding == [0.1, 0.2, 0.3]
    assert result.provider == "openai"
    assert result.model == "test-embed-model"
    assert result.dimensions == 3
    # The standard embedding interface exposes no token usage.
    assert result.usage is None
    assert result.cost is None


@pytest.mark.asyncio
@pytest.mark.parametrize("task", ["chat", "embeddings"])
async def test_validate_provider_model_makes_a_real_task_probe(task: str) -> None:
    structured = FakeStructuredModel(
        {
            "summary": "Configuration check succeeded.",
            "changes": ["Configuration check succeeded"],
            "tags": ["configuration", "check", "success"],
        }
    )
    embedded_text: list[str] = []

    class ValidationEmbeddings:
        async def aembed_query(self, text: str) -> list[float]:
            embedded_text.append(text)
            return [1.0]

    await validate_provider_model(
        ValidateProviderModelRequest.model_validate(
            {
                "task": task,
                "provider": "test-provider",
                "model": "test-model",
                "apiKey": "secret",
            }
        ),
        model_factory=lambda **_: FakeChatModel(structured),
        embeddings_factory=lambda **_: ValidationEmbeddings(),
    )

    if task == "chat":
        assert structured.messages is not None
        assert structured.messages[1]["content"][-1]["type"] == "image_url"
    else:
        assert embedded_text == ["Chronicle configuration check"]


# ---------------------------------------------------------------------------
# Environment defaults + token usage / cost estimate
# ---------------------------------------------------------------------------


class _FakeMessage:
    """Stand-in AIMessage carrying LangChain-style usage_metadata."""

    def __init__(self, usage: dict[str, int]) -> None:
        self.usage_metadata = usage


class _FakeStructuredWithUsage:
    """Mimics with_structured_output(..., include_raw=True)."""

    def __init__(self, annotation: dict[str, Any], usage: dict[str, int]) -> None:
        self._annotation = annotation
        self._usage = usage

    async def ainvoke(self, _messages: Any) -> dict[str, Any]:
        return {"raw": _FakeMessage(self._usage), "parsed": self._annotation}


class _FakeChatWithUsage:
    def __init__(self, structured: _FakeStructuredWithUsage) -> None:
        self._structured = structured

    def with_structured_output(self, _schema: type[Any], **_kwargs: Any) -> _FakeStructuredWithUsage:
        return self._structured


@pytest.mark.asyncio
async def test_annotate_falls_back_to_env_and_reports_tokens_and_cost(monkeypatch) -> None:
    # Configure defaults so the request can omit provider/model/key entirely.
    monkeypatch.setenv("CHRONICLE_AI_PROVIDER", "test-provider")
    monkeypatch.setenv("CHRONICLE_AI_API_KEY", "env-secret")
    monkeypatch.setenv("CHRONICLE_AI_ANNOTATE_MODEL", "env-chat-model")
    monkeypatch.setenv("CHRONICLE_AI_ANNOTATE_INPUT_PRICE_PER_M", "1.0")
    monkeypatch.setenv("CHRONICLE_AI_ANNOTATE_OUTPUT_PRICE_PER_M", "2.0")

    structured = _FakeStructuredWithUsage(
        {
            "summary": "A navy logo.",
            "changes": ["Navy background"],
            "tags": ["navy", "logo", "brand"],
            "confidence": None,
        },
        {"input_tokens": 1_000_000, "output_tokens": 500_000, "total_tokens": 1_500_000},
    )
    factory_arguments: dict[str, Any] = {}

    def factory(**kwargs: Any) -> _FakeChatWithUsage:
        factory_arguments.update(kwargs)
        return _FakeChatWithUsage(structured)

    result = await annotate_version(
        AnnotateRequest.model_validate({"fileName": "logo.png", "format": "png", "current": IMAGE}),
        model_factory=factory,
    )

    # Env defaults were used because the request omitted them.
    assert factory_arguments["model"] == "env-chat-model"
    assert factory_arguments["model_provider"] == "test-provider"
    assert factory_arguments["api_key"] == "env-secret"

    # Token usage is surfaced and cost = 1M/1M*1.0 + 0.5M/1M*2.0 = 1.0 + 1.0.
    assert result.usage.input_tokens == 1_000_000
    assert result.usage.output_tokens == 500_000
    assert result.cost.input_usd == 1.0
    assert result.cost.output_usd == 1.0
    assert result.cost.total_usd == 2.0


@pytest.mark.asyncio
async def test_annotate_without_provider_or_env_raises_configuration_error() -> None:
    from chronicle_ai.engine import ConfigurationError

    with pytest.raises(ConfigurationError):
        await annotate_version(
            AnnotateRequest.model_validate({"fileName": "logo.png", "format": "png", "current": IMAGE}),
            model_factory=lambda **_: None,
        )
