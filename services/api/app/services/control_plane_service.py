import uuid
from datetime import datetime, timezone

from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.control_plane import AccountSettings, EncryptedSecret, Installation
from app.models.user import User
from app.schemas.control_plane import (
    AccountSettingsRead,
    AccountSettingsUpdate,
    EncryptedSecretRead,
    EncryptedSecretUpdate,
    InstallationRead,
    InstallationRegister,
    PortableSettings,
)


def _default_settings() -> PortableSettings:
    return PortableSettings.model_validate({
        "schema_version": 1,
        "settings_sync_enabled": False,
        "api_key_sync_enabled": False,
        "appearance": {"theme": "system"},
        "ai": {
            "mode": "local",
            "chat": {"provider": "google", "model": "gemini-flash-latest"},
            "embeddings": {"provider": "google", "model": "gemini-embedding-001"},
        },
        "telemetry": {
            "enabled": True,
            "notice_version": "2026-07-21",
            "updated_at": datetime.now(timezone.utc),
        },
    })


async def get_account_settings(user: User, db: AsyncSession) -> AccountSettingsRead:
    row = await db.get(AccountSettings, user.id)
    if row is None:
        row = AccountSettings(
            user_id=user.id,
            revision=1,
            payload=_default_settings().model_dump(mode="json"),
        )
        db.add(row)
        await db.commit()
        await db.refresh(row)
    return AccountSettingsRead(
        settings=PortableSettings.model_validate(row.payload),
        revision=row.revision,
        updated_at=row.updated_at,
    )


async def put_account_settings(
    user: User, data: AccountSettingsUpdate, db: AsyncSession
) -> AccountSettingsRead:
    row = await db.get(AccountSettings, user.id)
    current_revision = row.revision if row else 0
    if data.expected_revision != current_revision:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={"code": "revision_conflict", "current_revision": current_revision},
        )
    if row is None:
        row = AccountSettings(user_id=user.id, revision=1, payload={})
        db.add(row)
    else:
        row.revision += 1
    row.payload = data.settings.model_dump(mode="json")
    await db.commit()
    await db.refresh(row)
    return AccountSettingsRead(
        settings=PortableSettings.model_validate(row.payload),
        revision=row.revision,
        updated_at=row.updated_at,
    )


async def get_encrypted_secret(user: User, db: AsyncSession) -> EncryptedSecretRead:
    row = await db.get(EncryptedSecret, user.id)
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No synced secret")
    return EncryptedSecretRead(
        envelope=row.envelope, revision=row.revision, updated_at=row.updated_at
    )


async def put_encrypted_secret(
    user: User, data: EncryptedSecretUpdate, db: AsyncSession
) -> EncryptedSecretRead:
    row = await db.get(EncryptedSecret, user.id)
    current_revision = row.revision if row else 0
    if data.expected_revision != current_revision:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={"code": "revision_conflict", "current_revision": current_revision},
        )
    if row is None:
        row = EncryptedSecret(user_id=user.id, revision=1, envelope=data.envelope)
        db.add(row)
    else:
        row.revision += 1
        row.envelope = data.envelope
    await db.commit()
    await db.refresh(row)
    return EncryptedSecretRead(
        envelope=row.envelope, revision=row.revision, updated_at=row.updated_at
    )


async def delete_encrypted_secret(user: User, db: AsyncSession) -> None:
    row = await db.get(EncryptedSecret, user.id)
    if row is not None:
        await db.delete(row)
        await db.commit()


async def register_installation(
    data: InstallationRegister, db: AsyncSession
) -> InstallationRead:
    now = datetime.now(timezone.utc)
    row = await db.get(Installation, data.installation_id)
    if row is None:
        row = Installation(
            id=data.installation_id,
            app_version=data.app_version,
            os_family=data.os_family,
            first_seen_at=now,
            last_seen_at=now,
        )
        db.add(row)
    else:
        row.app_version = data.app_version
        row.os_family = data.os_family
        row.last_seen_at = now
    await db.commit()
    await db.refresh(row)
    return InstallationRead(
        installation_id=row.id,
        linked_to_account=row.user_id is not None,
        first_seen_at=row.first_seen_at,
        last_seen_at=row.last_seen_at,
    )


async def link_installation(
    installation_id: uuid.UUID, user: User, db: AsyncSession
) -> InstallationRead:
    row = await db.get(Installation, installation_id)
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Installation not found")
    if row.user_id is not None and row.user_id != user.id:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Installation already linked")
    row.user_id = user.id
    row.last_seen_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(row)
    return InstallationRead(
        installation_id=row.id,
        linked_to_account=True,
        first_seen_at=row.first_seen_at,
        last_seen_at=row.last_seen_at,
    )
