"""
Test configuration.

Strategy:
- SQLite in-memory via aiosqlite (no Postgres needed for unit tests)
- Redis mocked with a simple in-process dict store
- OPA mocked to always return allow=True (RBAC logic tested separately)
"""
import uuid
from collections.abc import AsyncGenerator
from typing import Any
from unittest.mock import AsyncMock, patch

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.core.database import get_db
from app.core.security import hash_password
from app.main import app
from app.models import Base, Role, User

TEST_DATABASE_URL = "sqlite+aiosqlite:///:memory:"


# ── Database fixture ──────────────────────────────────────────────────

@pytest.fixture(scope="session")
def anyio_backend():
    return "asyncio"


@pytest.fixture
async def db_engine():
    engine = create_async_engine(TEST_DATABASE_URL, echo=False)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield engine
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
    await engine.dispose()


@pytest.fixture
async def db(db_engine) -> AsyncGenerator[AsyncSession, None]:
    session_factory = async_sessionmaker(bind=db_engine, expire_on_commit=False)
    async with session_factory() as session:
        yield session


# ── Seed helpers ──────────────────────────────────────────────────────

@pytest.fixture
async def seed_roles(db: AsyncSession):
    admin_role = Role(id=uuid.uuid4(), name="admin", description="Full access")
    user_role  = Role(id=uuid.uuid4(), name="user",  description="Standard user")
    db.add_all([admin_role, user_role])
    await db.commit()
    await db.refresh(admin_role)
    await db.refresh(user_role)
    return {"admin": admin_role, "user": user_role}


@pytest.fixture
async def admin_user(db: AsyncSession, seed_roles):
    user = User(
        id=uuid.uuid4(),
        email="admin@test.com",
        name="Admin",
        surname="Test",
        hashed_password=hash_password("adminpass"),
        is_active=True,
    )
    user.roles = [seed_roles["admin"]]
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return user


@pytest.fixture
async def regular_user(db: AsyncSession, seed_roles):
    user = User(
        id=uuid.uuid4(),
        email="user@test.com",
        name="Regular",
        surname="Test",
        hashed_password=hash_password("userpass"),
        is_active=True,
    )
    user.roles = [seed_roles["user"]]
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return user


# ── Redis mock ────────────────────────────────────────────────────────

class FakeRedis:
    """Minimal in-process Redis replacement for tests."""

    def __init__(self):
        self._store: dict[str, Any] = {}

    async def set(self, key, value, ex=None):
        self._store[key] = value

    async def get(self, key):
        return self._store.get(key)

    async def exists(self, key):
        return 1 if key in self._store else 0

    async def delete(self, *keys):
        for k in keys:
            self._store.pop(k, None)

    async def aclose(self):
        pass


@pytest.fixture(autouse=True)
def mock_redis():
    fake = FakeRedis()
    with patch("app.core.redis._redis", fake):
        yield fake


# ── OPA mock ─────────────────────────────────────────────────────────

@pytest.fixture(autouse=True)
def mock_opa_allow():
    """OPA always allows by default; override per-test when testing 403 paths."""
    with patch("app.core.opa.check_permission", new=AsyncMock(return_value=True)):
        yield


# ── HTTP client ───────────────────────────────────────────────────────

@pytest.fixture
async def client(db: AsyncSession) -> AsyncGenerator[AsyncClient, None]:
    app.dependency_overrides[get_db] = lambda: db
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        yield ac
    app.dependency_overrides.clear()


# ── Auth helpers ──────────────────────────────────────────────────────

@pytest.fixture
async def admin_token(client: AsyncClient, admin_user):
    resp = await client.post("/api/v1/auth/login", json={
        "email": "admin@test.com", "password": "adminpass"
    })
    assert resp.status_code == 200
    return resp.json()["access_token"]


@pytest.fixture
async def user_token(client: AsyncClient, regular_user):
    resp = await client.post("/api/v1/auth/login", json={
        "email": "user@test.com", "password": "userpass"
    })
    assert resp.status_code == 200
    return resp.json()["access_token"]
