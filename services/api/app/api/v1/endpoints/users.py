import uuid

from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.dependencies import require_permission
from app.models.user import User
from app.schemas.user import AssignRolesRequest, UserUpdate, UserWithRoles
from app.services import user_service

router = APIRouter(prefix="/users", tags=["users"])


@router.get("", response_model=list[UserWithRoles])
async def list_users(
    _: User = require_permission("users", "read"),
    db: AsyncSession = Depends(get_db),
):
    users = await user_service.list_users(db)
    return [UserWithRoles.from_orm_with_roles(u) for u in users]


@router.get("/{user_id}", response_model=UserWithRoles)
async def get_user(
    user_id: uuid.UUID,
    _: User = require_permission("users", "read"),
    db: AsyncSession = Depends(get_db),
):
    user = await user_service.get_user(user_id, db)
    return UserWithRoles.from_orm_with_roles(user)


@router.patch("/{user_id}", response_model=UserWithRoles)
async def update_user(
    user_id: uuid.UUID,
    data: UserUpdate,
    _: User = require_permission("users", "write"),
    db: AsyncSession = Depends(get_db),
):
    user = await user_service.update_user(user_id, data, db)
    return UserWithRoles.from_orm_with_roles(user)


@router.delete("/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
async def deactivate_user(
    user_id: uuid.UUID,
    _: User = require_permission("users", "delete"),
    db: AsyncSession = Depends(get_db),
):
    await user_service.deactivate_user(user_id, db)


@router.put("/{user_id}/roles", response_model=UserWithRoles)
async def assign_roles(
    user_id: uuid.UUID,
    data: AssignRolesRequest,
    _: User = require_permission("users", "write"),
    db: AsyncSession = Depends(get_db),
):
    user = await user_service.assign_roles(user_id, data.role_ids, db)
    return UserWithRoles.from_orm_with_roles(user)
