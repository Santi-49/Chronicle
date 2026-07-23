"""
POST-04 telemetry endpoint tests.

Verifies:
- Batch event ingestion rejects unknown/forbidden fields (extra="forbid")
- Project inventory upsert and delete work correctly
- Duplicate event IDs are silently ignored (idempotency)
"""
import uuid
from datetime import datetime, timezone

import pytest

pytestmark = pytest.mark.anyio


INSTALLATION_ID = str(uuid.uuid4())
PROJECT_ID = str(uuid.uuid4())


def _base_event(event_type: str, extra: dict | None = None) -> dict:
    payload = {
        "schema_version": 1,
        "id": str(uuid.uuid4()),
        "event": event_type,
        "occurred_at": datetime.now(timezone.utc).isoformat(),
        "installation_id": INSTALLATION_ID,
    }
    if extra:
        payload.update(extra)
    return payload


# ── Event ingestion ────────────────────────────────────────────────────────

class TestIngestEvents:
    async def test_app_opened_accepted(self, client):
        event = _base_event("app_opened", {"app_version": "1.0.0", "os_family": "windows"})
        resp = await client.post("/api/v1/telemetry/events", json={"events": [event]})
        assert resp.status_code == 204

    async def test_version_captured_accepted(self, client):
        event = _base_event("version_captured", {
            "file_type": "png",
            "size_bucket": "<100KB",
            "capture_ms": 42,
            "project_telemetry_id": PROJECT_ID,
        })
        resp = await client.post("/api/v1/telemetry/events", json={"events": [event]})
        assert resp.status_code == 204

    async def test_ai_summary_generated_accepted(self, client):
        event = _base_event("ai_summary_generated", {
            "operation": "annotation",
            "provider": "google_genai",
            "model": "gemini-flash-latest",
            "outcome": "success",
            "latency_ms": 1200,
        })
        resp = await client.post("/api/v1/telemetry/events", json={"events": [event]})
        assert resp.status_code == 204

    async def test_search_performed_accepted(self, client):
        event = _base_event("search_performed", {
            "mode": "hybrid",
            "latency_ms": 80,
            "result_count_bucket": "1-5",
        })
        resp = await client.post("/api/v1/telemetry/events", json={"events": [event]})
        assert resp.status_code == 204

    async def test_duplicate_event_id_is_idempotent(self, client):
        """Sending the same event ID twice must not raise an error."""
        event_id = str(uuid.uuid4())
        event = _base_event("app_opened", {
            "id": event_id, "app_version": "1.0.0", "os_family": "linux",
        })
        event["id"] = event_id
        resp1 = await client.post("/api/v1/telemetry/events", json={"events": [event]})
        resp2 = await client.post("/api/v1/telemetry/events", json={"events": [event]})
        assert resp1.status_code == 204
        assert resp2.status_code == 204

    async def test_unknown_field_rejected(self, client):
        """extra='forbid' must reject fields outside the schema."""
        event = _base_event("app_opened", {
            "app_version": "1.0.0",
            "os_family": "macos",
            "asset_id": 42,  # forbidden
        })
        resp = await client.post("/api/v1/telemetry/events", json={"events": [event]})
        assert resp.status_code == 422

    async def test_private_field_path_rejected(self, client):
        event = _base_event("version_captured", {
            "file_type": "png",
            "size_bucket": "<100KB",
            "capture_ms": 10,
            "file_path": "/home/user/design.png",  # forbidden
        })
        resp = await client.post("/api/v1/telemetry/events", json={"events": [event]})
        assert resp.status_code == 422

    async def test_exact_byte_size_rejected(self, client):
        event = _base_event("version_captured", {
            "file_type": "png",
            "capture_ms": 10,
            "size_bytes": 123456,  # forbidden — must use size_bucket
        })
        resp = await client.post("/api/v1/telemetry/events", json={"events": [event]})
        assert resp.status_code == 422

    async def test_query_text_rejected(self, client):
        event = _base_event("search_performed", {
            "mode": "keyword",
            "latency_ms": 50,
            "result_count_bucket": "0",
            "query": "blue background logo",  # forbidden
        })
        resp = await client.post("/api/v1/telemetry/events", json={"events": [event]})
        assert resp.status_code == 422

    async def test_empty_batch_rejected(self, client):
        resp = await client.post("/api/v1/telemetry/events", json={"events": []})
        assert resp.status_code == 422


# ── Project inventory ──────────────────────────────────────────────────────

class TestProjectInventory:
    async def test_upsert_creates_record(self, client):
        project_id = str(uuid.uuid4())
        resp = await client.put(
            f"/api/v1/telemetry/projects/{project_id}",
            params={"installation_id": INSTALLATION_ID},
            json={"tracked_file_count": 5, "file_type_counts": {"png": 3, "jpg": 2, "other": 0}},
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body["tracked_file_count"] == 5
        assert body["project_telemetry_id"] == project_id

    async def test_upsert_updates_record(self, client):
        project_id = str(uuid.uuid4())
        await client.put(
            f"/api/v1/telemetry/projects/{project_id}",
            params={"installation_id": INSTALLATION_ID},
            json={"tracked_file_count": 2, "file_type_counts": {"png": 2, "jpg": 0, "other": 0}},
        )
        resp = await client.put(
            f"/api/v1/telemetry/projects/{project_id}",
            params={"installation_id": INSTALLATION_ID},
            json={"tracked_file_count": 10, "file_type_counts": {"png": 8, "jpg": 2, "other": 0}},
        )
        assert resp.status_code == 200
        assert resp.json()["tracked_file_count"] == 10

    async def test_delete_silently_succeeds_when_missing(self, client):
        project_id = str(uuid.uuid4())
        resp = await client.delete(
            f"/api/v1/telemetry/projects/{project_id}",
            params={"installation_id": INSTALLATION_ID},
        )
        assert resp.status_code == 204

    async def test_upsert_rejects_name_field(self, client):
        project_id = str(uuid.uuid4())
        resp = await client.put(
            f"/api/v1/telemetry/projects/{project_id}",
            params={"installation_id": INSTALLATION_ID},
            json={
                "tracked_file_count": 1,
                "file_type_counts": {"png": 1, "jpg": 0, "other": 0},
                "project_name": "My Design Work",  # forbidden
            },
        )
        assert resp.status_code == 422
