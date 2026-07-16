import uuid

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.permission import Permission
from app.schemas.permission import PermissionCreate


async def list_permissions(db: AsyncSession) -> list[Permission]:
    result = await db.execute(select(Permission))
    return list(result.scalars().all())


async def create_permission(data: PermissionCreate, db: AsyncSession) -> Permission:
    existing = await db.execute(
        select(Permission).where(
            Permission.resource == data.resource, Permission.action == data.action
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Permission already exists")
    perm = Permission(resource=data.resource, action=data.action, description=data.description)
    db.add(perm)
    await db.commit()
    await db.refresh(perm)
    return perm


async def delete_permission(perm_id: uuid.UUID, db: AsyncSession) -> None:
    result = await db.execute(select(Permission).where(Permission.id == perm_id))
    perm = result.scalar_one_or_none()
    if not perm:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Permission not found")
    await db.delete(perm)
    await db.commit()
