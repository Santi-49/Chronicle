"""GDPR preference audit, export, and self-service account-erasure coverage."""
import uuid
from datetime import datetime, timezone
from unittest.mock import AsyncMock, patch

import pytest
from httpx import AsyncClient
from sqlalchemy import func, select

from app.core import redis as token_store
from app.models.control_plane import (
    AccountSettings,
    EncryptedSecret,
    ExternalIdentity,
    Installation,
    InstallationTelemetry,
    ProjectTelemetry,
    TelemetryError,
    TelemetryHourlyAiUsage,
    TelemetryHourlyUsage,
    TelemetryPreferenceAudit,
    TelemetryProjectRemoval,
    TelemetrySession,
)
from app.models.user import User

pytestmark = pytest.mark.asyncio


def auth(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


async def register_and_link(client: AsyncClient, token: str) -> str:
    installation_id = str(uuid.uuid4())
    registered = await client.post("/api/v1/installations/register", json={
        "installation_id": installation_id,
        "app_version": "0.9.0",
        "os_family": "windows",
    })
    assert registered.status_code == 200
    linked = await client.put(
        f"/api/v1/installations/{installation_id}/link",
        headers=auth(token),
    )
    assert linked.status_code == 200
    return installation_id


async def test_preference_audit_uses_server_side_account_link(
    client: AsyncClient, user_token, regular_user, db
):
    installation_id = await register_and_link(client, user_token)
    response = await client.post("/api/v1/telemetry/preference", json={
        "installation_id": installation_id,
        "enabled": False,
        "notice_version": "2026-07-25",
        "updated_at": datetime.now(timezone.utc).isoformat(),
    })
    assert response.status_code == 200
    assert response.json()["account_linked"] is True
    row = (await db.scalars(select(TelemetryPreferenceAudit))).one()
    assert row.user_id == regular_user.id


async def test_account_export_contains_linked_data_but_never_password_hash(
    client: AsyncClient, user_token, regular_user, db
):
    installation_id = await register_and_link(client, user_token)
    db.add(ExternalIdentity(
        user_id=regular_user.id,
        provider="google",
        provider_subject="google-subject",
    ))
    db.add(EncryptedSecret(
        user_id=regular_user.id,
        revision=1,
        envelope="opaque-ciphertext",
    ))
    db.add(TelemetrySession(
        id=uuid.uuid4(),
        installation_id=uuid.UUID(installation_id),
        opened_at=datetime.now(timezone.utc),
        app_version="0.9.0",
        os_family="windows",
    ))
    await db.commit()

    response = await client.get("/api/v1/account/export", headers=auth(user_token))
    assert response.status_code == 200
    body = response.json()
    assert body["schema_version"] == 1
    assert body["account"]["email"] == regular_user.email
    assert "hashed_password" not in body["account"]
    assert body["external_identities"][0]["provider"] == "google"
    assert body["encrypted_secret"]["envelope"] == "opaque-ciphertext"
    assert body["installations"][0]["id"] == installation_id
    assert len(body["usage_statistics"]["telemetry_sessions"]) == 1


async def test_self_service_erasure_removes_every_linked_row_and_revokes_sessions(
    client: AsyncClient, user_token, regular_user, db, mock_redis
):
    installation_id = uuid.UUID(await register_and_link(client, user_token))
    now = datetime.now(timezone.utc)
    project_id = uuid.uuid4()
    db.add_all([
        AccountSettings(user_id=regular_user.id, revision=1, payload={}),
        EncryptedSecret(user_id=regular_user.id, revision=1, envelope="opaque"),
        ExternalIdentity(
            user_id=regular_user.id, provider="google", provider_subject="subject"
        ),
        TelemetryPreferenceAudit(
            installation_id=installation_id,
            user_id=regular_user.id,
            enabled=True,
            notice_version="2026-07-25",
            preference_updated_at=now,
        ),
        TelemetrySession(
            id=uuid.uuid4(), installation_id=installation_id, opened_at=now,
            app_version="0.9.0", os_family="windows",
        ),
        TelemetryProjectRemoval(
            id=uuid.uuid4(), installation_id=installation_id,
            project_telemetry_id=project_id, occurred_at=now, history_deleted=False,
        ),
        TelemetryHourlyUsage(
            installation_id=installation_id, bucket_start=now, search_count=1,
        ),
        TelemetryHourlyAiUsage(
            installation_id=installation_id, bucket_start=now, operation="annotation",
            provider="google", model="gemini", attempt_count=1, success_count=1,
            failure_count=0, total_latency_ms=10,
        ),
        TelemetryError(
            id=uuid.uuid4(), installation_id=installation_id, occurred_at=now,
            process="main", component="test", operation="test", error_name="Error",
            sanitized_message="safe", stack_fingerprint="a" * 64, sanitized_stack=[],
            severity="error", fatal=False, handled=True, app_version="0.9.0",
            os_family="windows",
        ),
        InstallationTelemetry(
            installation_id=installation_id, captured_at=now, project_count=1,
            asset_count=1, version_count=1, ai_annotated_version_count=0,
            app_version="0.9.0", os_family="windows",
        ),
        ProjectTelemetry(
            id=project_id, installation_id=installation_id, captured_at=now,
            asset_count=1, version_count=1, ai_annotated_version_count=0,
            png_count=1, jpg_count=0, other_count=0,
        ),
    ])
    await db.commit()
    await token_store.store_token("other-session", str(regular_user.id), 3600)

    response = await client.delete("/api/v1/account", headers=auth(user_token))
    assert response.status_code == 204
    for model in (
        User, AccountSettings, EncryptedSecret, ExternalIdentity, Installation,
        TelemetryPreferenceAudit, TelemetrySession, TelemetryProjectRemoval,
        TelemetryHourlyUsage, TelemetryHourlyAiUsage, TelemetryError,
        InstallationTelemetry, ProjectTelemetry,
    ):
        assert await db.scalar(select(func.count()).select_from(model)) == 0
    assert not any(value == str(regular_user.id) for value in mock_redis._store.values())
    assert (await client.get("/api/v1/auth/me", headers=auth(user_token))).status_code == 401
    assert (await client.delete("/api/v1/account", headers=auth(user_token))).status_code == 401


async def test_erasure_rolls_back_all_database_changes_on_commit_failure(
    client: AsyncClient, user_token, regular_user, db
):
    user_id = regular_user.id
    await register_and_link(client, user_token)
    original_commit = db.commit
    with patch.object(db, "commit", new=AsyncMock(side_effect=RuntimeError("commit failed"))):
        with pytest.raises(RuntimeError, match="commit failed"):
            await client.delete("/api/v1/account", headers=auth(user_token))
    # The service called rollback; a fresh transaction still sees both rows.
    assert await db.get(User, user_id) is not None
    assert await db.scalar(
        select(func.count()).select_from(Installation).where(
            Installation.user_id == user_id
        )
    ) == 1
    await original_commit()


async def test_export_and_erasure_require_authentication(client: AsyncClient):
    assert (await client.get("/api/v1/account/export")).status_code == 401
    assert (await client.delete("/api/v1/account")).status_code == 401


async def test_anonymous_installation_can_export_and_erase_by_random_id(
    client: AsyncClient, db
):
    installation_id = str(uuid.uuid4())
    await client.post("/api/v1/installations/register", json={
        "installation_id": installation_id,
        "app_version": "0.9.0",
        "os_family": "windows",
    })
    exported = await client.get(f"/api/v1/installations/{installation_id}/export")
    assert exported.status_code == 200
    assert exported.json()["installation"]["id"] == installation_id

    erased = await client.delete(f"/api/v1/installations/{installation_id}/data")
    assert erased.status_code == 204
    assert await db.get(Installation, uuid.UUID(installation_id)) is None
    # Idempotent erasure does not disclose whether an already-erased id existed.
    assert (await client.delete(
        f"/api/v1/installations/{installation_id}/data"
    )).status_code == 204


async def test_linked_installation_export_and_erasure_require_its_account(
    client: AsyncClient, user_token
):
    installation_id = await register_and_link(client, user_token)
    assert (await client.get(
        f"/api/v1/installations/{installation_id}/export"
    )).status_code == 403
    assert (await client.delete(
        f"/api/v1/installations/{installation_id}/data"
    )).status_code == 403
    assert (await client.get(
        f"/api/v1/installations/{installation_id}/export",
        headers=auth(user_token),
    )).status_code == 200
