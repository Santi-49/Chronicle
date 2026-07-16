from fastapi import APIRouter, Depends, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.dependencies import get_current_user
from app.core.security import decode_token
from app.models.user import User
from app.schemas.auth import LoginRequest, RegisterRequest
from app.schemas.token import TokenPair
from app.schemas.user import UserWithRoles
from app.services import auth_service

router = APIRouter(prefix="/auth", tags=["auth"])
bearer_scheme = HTTPBearer()


@router.post("/register", response_model=UserWithRoles, status_code=status.HTTP_201_CREATED)
async def register(data: RegisterRequest, db: AsyncSession = Depends(get_db)):
    user = await auth_service.register_user(data, db)
    return UserWithRoles.from_orm_with_roles(user)


@router.post("/login", response_model=TokenPair)
async def login(data: LoginRequest, db: AsyncSession = Depends(get_db)):
    user = await auth_service.authenticate_user(data.email, data.password, db)
    return await auth_service.issue_tokens(user)


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme),
    current_user: User = Depends(get_current_user),
):
    payload = decode_token(credentials.credentials)
    await auth_service.revoke_tokens(current_user, payload["jti"])


@router.post("/refresh", response_model=TokenPair)
async def refresh(credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme)):
    return await auth_service.refresh_tokens(credentials.credentials)


@router.get("/me", response_model=UserWithRoles)
async def me(current_user: User = Depends(get_current_user)):
    return UserWithRoles.from_orm_with_roles(current_user)
