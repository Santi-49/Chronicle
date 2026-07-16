"""C7 — Functional boundary between the control plane and challenge module.

This contract defines supported operations, their purpose, and their data
formats. It does not prescribe prompts, models, tools, orchestration, retries,
storage, or implementation classes. The gateway implementation is deferred
until stretch feature F9 is researched and started.
"""

from typing import Literal, Protocol, TypedDict


class ImageInput(TypedDict):
    base64: str
    media_type: Literal["image/png", "image/jpeg"]


class AnnotateInput(TypedDict):
    file_name: str
    previous: ImageInput | None
    current: ImageInput


class AnnotateOutput(TypedDict):
    summary: str
    changes: list[str]
    tags: list[str]


class ModuleContract(Protocol):
    """Operations exposed by the optional hosted AI gateway."""

    async def annotate_version(self, input: AnnotateInput) -> AnnotateOutput: ...

    async def embed_text(self, text: str) -> list[float]: ...
