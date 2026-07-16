import uuid
from datetime import datetime

from pydantic import BaseModel, EmailStr


class UserRead(BaseModel):
    model_config = {"from_attributes": True}

    id: uuid.UUID
    email: EmailStr
    name: str
    surname: str
    is_active: bool
    created_at: datetime
    updated_at: datetime


class UserWithRoles(UserRead):
    roles: list[str] = []

    @classmethod
    def from_orm_with_roles(cls, user) -> "UserWithRoles":
        return cls(
            id=user.id,
            email=user.email,
            name=user.name,
            surname=user.surname,
            is_active=user.is_active,
            created_at=user.created_at,
            updated_at=user.updated_at,
            roles=user.role_names,
        )


class UserUpdate(BaseModel):
    name: str | None = None
    surname: str | None = None
    email: EmailStr | None = None
    is_active: bool | None = None


class AssignRolesRequest(BaseModel):
    role_ids: list[uuid.UUID]
