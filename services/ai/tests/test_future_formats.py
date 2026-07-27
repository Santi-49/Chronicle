"""End-to-end annotation tests for the selected future creative formats."""

from __future__ import annotations

import base64
from io import BytesIO
from typing import Any

import pytest
from PIL import Image
from psd_tools import PSDImage

from chronicle_ai.engine import annotate_version
from chronicle_ai.schemas import AnnotateRequest, VersionAnnotation


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


def _make_blend_bytes(*, color: tuple[int, int, int], version: str) -> bytes:
    preview = _jpeg_preview(color)
    return b"BLENDER" + version.encode("ascii") + preview


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
        "has_preview": False,
    },
    "blend": {
        "media_type": "application/x-blender",
        "previous": _make_blend_bytes(color=(255, 128, 128), version="-v293"),
        "current": _make_blend_bytes(color=(128, 160, 255), version="-v300"),
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
