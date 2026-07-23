"""
POST-04 telemetry service.

Stores content-free telemetry events and project inventory records. The service
receives already-validated Pydantic models from the endpoint layer, so no further
field inspection is needed here — the allowlist is enforced by the schemas.
"""
import uuid
from datetime import datetime, timezone

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.control_plane import ProjectTelemetry, TelemetryEvent
from app.schemas.telemetry import (
    ProjectInventoryRead,
    ProjectInventoryUpsert,
    TelemetryBatch,
)


async def ingest_events(
    batch: TelemetryBatch,
    installation_id: uuid.UUID,
    db: AsyncSession,
) -> int:
    """Persist validated events. Returns the number stored (duplicates silently skipped)."""
    stored = 0
    for event in batch.events:
        existing = await db.get(TelemetryEvent, event.id)
        if existing is not None:
            continue  # idempotent: same event-id from retry is a no-op
        row = TelemetryEvent(
            id=event.id,
            installation_id=installation_id,
            event_type=event.event,
            occurred_at=event.occurred_at,
            # model_dump produces the sanitised allowlisted dict; the backend
            # never parses sub-fields, preserving the opaque storage contract.
            payload=event.model_dump(mode="json"),
        )
        db.add(row)
        stored += 1
    await db.commit()
    return stored


async def upsert_project(
    project_id: uuid.UUID,
    installation_id: uuid.UUID,
    data: ProjectInventoryUpsert,
    db: AsyncSession,
) -> ProjectInventoryRead:
    """Idempotently update the file-count inventory for one project."""
    row = await db.get(ProjectTelemetry, project_id)
    if row is None:
        row = ProjectTelemetry(
            id=project_id,
            installation_id=installation_id,
            tracked_file_count=data.tracked_file_count,
            file_type_counts=data.file_type_counts,
        )
        db.add(row)
    else:
        row.tracked_file_count = data.tracked_file_count
        row.file_type_counts = data.file_type_counts
    await db.commit()
    await db.refresh(row)
    return ProjectInventoryRead(
        project_telemetry_id=row.id,
        installation_id=row.installation_id,
        tracked_file_count=row.tracked_file_count,
        file_type_counts=row.file_type_counts,
        updated_at=row.updated_at,
    )


async def delete_project(
    project_id: uuid.UUID,
    installation_id: uuid.UUID,
    db: AsyncSession,
) -> None:
    """Remove one project inventory record. Silently succeeds if already gone."""
    row = await db.get(ProjectTelemetry, project_id)
    if row is not None and row.installation_id == installation_id:
        await db.delete(row)
        await db.commit()
