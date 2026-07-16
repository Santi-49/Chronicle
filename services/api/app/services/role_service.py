import uuid

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.permission import Permission
from app.models.role import Role
from app.schemas.role import RoleCreate, RoleUpdate


async def get_role(role_id: uuid.UUID, db: AsyncSession) -> Role:
    result = await db.execute(select(Role).where(Role.id == role_id))
    role = result.scalar_one_or_none()
    if not role:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Role not found")
    return role


async def list_roles(db: AsyncSession) -> list[Role]:
    result = await db.execute(select(Role))
    return list(result.scalars().all())


async def create_role(data: RoleCreate, db: AsyncSession) -> Role:
    existing = await db.execute(select(Role).where(Role.name == data.name))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Role already exists")
    role = Role(name=data.name, description=data.description)
    db.add(role)
    await db.commit()
    await db.refresh(role)
    return role


async def update_role(role_id: uuid.UUID, data: RoleUpdate, db: AsyncSession) -> Role:
    role = await get_role(role_id, db)
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(role, field, value)
    await db.commit()
    await db.refresh(role)
    return role


async def delete_role(role_id: uuid.UUID, db: AsyncSession) -> None:
    role = await get_role(role_id, db)
    await db.delete(role)
    await db.commit()


async def assign_permissions(
    role_id: uuid.UUID, permission_ids: list[uuid.UUID], db: AsyncSession
) -> Role:
    role = await get_role(role_id, db)
    result = await db.execute(select(Permission).where(Permission.id.in_(permission_ids)))
    permissions = list(result.scalars().all())
    if len(permissions) != len(permission_ids):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="One or more permissions not found")
    role.permissions = permissions
    await db.commit()
    await db.refresh(role)
    return role
