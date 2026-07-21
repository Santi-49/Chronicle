from datetime import datetime, timezone

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core import redis as token_store
from app.core.config import settings
from app.core.security import create_token, hash_password, verify_password
from app.models.role import Role
from app.models.control_plane import ExternalIdentity
from app.models.user import User
from app.schemas.auth import RegisterRequest
from app.schemas.control_plane import GoogleIdentityClaims
from app.schemas.token import TokenPair


async def register_user(data: RegisterRequest, db: AsyncSession) -> User:
    existing = await db.execute(select(User).where(User.email == data.email))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Email already registered")

    default_role = await db.execute(select(Role).where(Role.name == "user"))
    role = default_role.scalar_one_or_none()

    user = User(
        email=data.email,
        name=data.name,
        surname=data.surname,
        hashed_password=hash_password(data.password),
    )
    if role:
        user.roles.append(role)
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return user


async def _default_role(db: AsyncSession) -> Role | None:
    result = await db.execute(select(Role).where(Role.name == "user"))
    return result.scalar_one_or_none()


def _google_names(claims: GoogleIdentityClaims) -> tuple[str, str]:
    given = claims.given_name.strip()
    family = claims.family_name.strip()
    if not given and claims.display_name.strip():
        parts = claims.display_name.strip().split(maxsplit=1)
        given = parts[0]
        family = parts[1] if len(parts) > 1 else ""
    return given or "Google", family or "User"


async def authenticate_google(claims: GoogleIdentityClaims, db: AsyncSession) -> User:
    result = await db.execute(
        select(User)
        .join(ExternalIdentity, ExternalIdentity.user_id == User.id)
        .where(
            ExternalIdentity.provider == "google",
            ExternalIdentity.provider_subject == claims.subject,
        )
    )
    user = result.scalar_one_or_none()
    if user is not None:
        if not user.is_active:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Account inactive")
        identity_result = await db.execute(
            select(ExternalIdentity).where(
                ExternalIdentity.provider == "google",
                ExternalIdentity.provider_subject == claims.subject,
            )
        )
        identity_result.scalar_one().last_login_at = datetime.now(timezone.utc)
        await db.commit()
        return user

    existing = await db.execute(select(User).where(User.email == claims.email))
    if existing.scalar_one_or_none() is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={
                "code": "account_link_required",
                "message": "Sign in to the existing Chronicle account before linking Google",
            },
        )

    name, surname = _google_names(claims)
    user = User(
        email=claims.email,
        name=name,
        surname=surname,
        hashed_password=None,
    )
    role = await _default_role(db)
    if role:
        user.roles.append(role)
    db.add(user)
    await db.flush()
    db.add(ExternalIdentity(
        user_id=user.id,
        provider="google",
        provider_subject=claims.subject,
        last_login_at=datetime.now(timezone.utc),
    ))
    await db.commit()
    await db.refresh(user)
    return user


async def link_google_identity(
    user: User, claims: GoogleIdentityClaims, db: AsyncSession
) -> None:
    result = await db.execute(
        select(ExternalIdentity).where(
            ExternalIdentity.provider == "google",
            ExternalIdentity.provider_subject == claims.subject,
        )
    )
    identity = result.scalar_one_or_none()
    if identity is not None and identity.user_id != user.id:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Google account is already linked to another Chronicle account",
        )

    own_result = await db.execute(
        select(ExternalIdentity).where(
            ExternalIdentity.user_id == user.id,
            ExternalIdentity.provider == "google",
        )
    )
    own_identity = own_result.scalar_one_or_none()
    if own_identity is not None and own_identity.provider_subject != claims.subject:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Chronicle account already has a different Google identity",
        )
    if identity is None:
        db.add(ExternalIdentity(
            user_id=user.id,
            provider="google",
            provider_subject=claims.subject,
            last_login_at=datetime.now(timezone.utc),
        ))
    else:
        identity.last_login_at = datetime.now(timezone.utc)
    await db.commit()


async def authenticate_user(email: str, password: str, db: AsyncSession) -> User:
    result = await db.execute(select(User).where(User.email == email))
    user = result.scalar_one_or_none()
    if not user or user.hashed_password is None or not verify_password(password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials"
        )
    if not user.is_active:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Account inactive")
    return user


async def issue_tokens(user: User) -> TokenPair:
    access_token, access_jti = create_token(str(user.id), "access")
    refresh_token, refresh_jti = create_token(str(user.id), "refresh")

    access_ttl = settings.access_token_expire_minutes * 60
    refresh_ttl = settings.refresh_token_expire_days * 86400

    await token_store.store_token(access_jti, str(user.id), access_ttl)
    await token_store.store_token(refresh_jti, str(user.id), refresh_ttl)
    await token_store.store_user_refresh_jti(str(user.id), refresh_jti, refresh_ttl)

    return TokenPair(access_token=access_token, refresh_token=refresh_token)


async def revoke_tokens(user: User, access_jti: str) -> None:
    refresh_jti = await token_store.get_user_refresh_jti(str(user.id))
    await token_store.revoke_token(access_jti)
    if refresh_jti:
        await token_store.revoke_token(refresh_jti)
    await token_store.delete_user_refresh_jti(str(user.id))


async def refresh_tokens(refresh_token_str: str) -> TokenPair:
    from jose import JWTError
    from app.core.security import decode_token

    try:
        payload = decode_token(refresh_token_str)
    except JWTError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")

    if payload.get("type") != "refresh":
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token type")

    refresh_jti = payload.get("jti")
    user_id = payload.get("sub")

    if not await token_store.token_exists(refresh_jti):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token revoked")

    await token_store.revoke_token(refresh_jti)
    await token_store.delete_user_refresh_jti(user_id)

    access_token, access_jti = create_token(user_id, "access")
    new_refresh_token, new_refresh_jti = create_token(user_id, "refresh")

    access_ttl = settings.access_token_expire_minutes * 60
    refresh_ttl = settings.refresh_token_expire_days * 86400

    await token_store.store_token(access_jti, user_id, access_ttl)
    await token_store.store_token(new_refresh_jti, user_id, refresh_ttl)
    await token_store.store_user_refresh_jti(user_id, new_refresh_jti, refresh_ttl)

    return TokenPair(access_token=access_token, refresh_token=new_refresh_token)
