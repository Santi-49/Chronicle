import pytest
from httpx import AsyncClient
from unittest.mock import AsyncMock, patch

from app.models.control_plane import ExternalIdentity
from app.schemas.control_plane import GoogleIdentityClaims


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


async def test_google_login_creates_account_and_reuses_subject(client: AsyncClient, seed_roles):
    claims = GoogleIdentityClaims(
        subject="google-subject-1",
        email="google@test.com",
        email_verified=True,
        given_name="Go",
        family_name="Ogle",
        display_name="Go Ogle",
    )
    with patch(
        "app.services.google_auth_service.verify_google_credential",
        new=AsyncMock(return_value=claims),
    ):
        first = await client.post("/api/v1/auth/google", json={"credential": "x" * 20})
        second = await client.post("/api/v1/auth/google", json={"credential": "y" * 20})

    assert first.status_code == 200
    assert second.status_code == 200
    me = await client.get(
        "/api/v1/auth/me",
        headers={"Authorization": f"Bearer {second.json()['access_token']}"},
    )
    assert me.status_code == 200
    assert me.json()["email"] == "google@test.com"


async def test_google_login_auto_links_existing_verified_email(
    client: AsyncClient, regular_user
):
    claims = GoogleIdentityClaims(
        subject="google-existing",
        email=regular_user.email.upper(),
        email_verified=True,
        given_name="Regular",
        family_name="Test",
    )
    with patch(
        "app.services.google_auth_service.verify_google_credential",
        new=AsyncMock(return_value=claims),
    ):
        response = await client.post("/api/v1/auth/google", json={"credential": "x" * 20})
    assert response.status_code == 200
    me = await client.get(
        "/api/v1/auth/me",
        headers={"Authorization": f"Bearer {response.json()['access_token']}"},
    )
    assert me.status_code == 200
    assert me.json()["email"] == regular_user.email
    assert "user" in me.json()["roles"]


async def test_google_login_does_not_replace_different_linked_identity(
    client: AsyncClient, db, regular_user
):
    db.add(ExternalIdentity(
        user_id=regular_user.id,
        provider="google",
        provider_subject="google-original",
    ))
    await db.commit()
    claims = GoogleIdentityClaims(
        subject="google-replacement",
        email=regular_user.email,
        email_verified=True,
    )
    with patch(
        "app.services.google_auth_service.verify_google_credential",
        new=AsyncMock(return_value=claims),
    ):
        response = await client.post("/api/v1/auth/google", json={"credential": "x" * 20})

    assert response.status_code == 409
    assert response.json()["detail"] == "Chronicle account already has a different Google identity"


async def test_google_login_keeps_inactive_existing_account_blocked(
    client: AsyncClient, db, regular_user
):
    regular_user.is_active = False
    await db.commit()
    claims = GoogleIdentityClaims(
        subject="google-inactive",
        email=regular_user.email,
        email_verified=True,
    )
    with patch(
        "app.services.google_auth_service.verify_google_credential",
        new=AsyncMock(return_value=claims),
    ):
        response = await client.post("/api/v1/auth/google", json={"credential": "x" * 20})

    assert response.status_code == 403
    assert response.json()["detail"] == "Account inactive"


async def test_authenticated_user_can_link_google(client: AsyncClient, user_token):
    claims = GoogleIdentityClaims(
        subject="google-link",
        email="another-google@test.com",
        email_verified=True,
    )
    with patch(
        "app.services.google_auth_service.verify_google_credential",
        new=AsyncMock(return_value=claims),
    ):
        linked = await client.post(
            "/api/v1/auth/google/link",
            json={"credential": "x" * 20},
            headers={"Authorization": f"Bearer {user_token}"},
        )
        login = await client.post("/api/v1/auth/google", json={"credential": "y" * 20})
    assert linked.status_code == 204
    assert login.status_code == 200
