"""Initial schema — tables + seed data

Revision ID: 001
Revises:
Create Date: 2024-01-01 00:00:00.000000
"""
import os
import uuid
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import UUID

revision: str = "001"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ── Tables ────────────────────────────────────────────────────────
    op.create_table(
        "roles",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, default=uuid.uuid4),
        sa.Column("name", sa.String(50), nullable=False, unique=True),
        sa.Column("description", sa.Text, nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    op.create_table(
        "permissions",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, default=uuid.uuid4),
        sa.Column("resource", sa.String(100), nullable=False),
        sa.Column("action", sa.String(50), nullable=False),
        sa.Column("description", sa.Text, nullable=True),
        sa.UniqueConstraint("resource", "action", name="uq_permissions_resource_action"),
    )

    op.create_table(
        "users",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, default=uuid.uuid4),
        sa.Column("email", sa.String(255), nullable=False, unique=True),
        sa.Column("name", sa.String(100), nullable=False),
        sa.Column("surname", sa.String(100), nullable=False),
        sa.Column("hashed_password", sa.String(255), nullable=False),
        sa.Column("is_active", sa.Boolean, nullable=False, server_default=sa.true()),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_users_email", "users", ["email"])

    op.create_table(
        "user_roles",
        sa.Column("user_id", UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("role_id", UUID(as_uuid=True), sa.ForeignKey("roles.id", ondelete="CASCADE"), primary_key=True),
    )

    op.create_table(
        "role_permissions",
        sa.Column("role_id", UUID(as_uuid=True), sa.ForeignKey("roles.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("permission_id", UUID(as_uuid=True), sa.ForeignKey("permissions.id", ondelete="CASCADE"), primary_key=True),
    )

    # ── Seed roles ────────────────────────────────────────────────────
    roles_table = sa.table("roles",
        sa.column("id", UUID(as_uuid=True)),
        sa.column("name", sa.String),
        sa.column("description", sa.String),
    )
    admin_role_id = uuid.uuid4()
    user_role_id = uuid.uuid4()
    op.bulk_insert(roles_table, [
        {"id": admin_role_id, "name": "admin", "description": "Full access"},
        {"id": user_role_id,  "name": "user",  "description": "Standard user"},
    ])

    # ── Seed permissions ──────────────────────────────────────────────
    perms_table = sa.table("permissions",
        sa.column("id", UUID(as_uuid=True)),
        sa.column("resource", sa.String),
        sa.column("action", sa.String),
    )
    perm_matrix = [
        ("users", "read"), ("users", "write"), ("users", "delete"),
        ("roles", "read"), ("roles", "write"), ("roles", "delete"),
        ("permissions", "read"), ("permissions", "write"), ("permissions", "delete"),
        ("hello", "read"),
    ]
    perm_rows = [{"id": uuid.uuid4(), "resource": r, "action": a} for r, a in perm_matrix]
    op.bulk_insert(perms_table, perm_rows)

    # ── Seed role_permissions ─────────────────────────────────────────
    rp_table = sa.table("role_permissions",
        sa.column("role_id", UUID(as_uuid=True)),
        sa.column("permission_id", UUID(as_uuid=True)),
    )
    hello_read_id = next(p["id"] for p in perm_rows if p["resource"] == "hello" and p["action"] == "read")
    admin_rp = [{"role_id": admin_role_id, "permission_id": p["id"]} for p in perm_rows]
    user_rp  = [{"role_id": user_role_id,  "permission_id": hello_read_id}]
    op.bulk_insert(rp_table, admin_rp + user_rp)

    # ── Seed first admin user ─────────────────────────────────────────
    import bcrypt as _bcrypt
    admin_email    = os.environ.get("FIRST_ADMIN_EMAIL", "admin@example.com")
    admin_password = os.environ.get("FIRST_ADMIN_PASSWORD", "changeme")
    admin_user_id  = uuid.uuid4()
    hashed_admin_pw = _bcrypt.hashpw(admin_password.encode(), _bcrypt.gensalt()).decode()

    users_table = sa.table("users",
        sa.column("id", UUID(as_uuid=True)),
        sa.column("email", sa.String),
        sa.column("name", sa.String),
        sa.column("surname", sa.String),
        sa.column("hashed_password", sa.String),
        sa.column("is_active", sa.Boolean),
    )
    op.bulk_insert(users_table, [{
        "id": admin_user_id,
        "email": admin_email,
        "name": "Admin",
        "surname": "User",
        "hashed_password": hashed_admin_pw,
        "is_active": True,
    }])

    ur_table = sa.table("user_roles",
        sa.column("user_id", UUID(as_uuid=True)),
        sa.column("role_id", UUID(as_uuid=True)),
    )
    op.bulk_insert(ur_table, [{"user_id": admin_user_id, "role_id": admin_role_id}])


def downgrade() -> None:
    op.drop_table("user_roles")
    op.drop_table("role_permissions")
    op.drop_index("ix_users_email", table_name="users")
    op.drop_table("users")
    op.drop_table("permissions")
    op.drop_table("roles")
