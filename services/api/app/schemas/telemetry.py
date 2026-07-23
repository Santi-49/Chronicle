"""
POST-04 telemetry schemas.

All event types use `extra="forbid"` (via StrictModel) so unknown fields —
including any accidentally added private data — are rejected at the API boundary.
Discriminated on the `event` literal field.
"""
import uuid
from datetime import datetime
from typing import Annotated, Literal, Union

from pydantic import Field

from app.schemas.control_plane import StrictModel

# ── Shared base ─────────────────────────────────────────────────────────

class TelemetryEventBase(StrictModel):
    schema_version: Literal[1] = 1
    id: uuid.UUID                          # client-generated; used for idempotency
    occurred_at: datetime
    installation_id: uuid.UUID
    # Optional: absent for local mode or events unlinked to a specific project.
    project_telemetry_id: uuid.UUID | None = None


# ── app_opened ───────────────────────────────────────────────────────────

class AppOpenedEvent(TelemetryEventBase):
    event: Literal["app_opened"]
    app_version: str = Field(min_length=1, max_length=32)
    os_family: Literal["windows", "macos", "linux", "other"]


# ── version_captured ─────────────────────────────────────────────────────

# Allowlisted file types only; anything else maps to "other".
AllowedFileType = Literal["png", "jpg", "other"]
# Coarse size buckets: exact byte size and hashes must never appear.
SizeBucket = Literal["<100KB", "100KB-1MB", "1-10MB", "10-50MB"]

class VersionCapturedEvent(TelemetryEventBase):
    event: Literal["version_captured"]
    file_type: AllowedFileType
    size_bucket: SizeBucket
    capture_ms: int = Field(ge=0)


# ── ai_summary_generated ─────────────────────────────────────────────────

class AiSummaryGeneratedEvent(TelemetryEventBase):
    event: Literal["ai_summary_generated"]
    operation: Literal["annotation", "embedding"]
    provider: str = Field(min_length=1, max_length=100)
    model: str = Field(min_length=1, max_length=200)
    outcome: Literal["success", "failure"]
    latency_ms: int = Field(ge=0)
    input_tokens: int | None = Field(default=None, ge=0)
    output_tokens: int | None = Field(default=None, ge=0)


# ── search_performed ─────────────────────────────────────────────────────

ResultCountBucket = Literal["0", "1-5", "6-20", "21+"]

class SearchPerformedEvent(TelemetryEventBase):
    event: Literal["search_performed"]
    mode: Literal["keyword", "semantic", "hybrid"]
    latency_ms: int = Field(ge=0)
    result_count_bucket: ResultCountBucket


# ── project_added ────────────────────────────────────────────────────────

class ProjectAddedEvent(TelemetryEventBase):
    event: Literal["project_added"]
    # project_telemetry_id in base is required for this event (enforced by callers).


# ── project_removed ──────────────────────────────────────────────────────

class ProjectRemovedEvent(TelemetryEventBase):
    event: Literal["project_removed"]
    history_deleted: bool


# ── ai_provider_configured ───────────────────────────────────────────────

class AiProviderConfiguredEvent(TelemetryEventBase):
    event: Literal["ai_provider_configured"]
    provider: str = Field(min_length=1, max_length=100)


# ── account_signed_in ────────────────────────────────────────────────────

class AccountSignedInEvent(TelemetryEventBase):
    event: Literal["account_signed_in"]
    method: Literal["google", "password"]


# ── restore_performed ────────────────────────────────────────────────────

class RestorePerformedEvent(TelemetryEventBase):
    event: Literal["restore_performed"]
    file_type: AllowedFileType


# ── version_history_reset ────────────────────────────────────────────────

class VersionHistoryResetEvent(TelemetryEventBase):
    event: Literal["version_history_reset"]


# ── Discriminated union ──────────────────────────────────────────────────

TelemetryEvent = Annotated[
    Union[
        AppOpenedEvent,
        VersionCapturedEvent,
        AiSummaryGeneratedEvent,
        SearchPerformedEvent,
        ProjectAddedEvent,
        ProjectRemovedEvent,
        AiProviderConfiguredEvent,
        AccountSignedInEvent,
        RestorePerformedEvent,
        VersionHistoryResetEvent,
    ],
    Field(discriminator="event"),
]


# ── Batch request ────────────────────────────────────────────────────────

class TelemetryBatch(StrictModel):
    events: list[TelemetryEvent] = Field(min_length=1, max_length=100)


# ── Project inventory ────────────────────────────────────────────────────

class ProjectInventoryUpsert(StrictModel):
    """Allowlisted project metadata — no name, path, description, or IDs."""
    tracked_file_count: int = Field(ge=0)
    # Map of normalized extension ("png", "jpg", "other") → count.
    file_type_counts: dict[AllowedFileType, int]  # type: ignore[type-arg]


class ProjectInventoryRead(StrictModel):
    project_telemetry_id: uuid.UUID
    installation_id: uuid.UUID
    tracked_file_count: int
    file_type_counts: dict[str, int]
    updated_at: datetime
