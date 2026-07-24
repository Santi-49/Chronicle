"""Add privacy-safe product analytics counters.

Revision ID: 005_product_analytics_counts
Revises: 004
"""
from alembic import op
import sqlalchemy as sa

revision = "005_product_analytics_counts"
down_revision = "004"
branch_labels = None
depends_on = None


def upgrade() -> None:
    for name in (
        "keyword_search_count", "semantic_search_count", "version_capture_count",
        "restore_count", "project_create_count",
    ):
        op.add_column(
            "telemetry_hourly_usage",
            sa.Column(name, sa.Integer(), nullable=False, server_default=sa.text("0")),
        )
    op.add_column("installation_telemetry", sa.Column("first_project_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("installation_telemetry", sa.Column("first_version_at", sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    op.drop_column("installation_telemetry", "first_version_at")
    op.drop_column("installation_telemetry", "first_project_at")
    for name in reversed((
        "keyword_search_count", "semantic_search_count", "version_capture_count",
        "restore_count", "project_create_count",
    )):
        op.drop_column("telemetry_hourly_usage", name)
