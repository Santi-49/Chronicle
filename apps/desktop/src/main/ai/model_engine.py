"""Model-agnostic LangChain operations used by the Chronicle AI service.

This module is the only place that touches LangChain. Everything else in the
package works with plain Python objects so that tests can inject fakes without
patching import machinery.

Two public coroutines:
  annotate_version  — first-version description or diff between two images.
  embed_text        — semantic-search vector for a text snippet.

Both accept an optional factory argument so unit tests can inject a fake model
without any monkey-patching.
"""

from typing import Any, Callable

from langchain.chat_models import init_chat_model
from langchain.embeddings import init_embeddings

from .prompts import load_annotation_prompt
from .schemas import (
    AnnotateRequest,
    EmbedTextRequest,
    EmbedTextResponse,
    ImageInput,
    VersionAnnotation,
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _data_url(image: ImageInput) -> str:
    """Build a data-URL that every LangChain provider understands.

    LangChain's universal multimodal content item for images uses the
    ``image_url`` type with a ``data:<media_type>;base64,<data>`` URL.  This
    avoids provider-specific dict shapes and works with Gemini, Claude,
    OpenAI, and watsonx out of the box.
    """
    return f"data:{image.media_type};base64,{image.base64}"


def _image_block(image: ImageInput) -> dict[str, Any]:
    """Return a LangChain-compatible multimodal content block for one image."""
    return {
        "type": "image_url",
        "image_url": {"url": _data_url(image)},
    }


# ---------------------------------------------------------------------------
# annotate_version
# ---------------------------------------------------------------------------


async def annotate_version(
    request: AnnotateRequest,
    model_factory: Callable[..., Any] = init_chat_model,
) -> VersionAnnotation:
    """Describe a first version or compare the previous and current images.

    When ``request.previous`` is ``None`` the model receives the first-version
    description prompt and a single image.  Otherwise it receives the diff
    prompt, the previous image, and then the current image — order matters so
    the model can reason about direction of change.

    Args:
        request: Validated ``AnnotateRequest`` with provider credentials,
            file name, and one or two images encoded as base64.
        model_factory: Injectable factory (default: ``init_chat_model``).
            Unit tests pass a fake so no real API call is made.

    Returns:
        A ``VersionAnnotation`` with ``summary``, ``changes``, ``tags``, and
        optional ``confidence``, validated against the C3 output schema.
    """
    model = model_factory(
        model=request.model,
        model_provider=request.provider,
        api_key=request.api_key.get_secret_value(),
        temperature=0,
    )
    # with_structured_output tells LangChain to parse the model's response
    # into the supplied Pydantic schema.  The returned object is already a
    # VersionAnnotation instance when the call succeeds.
    structured_model = model.with_structured_output(VersionAnnotation)

    system_prompt, user_prompt = load_annotation_prompt(
        file_name=request.file_name,
        is_first_version=request.previous is None,
    )

    # Build the multimodal user message content.
    # Text must come first so the model reads the instruction before images.
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

    # with_structured_output returns a VersionAnnotation instance when the
    # model honours the schema.  model_validate handles both the instance path
    # (real provider) and the dict path (test fakes that return plain dicts).
    if isinstance(raw, VersionAnnotation):
        return raw
    return VersionAnnotation.model_validate(raw)


# ---------------------------------------------------------------------------
# embed_text
# ---------------------------------------------------------------------------


async def embed_text(
    request: EmbedTextRequest,
    embeddings_factory: Callable[..., Any] = init_embeddings,
) -> EmbedTextResponse:
    """Create one semantic-search vector using LangChain's standard interface.

    Args:
        request: Validated ``EmbedTextRequest`` with provider credentials and
            the text to embed.
        embeddings_factory: Injectable factory (default: ``init_embeddings``).
            Unit tests pass a fake so no real API call is made.

    Returns:
        An ``EmbedTextResponse`` with the vector, provider/model identity, and
        dimension count.
    """
    embeddings = embeddings_factory(
        model=request.model,
        provider=request.provider,
        api_key=request.api_key.get_secret_value(),
    )
    vector: list[float] = await embeddings.aembed_query(request.text)
    return EmbedTextResponse(
        embedding=vector,
        provider=request.provider,
        model=request.model,
        dimensions=len(vector),
    )
