import pytest
from httpx import AsyncClient


pytestmark = pytest.mark.asyncio


async def test_list_roles(client: AsyncClient, admin_token, seed_roles):
    resp = await client.get("/api/v1/roles", headers={"Authorization": f"Bearer {admin_token}"})
    assert resp.status_code == 200
    names = [r["name"] for r in resp.json()]
    assert "admin" in names
    assert "user" in names


async def test_create_role(client: AsyncClient, admin_token):
    resp = await client.post(
        "/api/v1/roles",
        json={"name": "editor", "description": "Can edit content"},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert resp.status_code == 201
    assert resp.json()["name"] == "editor"


async def test_create_duplicate_role(client: AsyncClient, admin_token, seed_roles):
    resp = await client.post(
        "/api/v1/roles",
        json={"name": "admin"},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert resp.status_code == 409


async def test_get_role(client: AsyncClient, admin_token, seed_roles):
    role = seed_roles["user"]
    resp = await client.get(
        f"/api/v1/roles/{role.id}",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert resp.status_code == 200
    assert resp.json()["name"] == "user"


async def test_update_role(client: AsyncClient, admin_token, seed_roles):
    role = seed_roles["user"]
    resp = await client.patch(
        f"/api/v1/roles/{role.id}",
        json={"description": "Updated description"},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert resp.status_code == 200
    assert resp.json()["description"] == "Updated description"


async def test_delete_role(client: AsyncClient, admin_token):
    create = await client.post(
        "/api/v1/roles",
        json={"name": "temporary"},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    role_id = create.json()["id"]
    resp = await client.delete(
        f"/api/v1/roles/{role_id}",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert resp.status_code == 204


async def test_assign_permissions_to_role(client: AsyncClient, admin_token, seed_roles):
    from app.models.permission import Permission
    from sqlalchemy.ext.asyncio import AsyncSession
    import uuid

    role = seed_roles["user"]

    # Create a permission directly via the API
    perm_resp = await client.post(
        "/api/v1/permissions",
        json={"resource": "test", "action": "read"},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert perm_resp.status_code == 201
    perm_id = perm_resp.json()["id"]

    resp = await client.put(
        f"/api/v1/roles/{role.id}/permissions",
        json={"permission_ids": [perm_id]},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert resp.status_code == 200
    perm_names = [(p["resource"], p["action"]) for p in resp.json()["permissions"]]
    assert ("test", "read") in perm_names
