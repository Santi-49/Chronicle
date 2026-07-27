"""End-to-end annotation tests for the selected future creative formats."""

from __future__ import annotations

import base64
import gzip
from io import BytesIO
from typing import Any

import pytest
from PIL import Image
from psd_tools import PSDImage

from chronicle_ai.engine import annotate_version
from chronicle_ai.formats import ExtractionError
from chronicle_ai.future_formats import (
    extract_blend,
    extract_svg,
    prepare_blend_annotation,
    prepare_obj_annotation,
    prepare_svg_annotation,
)
from chronicle_ai.prompts import load_annotation_prompt
from chronicle_ai.schemas import AnnotateRequest, ImageInput, VersionAnnotation


class FakeStructuredModel:
    def __init__(self, result: dict[str, Any]) -> None:
        self.result = result
        self.messages: list[dict[str, Any]] | None = None

    async def ainvoke(self, messages: list[dict[str, Any]]) -> dict[str, Any]:
        self.messages = messages
        return self.result


class FakeChatModel:
    def __init__(self, structured: FakeStructuredModel) -> None:
        self.structured = structured

    def with_structured_output(self, _schema: type[Any], **_kwargs: Any) -> FakeStructuredModel:
        return self.structured


def _make_factory(result: dict[str, Any]) -> tuple[Any, FakeStructuredModel]:
    structured = FakeStructuredModel(result)
    chat_model = FakeChatModel(structured)
    return lambda **_: chat_model, structured


def _annotation_result() -> dict[str, Any]:
    return {
        "summary": "The file changed in a factual way.",
        "changes": ["Structure changed"],
        "tags": ["creative", "version", "change"],
        "confidence": 0.98,
    }


def _request(
    *,
    file_name: str,
    format_name: str,
    media_type: str,
    current_bytes: bytes,
    previous_bytes: bytes | None = None,
) -> AnnotateRequest:
    payload: dict[str, Any] = {
        "provider": "test-provider",
        "model": "test-chat-model",
        "apiKey": "test-key",
        "fileName": file_name,
        "format": format_name,
        "previous": None,
        "current": {
            "base64": base64.b64encode(current_bytes).decode("ascii"),
            "mediaType": media_type,
            "format": format_name,
        },
    }
    if previous_bytes is not None:
        payload["previous"] = {
            "base64": base64.b64encode(previous_bytes).decode("ascii"),
            "mediaType": media_type,
            "format": format_name,
        }
    return AnnotateRequest.model_validate(payload)


def _jpeg_preview(color: tuple[int, int, int]) -> bytes:
    image = Image.new("RGB", (48, 48), color)
    output = BytesIO()
    image.save(output, format="JPEG", quality=88, optimize=True)
    return output.getvalue()


def _make_psd_bytes(*, color: tuple[int, int, int, int], second_layer: bool = False) -> bytes:
    document = PSDImage.new("RGB", (160, 100), color=(255, 255, 255))
    document.create_pixel_layer(Image.new("RGBA", (80, 40), color), name="Hero", top=20, left=30)
    if second_layer:
        document.create_pixel_layer(
            Image.new("RGBA", (24, 24), (0, 0, 255, 255)),
            name="Badge",
            top=8,
            left=120,
        )
    output = BytesIO()
    document.save(output)
    return output.getvalue()


def _make_psb_bytes(*, color: tuple[int, int, int, int], second_layer: bool = False) -> bytes:
    data = bytearray(_make_psd_bytes(color=color, second_layer=second_layer))
    data[4:6] = b"\x00\x02"
    return bytes(data)


def _make_svg_bytes(*, fill: str, label: str) -> bytes:
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" width="160" height="100" viewBox="0 0 160 100">'
        f'<rect id="background" x="0" y="0" width="160" height="100" fill="white"/>'
        f'<rect id="banner" x="16" y="16" width="128" height="52" fill="{fill}"/>'
        f'<text id="headline" x="24" y="50">{label}</text>'
        f"</svg>"
    ).encode("utf-8")


def _make_obj_bytes(*, badge: bool = False) -> bytes:
    lines = [
        "o Chronicle",
        "v 0 0 0",
        "v 1 0 0",
        "v 1 1 0",
        "v 0 1 0",
        "f 1 2 3 4",
    ]
    if badge:
        lines.extend(
            [
                "g badge",
                "v 0.3 0.3 0.5",
                "v 0.7 0.3 0.5",
                "v 0.5 0.7 0.5",
                "f 5 6 7",
            ]
        )
    return ("\n".join(lines) + "\n").encode("utf-8")


def _make_obj_with_top_bar(*, top_bar: bool) -> bytes:
    lines = [
        "o MainBody",
        "v 0 0 0",
        "v 1 0 0",
        "v 1 1 0",
        "v 0 1 0",
        "v 0 0 1",
        "v 1 0 1",
        "v 1 1 1",
        "v 0 1 1",
        "f 1 2 3 4",
        "f 5 8 7 6",
        "f 1 5 6 2",
        "f 2 6 7 3",
        "f 3 7 8 4",
        "f 5 1 4 8",
    ]
    if top_bar:
        lines.extend(
            [
                "g rail",
                "v 0.15 1.05 0.35",
                "v 0.85 1.05 0.35",
                "v 0.85 1.2 0.35",
                "v 0.15 1.2 0.35",
                "v 0.15 1.05 0.65",
                "v 0.85 1.05 0.65",
                "v 0.85 1.2 0.65",
                "v 0.15 1.2 0.65",
                "f 9 10 11 12",
                "f 13 16 15 14",
                "f 9 13 14 10",
                "f 10 14 15 11",
                "f 11 15 16 12",
                "f 13 9 12 16",
            ]
        )
    return ("\n".join(lines) + "\n").encode("utf-8")


def _make_step_bytes(*, schema: str, offset: float) -> bytes:
    return (
        "ISO-10303-21;\n"
        "HEADER;\n"
        "FILE_DESCRIPTION(('Chronicle fixture'),'2;1');\n"
        f"FILE_NAME('sample.step','2026-07-26',('Chronicle'),('Chronicle'),'','','');\n"
        f"FILE_SCHEMA(('{schema}'));\n"
        "ENDSEC;\n"
        "DATA;\n"
        f"#1=CARTESIAN_POINT('',({0.0 + offset},{0.0},{0.0}));\n"
        f"#2=CARTESIAN_POINT('',({1.0 + offset},{0.0},{0.0}));\n"
        f"#3=CARTESIAN_POINT('',({1.0 + offset},{1.0},{1.0}));\n"
        "#4=ADVANCED_FACE('',(),#5,.T.);\n"
        "ENDSEC;\n"
        "END-ISO-10303-21;\n"
    ).encode("utf-8")


def _blend_block(code: bytes, body: bytes) -> bytes:
    """One 64-bit little-endian file-block: code, length, address, SDNA, count."""

    return (
        code
        + len(body).to_bytes(4, "little")
        + (0).to_bytes(8, "little")
        + (0).to_bytes(4, "little")
        + (1).to_bytes(4, "little")
        + body
    )


def _make_blend_bytes(
    *,
    color: tuple[int, int, int],
    version: str,
    thumbnail: bool = True,
    compression: str | None = None,
    edge: int = 24,
) -> bytes:
    """A .blend carrying the RGBA `TEST` thumbnail block Blender writes.

    Blender stores that image bottom row first, so the *last* rows written here
    are the ones that should appear at the top. The fixture writes the bright
    band last for exactly that reason: a decoder that forgets to flip returns a
    visibly different image and the orientation assertion fails.

    Blender's *Compress* option wraps the whole file in one gzip (older) or
    Zstandard (3.0+) stream, which is why `compression` exists here — the first
    implementation only accepted the raw magic and rejected every compressed save.
    """

    blocks = b""
    if thumbnail:
        rows = []
        for row in range(edge):
            # File order is bottom-up: dark half first, bright half last.
            shade = tuple(value // 2 for value in color) if row < edge // 2 else color
            rows.append(bytes(shade + (255,)) * edge)
        body = edge.to_bytes(4, "little") + edge.to_bytes(4, "little") + b"".join(rows)
        blocks += _blend_block(b"TEST", body)
    blocks += _blend_block(b"ENDB", b"")

    raw = b"BLENDER" + version.encode("ascii") + blocks
    if compression == "gzip":
        return gzip.compress(raw)
    if compression == "zstandard":
        import zstandard

        return zstandard.ZstdCompressor().compress(raw)
    return raw


def _blend_input(data: bytes) -> ImageInput:
    return ImageInput.model_validate(
        {
            "base64": base64.b64encode(data).decode("ascii"),
            "mediaType": "application/x-blender",
            "format": "blend",
        }
    )


CASE_DATA = {
    "psd": {
        "media_type": "image/vnd.adobe.photoshop",
        "previous": _make_psd_bytes(color=(255, 0, 0, 255)),
        "current": _make_psd_bytes(color=(0, 128, 255, 255), second_layer=True),
        "has_preview": True,
    },
    "psb": {
        "media_type": "image/vnd.adobe.photoshop",
        "previous": _make_psb_bytes(color=(255, 0, 0, 255)),
        "current": _make_psb_bytes(color=(0, 128, 255, 255), second_layer=True),
        "has_preview": True,
    },
    "svg": {
        "media_type": "image/svg+xml",
        "previous": _make_svg_bytes(fill="#d33", label="Alpha"),
        "current": _make_svg_bytes(fill="#1177cc", label="Beta"),
        "has_preview": True,
    },
    "blend": {
        "media_type": "application/x-blender",
        # Compressed on both sides, because that is what Blender's Compress
        # option produces and what real demo files turned out to be.
        "previous": _make_blend_bytes(color=(255, 128, 128), version="-v293", compression="gzip"),
        "current": _make_blend_bytes(color=(128, 160, 255), version="-v403", compression="gzip"),
        "has_preview": True,
    },
    "obj": {
        "media_type": "model/obj",
        "previous": _make_obj_bytes(badge=False),
        "current": _make_obj_bytes(badge=True),
        "has_preview": True,
    },
    "step": {
        "media_type": "model/step",
        "previous": _make_step_bytes(schema="CONFIG_CONTROL_DESIGN", offset=0.0),
        "current": _make_step_bytes(schema="AUTOMOTIVE_DESIGN", offset=0.4),
        "has_preview": False,
    },
}


@pytest.mark.parametrize("format_name", sorted(CASE_DATA))
@pytest.mark.asyncio
async def test_future_formats_annotate_first_version(format_name: str) -> None:
    case = CASE_DATA[format_name]
    factory, structured = _make_factory(_annotation_result())
    request = _request(
        file_name=f"sample.{format_name}",
        format_name=format_name,
        media_type=case["media_type"],
        current_bytes=case["current"],
    )

    result = await annotate_version(request, model_factory=factory)

    assert isinstance(result, VersionAnnotation)
    assert result.summary == "The file changed in a factual way."
    assert result.confidence == (0.75 if format_name == "psb" else 0.98)
    assert structured.messages is not None
    content = structured.messages[1]["content"]
    image_blocks = [block for block in content if block["type"] == "image_url"]
    assert len(image_blocks) == (1 if case["has_preview"] else 0)


@pytest.mark.parametrize("format_name", sorted(CASE_DATA))
@pytest.mark.asyncio
async def test_future_formats_annotate_diffs(format_name: str) -> None:
    case = CASE_DATA[format_name]
    factory, structured = _make_factory(_annotation_result())
    request = _request(
        file_name=f"sample.{format_name}",
        format_name=format_name,
        media_type=case["media_type"],
        previous_bytes=case["previous"],
        current_bytes=case["current"],
    )

    result = await annotate_version(request, model_factory=factory)

    assert isinstance(result, VersionAnnotation)
    assert result.changes == ["Structure changed"]
    assert result.tags == ["creative", "version", "change"]
    assert result.confidence == (0.75 if format_name == "psb" else 0.98)
    assert structured.messages is not None
    content = structured.messages[1]["content"]
    image_blocks = [block for block in content if block["type"] == "image_url"]
    assert len(image_blocks) == (1 if case["has_preview"] else 0)
    assert "Deterministic local" in content[0]["text"]


def test_obj_diff_supplies_compact_artist_facing_spatial_hints() -> None:
    previous = _request(
        file_name="model.obj",
        format_name="obj",
        media_type="model/obj",
        current_bytes=_make_obj_with_top_bar(top_bar=False),
    ).current
    current = _request(
        file_name="model.obj",
        format_name="obj",
        media_type="model/obj",
        current_bytes=_make_obj_with_top_bar(top_bar=True),
    ).current

    prepared = prepare_obj_annotation(previous, current)

    assert len(prepared.images) == 1
    assert len(prepared.context) < 3_000
    assert '"document":' not in prepared.context
    assert '"addedGeometry"' in prepared.context
    assert '"shapeHint":"elongated rectangular form"' in prepared.context
    assert '"relativePosition":"above the main form, near the center"' in prepared.context


def test_obj_prompt_prioritises_artist_language_over_mesh_jargon() -> None:
    system, user = load_annotation_prompt(
        "model.obj",
        is_first_version=False,
        operation_prefix="OBJ ",
    )

    assert "Write for the artist" in system
    assert "Do not expose" in system
    assert "no more than three distinct changes" in system
    assert "Prioritize visible shape, placement, proportion" in user
    assert "omit them from artist-facing prose" in " ".join(user.split())


def test_svg_diff_combines_compact_structure_with_one_safe_preview() -> None:
    previous = _request(
        file_name="campaign.svg",
        format_name="svg",
        media_type="image/svg+xml",
        current_bytes=_make_svg_bytes(fill="#d33", label="Alpha"),
    ).current
    current = _request(
        file_name="campaign.svg",
        format_name="svg",
        media_type="image/svg+xml",
        current_bytes=_make_svg_bytes(fill="#1177cc", label="Beta"),
    ).current

    prepared = prepare_svg_annotation(previous, current)
    evidence = extract_svg(current)

    assert evidence.preview is not None
    assert evidence.preview.size == (1024, 1024)
    assert len(prepared.images) == 1
    assert len(prepared.context) < 3_000
    assert '"document":' not in prepared.context
    assert "#d33" in prepared.context
    assert "#1177cc" in prepared.context
    assert "Alpha" in prepared.context
    assert "Beta" in prepared.context


def test_svg_preview_ignores_external_and_executable_content() -> None:
    source = _request(
        file_name="safe.svg",
        format_name="svg",
        media_type="image/svg+xml",
        current_bytes=(
            b'<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100">'
            b'<rect x="5" y="5" width="40" height="40" fill="blue"/>'
            b'<image href="https://example.invalid/tracker.png" width="100" height="100"/>'
            b'<script>throw new Error("must not run")</script>'
            b"</svg>"
        ),
    ).current

    evidence = extract_svg(source)

    assert evidence.preview is not None
    assert any("image content was not rendered" in warning for warning in evidence.warnings)


def test_svg_preview_renders_common_path_curves_without_a_browser() -> None:
    source = _request(
        file_name="mark.svg",
        format_name="svg",
        media_type="image/svg+xml",
        current_bytes=(
            b'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">'
            b'<path d="M10 70 C20 10 80 10 90 70 L50 90 Z" fill="#ff6b00"/>'
            b"</svg>"
        ),
    ).current

    evidence = extract_svg(source)

    assert evidence.preview is not None
    assert not any("path content was not rendered" in warning for warning in evidence.warnings)
    assert evidence.preview.getbbox() is not None


def test_svg_prompt_prioritises_visible_change_over_xml_jargon() -> None:
    system, user = load_annotation_prompt(
        "campaign.svg",
        is_first_version=False,
        operation_prefix="SVG ",
    )

    normalized = " ".join(user.split())
    assert "Write for the artist" in system
    assert "Lead with the visible result" in normalized
    assert "do not expose raw path commands" in normalized
    assert "Verify structural facts against the comparison preview" in normalized


# ---------------------------------------------------------------------------
# BLEND extraction
#
# Blender's Compress option stores the whole file as one gzip or Zstandard
# stream, so a saved .blend frequently does not begin with the BLENDER magic.
# The first implementation required that magic and scavenged the file for any
# embedded PNG/JPEG, which failed every compressed save outright and could have
# presented an unrelated packed texture as the scene thumbnail.
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("compression", [None, "gzip", "zstandard"])
def test_extract_blend_reads_the_thumbnail_however_the_file_is_stored(compression) -> None:
    data = _make_blend_bytes(color=(200, 60, 40), version="-v403", compression=compression)
    evidence = extract_blend(_blend_input(data))

    assert evidence.metadata["blenderVersion"] == "403"
    assert evidence.metadata["compression"] == (compression or "none")
    assert evidence.metadata["hasThumbnail"] is True
    assert evidence.preview is not None
    assert evidence.preview.size == (24, 24)
    # Blender writes the image bottom row first, so the band written last must
    # come back at the top rather than mirrored to the bottom.
    top = evidence.preview.convert("RGB").getpixel((12, 2))
    bottom = evidence.preview.convert("RGB").getpixel((12, 21))
    assert sum(top) > sum(bottom)
    assert evidence.warnings == ()


def test_extract_blend_without_a_thumbnail_warns_instead_of_failing() -> None:
    data = _make_blend_bytes(color=(0, 0, 0), version="-v403", thumbnail=False)
    evidence = extract_blend(_blend_input(data))

    assert evidence.preview is None
    assert evidence.metadata["hasThumbnail"] is False
    assert any("no embedded thumbnail" in warning for warning in evidence.warnings)


def test_extract_blend_refuses_an_implausible_thumbnail_size() -> None:
    """A declared size is never trusted enough to allocate from."""

    body = (40_000).to_bytes(4, "little") + (40_000).to_bytes(4, "little") + b"\x00" * 16
    data = b"BLENDER-v403" + _blend_block(b"TEST", body) + _blend_block(b"ENDB", b"")
    evidence = extract_blend(_blend_input(data))

    assert evidence.preview is None
    assert any("could not be decoded" in warning for warning in evidence.warnings)


@pytest.mark.parametrize(
    "data",
    [b"not a blend file at all", gzip.compress(b"decompresses but is not a blend")],
    ids=["garbage", "compressed-non-blend"],
)
def test_extract_blend_rejects_unreadable_bytes(data: bytes) -> None:
    with pytest.raises(ExtractionError):
        extract_blend(_blend_input(data))


def test_blend_confidence_is_capped_only_when_evidence_is_degraded() -> None:
    """The cap has to mean "partial evidence", not "this format"."""

    complete = prepare_blend_annotation(
        None, _blend_input(_make_blend_bytes(color=(10, 20, 30), version="-v403"))
    )
    degraded = prepare_blend_annotation(
        None,
        _blend_input(_make_blend_bytes(color=(10, 20, 30), version="-v403", thumbnail=False)),
    )

    assert complete.confidence_limit is None
    assert len(complete.images) == 1
    assert degraded.confidence_limit == 0.65
    assert degraded.images == ()
    # The coverage boundary is still stated, cap or no cap.
    assert "scene itself is never opened" in complete.context
