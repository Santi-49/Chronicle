import uuid
from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import Boolean, DateTime, ForeignKey, Index, Integer, JSON, String, Text, UniqueConstraint, func
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
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    provider: Mapped[str] = mapped_column(String(32), nullable=False)
    provider_subject: Mapped[str] = mapped_column(String(255), nullable=False)
    last_login_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    user: Mapped["User"] = relationship("User", back_populates="external_identities")


class AccountSettings(Base, TimestampMixin):
    __tablename__ = "account_settings"
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    revision: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    payload: Mapped[dict] = mapped_column(JSON, nullable=False)
    user: Mapped["User"] = relationship("User", back_populates="account_settings")


class EncryptedSecret(Base, TimestampMixin):
    __tablename__ = "encrypted_secrets"
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    revision: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    envelope: Mapped[str] = mapped_column(Text, nullable=False)
    user: Mapped["User"] = relationship("User", back_populates="encrypted_secret")


class Installation(Base, TimestampMixin):
    __tablename__ = "installations"
    __table_args__ = (Index("ix_installations_user_id", "user_id"),)
    id: Mapped[uuid.UUID] = mapped_column(primary_key=True)
    user_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    app_version: Mapped[str] = mapped_column(String(32), nullable=False)
    os_family: Mapped[str] = mapped_column(String(16), nullable=False)
    first_seen_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    last_seen_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)


class LocationColumns:
    country_code: Mapped[str | None] = mapped_column(String(2), nullable=True)
    region_code: Mapped[str | None] = mapped_column(String(16), nullable=True)
    city: Mapped[str | None] = mapped_column(String(128), nullable=True)


class TelemetrySession(Base, TimestampMixin, LocationColumns):
    __tablename__ = "telemetry_sessions"
    id: Mapped[uuid.UUID] = mapped_column(primary_key=True)
    installation_id: Mapped[uuid.UUID] = mapped_column(nullable=False, index=True)
    opened_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, index=True)
    app_version: Mapped[str] = mapped_column(String(32), nullable=False)
    os_family: Mapped[str] = mapped_column(String(16), nullable=False)


class TelemetryProjectRemoval(Base, TimestampMixin, LocationColumns):
    __tablename__ = "telemetry_project_removals"
    id: Mapped[uuid.UUID] = mapped_column(primary_key=True)
    installation_id: Mapped[uuid.UUID] = mapped_column(nullable=False, index=True)
    project_telemetry_id: Mapped[uuid.UUID] = mapped_column(nullable=False)
    occurred_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, index=True)
    history_deleted: Mapped[bool] = mapped_column(Boolean, nullable=False)


class TelemetryHourlyUsage(Base, TimestampMixin, LocationColumns):
    __tablename__ = "telemetry_hourly_usage"
    installation_id: Mapped[uuid.UUID] = mapped_column(primary_key=True)
    bucket_start: Mapped[datetime] = mapped_column(DateTime(timezone=True), primary_key=True)
    search_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)


class TelemetryHourlyAiUsage(Base, TimestampMixin, LocationColumns):
    __tablename__ = "telemetry_hourly_ai_usage"
    installation_id: Mapped[uuid.UUID] = mapped_column(primary_key=True)
    bucket_start: Mapped[datetime] = mapped_column(DateTime(timezone=True), primary_key=True)
    operation: Mapped[str] = mapped_column(String(16), primary_key=True)
    provider: Mapped[str] = mapped_column(String(100), primary_key=True)
    model: Mapped[str] = mapped_column(String(200), primary_key=True)
    attempt_count: Mapped[int] = mapped_column(Integer, nullable=False)
    success_count: Mapped[int] = mapped_column(Integer, nullable=False)
    failure_count: Mapped[int] = mapped_column(Integer, nullable=False)
    total_latency_ms: Mapped[int] = mapped_column(Integer, nullable=False)


class TelemetryError(Base, TimestampMixin, LocationColumns):
    __tablename__ = "telemetry_errors"
    id: Mapped[uuid.UUID] = mapped_column(primary_key=True)
    installation_id: Mapped[uuid.UUID] = mapped_column(nullable=False, index=True)
    occurred_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, index=True)
    process: Mapped[str] = mapped_column(String(16), nullable=False)
    component: Mapped[str] = mapped_column(String(64), nullable=False)
    operation: Mapped[str] = mapped_column(String(100), nullable=False)
    error_name: Mapped[str] = mapped_column(String(100), nullable=False)
    error_code: Mapped[str | None] = mapped_column(String(100), nullable=True)
    sanitized_message: Mapped[str] = mapped_column(String(500), nullable=False)
    stack_fingerprint: Mapped[str] = mapped_column(String(128), nullable=False, index=True)
    sanitized_stack: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    severity: Mapped[str] = mapped_column(String(16), nullable=False)
    fatal: Mapped[bool] = mapped_column(Boolean, nullable=False)
    handled: Mapped[bool] = mapped_column(Boolean, nullable=False)
    app_version: Mapped[str] = mapped_column(String(32), nullable=False)
    os_family: Mapped[str] = mapped_column(String(16), nullable=False)
    provider: Mapped[str | None] = mapped_column(String(100), nullable=True)
    model: Mapped[str | None] = mapped_column(String(200), nullable=True)


class InstallationTelemetry(Base, TimestampMixin, LocationColumns):
    __tablename__ = "installation_telemetry"
    installation_id: Mapped[uuid.UUID] = mapped_column(primary_key=True)
    captured_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    project_count: Mapped[int] = mapped_column(Integer, nullable=False)
    asset_count: Mapped[int] = mapped_column(Integer, nullable=False)
    version_count: Mapped[int] = mapped_column(Integer, nullable=False)
    ai_annotated_version_count: Mapped[int] = mapped_column(Integer, nullable=False)
    annotation_provider: Mapped[str | None] = mapped_column(String(100), nullable=True)
    annotation_model: Mapped[str | None] = mapped_column(String(200), nullable=True)
    embedding_provider: Mapped[str | None] = mapped_column(String(100), nullable=True)
    embedding_model: Mapped[str | None] = mapped_column(String(200), nullable=True)
    app_version: Mapped[str] = mapped_column(String(32), nullable=False)
    os_family: Mapped[str] = mapped_column(String(16), nullable=False)


class ProjectTelemetry(Base, TimestampMixin):
    __tablename__ = "project_telemetry"
    __table_args__ = (Index("ix_project_telemetry_installation_id", "installation_id"),)
    id: Mapped[uuid.UUID] = mapped_column(primary_key=True)
    installation_id: Mapped[uuid.UUID] = mapped_column(nullable=False)
    captured_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    asset_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    version_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    ai_annotated_version_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    png_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    jpg_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    other_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
