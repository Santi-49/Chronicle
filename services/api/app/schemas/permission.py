import uuid

from pydantic import BaseModel


class PermissionCreate(BaseModel):
    resource: str
    action: str
    description: str | None = None


class PermissionRead(BaseModel):
    model_config = {"from_attributes": True}

    id: uuid.UUID
    resource: str
    action: str
    description: str | None
