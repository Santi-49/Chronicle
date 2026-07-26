"""Chronicle's local, loopback-only Python AI service."""

from .main import app
from .engine import annotate_version, embed_text, embed_texts
from .schemas import AnnotateRequest, EmbedTextRequest, EmbedTextsRequest, VersionAnnotation

__all__ = [
    "AnnotateRequest",
    "EmbedTextRequest",
    "EmbedTextsRequest",
    "VersionAnnotation",
    "annotate_version",
    "app",
    "embed_text",
    "embed_texts",
]
