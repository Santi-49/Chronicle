import uuid
from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import DateTime, ForeignKey, Index, Integer, JSON, String, Text, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin, UUIDMixin

if TYPE_CHECKING:
    from app.models.user import User


class ExternalIdentity(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "external_identities"
    __table_args__ = (
        UniqueConstraint("provider", "provider_subject", name="uq_external_identity_subject"),
        UniqueConstraint("user_id", "provider", name="uq_external_identity_user_provider"),
    )

    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    provider: Mapped[str] = mapped_column(String(32), nullable=False)
    provider_subject: Mapped[str] = mapped_column(String(255), nullable=False)
    last_login_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    user: Mapped["User"] = relationship("User", back_populates="external_identities")


class AccountSettings(Base, TimestampMixin):
    __tablename__ = "account_settings"

    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    revision: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    payload: Mapped[dict] = mapped_column(JSON, nullable=False)

    user: Mapped["User"] = relationship("User", back_populates="account_settings")


class EncryptedSecret(Base, TimestampMixin):
    __tablename__ = "encrypted_secrets"

    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    revision: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    # Opaque, client-encrypted envelope. The API never parses or logs it.
    envelope: Mapped[str] = mapped_column(Text, nullable=False)

    user: Mapped["User"] = relationship("User", back_populates="encrypted_secret")


class Installation(Base, TimestampMixin):
    __tablename__ = "installations"
    __table_args__ = (Index("ix_installations_user_id", "user_id"),)

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True)
    user_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    app_version: Mapped[str] = mapped_column(String(32), nullable=False)
    os_family: Mapped[str] = mapped_column(String(16), nullable=False)
    first_seen_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    last_seen_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )


class TelemetryEvent(Base, TimestampMixin):
    """Append-only telemetry event log. The envelope column is intentionally
    opaque JSON stored verbatim — the API validates the shape on ingestion via
    Pydantic, then persists the sanitised dict. The backend never logs it."""
    __tablename__ = "telemetry_events"
    __table_args__ = (
        Index("ix_telemetry_events_installation_id", "installation_id"),
        Index("ix_telemetry_events_occurred_at", "occurred_at"),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True)  # client-supplied; idempotency key
    installation_id: Mapped[uuid.UUID] = mapped_column(nullable=False)
    event_type: Mapped[str] = mapped_column(String(64), nullable=False)
    occurred_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    payload: Mapped[dict] = mapped_column(JSON, nullable=False)


class ProjectTelemetry(Base, TimestampMixin):
    """Per-installation project inventory record. Keyed by a client-generated
    random UUID that carries no link to the project's real name or path."""
    __tablename__ = "project_telemetry"
    __table_args__ = (
        Index("ix_project_telemetry_installation_id", "installation_id"),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True)  # = projectTelemetryId
    installation_id: Mapped[uuid.UUID] = mapped_column(nullable=False)
    tracked_file_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    file_type_counts: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
