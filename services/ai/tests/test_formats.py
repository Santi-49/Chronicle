"""Format adapter registry tests (POST-01/POST-02).

The registry is what makes a new format a one-entry change: annotation
dispatch, prompt selection, and the /capabilities response all read from it.
These tests pin that behavior and the invariants the desktop app relies on.
"""

import pytest
from pydantic import ValidationError

from chronicle_ai.engine import UnsupportedFormatError, annotate_version
from chronicle_ai.formats import adapter_for, media_types, supported_formats
from chronicle_ai.prompts import load_annotation_prompt
from chronicle_ai.schemas import AnnotateRequest, ImageInput


def test_every_supported_format_has_a_complete_adapter() -> None:
    assert supported_formats() == (
        "png",
        "jpg",
        "jpeg",
        "psd",
        "psb",
        "svg",
        "blend",
        "obj",
        "step",
    )

    for name in supported_formats():
        adapter = adapter_for(name)
        assert adapter is not None
        assert adapter.format == name
        assert adapter.media_type in media_types()
        # Every adapter must resolve to real prompt sections.
        for first_version in (True, False):
            system, user = load_annotation_prompt(
                file_name="logo.png",
                is_first_version=first_version,
                operation_prefix=adapter.prompt_operation,
            )
            assert system and user


def test_registry_matches_the_published_format_enum() -> None:
    """The OpenAPI enum and the registry must not drift apart."""

    declared = ImageInput.model_fields["format"].annotation
    assert set(getattr(declared, "__args__")) == set(supported_formats())

    media = ImageInput.model_fields["media_type"].annotation
    assert set(getattr(media, "__args__")) == set(media_types())


def test_image_formats_need_no_local_extraction() -> None:
    for name in ("png", "jpg", "jpeg"):
        assert adapter_for(name).prepare is None
    for name in ("psd", "psb", "svg", "blend", "obj", "step"):
        assert adapter_for(name).prepare is not None


def test_unknown_format_has_no_adapter() -> None:
    assert adapter_for("gif") is None
    assert adapter_for("") is None


def test_prompt_selection_is_driven_by_the_adapter_prefix() -> None:
    _, image_user = load_annotation_prompt("logo.png", is_first_version=False)
    _, svg_user = load_annotation_prompt(
        "campaign.svg", is_first_version=False, operation_prefix="SVG "
    )
    assert image_user != svg_user
    assert "logo.png" in image_user
    assert "campaign.svg" in svg_user


async def test_annotate_rejects_a_format_without_an_adapter() -> None:
    """A format the schema allows but the registry does not implement.

    The published enum keeps unimplemented formats out of the request, so this
    guards the case where the two are changed out of step.
    """

    request = AnnotateRequest.model_validate(
        {
            "fileName": "logo.png",
            "format": "png",
            "current": {"base64": "aW1hZ2U=", "mediaType": "image/png", "format": "png"},
        }
    )
    object.__setattr__(request, "format", "gif")

    with pytest.raises(UnsupportedFormatError, match="cannot annotate 'gif'"):
        await annotate_version(request)


def test_media_type_validation_reads_the_registry() -> None:
    with pytest.raises(ValidationError, match="requires mediaType"):
        ImageInput.model_validate(
            {"base64": "aW1hZ2U=", "mediaType": "image/png", "format": "psd"}
        )
