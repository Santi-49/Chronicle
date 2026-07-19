"""Small LangChain operations used by the temporary FastAPI service."""

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


def _image_block(image: ImageInput) -> dict[str, str]:
    """Build LangChain's provider-neutral multimodal image block."""

    return {
        "type": "image",
        "base64": image.base64,
        "mime_type": image.media_type,
    }


async def annotate_version(
    request: AnnotateRequest,
    model_factory: Callable[..., Any] = init_chat_model,
) -> VersionAnnotation:
    """Describe a first version or compare the previous and current images."""

    model = model_factory(
        model=request.model,
        model_provider=request.provider,
        api_key=request.api_key.get_secret_value(),
        temperature=0,
    )
    structured_model = model.with_structured_output(VersionAnnotation)
    system_prompt, user_prompt = load_annotation_prompt(
        file_name=request.file_name,
        is_first_version=request.previous is None,
    )

    content: list[dict[str, str]] = [{"type": "text", "text": user_prompt}]
    # Image order matters: the model must see previous before current.
    if request.previous is not None:
        content.append(_image_block(request.previous))
    content.append(_image_block(request.current))

    result = await structured_model.ainvoke(
        [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": content},
        ]
    )
    return VersionAnnotation.model_validate(result)


async def embed_text(
    request: EmbedTextRequest,
    embeddings_factory: Callable[..., Any] = init_embeddings,
) -> EmbedTextResponse:
    """Create one semantic-search vector with LangChain's standard interface."""

    embeddings = embeddings_factory(
        model=request.model,
        provider=request.provider,
        api_key=request.api_key.get_secret_value(),
    )
    vector = await embeddings.aembed_query(request.text)
    return EmbedTextResponse(
        embedding=vector,
        provider=request.provider,
        model=request.model,
        dimensions=len(vector),
    )
