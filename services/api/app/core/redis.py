import redis.asyncio as aioredis

from app.core.config import settings

_redis: aioredis.Redis | None = None


def get_redis_client() -> aioredis.Redis:
    global _redis
    if _redis is None:
        _redis = aioredis.from_url(settings.redis_url, decode_responses=True)
    return _redis


# ── Token whitelist helpers ────────────────────────────────────────────

async def store_token(jti: str, user_id: str, ttl_seconds: int) -> None:
    await get_redis_client().set(f"token:{jti}", user_id, ex=ttl_seconds)


async def token_exists(jti: str) -> bool:
    return await get_redis_client().exists(f"token:{jti}") == 1


async def revoke_token(jti: str) -> None:
    await get_redis_client().delete(f"token:{jti}")


async def store_user_refresh_jti(user_id: str, refresh_jti: str, ttl_seconds: int) -> None:
    await get_redis_client().set(f"refresh:{user_id}", refresh_jti, ex=ttl_seconds)


async def get_user_refresh_jti(user_id: str) -> str | None:
    return await get_redis_client().get(f"refresh:{user_id}")


async def delete_user_refresh_jti(user_id: str) -> None:
    await get_redis_client().delete(f"refresh:{user_id}")
