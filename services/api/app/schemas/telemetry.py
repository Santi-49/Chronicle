"""Strict v2 usage-statistics contract.

The desktop sends independent typed records in one retry-safe transport batch.
Location is deliberately absent: the API derives it from Cloudflare headers.
"""
import uuid
from datetime import datetime
from typing import Literal

from pydantic import Field, model_validator

from app.schemas.control_plane import StrictModel

OsFamily = Literal["windows", "macos", "linux", "other"]
AiOperation = Literal["annotation", "embedding"]
ErrorProcess = Literal["main", "renderer", "preload", "electron"]
ErrorSeverity = Literal["warning", "error", "fatal"]


class AppSession(StrictModel):
    id: uuid.UUID
    opened_at: datetime
    app_version: str = Field(min_length=1, max_length=32)
    os_family: OsFamily


class ProjectRemoval(StrictModel):
    id: uuid.UUID
    project_telemetry_id: uuid.UUID
    occurred_at: datetime
    history_deleted: bool


class HourlyUsage(StrictModel):
    bucket_start: datetime
    search_count: int = Field(ge=0)
    keyword_search_count: int = Field(default=0, ge=0)
    semantic_search_count: int = Field(default=0, ge=0)
    version_capture_count: int = Field(default=0, ge=0)
    restore_count: int = Field(default=0, ge=0)
    project_create_count: int = Field(default=0, ge=0)


class HourlyAiUsage(StrictModel):
    bucket_start: datetime
    operation: AiOperation
    provider: str = Field(min_length=1, max_length=100)
    model: str = Field(min_length=1, max_length=200)
    attempt_count: int = Field(ge=0)
    success_count: int = Field(ge=0)
    failure_count: int = Field(ge=0)
    total_latency_ms: int = Field(ge=0)

    @model_validator(mode="after")
    def outcomes_match_attempts(self) -> "HourlyAiUsage":
        if self.success_count + self.failure_count != self.attempt_count:
            raise ValueError("success_count + failure_count must equal attempt_count")
        return self


class AppError(StrictModel):
    id: uuid.UUID
    occurred_at: datetime
    process: ErrorProcess
    component: str = Field(min_length=1, max_length=64)
    operation: str = Field(min_length=1, max_length=100)
    error_name: str = Field(min_length=1, max_length=100)
    error_code: str | None = Field(default=None, max_length=100)
    sanitized_message: str = Field(min_length=1, max_length=500)
    stack_fingerprint: str = Field(min_length=16, max_length=128)
    sanitized_stack: list[str] = Field(default_factory=list, max_length=20)
    severity: ErrorSeverity
    fatal: bool
    handled: bool
    app_version: str = Field(min_length=1, max_length=32)
    os_family: OsFamily
    provider: str | None = Field(default=None, max_length=100)
    model: str | None = Field(default=None, max_length=200)


class InstallationState(StrictModel):
    captured_at: datetime
    project_count: int = Field(ge=0)
    asset_count: int = Field(ge=0)
    version_count: int = Field(ge=0)
    ai_annotated_version_count: int = Field(ge=0)
    annotation_provider: str | None = Field(default=None, max_length=100)
    annotation_model: str | None = Field(default=None, max_length=200)
    embedding_provider: str | None = Field(default=None, max_length=100)
    embedding_model: str | None = Field(default=None, max_length=200)
    app_version: str = Field(min_length=1, max_length=32)
    os_family: OsFamily
    first_project_at: datetime | None = None
    first_version_at: datetime | None = None


class ProjectState(StrictModel):
    project_telemetry_id: uuid.UUID
    captured_at: datetime
    asset_count: int = Field(ge=0)
    version_count: int = Field(ge=0)
    ai_annotated_version_count: int = Field(ge=0)
    png_count: int = Field(ge=0)
    jpg_count: int = Field(ge=0)
    other_count: int = Field(ge=0)


class TelemetryBatch(StrictModel):
    schema_version: Literal[2] = 2
    batch_id: uuid.UUID
    installation_id: uuid.UUID
    sent_at: datetime
    final: bool = False
    sessions: list[AppSession] = Field(default_factory=list, max_length=100)
    project_removals: list[ProjectRemoval] = Field(default_factory=list, max_length=100)
    hourly_usage: list[HourlyUsage] = Field(default_factory=list, max_length=168)
    hourly_ai_usage: list[HourlyAiUsage] = Field(default_factory=list, max_length=500)
    errors: list[AppError] = Field(default_factory=list, max_length=200)
    installation_state: InstallationState | None = None
    projects: list[ProjectState] = Field(default_factory=list, max_length=500)
    deleted_project_ids: list[uuid.UUID] = Field(default_factory=list, max_length=100)

    @model_validator(mode="after")
    def contains_data(self) -> "TelemetryBatch":
        if not any((
            self.sessions,
            self.project_removals,
            self.hourly_usage,
            self.hourly_ai_usage,
            self.errors,
            self.installation_state,
            self.projects,
            self.deleted_project_ids,
            self.final,
        )):
            raise ValueError("telemetry batch must contain at least one record")
        return self
