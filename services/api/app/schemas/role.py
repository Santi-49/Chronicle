import uuid
from datetime import datetime

from pydantic import BaseModel

from app.schemas.permission import PermissionRead


class RoleCreate(BaseModel):
    name: str
    description: str | None = None


class RoleRead(BaseModel):
    model_config = {"from_attributes": True}

    id: uuid.UUID
    name: str
    description: str | None
    created_at: datetime
    permissions: list[PermissionRead] = []


class RoleUpdate(BaseModel):
    name: str | None = None
    description: str | None = None


class AssignPermissionsRequest(BaseModel):
    permission_ids: list[uuid.UUID]
