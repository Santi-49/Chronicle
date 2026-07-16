import uuid

from sqlalchemy import ForeignKey, Uuid
from sqlalchemy.orm import mapped_column, MappedColumn

from app.models.base import Base


class UserRoles(Base):
    __tablename__ = "user_roles"

    user_id: MappedColumn[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    role_id: MappedColumn[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("roles.id", ondelete="CASCADE"), primary_key=True
    )


class RolePermissions(Base):
    __tablename__ = "role_permissions"

    role_id: MappedColumn[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("roles.id", ondelete="CASCADE"), primary_key=True
    )
    permission_id: MappedColumn[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("permissions.id", ondelete="CASCADE"),
        primary_key=True,
    )
