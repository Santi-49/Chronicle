import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


class AiTaskPreference(StrictModel):
    provider: str = Field(max_length=100)
    model: str = Field(max_length=200)


class AiPreference(StrictModel):
    mode: Literal["local", "gateway"] = "local"
    chat: AiTaskPreference
    embeddings: AiTaskPreference


class TelemetryPreference(StrictModel):
    enabled: bool = True
    notice_version: str = Field(default="2026-07-21", min_length=1, max_length=32)
    updated_at: datetime


class AppearancePreference(StrictModel):
    theme: Literal["system", "dark", "light"] = "system"


class PortableSettings(StrictModel):
    schema_version: Literal[1] = 1
    settings_sync_enabled: bool = False
    api_key_sync_enabled: bool = False
    appearance: AppearancePreference
    ai: AiPreference
    telemetry: TelemetryPreference


class AccountSettingsRead(StrictModel):
    settings: PortableSettings
    revision: int = Field(ge=1)
    updated_at: datetime


class AccountSettingsUpdate(StrictModel):
    settings: PortableSettings
    expected_revision: int = Field(ge=0)


class EncryptedSecretRead(StrictModel):
    envelope: str
    revision: int = Field(ge=1)
    updated_at: datetime


class EncryptedSecretUpdate(StrictModel):
    envelope: str = Field(min_length=1, max_length=131_072)
    expected_revision: int = Field(ge=0)


class InstallationRegister(StrictModel):
    installation_id: uuid.UUID
    app_version: str = Field(min_length=1, max_length=32)
    os_family: Literal["windows", "macos", "linux", "other"]


class InstallationRead(StrictModel):
    installation_id: uuid.UUID
    linked_to_account: bool
    first_seen_at: datetime
    last_seen_at: datetime


class GoogleCredentialRequest(StrictModel):
    credential: str = Field(min_length=20, max_length=16_384)


class GoogleIdentityClaims(StrictModel):
    subject: str
    email: str
    email_verified: bool
    given_name: str = ""
    family_name: str = ""
    display_name: str = ""
