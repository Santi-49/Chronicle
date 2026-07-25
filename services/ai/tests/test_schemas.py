"""Contract-focused validation tests."""

import pytest
from pydantic import ValidationError

from chronicle_ai.schemas import AnnotateRequest, VersionAnnotation


def test_annotation_accepts_the_c3_shape() -> None:
    annotation = VersionAnnotation(
        summary="Background changed from navy to teal.",
        changes=["Background changed from navy to teal"],
        tags=["navy", "teal", "background-change"],
        confidence=0.95,
    )

    assert annotation.confidence == 0.95


@pytest.mark.parametrize("tag", ["Uppercase", "two words", "-leading", "emoji-🎨"])
def test_annotation_rejects_non_searchable_tags(tag: str) -> None:
    with pytest.raises(ValidationError):
        VersionAnnotation(
            summary="Valid summary",
            changes=["Valid change"],
            tags=["valid", "also-valid", tag],
        )


def test_annotation_rejects_out_of_range_confidence() -> None:
    with pytest.raises(ValidationError):
        VersionAnnotation(
            summary="Valid summary",
            changes=["Valid change"],
            tags=["one", "two", "three"],
            confidence=1.1,
        )


def test_psd_request_requires_photoshop_media_type() -> None:
    with pytest.raises(ValidationError, match="requires mediaType"):
        AnnotateRequest.model_validate(
            {
                "fileName": "campaign.psd",
                "format": "psd",
                "current": {
                    "base64": "aW1hZ2U=",
                    "mediaType": "image/png",
                    "format": "psd",
                },
            }
        )


def test_request_and_file_formats_must_match() -> None:
    with pytest.raises(ValidationError, match="current format must match"):
        AnnotateRequest.model_validate(
            {
                "fileName": "campaign.psd",
                "format": "psd",
                "current": {
                    "base64": "aW1hZ2U=",
                    "mediaType": "image/png",
                    "format": "png",
                },
            }
        )
