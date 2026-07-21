"""Chronicle control-plane accounts, settings, secrets, and installations.

Revision ID: 002
Revises: 001
Create Date: 2026-07-21
"""
import uuid
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import UUID

revision: str = "002"
down_revision: Union[str, None] = "001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.alter_column("users", "hashed_password", existing_type=sa.String(255), nullable=True)

    op.create_table(
        "external_identities",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, default=uuid.uuid4),
        sa.Column("user_id", UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("provider", sa.String(32), nullable=False),
        sa.Column("provider_subject", sa.String(255), nullable=False),
        sa.Column("last_login_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("provider", "provider_subject", name="uq_external_identity_subject"),
        sa.UniqueConstraint("user_id", "provider", name="uq_external_identity_user_provider"),
    )
    op.create_index("ix_external_identities_user_id", "external_identities", ["user_id"])

    op.create_table(
        "account_settings",
        sa.Column("user_id", UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("revision", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("payload", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )

    op.create_table(
        "encrypted_secrets",
        sa.Column("user_id", UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("revision", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("envelope", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )

    op.create_table(
        "installations",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("app_version", sa.String(32), nullable=False),
        sa.Column("os_family", sa.String(16), nullable=False),
        sa.Column("first_seen_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("last_seen_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_installations_user_id", "installations", ["user_id"])

    bind = op.get_bind()
    account_read_id = uuid.uuid4()
    account_write_id = uuid.uuid4()
    bind.execute(
        sa.text("INSERT INTO permissions (id, resource, action, description) VALUES "
                "(:read_id, 'account', 'read', 'Read own account configuration'), "
                "(:write_id, 'account', 'write', 'Write own account configuration')"),
        {"read_id": account_read_id, "write_id": account_write_id},
    )
    role_rows = bind.execute(
        sa.text("SELECT id FROM roles WHERE name IN ('admin', 'user')")
    ).fetchall()
    for (role_id,) in role_rows:
        bind.execute(
            sa.text("INSERT INTO role_permissions (role_id, permission_id) VALUES "
                    "(:role_id, :read_id), (:role_id, :write_id)"),
            {"role_id": role_id, "read_id": account_read_id, "write_id": account_write_id},
        )


def downgrade() -> None:
    bind = op.get_bind()
    permission_ids = bind.execute(
        sa.text("SELECT id FROM permissions WHERE resource = 'account'")
    ).fetchall()
    for (permission_id,) in permission_ids:
        bind.execute(
            sa.text("DELETE FROM role_permissions WHERE permission_id = :permission_id"),
            {"permission_id": permission_id},
        )
    bind.execute(sa.text("DELETE FROM permissions WHERE resource = 'account'"))

    op.drop_index("ix_installations_user_id", table_name="installations")
    op.drop_table("installations")
    op.drop_table("encrypted_secrets")
    op.drop_table("account_settings")
    op.drop_index("ix_external_identities_user_id", table_name="external_identities")
    op.drop_table("external_identities")

    # Preserve Google-created users while restoring the original non-null schema;
    # the random hash is intentionally unusable as a known password.
    import bcrypt
    placeholder = bcrypt.hashpw(uuid.uuid4().hex.encode(), bcrypt.gensalt()).decode()
    bind.execute(
        sa.text("UPDATE users SET hashed_password = :placeholder WHERE hashed_password IS NULL"),
        {"placeholder": placeholder},
    )
    op.alter_column("users", "hashed_password", existing_type=sa.String(255), nullable=False)
