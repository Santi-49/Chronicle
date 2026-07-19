"""HTTP input and output models for Chronicle's local AI service."""

import base64
import binascii
import re
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, SecretStr, field_validator


NonEmptyText = Annotated[str, Field(min_length=1)]
ProviderName = Annotated[str, Field(min_length=1, max_length=50)]
ModelName = Annotated[str, Field(min_length=1, max_length=200)]


class StrictModel(BaseModel):
    """Reject unknown fields so API mistakes are visible immediately."""

    model_config = ConfigDict(extra="forbid", populate_by_name=True)


class ImageInput(StrictModel):
    """One PNG or JPEG transported across the local HTTP boundary."""

    base64: NonEmptyText
    media_type: Literal["image/png", "image/jpeg"] = Field(alias="mediaType")

    @field_validator("base64")
    @classmethod
    def base64_must_be_valid(cls, value: str) -> str:
        try:
            base64.b64decode(value, validate=True)
        except (binascii.Error, ValueError) as error:
            raise ValueError("base64 must contain a valid encoded image") from error
        return value


class ProviderConfig(StrictModel):
    """Model selection and the short-lived BYOK credential for one request."""

    provider: ProviderName
    model: ModelName
    # SecretStr keeps the key out of repr(), tracebacks and accidental logs.
    api_key: SecretStr = Field(alias="apiKey")

    @field_validator("provider", "model")
    @classmethod
    def value_must_not_be_blank(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("value must not be blank")
        return value

    @field_validator("api_key")
    @classmethod
    def key_must_not_be_empty(cls, value: SecretStr) -> SecretStr:
        if not value.get_secret_value().strip():
            raise ValueError("apiKey must not be empty")
        return value


class AnnotateRequest(ProviderConfig):
    file_name: Annotated[str, Field(alias="fileName", min_length=1, max_length=255)]
    previous: ImageInput | None = None
    current: ImageInput

    @field_validator("file_name")
    @classmethod
    def file_name_must_not_be_blank(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("fileName must not be blank")
        return value


class EmbedTextRequest(ProviderConfig):
    text: Annotated[str, Field(min_length=1, max_length=10_000)]

    @field_validator("text")
    @classmethod
    def text_must_not_be_blank(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("text must not be blank")
        return value


class VersionAnnotation(StrictModel):
    """Exact C3 annotation output shared with the Electron app."""

    summary: Annotated[str, Field(min_length=1, max_length=200)]
    changes: Annotated[list[str], Field(min_length=1, max_length=6)]
    tags: Annotated[list[str], Field(min_length=3, max_length=8)]
    confidence: Annotated[float, Field(ge=0, le=1)] | None = None

    @field_validator("summary")
    @classmethod
    def summary_must_not_be_blank(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("summary must not be blank")
        return value

    @field_validator("changes")
    @classmethod
    def changes_must_be_valid(cls, values: list[str]) -> list[str]:
        cleaned = [value.strip() for value in values]
        if any(not value or len(value) > 200 for value in cleaned):
            raise ValueError("each change must contain 1 to 200 characters")
        return cleaned

    @field_validator("tags")
    @classmethod
    def tags_must_be_searchable(cls, values: list[str]) -> list[str]:
        cleaned = [value.strip() for value in values]
        if any(
            len(value) > 30 or re.fullmatch(r"[a-z0-9][a-z0-9-]*", value) is None
            for value in cleaned
        ):
            raise ValueError("tags must be lowercase words or hyphenated words")
        return cleaned


class EmbedTextResponse(StrictModel):
    embedding: Annotated[list[float], Field(min_length=1)]
    provider: str
    model: str
    dimensions: Annotated[int, Field(gt=0)]


class HealthResponse(StrictModel):
    status: Literal["ok"] = "ok"
    service: Literal["chronicle-ai"] = "chronicle-ai"
    version: str = "0.1.0"


class ServiceErrorDetail(StrictModel):
    code: Literal[
        "invalid_model_output",
        "provider_unavailable",
        "provider_timeout",
        "provider_error",
    ]
    message: str


class ServiceErrorResponse(StrictModel):
    detail: ServiceErrorDetail
