"""GDPR access, preference-audit, and transactional account-erasure operations."""
from datetime import datetime, timezone
from typing import Any
import uuid

from fastapi import HTTPException, status
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core import redis as token_store
from app.models.associations import UserRoles
from app.models.control_plane import (
    AccountSettings,
    EncryptedSecret,
    ExternalIdentity,
    Installation,
    InstallationTelemetry,
    ProjectTelemetry,
    TelemetryError,
    TelemetryHourlyAiUsage,
    TelemetryHourlyUsage,
    TelemetryPreferenceAudit,
    TelemetryProjectRemoval,
    TelemetrySession,
)
from app.models.user import User
from app.schemas.control_plane import (
    AccountDataExport,
    InstallationDataExport,
    TelemetryPreferenceRead,
    TelemetryPreferenceWrite,
)

TELEMETRY_MODELS = (
    TelemetrySession,
    TelemetryProjectRemoval,
    TelemetryHourlyUsage,
    TelemetryHourlyAiUsage,
    TelemetryError,
    InstallationTelemetry,
    ProjectTelemetry,
)


def _row(row: Any, *, exclude: set[str] | None = None) -> dict[str, Any]:
    blocked = exclude or set()
    return {
        column.name: getattr(row, column.name)
        for column in row.__table__.columns
        if column.name not in blocked
    }


async def record_telemetry_preference(
    data: TelemetryPreferenceWrite, db: AsyncSession
) -> TelemetryPreferenceRead:
    installation = await db.get(Installation, data.installation_id)
    if installation is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Installation must be registered before recording a preference",
        )
    row = TelemetryPreferenceAudit(
        installation_id=installation.id,
        user_id=installation.user_id,
        enabled=data.enabled,
        notice_version=data.notice_version,
        preference_updated_at=data.updated_at,
    )
    db.add(row)
    await db.commit()
    await db.refresh(row)
    return TelemetryPreferenceRead(
        id=row.id,
        installation_id=row.installation_id,
        enabled=row.enabled,
        notice_version=row.notice_version,
        updated_at=row.preference_updated_at,
        account_linked=row.user_id is not None,
        recorded_at=row.created_at,
    )


async def export_account_data(user: User, db: AsyncSession) -> AccountDataExport:
    installations = list((await db.scalars(
        select(Installation).where(Installation.user_id == user.id)
    )).all())
    installation_ids = [row.id for row in installations]
    identities = list((await db.scalars(
        select(ExternalIdentity).where(ExternalIdentity.user_id == user.id)
    )).all())
    preferences = list((await db.scalars(
        select(TelemetryPreferenceAudit).where(
            (TelemetryPreferenceAudit.user_id == user.id)
            | (TelemetryPreferenceAudit.installation_id.in_(installation_ids))
        )
    )).all()) if installation_ids else list((await db.scalars(
        select(TelemetryPreferenceAudit).where(TelemetryPreferenceAudit.user_id == user.id)
    )).all())

    statistics: dict[str, list[dict[str, Any]]] = {}
    for model in TELEMETRY_MODELS:
        if not installation_ids:
            rows = []
        else:
            rows = list((await db.scalars(
                select(model).where(model.installation_id.in_(installation_ids))
            )).all())
        statistics[model.__tablename__] = [_row(row) for row in rows]

    settings = await db.get(AccountSettings, user.id)
    secret = await db.get(EncryptedSecret, user.id)
    return AccountDataExport(
        exported_at=datetime.now(timezone.utc),
        account=_row(user, exclude={"hashed_password"}),
        external_identities=[_row(row) for row in identities],
        settings=_row(settings) if settings else None,
        encrypted_secret=_row(secret) if secret else None,
        installations=[_row(row) for row in installations],
        telemetry_preferences=[_row(row) for row in preferences],
        usage_statistics=statistics,
    )


async def export_installation_data(
    installation_id: uuid.UUID,
    current_user: User | None,
    db: AsyncSession,
) -> InstallationDataExport:
    installation = await db.get(Installation, installation_id)
    if installation is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Installation not found")
    if installation.user_id is not None and (
        current_user is None or current_user.id != installation.user_id
    ):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")
    preferences = list((await db.scalars(
        select(TelemetryPreferenceAudit).where(
            TelemetryPreferenceAudit.installation_id == installation_id
        )
    )).all())
    statistics: dict[str, list[dict[str, Any]]] = {}
    for model in TELEMETRY_MODELS:
        rows = list((await db.scalars(
            select(model).where(model.installation_id == installation_id)
        )).all())
        statistics[model.__tablename__] = [_row(row) for row in rows]
    return InstallationDataExport(
        exported_at=datetime.now(timezone.utc),
        installation=_row(installation),
        telemetry_preferences=[_row(row) for row in preferences],
        usage_statistics=statistics,
    )


async def erase_installation_data(
    installation_id: uuid.UUID,
    current_user: User | None,
    db: AsyncSession,
) -> None:
    installation = await db.get(Installation, installation_id)
    if installation is None:
        return
    if installation.user_id is not None and (
        current_user is None or current_user.id != installation.user_id
    ):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")
    try:
        for model in TELEMETRY_MODELS:
            await db.execute(delete(model).where(model.installation_id == installation_id))
        await db.execute(delete(TelemetryPreferenceAudit).where(
            TelemetryPreferenceAudit.installation_id == installation_id
        ))
        await db.delete(installation)
        await db.commit()
    except Exception:
        await db.rollback()
        raise


async def erase_account(user: User, db: AsyncSession) -> None:
    """Erase all account-linked rows atomically, then revoke every session."""
    user_id = user.id
    try:
        installation_ids = list((await db.scalars(
            select(Installation.id).where(Installation.user_id == user_id)
        )).all())
        if installation_ids:
            for model in TELEMETRY_MODELS:
                await db.execute(delete(model).where(model.installation_id.in_(installation_ids)))
            await db.execute(delete(TelemetryPreferenceAudit).where(
                TelemetryPreferenceAudit.installation_id.in_(installation_ids)
            ))
        await db.execute(delete(TelemetryPreferenceAudit).where(
            TelemetryPreferenceAudit.user_id == user_id
        ))
        await db.execute(delete(Installation).where(Installation.user_id == user_id))
        await db.execute(delete(EncryptedSecret).where(EncryptedSecret.user_id == user_id))
        await db.execute(delete(AccountSettings).where(AccountSettings.user_id == user_id))
        await db.execute(delete(ExternalIdentity).where(ExternalIdentity.user_id == user_id))
        await db.execute(delete(UserRoles).where(UserRoles.user_id == user_id))
        await db.execute(delete(User).where(User.id == user_id))
        await db.commit()
    except Exception:
        await db.rollback()
        raise

    # A missing user makes every JWT unusable even if Redis is temporarily
    # unavailable; this removes the whitelist entries as the normal path.
    try:
        await token_store.revoke_all_user_tokens(str(user_id))
    except Exception:
        # The deleted user row already makes every JWT fail authentication.
        # Do not report a reversible-looking failure after the DB transaction
        # has irreversibly succeeded merely because Redis is unavailable.
        pass
