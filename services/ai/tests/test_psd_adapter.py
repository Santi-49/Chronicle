"""PSD extraction, compact diff, and provider-input tests for POST-02."""

import base64
from io import BytesIO
from typing import Any

from PIL import Image
import pytest
from psd_tools import PSDImage
from fastapi.testclient import TestClient

from chronicle_ai import routes
from chronicle_ai.engine import annotate_version
from chronicle_ai.main import app
from chronicle_ai.psd_adapter import (
    CONTACT_SHEET_SIZE,
    MAX_PREVIEW_EDGE,
    PsdExtractionError,
    extract_psd,
    prepare_psd_annotation,
)
from chronicle_ai.schemas import AnnotateRequest, ImageInput


def make_psd(
    *,
    layer_name: str = "Hero",
    color: tuple[int, int, int, int] = (255, 0, 0, 255),
    second_layer: bool = False,
    size: tuple[int, int] = (160, 100),
) -> bytes:
    document = PSDImage.new("RGB", size, color=(255, 255, 255))
    document.create_pixel_layer(
        Image.new("RGBA", (80, 40), color),
        name=layer_name,
        top=20,
        left=30,
    )
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


def psd_input(data: bytes) -> ImageInput:
    return ImageInput.model_validate(
        {
            "base64": base64.b64encode(data).decode("ascii"),
            "mediaType": "image/vnd.adobe.photoshop",
            "format": "psd",
        }
    )


def psd_request(previous: bytes | None, current: bytes) -> AnnotateRequest:
    return AnnotateRequest.model_validate(
        {
            "provider": "test-provider",
            "model": "test-model",
            "apiKey": "secret",
            "fileName": "campaign.psd",
            "format": "psd",
            "previous": (
                None
                if previous is None
                else psd_input(previous).model_dump(by_alias=True)
            ),
            "current": psd_input(current).model_dump(by_alias=True),
        }
    )


def test_extract_psd_reads_bounded_structure_and_composite() -> None:
    extracted = extract_psd(psd_input(make_psd(second_layer=True)))

    assert extracted.metadata == {
        "width": 160,
        "height": 100,
        "colorMode": "rgb",
        "depth": 8,
        "layerCount": 2,
    }
    assert [layer["path"] for layer in extracted.layers] == ["Hero", "Badge"]
    assert extracted.preview is not None
    assert max(extracted.preview.size) <= MAX_PREVIEW_EDGE


def test_first_version_sends_one_derived_jpeg_not_psd_bytes() -> None:
    original = make_psd()
    prepared = prepare_psd_annotation(None, psd_input(original))

    assert len(prepared.images) == 1
    preview = prepared.images[0]
    assert preview.media_type == "image/jpeg"
    assert preview.format == "jpeg"
    assert base64.b64decode(preview.base64) != original
    assert '"mode":"first-version"' in prepared.context


def test_visual_diff_uses_one_before_after_contact_sheet() -> None:
    prepared = prepare_psd_annotation(
        psd_input(make_psd(color=(255, 0, 0, 255))),
        psd_input(make_psd(color=(0, 128, 255, 255), second_layer=True)),
    )

    assert len(prepared.images) == 1
    sheet = Image.open(BytesIO(base64.b64decode(prepared.images[0].base64)))
    assert sheet.size == CONTACT_SHEET_SIZE
    assert '"change":"added","layer":"Badge"' in prepared.context


def test_structure_only_diff_omits_visual_tokens_when_composites_match() -> None:
    prepared = prepare_psd_annotation(
        psd_input(make_psd(layer_name="Old name")),
        psd_input(make_psd(layer_name="New name")),
    )

    assert prepared.images == ()
    assert "pixel-identical" in prepared.context
    assert '"change":"removed","layer":"Old name"' in prepared.context
    assert '"change":"added","layer":"New name"' in prepared.context


def test_corrupt_psd_is_rejected_without_exposing_parser_details() -> None:
    with pytest.raises(PsdExtractionError, match="corrupt or unsupported"):
        extract_psd(psd_input(b"not a PSD"))


def test_psd_over_safety_limit_is_rejected_before_parsing(monkeypatch) -> None:
    monkeypatch.setattr("chronicle_ai.psd_adapter.MAX_PSD_BYTES", 4)

    with pytest.raises(PsdExtractionError, match="50 MB safety limit"):
        extract_psd(psd_input(b"12345"))


def test_provider_evidence_has_a_hard_text_budget(monkeypatch) -> None:
    monkeypatch.setattr("chronicle_ai.psd_adapter.MAX_EVIDENCE_CHARS", 300)
    prepared = prepare_psd_annotation(
        None,
        psd_input(make_psd(second_layer=True)),
    )

    evidence = prepared.context.split("\n", 1)[1]
    assert len(evidence) <= 300
    assert '"contextTruncated":true' in evidence
    assert prepared.confidence_limit == 0.75


class FakeStructuredModel:
    def __init__(self) -> None:
        self.messages: list[dict[str, Any]] | None = None

    async def ainvoke(self, messages: list[dict[str, Any]]) -> dict[str, Any]:
        self.messages = messages
        return {
            "summary": "A blue badge was added.",
            "changes": ["Added the Badge layer"],
            "tags": ["badge", "blue", "photoshop"],
            "confidence": 0.9,
        }


class FakeChatModel:
    def __init__(self, structured: FakeStructuredModel) -> None:
        self.structured = structured

    def with_structured_output(
        self, _schema: type[Any], **_kwargs: Any
    ) -> FakeStructuredModel:
        return self.structured


@pytest.mark.asyncio
async def test_engine_dispatches_psd_to_compact_single_image_pipeline(monkeypatch) -> None:
    monkeypatch.setattr("chronicle_ai.psd_adapter.MAX_LAYER_RECORDS", 1)
    structured = FakeStructuredModel()
    result = await annotate_version(
        psd_request(
            make_psd(color=(255, 0, 0, 255)),
            make_psd(color=(0, 0, 255, 255), second_layer=True),
        ),
        model_factory=lambda **_: FakeChatModel(structured),
    )

    assert result.summary == "A blue badge was added."
    assert result.confidence == 0.75
    assert structured.messages is not None
    content = structured.messages[1]["content"]
    assert [block["type"] for block in content] == ["text", "image_url"]
    assert "Deterministic local PSD evidence" in content[0]["text"]
    assert content[1]["image_url"]["url"].startswith("data:image/jpeg;base64,")


def test_psd_diff_passes_through_running_fastapi_surface(monkeypatch) -> None:
    structured = FakeStructuredModel()

    async def local_annotate(request: AnnotateRequest):
        return await annotate_version(
            request,
            model_factory=lambda **_: FakeChatModel(structured),
        )

    monkeypatch.setattr(routes, "annotate_version", local_annotate)
    request = psd_request(
        make_psd(color=(255, 0, 0, 255)),
        make_psd(color=(0, 0, 255, 255), second_layer=True),
    )
    response = TestClient(app).post(
        "/annotate",
        json=request.model_dump(by_alias=True, mode="json"),
    )

    assert response.status_code == 200
    assert response.json()["summary"] == "A blue badge was added."
    assert structured.messages is not None
    assert [
        block["type"] for block in structured.messages[1]["content"]
    ] == ["text", "image_url"]
