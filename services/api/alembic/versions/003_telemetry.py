"""POST-04: telemetry_events and project_telemetry tables.

Revision ID: 003
Revises: 002
Create Date: 2026-07-23
"""
import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import UUID

revision: str = "003"
down_revision: str | None = "002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "telemetry_events",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("installation_id", UUID(as_uuid=True), nullable=False),
        sa.Column("event_type", sa.String(64), nullable=False),
        sa.Column("occurred_at", sa.DateTime(timezone=True), nullable=False),
        # Opaque validated JSON blob — stored verbatim, never parsed by the backend.
        sa.Column("payload", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_telemetry_events_installation_id", "telemetry_events", ["installation_id"])
    op.create_index("ix_telemetry_events_occurred_at", "telemetry_events", ["occurred_at"])

    op.create_table(
        "project_telemetry",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("installation_id", UUID(as_uuid=True), nullable=False),
        sa.Column("tracked_file_count", sa.Integer(), nullable=False, server_default="0"),
        # Use a SQL expression, not a Python string containing SQL quotes.
        # `server_default="'{}'"` becomes DEFAULT '''{}''' and PostgreSQL
        # rejects the single quote token as invalid JSON.
        sa.Column(
            "file_type_counts",
            sa.JSON(),
            nullable=False,
            server_default=sa.text("'{}'::json"),
        ),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_project_telemetry_installation_id", "project_telemetry", ["installation_id"])


def downgrade() -> None:
    op.drop_index("ix_project_telemetry_installation_id", table_name="project_telemetry")
    op.drop_table("project_telemetry")
    op.drop_index("ix_telemetry_events_occurred_at", table_name="telemetry_events")
    op.drop_index("ix_telemetry_events_installation_id", table_name="telemetry_events")
    op.drop_table("telemetry_events")
