"""
POST /api/v1/telemetry/events         — batch event ingestion (installation-id from body)
PUT  /api/v1/telemetry/projects/{id}  — project inventory upsert
DEL  /api/v1/telemetry/projects/{id}  — project inventory deletion

All endpoints are public (no auth required) to support local-mode installations that
have no Chronicle account. The installation_id is taken from the request body/path;
there is no secret involved because the data is intentionally content-free.
"""
import uuid

from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.schemas.telemetry import (
    ProjectInventoryRead,
    ProjectInventoryUpsert,
    TelemetryBatch,
)
from app.services import telemetry_service

router = APIRouter(prefix="/telemetry", tags=["telemetry"])


@router.post("/events", status_code=status.HTTP_204_NO_CONTENT)
async def ingest_events(
    batch: TelemetryBatch,
    db: AsyncSession = Depends(get_db),
) -> None:
    """
    Batch-ingest content-free telemetry events.

    The installation_id inside each event is taken directly from the client payload;
    events with duplicate IDs are silently ignored for idempotent retry safety.
    All events in a batch must share the same installation_id — the schema validates
    the individual fields; the service enforces no cross-event constraint here.
    """
    # Use the installation_id from the first event as the batch owner; all events
    # carry their own installation_id which the service stores verbatim.
    installation_id = batch.events[0].installation_id
    await telemetry_service.ingest_events(batch, installation_id, db)


@router.put(
    "/projects/{project_telemetry_id}",
    response_model=ProjectInventoryRead,
    status_code=status.HTTP_200_OK,
)
async def upsert_project(
    project_telemetry_id: uuid.UUID,
    data: ProjectInventoryUpsert,
    installation_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
) -> ProjectInventoryRead:
    """
    Upsert the file-count inventory for one project.

    `installation_id` is passed as a required query parameter so the backend can
    scope records per-installation without requiring a Chronicle account.
    """
    return await telemetry_service.upsert_project(project_telemetry_id, installation_id, data, db)


@router.delete(
    "/projects/{project_telemetry_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def delete_project(
    project_telemetry_id: uuid.UUID,
    installation_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
) -> None:
    """
    Remove a project inventory record.

    Called when a project is removed or telemetry is disabled. Silently succeeds
    if the record is already gone.
    """
    await telemetry_service.delete_project(project_telemetry_id, installation_id, db)
