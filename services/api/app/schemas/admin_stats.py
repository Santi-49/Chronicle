"""Aggregate-only contract for the Chronicle admin dashboard.

No identifier or event-level creative metadata is represented here. Fields that
the v2 telemetry contract does not collect are explicit capability flags rather
than invented values.
"""

from datetime import datetime
from typing import Literal
import uuid

from pydantic import Field

from app.schemas.control_plane import StrictModel


class AdminOverview(StrictModel):
    registered_accounts: int = Field(ge=0)
    registered_installations: int = Field(ge=0)
    estimated_active_installations: int = Field(ge=0)
    reporting_installations: int = Field(ge=0)
    current_projects: int = Field(ge=0)
    tracked_files: int = Field(ge=0)
    current_versions: int = Field(ge=0)
    weekly_active_creative_installations: int = Field(ge=0)
    versions_captured: int = Field(ge=0)
    project_creations: int = Field(ge=0)
    restores: int = Field(ge=0)
    activation_rate: float = Field(ge=0, le=1)
    d7_retention_rate: float = Field(ge=0, le=1)


class AdminInventoryAverages(StrictModel):
    projects_per_registered_account: float = Field(ge=0)
    projects_per_registered_installation: float = Field(ge=0)
    tracked_files_per_project: float = Field(ge=0)
    versions_per_project: float = Field(ge=0)
    median_versions_per_project: float = Field(ge=0)


class AdminCategoryCount(StrictModel):
    label: str = Field(min_length=1, max_length=200)
    count: int = Field(ge=0)


class AdminTimeSeriesPoint(StrictModel):
    bucket_start: datetime
    count: int = Field(ge=0)


class AdminAiModelAggregate(StrictModel):
    operation: Literal["annotation", "embedding"]
    provider: str = Field(min_length=1, max_length=100)
    model: str = Field(min_length=1, max_length=200)
    attempt_count: int = Field(ge=0)
    success_count: int = Field(ge=0)
    failure_count: int = Field(ge=0)
    average_latency_ms: float = Field(ge=0)
    token_count: int | None = Field(default=None, ge=0)


class AdminAiStatistics(StrictModel):
    attempt_count: int = Field(ge=0)
    success_count: int = Field(ge=0)
    failure_count: int = Field(ge=0)
    success_rate: float = Field(ge=0, le=1)
    average_latency_ms: float = Field(ge=0)
    token_counts_available: bool = False
    total_token_count: int | None = Field(default=None, ge=0)
    provider_model_mix: list[AdminAiModelAggregate]
    over_time: list[AdminTimeSeriesPoint]


class AdminSearchStatistics(StrictModel):
    total_count: int = Field(ge=0)
    mode_counts_available: bool = False
    by_mode: list[AdminCategoryCount]
    over_time: list[AdminTimeSeriesPoint]


class AdminErrorAggregate(StrictModel):
    component: str = Field(min_length=1, max_length=64)
    error_name: str = Field(min_length=1, max_length=100)
    error_code: str | None = Field(default=None, max_length=100)
    stack_fingerprint: str = Field(min_length=16, max_length=128)
    severity: Literal["warning", "error", "fatal"]
    count: int = Field(ge=1)
    last_seen_at: datetime


class AdminStatistics(StrictModel):
    generated_at: datetime
    period_days: int = Field(ge=7, le=90)
    overview: AdminOverview
    inventory_averages: AdminInventoryAverages
    file_type_distribution: list[AdminCategoryCount]
    version_inventory_over_time: list[AdminTimeSeriesPoint]
    ai: AdminAiStatistics
    search: AdminSearchStatistics
    errors: list[AdminErrorAggregate]
    coarse_locations: list[AdminCategoryCount]


class AdminAccountSummary(StrictModel):
    id: uuid.UUID
    email: str
    display_name: str
    google_linked: bool
    installation_count: int = Field(ge=0)
    current_project_count: int = Field(ge=0)
    current_version_count: int = Field(ge=0)
