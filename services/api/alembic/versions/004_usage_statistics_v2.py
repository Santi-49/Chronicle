"""Normalize usage statistics and remove the v1 generic event log.

Revision ID: 004
Revises: 003
Create Date: 2026-07-24
"""
import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import UUID

revision: str = "004"
down_revision: str | None = "003"
branch_labels = None
depends_on = None


def _location_columns() -> list[sa.Column]:
    return [
        sa.Column("country_code", sa.String(2), nullable=True),
        sa.Column("region_code", sa.String(16), nullable=True),
        sa.Column("city", sa.String(128), nullable=True),
    ]


def _timestamps() -> list[sa.Column]:
    return [
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    ]


def upgrade() -> None:
    op.drop_index("ix_telemetry_events_occurred_at", table_name="telemetry_events")
    op.drop_index("ix_telemetry_events_installation_id", table_name="telemetry_events")
    op.drop_table("telemetry_events")
    op.drop_index("ix_project_telemetry_installation_id", table_name="project_telemetry")
    op.drop_table("project_telemetry")

    op.create_table(
        "telemetry_sessions",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("installation_id", UUID(as_uuid=True), nullable=False),
        sa.Column("opened_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("app_version", sa.String(32), nullable=False),
        sa.Column("os_family", sa.String(16), nullable=False),
        *_location_columns(), *_timestamps(),
    )
    op.create_index("ix_telemetry_sessions_installation_id", "telemetry_sessions", ["installation_id"])
    op.create_index("ix_telemetry_sessions_opened_at", "telemetry_sessions", ["opened_at"])

    op.create_table(
        "telemetry_project_removals",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("installation_id", UUID(as_uuid=True), nullable=False),
        sa.Column("project_telemetry_id", UUID(as_uuid=True), nullable=False),
        sa.Column("occurred_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("history_deleted", sa.Boolean(), nullable=False),
        *_location_columns(), *_timestamps(),
    )
    op.create_index("ix_telemetry_project_removals_installation_id", "telemetry_project_removals", ["installation_id"])
    op.create_index("ix_telemetry_project_removals_occurred_at", "telemetry_project_removals", ["occurred_at"])

    op.create_table(
        "telemetry_hourly_usage",
        sa.Column("installation_id", UUID(as_uuid=True), primary_key=True),
        sa.Column("bucket_start", sa.DateTime(timezone=True), primary_key=True),
        sa.Column("search_count", sa.Integer(), nullable=False),
        *_location_columns(), *_timestamps(),
    )
    op.create_table(
        "telemetry_hourly_ai_usage",
        sa.Column("installation_id", UUID(as_uuid=True), primary_key=True),
        sa.Column("bucket_start", sa.DateTime(timezone=True), primary_key=True),
        sa.Column("operation", sa.String(16), primary_key=True),
        sa.Column("provider", sa.String(100), primary_key=True),
        sa.Column("model", sa.String(200), primary_key=True),
        sa.Column("attempt_count", sa.Integer(), nullable=False),
        sa.Column("success_count", sa.Integer(), nullable=False),
        sa.Column("failure_count", sa.Integer(), nullable=False),
        sa.Column("total_latency_ms", sa.Integer(), nullable=False),
        *_location_columns(), *_timestamps(),
    )
    op.create_table(
        "telemetry_errors",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("installation_id", UUID(as_uuid=True), nullable=False),
        sa.Column("occurred_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("process", sa.String(16), nullable=False),
        sa.Column("component", sa.String(64), nullable=False),
        sa.Column("operation", sa.String(100), nullable=False),
        sa.Column("error_name", sa.String(100), nullable=False),
        sa.Column("error_code", sa.String(100), nullable=True),
        sa.Column("sanitized_message", sa.String(500), nullable=False),
        sa.Column("stack_fingerprint", sa.String(128), nullable=False),
        sa.Column("sanitized_stack", sa.JSON(), nullable=False),
        sa.Column("severity", sa.String(16), nullable=False),
        sa.Column("fatal", sa.Boolean(), nullable=False),
        sa.Column("handled", sa.Boolean(), nullable=False),
        sa.Column("app_version", sa.String(32), nullable=False),
        sa.Column("os_family", sa.String(16), nullable=False),
        sa.Column("provider", sa.String(100), nullable=True),
        sa.Column("model", sa.String(200), nullable=True),
        *_location_columns(), *_timestamps(),
    )
    op.create_index("ix_telemetry_errors_installation_id", "telemetry_errors", ["installation_id"])
    op.create_index("ix_telemetry_errors_occurred_at", "telemetry_errors", ["occurred_at"])
    op.create_index("ix_telemetry_errors_stack_fingerprint", "telemetry_errors", ["stack_fingerprint"])

    op.create_table(
        "installation_telemetry",
        sa.Column("installation_id", UUID(as_uuid=True), primary_key=True),
        sa.Column("captured_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("project_count", sa.Integer(), nullable=False),
        sa.Column("asset_count", sa.Integer(), nullable=False),
        sa.Column("version_count", sa.Integer(), nullable=False),
        sa.Column("ai_annotated_version_count", sa.Integer(), nullable=False),
        sa.Column("annotation_provider", sa.String(100), nullable=True),
        sa.Column("annotation_model", sa.String(200), nullable=True),
        sa.Column("embedding_provider", sa.String(100), nullable=True),
        sa.Column("embedding_model", sa.String(200), nullable=True),
        sa.Column("app_version", sa.String(32), nullable=False),
        sa.Column("os_family", sa.String(16), nullable=False),
        *_location_columns(), *_timestamps(),
    )
    op.create_table(
        "project_telemetry",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("installation_id", UUID(as_uuid=True), nullable=False),
        sa.Column("captured_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("asset_count", sa.Integer(), nullable=False),
        sa.Column("version_count", sa.Integer(), nullable=False),
        sa.Column("ai_annotated_version_count", sa.Integer(), nullable=False),
        sa.Column("png_count", sa.Integer(), nullable=False),
        sa.Column("jpg_count", sa.Integer(), nullable=False),
        sa.Column("other_count", sa.Integer(), nullable=False),
        *_timestamps(),
    )
    op.create_index("ix_project_telemetry_installation_id", "project_telemetry", ["installation_id"])


def downgrade() -> None:
    for table in (
        "project_telemetry", "installation_telemetry", "telemetry_errors",
        "telemetry_hourly_ai_usage", "telemetry_hourly_usage",
        "telemetry_project_removals", "telemetry_sessions",
    ):
        op.drop_table(table)
    # Downgrade restores empty v1 tables; discarded telemetry is intentionally not reconstructed.
    op.create_table(
        "telemetry_events",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("installation_id", UUID(as_uuid=True), nullable=False),
        sa.Column("event_type", sa.String(64), nullable=False),
        sa.Column("occurred_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("payload", sa.JSON(), nullable=False),
        *_timestamps(),
    )
    op.create_index("ix_telemetry_events_installation_id", "telemetry_events", ["installation_id"])
    op.create_index("ix_telemetry_events_occurred_at", "telemetry_events", ["occurred_at"])
    op.create_table(
        "project_telemetry",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("installation_id", UUID(as_uuid=True), nullable=False),
        sa.Column("tracked_file_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("file_type_counts", sa.JSON(), nullable=False, server_default=sa.text("'{}'::json")),
        *_timestamps(),
    )
    op.create_index("ix_project_telemetry_installation_id", "project_telemetry", ["installation_id"])
