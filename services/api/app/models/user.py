from typing import TYPE_CHECKING

from sqlalchemy import Boolean, String, Index
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin, UUIDMixin

if TYPE_CHECKING:
    from app.models.role import Role


class User(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "users"
    __table_args__ = (Index("ix_users_email", "email"),)

    email: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    surname: Mapped[str] = mapped_column(String(100), nullable=False)
    hashed_password: Mapped[str | None] = mapped_column(String(255), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)

    roles: Mapped[list["Role"]] = relationship(
        "Role", secondary="user_roles", back_populates="users", lazy="selectin"
    )
    external_identities = relationship(
        "ExternalIdentity", back_populates="user", cascade="all, delete-orphan", lazy="selectin"
    )
    account_settings = relationship(
        "AccountSettings", back_populates="user", cascade="all, delete-orphan", uselist=False
    )
    encrypted_secret = relationship(
        "EncryptedSecret", back_populates="user", cascade="all, delete-orphan", uselist=False
    )

    @property
    def role_names(self) -> list[str]:
        return [r.name for r in self.roles]
