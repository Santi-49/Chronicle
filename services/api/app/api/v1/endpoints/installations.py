import uuid

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.dependencies import get_current_user
from app.models.user import User
from app.schemas.control_plane import InstallationRead, InstallationRegister
from app.services import control_plane_service

router = APIRouter(prefix="/installations", tags=["installations"])


@router.post("/register", response_model=InstallationRead)
async def register_installation(
    data: InstallationRegister,
    db: AsyncSession = Depends(get_db),
):
    return await control_plane_service.register_installation(data, db)


@router.put("/{installation_id}/link", response_model=InstallationRead)
async def link_installation(
    installation_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    return await control_plane_service.link_installation(installation_id, user, db)
