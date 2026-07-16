import pytest
from httpx import AsyncClient


pytestmark = pytest.mark.asyncio


async def test_list_users(client: AsyncClient, admin_token, admin_user, regular_user):
    resp = await client.get("/api/v1/users", headers={"Authorization": f"Bearer {admin_token}"})
    assert resp.status_code == 200
    emails = [u["email"] for u in resp.json()]
    assert "admin@test.com" in emails
    assert "user@test.com" in emails


async def test_get_user(client: AsyncClient, admin_token, regular_user):
    resp = await client.get(
        f"/api/v1/users/{regular_user.id}",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert resp.status_code == 200
    assert resp.json()["email"] == "user@test.com"


async def test_get_user_not_found(client: AsyncClient, admin_token):
    import uuid
    resp = await client.get(
        f"/api/v1/users/{uuid.uuid4()}",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert resp.status_code == 404


async def test_update_user(client: AsyncClient, admin_token, regular_user):
    resp = await client.patch(
        f"/api/v1/users/{regular_user.id}",
        json={"name": "Updated"},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert resp.status_code == 200
    assert resp.json()["name"] == "Updated"


async def test_deactivate_user(client: AsyncClient, admin_token, regular_user):
    resp = await client.delete(
        f"/api/v1/users/{regular_user.id}",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert resp.status_code == 204

    # Fetch the user and confirm is_active is False
    get_resp = await client.get(
        f"/api/v1/users/{regular_user.id}",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert get_resp.json()["is_active"] is False


async def test_assign_roles(client: AsyncClient, admin_token, regular_user, seed_roles):
    admin_role = seed_roles["admin"]
    resp = await client.put(
        f"/api/v1/users/{regular_user.id}/roles",
        json={"role_ids": [str(admin_role.id)]},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert resp.status_code == 200
    assert "admin" in resp.json()["roles"]


async def test_list_users_unauthenticated(client: AsyncClient):
    resp = await client.get("/api/v1/users")
    assert resp.status_code == 401
