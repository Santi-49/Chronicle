from fastapi import APIRouter

from app.core.dependencies import require_permission
from app.models.user import User

router = APIRouter(prefix="/hello", tags=["hello"])


@router.get("")
async def hello_public():
    return {"message": "Hello, world!"}


@router.get("/protected")
async def hello_protected(current_user: User = require_permission("hello", "read")):
    return {"message": f"Hello, {current_user.name} {current_user.surname}!"}
