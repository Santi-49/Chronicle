import uuid

from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.dependencies import require_permission
from app.models.user import User
from app.schemas.role import AssignPermissionsRequest, RoleCreate, RoleRead, RoleUpdate
from app.services import role_service

router = APIRouter(prefix="/roles", tags=["roles"])


@router.get("", response_model=list[RoleRead])
async def list_roles(
    _: User = require_permission("roles", "read"),
    db: AsyncSession = Depends(get_db),
):
    return await role_service.list_roles(db)


@router.post("", response_model=RoleRead, status_code=status.HTTP_201_CREATED)
async def create_role(
    data: RoleCreate,
    _: User = require_permission("roles", "write"),
    db: AsyncSession = Depends(get_db),
):
    return await role_service.create_role(data, db)


@router.get("/{role_id}", response_model=RoleRead)
async def get_role(
    role_id: uuid.UUID,
    _: User = require_permission("roles", "read"),
    db: AsyncSession = Depends(get_db),
):
    return await role_service.get_role(role_id, db)


@router.patch("/{role_id}", response_model=RoleRead)
async def update_role(
    role_id: uuid.UUID,
    data: RoleUpdate,
    _: User = require_permission("roles", "write"),
    db: AsyncSession = Depends(get_db),
):
    return await role_service.update_role(role_id, data, db)


@router.delete("/{role_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_role(
    role_id: uuid.UUID,
    _: User = require_permission("roles", "delete"),
    db: AsyncSession = Depends(get_db),
):
    await role_service.delete_role(role_id, db)


@router.put("/{role_id}/permissions", response_model=RoleRead)
async def assign_permissions(
    role_id: uuid.UUID,
    data: AssignPermissionsRequest,
    _: User = require_permission("roles", "write"),
    db: AsyncSession = Depends(get_db),
):
    return await role_service.assign_permissions(role_id, data.permission_ids, db)
