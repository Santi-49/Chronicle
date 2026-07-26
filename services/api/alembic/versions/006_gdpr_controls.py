"""Add auditable privacy preferences and self-service erasure authorization.

Revision ID: 006
Revises: 005_product_analytics_counts
Create Date: 2026-07-25
"""
import uuid

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import UUID

revision = "006"
down_revision = "005_product_analytics_counts"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "telemetry_preference_audit",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "installation_id",
            UUID(as_uuid=True),
            sa.ForeignKey("installations.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "user_id",
            UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=True,
        ),
        sa.Column("enabled", sa.Boolean(), nullable=False),
        sa.Column("notice_version", sa.String(32), nullable=False),
        sa.Column("preference_updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index(
        "ix_telemetry_preference_audit_installation_id",
        "telemetry_preference_audit",
        ["installation_id"],
    )
    op.create_index(
        "ix_telemetry_preference_audit_user_id",
        "telemetry_preference_audit",
        ["user_id"],
    )
    bind = op.get_bind()
    permission_id = uuid.uuid4()
    bind.execute(
        sa.text(
            "INSERT INTO permissions (id, resource, action, description) "
            "VALUES (:id, 'account', 'delete', 'Erase own account and linked cloud data')"
        ),
        {"id": permission_id},
    )
    role_rows = bind.execute(
        sa.text("SELECT id FROM roles WHERE name IN ('admin', 'user')")
    ).fetchall()
    for (role_id,) in role_rows:
        bind.execute(
            sa.text(
                "INSERT INTO role_permissions (role_id, permission_id) "
                "VALUES (:role_id, :permission_id)"
            ),
            {"role_id": role_id, "permission_id": permission_id},
        )


def downgrade() -> None:
    bind = op.get_bind()
    permission_rows = bind.execute(
        sa.text(
            "SELECT id FROM permissions "
            "WHERE resource = 'account' AND action = 'delete'"
        )
    ).fetchall()
    for (permission_id,) in permission_rows:
        bind.execute(
            sa.text("DELETE FROM role_permissions WHERE permission_id = :permission_id"),
            {"permission_id": permission_id},
        )
        bind.execute(
            sa.text("DELETE FROM permissions WHERE id = :permission_id"),
            {"permission_id": permission_id},
        )
    op.drop_index(
        "ix_telemetry_preference_audit_user_id",
        table_name="telemetry_preference_audit",
    )
    op.drop_index(
        "ix_telemetry_preference_audit_installation_id",
        table_name="telemetry_preference_audit",
    )
    op.drop_table("telemetry_preference_audit")
