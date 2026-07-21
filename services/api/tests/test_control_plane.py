import uuid
from datetime import datetime, timezone

import pytest
from httpx import AsyncClient

pytestmark = pytest.mark.asyncio


def auth(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


async def test_health_uses_chronicle_metadata(client: AsyncClient):
    response = await client.get("/health")

    assert response.status_code == 200
    assert response.json() == {
        "status": "ok",
        "service": "chronicle-control-plane",
        "version": "0.2.0",
    }


async def test_account_settings_default_and_revision_update(
    client: AsyncClient, user_token
):
    response = await client.get("/api/v1/account/settings", headers=auth(user_token))
    assert response.status_code == 200
    body = response.json()
    assert body["revision"] == 1
    assert body["settings"]["telemetry"]["enabled"] is True
    assert body["settings"]["settings_sync_enabled"] is False

    settings = body["settings"]
    settings["settings_sync_enabled"] = True
    settings["ai"]["chat"] = {"provider": "anthropic", "model": "claude-sonnet-5"}
    settings["telemetry"]["updated_at"] = datetime.now(timezone.utc).isoformat()
    updated = await client.put(
        "/api/v1/account/settings",
        headers=auth(user_token),
        json={"settings": settings, "expected_revision": 1},
    )
    assert updated.status_code == 200
    assert updated.json()["revision"] == 2
    assert updated.json()["settings"]["ai"]["chat"]["provider"] == "anthropic"

    conflict = await client.put(
        "/api/v1/account/settings",
        headers=auth(user_token),
        json={"settings": settings, "expected_revision": 1},
    )
    assert conflict.status_code == 409


async def test_account_settings_reject_unknown_fields(client: AsyncClient, user_token):
    body = (await client.get("/api/v1/account/settings", headers=auth(user_token))).json()
    body["settings"]["local_path"] = "C:/private"
    response = await client.put(
        "/api/v1/account/settings",
        headers=auth(user_token),
        json={"settings": body["settings"], "expected_revision": body["revision"]},
    )
    assert response.status_code == 422


async def test_encrypted_secret_is_opaque_versioned_and_deletable(
    client: AsyncClient, user_token
):
    missing = await client.get("/api/v1/account/secrets", headers=auth(user_token))
    assert missing.status_code == 404

    created = await client.put(
        "/api/v1/account/secrets",
        headers=auth(user_token),
        json={"envelope": "opaque-client-ciphertext", "expected_revision": 0},
    )
    assert created.status_code == 200
    assert created.json()["envelope"] == "opaque-client-ciphertext"
    assert created.json()["revision"] == 1

    conflict = await client.put(
        "/api/v1/account/secrets",
        headers=auth(user_token),
        json={"envelope": "replacement", "expected_revision": 0},
    )
    assert conflict.status_code == 409

    deleted = await client.delete("/api/v1/account/secrets", headers=auth(user_token))
    assert deleted.status_code == 204
    assert (await client.get("/api/v1/account/secrets", headers=auth(user_token))).status_code == 404


async def test_installation_registration_is_idempotent_and_can_link(
    client: AsyncClient, user_token
):
    installation_id = str(uuid.uuid4())
    payload = {
        "installation_id": installation_id,
        "app_version": "0.1.0",
        "os_family": "windows",
    }
    first = await client.post("/api/v1/installations/register", json=payload)
    second = await client.post(
        "/api/v1/installations/register",
        json={**payload, "app_version": "0.1.1"},
    )
    assert first.status_code == 200
    assert second.status_code == 200
    assert second.json()["linked_to_account"] is False

    linked = await client.put(
        f"/api/v1/installations/{installation_id}/link",
        headers=auth(user_token),
    )
    assert linked.status_code == 200
    assert linked.json()["linked_to_account"] is True


async def test_installation_registration_rejects_extra_metadata(client: AsyncClient):
    response = await client.post("/api/v1/installations/register", json={
        "installation_id": str(uuid.uuid4()),
        "app_version": "0.1.0",
        "os_family": "windows",
        "hostname": "must-not-leave-device",
    })
    assert response.status_code == 422
