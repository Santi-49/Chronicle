"""Model-agnostic LangChain operations used by the Chronicle AI service.

This module is the only place that touches LangChain. Everything else in the
package works with plain Python objects so that tests can inject fakes without
patching import machinery.

Two public coroutines:
  annotate_version  — first-version description or diff between two images.
  embed_text        — semantic-search vector for a text snippet.

Both resolve provider/model/key from the request, falling back to the
environment defaults (chronicle_ai.config), attach the provider-reported token
usage, and estimate the call's cost from the per-task prices. Both accept an
optional factory argument so unit tests can inject a fake model.
"""

from typing import Any, Callable

from langchain.chat_models import init_chat_model
from langchain.embeddings import init_embeddings

from .config import TaskConfig, load_config
from .prompts import load_annotation_prompt
from .schemas import (
    AnnotateRequest,
    AnnotateResponse,
    CostEstimate,
    EmbedTextRequest,
    EmbedTextResponse,
    ImageInput,
    TokenUsage,
    ValidateProviderModelRequest,
    VersionAnnotation,
)


class ConfigurationError(Exception):
    """No provider/model/key was supplied by the request or the environment."""


# ---------------------------------------------------------------------------
# Shared helpers
# ---------------------------------------------------------------------------


def _resolve(request_value: str | None, default: str | None, what: str) -> str:
    value = request_value or default
    if not value:
        raise ConfigurationError(
            f"No {what} configured. Pass it in the request or set the "
            f"CHRONICLE_AI_* environment defaults."
        )
    return value


def _data_url(image: ImageInput) -> str:
    """Build a data-URL that every LangChain provider understands.

    LangChain's universal multimodal content item for images uses the
    ``image_url`` type with a ``data:<media_type>;base64,<data>`` URL, which
    works across providers out of the box.
    """
    return f"data:{image.media_type};base64,{image.base64}"


def _image_block(image: ImageInput) -> dict[str, Any]:
    """Return a LangChain-compatible multimodal content block for one image."""
    return {"type": "image_url", "image_url": {"url": _data_url(image)}}


def _usage_from_message(message: Any) -> TokenUsage | None:
    """Read ``usage_metadata`` from a LangChain AIMessage, if present."""
    meta = getattr(message, "usage_metadata", None)
    if not meta:
        return None
    return TokenUsage(
        input_tokens=meta.get("input_tokens"),
        output_tokens=meta.get("output_tokens"),
        total_tokens=meta.get("total_tokens"),
    )


def _estimate_cost(usage: TokenUsage | None, pricing: TaskConfig) -> CostEstimate | None:
    """Estimate USD cost from token usage and the per-million-token prices."""
    if usage is None:
        return None
    input_usd = (usage.input_tokens or 0) / 1_000_000 * pricing.input_price_per_m
    output_usd = (usage.output_tokens or 0) / 1_000_000 * pricing.output_price_per_m
    return CostEstimate(
        input_usd=round(input_usd, 6),
        output_usd=round(output_usd, 6),
        total_usd=round(input_usd + output_usd, 6),
    )


def _parse_structured(raw: Any) -> tuple[VersionAnnotation, TokenUsage | None]:
    """Normalise ``with_structured_output`` results into (annotation, usage).

    Handles three shapes:
      * ``include_raw=True`` dict → {"raw": AIMessage, "parsed": VersionAnnotation}
      * a ``VersionAnnotation`` instance (some providers / test fakes)
      * a plain dict of annotation fields (test fakes)
    """
    if isinstance(raw, dict) and "parsed" in raw:
        parsed = raw["parsed"]
        annotation = (
            parsed
            if isinstance(parsed, VersionAnnotation)
            else VersionAnnotation.model_validate(parsed)
        )
        return annotation, _usage_from_message(raw.get("raw"))
    if isinstance(raw, VersionAnnotation):
        return raw, None
    return VersionAnnotation.model_validate(raw), None


# ---------------------------------------------------------------------------
# annotate_version
# ---------------------------------------------------------------------------


async def annotate_version(
    request: AnnotateRequest,
    model_factory: Callable[..., Any] = init_chat_model,
) -> AnnotateResponse:
    """Describe a first version or compare the previous and current images.

    Provider/model/key come from the request, falling back to the environment
    defaults. The response carries the C3 annotation plus the call's token
    usage and estimated cost.
    """
    config = load_config()
    provider = _resolve(request.provider, config.provider, "provider")
    model_name = _resolve(request.model, config.annotate.model, "model")
    api_key = _resolve(
        request.api_key.get_secret_value() if request.api_key else None,
        config.api_key,
        "API key",
    )

    model = model_factory(
        model=model_name,
        model_provider=provider,
        api_key=api_key,
        temperature=0,
    )
    # include_raw keeps the underlying AIMessage so we can read usage_metadata;
    # with_structured_output otherwise returns only the parsed object.
    structured_model = model.with_structured_output(VersionAnnotation, include_raw=True)

    system_prompt, user_prompt = load_annotation_prompt(
        file_name=request.file_name,
        is_first_version=request.previous is None,
    )

    # Text first so the model reads the instruction before the image(s).
    content: list[dict[str, Any]] = [{"type": "text", "text": user_prompt}]
    if request.previous is not None:
        content.append(_image_block(request.previous))
    content.append(_image_block(request.current))

    raw = await structured_model.ainvoke(
        [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": content},
        ]
    )

    annotation, usage = _parse_structured(raw)
    cost = _estimate_cost(usage, config.annotate)
    return AnnotateResponse(**annotation.model_dump(), usage=usage, cost=cost)


# ---------------------------------------------------------------------------
# embed_text
# ---------------------------------------------------------------------------


async def embed_text(
    request: EmbedTextRequest,
    embeddings_factory: Callable[..., Any] = init_embeddings,
) -> EmbedTextResponse:
    """Create one semantic-search vector using LangChain's standard interface.

    Provider/model/key resolve the same way as annotation. Token usage is
    attached only when the provider exposes it (the standard embedding
    interface usually does not, so ``usage``/``cost`` are typically null).
    """
    config = load_config()
    provider = _resolve(request.provider, config.provider, "provider")
    model_name = _resolve(request.model, config.embed.model, "model")
    api_key = _resolve(
        request.api_key.get_secret_value() if request.api_key else None,
        config.api_key,
        "API key",
    )

    embeddings = embeddings_factory(
        model=model_name,
        provider=provider,
        api_key=api_key,
    )
    vector: list[float] = await embeddings.aembed_query(request.text)
    usage = _usage_from_message(embeddings)  # None unless the object reports it
    return EmbedTextResponse(
        embedding=vector,
        provider=provider,
        model=model_name,
        dimensions=len(vector),
        usage=usage,
        cost=_estimate_cost(usage, config.embed),
    )


# A real one-pixel PNG lets validation prove that chat models support the
# multimodal path Chronicle uses, not merely text completion.
_VALIDATION_PNG = (
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII="
)


async def validate_provider_model(
    request: ValidateProviderModelRequest,
    model_factory: Callable[..., Any] = init_chat_model,
    embeddings_factory: Callable[..., Any] = init_embeddings,
) -> None:
    """Make a minimal real provider call for the selected Chronicle task."""

    common = {
        "provider": request.provider,
        "model": request.model,
        "apiKey": request.api_key.get_secret_value(),
    }
    if request.task == "embeddings":
        await embed_text(
            EmbedTextRequest.model_validate({**common, "text": "Chronicle configuration check"}),
            embeddings_factory=embeddings_factory,
        )
        return

    await annotate_version(
        AnnotateRequest.model_validate(
            {
                **common,
                "fileName": "configuration-check.png",
                "previous": None,
                "current": {"base64": _VALIDATION_PNG, "mediaType": "image/png"},
            }
        ),
        model_factory=model_factory,
    )
