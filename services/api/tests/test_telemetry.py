"""Usage-statistics v2 contract, idempotency, location, and privacy tests."""
import uuid
from datetime import datetime, timezone

import pytest
from sqlalchemy import func, select

from app.models.control_plane import (
    InstallationTelemetry,
    ProjectTelemetry,
    TelemetryError,
    TelemetryHourlyAiUsage,
    TelemetryHourlyUsage,
    TelemetryProjectRemoval,
    TelemetrySession,
)

pytestmark = pytest.mark.anyio

INSTALLATION_ID = str(uuid.uuid4())
NOW = datetime.now(timezone.utc).replace(minute=0, second=0, microsecond=0)


def batch(**changes) -> dict:
    value = {
        "schema_version": 2,
        "batch_id": str(uuid.uuid4()),
        "installation_id": INSTALLATION_ID,
        "sent_at": NOW.isoformat(),
        "final": False,
        "sessions": [],
        "project_removals": [],
        "hourly_usage": [],
        "hourly_ai_usage": [],
        "errors": [],
        "projects": [],
        "deleted_project_ids": [],
    }
    value.update(changes)
    return value


class TestTelemetryBatch:
    async def test_stores_normalized_records_and_cloudflare_location(self, client, db):
        session_id = str(uuid.uuid4())
        project_id = str(uuid.uuid4())
        error_id = str(uuid.uuid4())
        payload = batch(
            sessions=[{
                "id": session_id, "opened_at": NOW.isoformat(),
                "app_version": "0.6.0", "os_family": "windows",
            }],
            hourly_usage=[{"bucket_start": NOW.isoformat(), "search_count": 18}],
            hourly_ai_usage=[{
                "bucket_start": NOW.isoformat(), "operation": "annotation",
                "provider": "openai", "model": "gpt-5.6-terra",
                "attempt_count": 2, "success_count": 1, "failure_count": 1,
                "total_latency_ms": 2400,
            }],
            errors=[{
                "id": error_id, "occurred_at": NOW.isoformat(), "process": "main",
                "component": "filesystem", "operation": "capture",
                "error_name": "ENOENT", "error_code": "ENOENT",
                "sanitized_message": "File was unavailable",
                "stack_fingerprint": "0123456789abcdef",
                "sanitized_stack": ["capture.ts:42"], "severity": "error",
                "fatal": False, "handled": True, "app_version": "0.6.0",
                "os_family": "windows", "provider": None, "model": None,
            }],
            installation_state={
                "captured_at": NOW.isoformat(), "project_count": 1,
                "asset_count": 3, "version_count": 12,
                "ai_annotated_version_count": 10,
                "annotation_provider": "openai", "annotation_model": "gpt-5.6-terra",
                "embedding_provider": "openai", "embedding_model": "text-embedding-3-small",
                "app_version": "0.6.0", "os_family": "windows",
            },
            projects=[{
                "project_telemetry_id": project_id, "captured_at": NOW.isoformat(),
                "asset_count": 3, "version_count": 12,
                "ai_annotated_version_count": 10,
                "png_count": 2, "jpg_count": 1, "other_count": 0,
            }],
        )
        response = await client.post(
            "/api/v1/telemetry/batches",
            json=payload,
            headers={
                "CF-IPCountry": "ES",
                "CF-Region-Code": "MD",
                "CF-IPCity": "Madrid",
                "CF-Connecting-IP": "203.0.113.10",
            },
        )
        assert response.status_code == 204

        stored_session = await db.get(TelemetrySession, uuid.UUID(session_id))
        assert stored_session is not None
        assert stored_session.country_code == "ES"
        assert stored_session.region_code == "MD"
        assert not hasattr(stored_session, "ip_address")
        assert (await db.get(
            TelemetryHourlyUsage, (uuid.UUID(INSTALLATION_ID), NOW)
        )).search_count == 18
        assert (await db.get(
            TelemetryHourlyAiUsage,
            (uuid.UUID(INSTALLATION_ID), NOW, "annotation", "openai", "gpt-5.6-terra"),
        )).failure_count == 1
        assert await db.get(TelemetryError, uuid.UUID(error_id)) is not None
        assert await db.get(InstallationTelemetry, uuid.UUID(INSTALLATION_ID)) is not None
        assert await db.get(ProjectTelemetry, uuid.UUID(project_id)) is not None

    async def test_retry_is_idempotent(self, client, db):
        session_id = str(uuid.uuid4())
        payload = batch(sessions=[{
            "id": session_id, "opened_at": NOW.isoformat(),
            "app_version": "0.6.0", "os_family": "linux",
        }])
        assert (await client.post("/api/v1/telemetry/batches", json=payload)).status_code == 204
        assert (await client.post("/api/v1/telemetry/batches", json=payload)).status_code == 204
        count = await db.scalar(select(func.count()).select_from(TelemetrySession))
        assert count == 1

    async def test_hourly_counters_upsert_cumulative_value(self, client, db):
        first = batch(hourly_usage=[{"bucket_start": NOW.isoformat(), "search_count": 2}])
        second = batch(hourly_usage=[{"bucket_start": NOW.isoformat(), "search_count": 5}])
        await client.post("/api/v1/telemetry/batches", json=first)
        await client.post("/api/v1/telemetry/batches", json=second)
        row = await db.get(TelemetryHourlyUsage, (uuid.UUID(INSTALLATION_ID), NOW))
        assert row.search_count == 5

    async def test_project_removal_deletes_current_snapshot(self, client, db):
        project_id = str(uuid.uuid4())
        await client.post("/api/v1/telemetry/batches", json=batch(projects=[{
            "project_telemetry_id": project_id, "captured_at": NOW.isoformat(),
            "asset_count": 1, "version_count": 2, "ai_annotated_version_count": 1,
            "png_count": 1, "jpg_count": 0, "other_count": 0,
        }]))
        removal_id = str(uuid.uuid4())
        response = await client.post("/api/v1/telemetry/batches", json=batch(project_removals=[{
            "id": removal_id, "project_telemetry_id": project_id,
            "occurred_at": NOW.isoformat(), "history_deleted": False,
        }]))
        assert response.status_code == 204
        assert await db.get(ProjectTelemetry, uuid.UUID(project_id)) is None
        assert await db.get(TelemetryProjectRemoval, uuid.UUID(removal_id)) is not None

    async def test_final_batch_removes_current_state(self, client, db):
        project_id = str(uuid.uuid4())
        payload = batch(
            final=True,
            installation_state={
                "captured_at": NOW.isoformat(), "project_count": 1, "asset_count": 1,
                "version_count": 1, "ai_annotated_version_count": 0,
                "annotation_provider": None, "annotation_model": None,
                "embedding_provider": None, "embedding_model": None,
                "app_version": "0.6.0", "os_family": "windows",
            },
            projects=[{
                "project_telemetry_id": project_id, "captured_at": NOW.isoformat(),
                "asset_count": 1, "version_count": 1, "ai_annotated_version_count": 0,
                "png_count": 1, "jpg_count": 0, "other_count": 0,
            }],
        )
        assert (await client.post("/api/v1/telemetry/batches", json=payload)).status_code == 204
        assert await db.get(InstallationTelemetry, uuid.UUID(INSTALLATION_ID)) is None
        assert await db.get(ProjectTelemetry, uuid.UUID(project_id)) is None

    async def test_rejects_private_and_unknown_fields(self, client):
        payload = batch(hourly_usage=[{
            "bucket_start": NOW.isoformat(), "search_count": 1,
            "query": "private search text",
        }])
        assert (await client.post("/api/v1/telemetry/batches", json=payload)).status_code == 422

    async def test_rejects_invalid_ai_totals(self, client):
        payload = batch(hourly_ai_usage=[{
            "bucket_start": NOW.isoformat(), "operation": "embedding",
            "provider": "openai", "model": "text-embedding-3-small",
            "attempt_count": 2, "success_count": 2, "failure_count": 1,
            "total_latency_ms": 20,
        }])
        assert (await client.post("/api/v1/telemetry/batches", json=payload)).status_code == 422

    async def test_empty_batch_rejected(self, client):
        assert (await client.post("/api/v1/telemetry/batches", json=batch())).status_code == 422
