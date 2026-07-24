"""POST-05 aggregate contract, authorization, and privacy coverage."""

import json
import uuid
from datetime import datetime, timezone
from unittest.mock import AsyncMock, patch

import pytest

from app.models.control_plane import Installation

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
    assert body["overview"] == {
        "registered_accounts": 1,
        "registered_installations": 1,
        "estimated_active_installations": 1,
        "reporting_installations": 1,
        "current_projects": 1,
        "tracked_files": 3,
        "current_versions": 12,
        "weekly_active_creative_installations": 0,
        "versions_captured": 0,
        "project_creations": 0,
        "restores": 0,
        "activation_rate": 0.0,
        "d7_retention_rate": 0.0,
    }
    assert body["search"]["total_count"] == 7
    assert body["search"]["mode_counts_available"] is True
    assert body["ai"]["attempt_count"] == 4
    assert body["ai"]["success_count"] == 3
    assert body["ai"]["token_counts_available"] is False
    assert body["file_type_distribution"][:2] == [
        {"label": "PNG", "count": 2},
        {"label": "JPG", "count": 1},
    ]
    assert body["coarse_locations"] == [{"label": "ES · MD · Madrid", "count": 1}]

    serialized = json.dumps(body)
    for forbidden in (
        "project_telemetry_id",
        "installation_id",
        "sanitized_message",
        "sanitized_stack",
        "private/source.ts",
        "Content deliberately absent",
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
        "/api/v1/admin/statistics?period_days=365",
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
    assert response.json()[0] == {
        "id": str(admin_user.id),
        "email": "admin@test.com",
        "display_name": "Admin Test",
        "google_linked": True,
        "installation_count": 0,
        "current_project_count": 0,
        "current_version_count": 0,
    }
