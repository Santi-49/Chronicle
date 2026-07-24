"""POST-05 aggregate contract, authorization, and privacy coverage."""

import json
import uuid
from datetime import datetime, timezone
from unittest.mock import AsyncMock, patch

import pytest
from sqlalchemy import select

from app.models.control_plane import Installation, TelemetryError
from app.models.role import Role
from app.models.user import User

pytestmark = pytest.mark.anyio

NOW = datetime.now(timezone.utc).replace(minute=0, second=0, microsecond=0)


async def seed_statistics(client, db, admin_user) -> None:
    installation_id = uuid.uuid4()
    db.add(
        Installation(
            id=installation_id,
            user_id=admin_user.id,
            app_version="0.6.0",
            os_family="windows",
        )
    )
    await db.commit()
    payload = {
        "schema_version": 2,
        "batch_id": str(uuid.uuid4()),
        "installation_id": str(installation_id),
        "sent_at": NOW.isoformat(),
        "final": False,
        "sessions": [{
            "id": str(uuid.uuid4()),
            "opened_at": NOW.isoformat(),
            "app_version": "0.6.0",
            "os_family": "windows",
        }, {
            "id": str(uuid.uuid4()),
            "opened_at": NOW.isoformat(),
            "app_version": "0.6.0",
            "os_family": "windows",
        }],
        "project_removals": [],
        "hourly_usage": [{"bucket_start": NOW.isoformat(), "search_count": 7}],
        "hourly_ai_usage": [{
            "bucket_start": NOW.isoformat(),
            "operation": "annotation",
            "provider": "openai",
            "model": "gpt-5.6-terra",
            "attempt_count": 4,
            "success_count": 3,
            "failure_count": 1,
            "total_latency_ms": 2000,
        }],
        "errors": [{
            "id": str(uuid.uuid4()),
            "occurred_at": NOW.isoformat(),
            "process": "main",
            "component": "watcher",
            "operation": "capture",
            "error_name": "UnavailableError",
            "error_code": "E_UNAVAILABLE",
            "sanitized_message": "Content deliberately absent from aggregate response",
            "stack_fingerprint": "0123456789abcdef",
            "sanitized_stack": ["private/source.ts:42"],
            "severity": "error",
            "fatal": False,
            "handled": True,
            "app_version": "0.6.0",
            "os_family": "windows",
            "provider": None,
            "model": None,
        }],
        "installation_state": {
            "captured_at": NOW.isoformat(),
            "project_count": 1,
            "asset_count": 3,
            "version_count": 12,
            "ai_annotated_version_count": 9,
            "annotation_provider": "openai",
            "annotation_model": "gpt-5.6-terra",
            "embedding_provider": "openai",
            "embedding_model": "text-embedding-3-small",
            "app_version": "0.6.0",
            "os_family": "windows",
        },
        "projects": [{
            "project_telemetry_id": str(uuid.uuid4()),
            "captured_at": NOW.isoformat(),
            "asset_count": 3,
            "version_count": 12,
            "ai_annotated_version_count": 9,
            "png_count": 2,
            "jpg_count": 1,
            "other_count": 0,
        }],
        "deleted_project_ids": [],
    }
    response = await client.post(
        "/api/v1/telemetry/batches",
        json=payload,
        headers={
            "CF-IPCountry": "ES",
            "CF-Region-Code": "MD",
            "CF-IPCity": "Madrid",
        },
    )
    assert response.status_code == 204


async def test_admin_reads_live_aggregate_statistics(
    client, db, admin_user, admin_token
):
    await seed_statistics(client, db, admin_user)

    response = await client.get(
        "/api/v1/admin/statistics?period_days=30",
        headers={"Authorization": f"Bearer {admin_token}"},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["overview"]["registered_accounts"] == 1
    assert body["overview"]["registered_installations"] == 1
    assert body["overview"]["estimated_active_installations"] == 1
    assert body["overview"]["new_installations"] == 1
    assert body["overview"]["error_affected_installations"] == 1
    assert body["overview"]["activation_eligible_installations"] == 1
    assert body["overview"]["d7_eligible_installations"] == 0
    assert body["search"]["total_count"] == 7
    assert body["search"]["mode_counts_available"] is True
    assert body["ai"]["attempt_count"] == 4
    assert body["ai"]["success_count"] == 3
    assert body["ai"]["token_counts_available"] is False
    assert body["file_type_distribution"][:2] == [
        {"label": "PNG", "count": 2},
        {"label": "JPG", "count": 1},
    ]
    assert body["coarse_locations"] == [{"label": "ES · MD · Madrid", "count": 2}]
    assert body["os_distribution"] == [{"label": "windows", "count": 1}]
    assert body["app_version_distribution"] == [{"label": "0.6.0", "count": 1}]
    assert body["growth"]["daily_active_installations"][-1]["count"] == 1
    assert body["errors"][0]["sanitized_message"] == "Content deliberately absent from aggregate response"
    assert body["errors"][0]["sanitized_stack"] == ["private/source.ts:42"]
    assert body["errors"][0]["affected_installations"] == 1

    serialized = json.dumps(body)
    for forbidden in (
        "project_telemetry_id",
        "installation_id",
        "search query",
        "file contents",
    ):
        assert forbidden not in serialized


async def test_non_admin_is_forbidden(client, user_token):
    async def authorize(_user_id, roles, resource, action):
        return "admin" in roles and resource == "admin_statistics" and action == "read"

    with patch(
        "app.core.opa.check_permission",
        new=AsyncMock(side_effect=authorize),
    ):
        response = await client.get(
            "/api/v1/admin/statistics",
            headers={"Authorization": f"Bearer {user_token}"},
        )

    assert response.status_code == 403


async def test_admin_statistics_rejects_oversized_period(client, admin_token):
    response = await client.get(
        "/api/v1/admin/statistics?period_days=367",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert response.status_code == 422


async def test_admin_can_search_google_account_directory(client, db, admin_user, admin_token):
    from app.models.control_plane import ExternalIdentity

    db.add(ExternalIdentity(
        user_id=admin_user.id,
        provider="google",
        provider_subject="google-subject-admin",
    ))
    await db.commit()
    response = await client.get(
        "/api/v1/admin/statistics/accounts?search=admin%40test.com",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert response.status_code == 200
    account = response.json()[0]
    assert account["id"] == str(admin_user.id)
    assert account["email"] == "admin@test.com"
    assert account["display_name"] == "Admin Test"
    assert account["google_linked"] is True
    assert account["is_active"] is True
    assert account["is_admin"] is True
    assert account["last_login_at"] is not None
    assert account["installation_count"] == 0


async def test_admin_statistics_accepts_custom_date_range(client, admin_token):
    today = NOW.date().isoformat()
    response = await client.get(
        f"/api/v1/admin/statistics?start_date={today}&end_date={today}",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["period_days"] == 1
    assert body["period_start"].startswith(today)


async def test_last_active_admin_cannot_be_demoted(client, admin_user, admin_token):
    response = await client.delete(
        f"/api/v1/admin/statistics/accounts/{admin_user.id}/admin",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert response.status_code == 409


async def test_admin_can_promote_and_demote_an_account(client, db, admin_token):
    user_role = await db.scalar(select(Role).where(Role.name == "user"))
    account = User(
        email="member@test.com",
        name="Member",
        surname="Test",
        hashed_password=None,
        roles=[user_role],
    )
    db.add(account)
    await db.commit()

    promoted = await client.put(
        f"/api/v1/admin/statistics/accounts/{account.id}/admin",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert promoted.status_code == 200
    assert promoted.json()["is_admin"] is True

    demoted = await client.delete(
        f"/api/v1/admin/statistics/accounts/{account.id}/admin",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert demoted.status_code == 200
    assert demoted.json()["is_admin"] is False


async def test_admin_deletes_occurrences_without_suppressing_future_errors(
    client, db, admin_user, admin_token
):
    await seed_statistics(client, db, admin_user)
    fingerprint = "0123456789abcdef"
    deleted = await client.delete(
        f"/api/v1/admin/statistics/errors/{fingerprint}",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert deleted.status_code == 204
    assert await db.scalar(select(TelemetryError).where(
        TelemetryError.stack_fingerprint == fingerprint
    )) is None

    installation_id = await db.scalar(select(Installation.id))
    db.add(TelemetryError(
        id=uuid.uuid4(),
        installation_id=installation_id,
        occurred_at=NOW,
        process="main",
        component="watcher",
        operation="capture",
        error_name="UnavailableError",
        error_code="E_UNAVAILABLE",
        sanitized_message="The issue happened again",
        stack_fingerprint=fingerprint,
        sanitized_stack=[],
        severity="error",
        fatal=False,
        handled=True,
        app_version="0.6.0",
        os_family="windows",
    ))
    await db.commit()

    statistics = await client.get(
        "/api/v1/admin/statistics",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert statistics.status_code == 200
    assert statistics.json()["errors"][0]["stack_fingerprint"] == fingerprint


async def test_admin_can_delete_all_stored_errors(client, db, admin_user, admin_token):
    await seed_statistics(client, db, admin_user)
    deleted = await client.delete(
        "/api/v1/admin/statistics/errors",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert deleted.status_code == 204
    assert list((await db.scalars(select(TelemetryError))).all()) == []
