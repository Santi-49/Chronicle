from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.dependencies import get_current_user, require_permission
from app.models.user import User
from app.schemas.control_plane import (
    AccountDataExport,
    AccountSettingsRead,
    AccountSettingsUpdate,
    EncryptedSecretRead,
    EncryptedSecretUpdate,
)
from app.services import control_plane_service, privacy_service

router = APIRouter(prefix="/account", tags=["account"])


@router.get("/settings", response_model=AccountSettingsRead)
async def get_settings(
    user: User = require_permission("account", "read"),
    db: AsyncSession = Depends(get_db),
):
    return await control_plane_service.get_account_settings(user, db)


@router.put("/settings", response_model=AccountSettingsRead)
async def put_settings(
    data: AccountSettingsUpdate,
    user: User = require_permission("account", "write"),
    db: AsyncSession = Depends(get_db),
):
    return await control_plane_service.put_account_settings(user, data, db)


@router.get("/secrets", response_model=EncryptedSecretRead)
async def get_secret(
    user: User = require_permission("account", "read"),
    db: AsyncSession = Depends(get_db),
):
    return await control_plane_service.get_encrypted_secret(user, db)


@router.put("/secrets", response_model=EncryptedSecretRead)
async def put_secret(
    data: EncryptedSecretUpdate,
    user: User = require_permission("account", "write"),
    db: AsyncSession = Depends(get_db),
):
    return await control_plane_service.put_encrypted_secret(user, data, db)


@router.delete("/secrets", status_code=status.HTTP_204_NO_CONTENT)
async def delete_secret(
    user: User = require_permission("account", "write"),
    db: AsyncSession = Depends(get_db),
):
    await control_plane_service.delete_encrypted_secret(user, db)


@router.get("/export", response_model=AccountDataExport)
async def export_account_data(
    user: User = require_permission("account", "read"),
    db: AsyncSession = Depends(get_db),
):
    return await privacy_service.export_account_data(user, db)


@router.delete("", status_code=status.HTTP_204_NO_CONTENT)
async def erase_current_account(
    # This endpoint can only erase the authenticated caller; it accepts no
    # target account ID. Authentication is therefore the authorization
    # boundary, and stale role/OPA state must not block self-service erasure.
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await privacy_service.erase_account(user, db)
