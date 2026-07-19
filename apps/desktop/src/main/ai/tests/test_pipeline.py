"""Integration tests: image_loader → model_engine pipeline.

These tests exercise the full data path that Chronicle uses at runtime:

  1. image_loader.load_image() reads a real file from disk and returns raw bytes
     plus the MIME type.
  2. The bytes are base64-encoded exactly as the pipeline does it.
  3. An AnnotateRequest is assembled from those bytes.
  4. model_engine.annotate_version() is called with a fake LLM injected via
     the model_factory argument — no API key, no network, no external process.
  5. The returned VersionAnnotation is validated against the C3 output schema.

Every supported image format (.png, .jpg, .jpeg) is tested in both annotation
modes (first-version description and diff between two versions).

Fixtures that generate real binary image files live in conftest.py.
"""

import base64
from pathlib import Path
from typing import Any

import pytest

from apps.desktop.src.main.ai.image_loader import load_image
from apps.desktop.src.main.ai.model_engine import annotate_version
from apps.desktop.src.main.ai.schemas import AnnotateRequest, VersionAnnotation


# ---------------------------------------------------------------------------
# Shared fake LLM helpers
# ---------------------------------------------------------------------------


class FakeStructuredModel:
    """Records the message list and returns a pre-built VersionAnnotation dict."""

    def __init__(self, result: dict[str, Any]) -> None:
        self.result = result
        self.messages: list[dict[str, Any]] | None = None

    async def ainvoke(self, messages: list[dict[str, Any]]) -> dict[str, Any]:
        self.messages = messages
        return self.result


class FakeChatModel:
    def __init__(self, structured: FakeStructuredModel) -> None:
        self.structured = structured

    def with_structured_output(self, _schema: type[Any]) -> FakeStructuredModel:
        return self.structured


def _make_factory(result: dict[str, Any]) -> tuple[Any, FakeStructuredModel]:
    """Return a (factory_callable, FakeStructuredModel) pair for a single test."""
    structured = FakeStructuredModel(result)
    chat_model = FakeChatModel(structured)
    return lambda **_: chat_model, structured


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _load_as_b64(path: Path) -> tuple[str, str]:
    """Load an image file and return (base64_string, media_type)."""
    record = load_image(str(path))
    b64 = base64.b64encode(record["data"]).decode()
    return b64, record["mime_type"]


ANNOTATION_DICT = {
    "summary": "A red square logo on a white background.",
    "changes": ["Red square logo present", "White background"],
    "tags": ["red", "logo", "square"],
    "confidence": None,
}

DIFF_DICT = {
    "summary": "Background changed from red to blue.",
    "changes": ["Background changed from red to blue"],
    "tags": ["red", "blue", "background"],
    "confidence": 0.95,
}


# ---------------------------------------------------------------------------
# Helpers for building requests from loaded files
# ---------------------------------------------------------------------------


def _first_version_request(image_path: Path) -> AnnotateRequest:
    b64, media_type = _load_as_b64(image_path)
    return AnnotateRequest.model_validate(
        {
            "provider": "google_genai",
            "model": "gemini-2.5-flash",
            "apiKey": "test-key",
            "fileName": image_path.name,
            "previous": None,
            "current": {"base64": b64, "mediaType": media_type},
        }
    )


def _diff_request(previous_path: Path, current_path: Path) -> AnnotateRequest:
    prev_b64, prev_media = _load_as_b64(previous_path)
    curr_b64, curr_media = _load_as_b64(current_path)
    return AnnotateRequest.model_validate(
        {
            "provider": "google_genai",
            "model": "gemini-2.5-flash",
            "apiKey": "test-key",
            "fileName": current_path.name,
            "previous": {"base64": prev_b64, "mediaType": prev_media},
            "current": {"base64": curr_b64, "mediaType": curr_media},
        }
    )


# ===========================================================================
# image_loader — reads real files and returns correct MIME types
# ===========================================================================


def test_load_png_returns_png_mime(png_file: Path) -> None:
    record = load_image(str(png_file))

    assert record["mime_type"] == "image/png"
    assert record["path"] == str(png_file)
    assert len(record["data"]) > 0


def test_load_jpg_returns_jpeg_mime(jpeg_file: Path) -> None:
    record = load_image(str(jpeg_file))

    assert record["mime_type"] == "image/jpeg"
    assert record["path"] == str(jpeg_file)
    assert len(record["data"]) > 0


def test_load_jpeg_extension_returns_jpeg_mime(jpeg_file_alt_ext: Path) -> None:
    record = load_image(str(jpeg_file_alt_ext))

    assert record["mime_type"] == "image/jpeg"


def test_load_missing_file_raises_file_not_found(tmp_path: Path) -> None:
    with pytest.raises(FileNotFoundError):
        load_image(str(tmp_path / "ghost.png"))


def test_load_unsupported_extension_raises_value_error(tmp_path: Path) -> None:
    unsupported = tmp_path / "image.bmp"
    unsupported.write_bytes(b"\x00" * 16)

    with pytest.raises(ValueError, match="Unsupported image format"):
        load_image(str(unsupported))


def test_load_directory_raises_value_error(tmp_path: Path) -> None:
    with pytest.raises(ValueError, match="not a file"):
        load_image(str(tmp_path))


def test_load_preserves_exact_bytes(png_file: Path) -> None:
    """The bytes returned must be bit-for-bit identical to the file on disk."""
    record = load_image(str(png_file))

    assert record["data"] == png_file.read_bytes()


# ===========================================================================
# Pipeline: image_loader → AnnotateRequest schema validation
# ===========================================================================


def test_png_bytes_encode_to_valid_base64_for_schema(png_file: Path) -> None:
    """Raw bytes from image_loader round-trip cleanly through ImageInput."""
    b64, media_type = _load_as_b64(png_file)

    # If validation passes, the bytes are a valid base64-encoded image
    request = _first_version_request(png_file)

    assert request.current.base64 == b64
    assert request.current.media_type == "image/png"


def test_jpg_bytes_encode_to_valid_base64_for_schema(jpeg_file: Path) -> None:
    b64, media_type = _load_as_b64(jpeg_file)
    request = _first_version_request(jpeg_file)

    assert request.current.base64 == b64
    assert request.current.media_type == "image/jpeg"


def test_jpeg_extension_encodes_as_jpeg_mime(jpeg_file_alt_ext: Path) -> None:
    request = _first_version_request(jpeg_file_alt_ext)

    assert request.current.media_type == "image/jpeg"


# ===========================================================================
# Pipeline: AnnotateRequest → model_engine → VersionAnnotation
# (all formats × both annotation modes, fake LLM injected)
# ===========================================================================


@pytest.mark.asyncio
async def test_png_first_version_produces_valid_annotation(png_file: Path) -> None:
    """PNG: first-version description path through the full pipeline."""
    factory, structured = _make_factory(ANNOTATION_DICT)
    request = _first_version_request(png_file)

    result = await annotate_version(request, model_factory=factory)

    assert isinstance(result, VersionAnnotation)
    assert result.summary == ANNOTATION_DICT["summary"]
    assert result.changes == ANNOTATION_DICT["changes"]
    assert result.tags == ANNOTATION_DICT["tags"]
    assert result.confidence is None


@pytest.mark.asyncio
async def test_jpg_first_version_produces_valid_annotation(jpeg_file: Path) -> None:
    """JPG (.jpg): first-version description path through the full pipeline."""
    factory, structured = _make_factory(ANNOTATION_DICT)
    request = _first_version_request(jpeg_file)

    result = await annotate_version(request, model_factory=factory)

    assert isinstance(result, VersionAnnotation)
    assert result.summary == ANNOTATION_DICT["summary"]


@pytest.mark.asyncio
async def test_jpeg_ext_first_version_produces_valid_annotation(
    jpeg_file_alt_ext: Path,
) -> None:
    """JPEG (.jpeg extension): first-version description path."""
    factory, _ = _make_factory(ANNOTATION_DICT)
    result = await annotate_version(
        _first_version_request(jpeg_file_alt_ext), model_factory=factory
    )

    assert isinstance(result, VersionAnnotation)


@pytest.mark.asyncio
async def test_png_diff_produces_valid_annotation(png_pair: tuple[Path, Path]) -> None:
    """PNG: diff path — two different images through the full pipeline."""
    previous_path, current_path = png_pair
    factory, structured = _make_factory(DIFF_DICT)
    request = _diff_request(previous_path, current_path)

    result = await annotate_version(request, model_factory=factory)

    assert isinstance(result, VersionAnnotation)
    assert result.confidence == 0.95
    assert result.tags == ["red", "blue", "background"]


@pytest.mark.asyncio
async def test_diff_image_order_in_message(png_pair: tuple[Path, Path]) -> None:
    """The previous image must appear before the current image in the LLM message."""
    previous_path, current_path = png_pair
    prev_b64, _ = _load_as_b64(previous_path)
    curr_b64, _ = _load_as_b64(current_path)
    factory, structured = _make_factory(DIFF_DICT)
    request = _diff_request(previous_path, current_path)

    await annotate_version(request, model_factory=factory)

    assert structured.messages is not None
    content = structured.messages[1]["content"]
    # text block + previous image + current image
    assert [block["type"] for block in content] == ["text", "image_url", "image_url"]

    prev_url = content[1]["image_url"]["url"]
    curr_url = content[2]["image_url"]["url"]
    assert f"base64,{prev_b64}" in prev_url
    assert f"base64,{curr_b64}" in curr_url


@pytest.mark.asyncio
async def test_first_version_has_single_image_in_message(png_file: Path) -> None:
    """First-version mode sends exactly one image block to the LLM."""
    factory, structured = _make_factory(ANNOTATION_DICT)

    await annotate_version(_first_version_request(png_file), model_factory=factory)

    assert structured.messages is not None
    content = structured.messages[1]["content"]
    image_blocks = [b for b in content if b["type"] == "image_url"]
    assert len(image_blocks) == 1


@pytest.mark.asyncio
async def test_png_data_url_contains_correct_mime(png_file: Path) -> None:
    """The data-URL built from a PNG file must declare image/png."""
    factory, structured = _make_factory(ANNOTATION_DICT)

    await annotate_version(_first_version_request(png_file), model_factory=factory)

    assert structured.messages is not None
    image_block = structured.messages[1]["content"][1]
    assert image_block["image_url"]["url"].startswith("data:image/png;base64,")


@pytest.mark.asyncio
async def test_jpg_data_url_contains_correct_mime(jpeg_file: Path) -> None:
    """The data-URL built from a JPEG file must declare image/jpeg."""
    factory, structured = _make_factory(ANNOTATION_DICT)

    await annotate_version(_first_version_request(jpeg_file), model_factory=factory)

    assert structured.messages is not None
    image_block = structured.messages[1]["content"][1]
    assert image_block["image_url"]["url"].startswith("data:image/jpeg;base64,")


@pytest.mark.asyncio
async def test_filename_appears_in_prompt_for_png(png_file: Path) -> None:
    """The file name must be interpolated into the user prompt."""
    factory, structured = _make_factory(ANNOTATION_DICT)

    await annotate_version(_first_version_request(png_file), model_factory=factory)

    assert structured.messages is not None
    user_text = structured.messages[1]["content"][0]["text"]
    assert png_file.name in user_text


@pytest.mark.asyncio
async def test_filename_appears_in_prompt_for_jpg(jpeg_file: Path) -> None:
    factory, structured = _make_factory(ANNOTATION_DICT)

    await annotate_version(_first_version_request(jpeg_file), model_factory=factory)

    assert structured.messages is not None
    user_text = structured.messages[1]["content"][0]["text"]
    assert jpeg_file.name in user_text


@pytest.mark.asyncio
async def test_c3_output_schema_enforced_on_pipeline_result(png_file: Path) -> None:
    """The pipeline raises ValidationError when the model returns bad output."""
    from pydantic import ValidationError

    bad_result = {
        "summary": "Valid summary",
        "changes": ["Valid change"],
        "tags": ["BAD TAG WITH SPACES"],  # violates lowercase-slug rule
    }

    class BadStructuredModel:
        async def ainvoke(self, _: Any) -> dict[str, Any]:
            return bad_result

    class BadChatModel:
        def with_structured_output(self, _: type[Any]) -> BadStructuredModel:
            return BadStructuredModel()

    with pytest.raises(ValidationError):
        await annotate_version(
            _first_version_request(png_file),
            model_factory=lambda **_: BadChatModel(),
        )
