"""Chronicle's local, loopback-only Python AI service."""

from .main import app
from .engine import annotate_version, embed_text
from .schemas import AnnotateRequest, EmbedTextRequest, VersionAnnotation

__all__ = [
    "AnnotateRequest",
    "EmbedTextRequest",
    "VersionAnnotation",
    "annotate_version",
    "app",
    "embed_text",
]
