import uuid

from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.dependencies import require_permission
from app.models.user import User
from app.schemas.permission import PermissionCreate, PermissionRead
from app.services import permission_service

router = APIRouter(prefix="/permissions", tags=["permissions"])


@router.get("", response_model=list[PermissionRead])
async def list_permissions(
    _: User = require_permission("permissions", "read"),
    db: AsyncSession = Depends(get_db),
):
    return await permission_service.list_permissions(db)


@router.post("", response_model=PermissionRead, status_code=status.HTTP_201_CREATED)
async def create_permission(
    data: PermissionCreate,
    _: User = require_permission("permissions", "write"),
    db: AsyncSession = Depends(get_db),
):
    return await permission_service.create_permission(data, db)


@router.delete("/{perm_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_permission(
    perm_id: uuid.UUID,
    _: User = require_permission("permissions", "delete"),
    db: AsyncSession = Depends(get_db),
):
    await permission_service.delete_permission(perm_id, db)
