"""Per-format annotation adapters.

The C3 ``format`` field selects an adapter here; nothing else in the service
branches on a file type. An adapter declares the media type its inputs carry,
which prompt wording to use, and — optionally — a local preparation step that
turns opaque bytes into provider-safe evidence (structure plus at most a derived
preview image), so proprietary container bytes never reach the provider.

Adding a format: add one ``FormatAdapter`` below, add its prompt sections to
``packages/prompts/version-annotation.md``, and widen the ``SupportedFormat``
literal in ``schemas.py``. The desktop app keeps that format's annotation jobs
queued until this registry accepts it (see /capabilities).
"""

from __future__ import annotations

from dataclasses import dataclass
from functools import lru_cache
from typing import Callable, Protocol, Sequence


class PreparedAnnotation(Protocol):
    """Local evidence an adapter produces for the provider call."""

    @property
    def context(self) -> str: ...

    @property
    def images(self) -> Sequence[object]: ...

    @property
    def confidence_limit(self) -> float | None: ...


@dataclass(frozen=True)
class FormatAdapter:
    """Everything the annotation pipeline needs to know about one format."""

    format: str
    #: Media type the C3 input must carry for this format.
    media_type: str
    #: Prompt operation prefix in packages/prompts/version-annotation.md.
    prompt_operation: str
    #: Local extraction step, or None to send the original bytes as an image.
    prepare: Callable[..., PreparedAnnotation] | None = None


def _image_adapter(format_name: str, media_type: str) -> FormatAdapter:
    """Formats a vision model reads directly: no local extraction needed."""

    return FormatAdapter(format=format_name, media_type=media_type, prompt_operation="")


@lru_cache(maxsize=1)
def _registry() -> dict[str, FormatAdapter]:
    # Adapter modules are imported on first use, not at module import time:
    # they depend on the request schemas, which in turn read this registry.
    from .future_formats import (
        prepare_blend_annotation,
        prepare_obj_annotation,
        prepare_step_annotation,
        prepare_svg_annotation,
    )
    from .psd_adapter import prepare_psd_annotation
    from .psd_adapter import prepare_psb_annotation

    return {
        "png": _image_adapter("png", "image/png"),
        "jpg": _image_adapter("jpg", "image/jpeg"),
        "jpeg": _image_adapter("jpeg", "image/jpeg"),
        "psd": FormatAdapter(
            format="psd",
            media_type="image/vnd.adobe.photoshop",
            prompt_operation="PSD ",
            prepare=prepare_psd_annotation,
        ),
        "psb": FormatAdapter(
            format="psb",
            media_type="image/vnd.adobe.photoshop",
            prompt_operation="PSB ",
            prepare=prepare_psb_annotation,
        ),
        "svg": FormatAdapter(
            format="svg",
            media_type="image/svg+xml",
            prompt_operation="SVG ",
            prepare=prepare_svg_annotation,
        ),
        "blend": FormatAdapter(
            format="blend",
            media_type="application/x-blender",
            prompt_operation="BLEND ",
            prepare=prepare_blend_annotation,
        ),
        "obj": FormatAdapter(
            format="obj",
            media_type="model/obj",
            prompt_operation="OBJ ",
            prepare=prepare_obj_annotation,
        ),
        "step": FormatAdapter(
            format="step",
            media_type="model/step",
            prompt_operation="STEP ",
            prepare=prepare_step_annotation,
        ),
    }


def adapter_for(format_name: str) -> FormatAdapter | None:
    """The adapter for a format, or None when the service cannot annotate it."""

    return _registry().get(format_name)


def supported_formats() -> tuple[str, ...]:
    """Formats this build can annotate, in declaration order (/capabilities)."""

    return tuple(_registry())


def media_types() -> tuple[str, ...]:
    """Media types accepted across every registered format."""

    return tuple(dict.fromkeys(adapter.media_type for adapter in _registry().values()))
