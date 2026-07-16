import pytest
from httpx import AsyncClient


pytestmark = pytest.mark.asyncio


async def test_register_success(client: AsyncClient, seed_roles):
    resp = await client.post("/api/v1/auth/register", json={
        "email": "new@test.com",
        "name": "New",
        "surname": "User",
        "password": "password123",
    })
    assert resp.status_code == 201
    body = resp.json()
    assert body["email"] == "new@test.com"
    assert body["name"] == "New"
    assert body["surname"] == "User"
    assert "hashed_password" not in body
    assert "user" in body["roles"]


async def test_register_duplicate_email(client: AsyncClient, seed_roles):
    payload = {"email": "dup@test.com", "name": "A", "surname": "B", "password": "pw"}
    await client.post("/api/v1/auth/register", json=payload)
    resp = await client.post("/api/v1/auth/register", json=payload)
    assert resp.status_code == 409


async def test_login_success(client: AsyncClient, regular_user):
    resp = await client.post("/api/v1/auth/login", json={
        "email": "user@test.com", "password": "userpass"
    })
    assert resp.status_code == 200
    body = resp.json()
    assert "access_token" in body
    assert "refresh_token" in body
    assert body["token_type"] == "bearer"


async def test_login_wrong_password(client: AsyncClient, regular_user):
    resp = await client.post("/api/v1/auth/login", json={
        "email": "user@test.com", "password": "wrong"
    })
    assert resp.status_code == 401


async def test_login_unknown_email(client: AsyncClient):
    resp = await client.post("/api/v1/auth/login", json={
        "email": "nobody@test.com", "password": "pw"
    })
    assert resp.status_code == 401


async def test_me(client: AsyncClient, user_token):
    resp = await client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {user_token}"})
    assert resp.status_code == 200
    body = resp.json()
    assert body["email"] == "user@test.com"
    assert body["name"] == "Regular"
    assert body["surname"] == "Test"


async def test_me_no_token(client: AsyncClient):
    resp = await client.get("/api/v1/auth/me")
    assert resp.status_code == 401


async def test_logout(client: AsyncClient, user_token):
    resp = await client.post(
        "/api/v1/auth/logout", headers={"Authorization": f"Bearer {user_token}"}
    )
    assert resp.status_code == 204

    # Token should now be revoked
    resp2 = await client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {user_token}"})
    assert resp2.status_code == 401


async def test_refresh(client: AsyncClient, regular_user):
    login = await client.post("/api/v1/auth/login", json={
        "email": "user@test.com", "password": "userpass"
    })
    refresh_token = login.json()["refresh_token"]

    resp = await client.post(
        "/api/v1/auth/refresh", headers={"Authorization": f"Bearer {refresh_token}"}
    )
    assert resp.status_code == 200
    body = resp.json()
    assert "access_token" in body
    assert body["access_token"] != login.json()["access_token"]


async def test_refresh_with_access_token_fails(client: AsyncClient, user_token):
    resp = await client.post(
        "/api/v1/auth/refresh", headers={"Authorization": f"Bearer {user_token}"}
    )
    assert resp.status_code == 401
