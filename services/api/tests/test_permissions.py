import pytest
from httpx import AsyncClient


pytestmark = pytest.mark.asyncio


async def test_list_permissions(client: AsyncClient, admin_token):
    resp = await client.get(
        "/api/v1/permissions", headers={"Authorization": f"Bearer {admin_token}"}
    )
    assert resp.status_code == 200
    assert isinstance(resp.json(), list)


async def test_create_permission(client: AsyncClient, admin_token):
    resp = await client.post(
        "/api/v1/permissions",
        json={"resource": "documents", "action": "read", "description": "Read docs"},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert resp.status_code == 201
    body = resp.json()
    assert body["resource"] == "documents"
    assert body["action"] == "read"


async def test_create_duplicate_permission(client: AsyncClient, admin_token):
    payload = {"resource": "items", "action": "write"}
    await client.post("/api/v1/permissions", json=payload,
                      headers={"Authorization": f"Bearer {admin_token}"})
    resp = await client.post("/api/v1/permissions", json=payload,
                             headers={"Authorization": f"Bearer {admin_token}"})
    assert resp.status_code == 409


async def test_delete_permission(client: AsyncClient, admin_token):
    create = await client.post(
        "/api/v1/permissions",
        json={"resource": "temp", "action": "delete"},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    perm_id = create.json()["id"]
    resp = await client.delete(
        f"/api/v1/permissions/{perm_id}",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert resp.status_code == 204


async def test_delete_nonexistent_permission(client: AsyncClient, admin_token):
    import uuid
    resp = await client.delete(
        f"/api/v1/permissions/{uuid.uuid4()}",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert resp.status_code == 404


async def test_hello_public(client: AsyncClient):
    resp = await client.get("/api/v1/hello")
    assert resp.status_code == 200
    assert resp.json()["message"] == "Hello, world!"


async def test_hello_protected(client: AsyncClient, user_token):
    resp = await client.get(
        "/api/v1/hello/protected", headers={"Authorization": f"Bearer {user_token}"}
    )
    assert resp.status_code == 200
    assert "Regular" in resp.json()["message"]


async def test_hello_protected_no_token(client: AsyncClient):
    resp = await client.get("/api/v1/hello/protected")
    assert resp.status_code == 401
