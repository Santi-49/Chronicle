import uuid

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.role import Role
from app.models.user import User
from app.schemas.user import UserUpdate


async def get_user(user_id: uuid.UUID, db: AsyncSession) -> User:
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    return user


async def list_users(db: AsyncSession) -> list[User]:
    result = await db.execute(select(User))
    return list(result.scalars().all())


async def update_user(user_id: uuid.UUID, data: UserUpdate, db: AsyncSession) -> User:
    user = await get_user(user_id, db)
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(user, field, value)
    await db.commit()
    await db.refresh(user)
    return user


async def deactivate_user(user_id: uuid.UUID, db: AsyncSession) -> None:
    user = await get_user(user_id, db)
    user.is_active = False
    await db.commit()


async def assign_roles(user_id: uuid.UUID, role_ids: list[uuid.UUID], db: AsyncSession) -> User:
    user = await get_user(user_id, db)
    result = await db.execute(select(Role).where(Role.id.in_(role_ids)))
    roles = list(result.scalars().all())
    if len(roles) != len(role_ids):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="One or more roles not found")
    user.roles = roles
    await db.commit()
    await db.refresh(user)
    return user
