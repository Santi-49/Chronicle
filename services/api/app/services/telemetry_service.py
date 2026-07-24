"""Normalized, retry-safe storage for v2 usage-statistics batches."""
from dataclasses import dataclass

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.control_plane import (
    InstallationTelemetry,
    ProjectTelemetry,
    TelemetryError,
    TelemetryHourlyAiUsage,
    TelemetryHourlyUsage,
    TelemetryProjectRemoval,
    TelemetrySession,
)
from app.schemas.telemetry import TelemetryBatch


@dataclass(frozen=True)
class RequestLocation:
    country_code: str | None
    region_code: str | None
    city: str | None


def _location(location: RequestLocation) -> dict:
    return {
        "country_code": location.country_code,
        "region_code": location.region_code,
        "city": location.city,
    }


async def ingest_batch(batch: TelemetryBatch, location: RequestLocation, db: AsyncSession) -> None:
    installation_id = batch.installation_id
    loc = _location(location)

    for item in batch.sessions:
        if await db.get(TelemetrySession, item.id) is None:
            db.add(TelemetrySession(
                id=item.id,
                installation_id=installation_id,
                **item.model_dump(exclude={"id"}),
                **loc,
            ))

    for item in batch.project_removals:
        if await db.get(TelemetryProjectRemoval, item.id) is None:
            db.add(TelemetryProjectRemoval(
                id=item.id,
                installation_id=installation_id,
                **item.model_dump(exclude={"id"}),
                **loc,
            ))
        project = await db.get(ProjectTelemetry, item.project_telemetry_id)
        if project is not None and project.installation_id == installation_id:
            await db.delete(project)

    for item in batch.hourly_usage:
        key = (installation_id, item.bucket_start)
        row = await db.get(TelemetryHourlyUsage, key)
        if row is None:
            db.add(TelemetryHourlyUsage(
                installation_id=installation_id, **item.model_dump(), **loc,
            ))
        else:
            row.search_count = max(row.search_count, item.search_count)
            row.keyword_search_count = max(row.keyword_search_count, item.keyword_search_count)
            row.semantic_search_count = max(row.semantic_search_count, item.semantic_search_count)
            row.version_capture_count = max(row.version_capture_count, item.version_capture_count)
            row.restore_count = max(row.restore_count, item.restore_count)
            row.project_create_count = max(row.project_create_count, item.project_create_count)
            row.country_code, row.region_code, row.city = loc.values()

    for item in batch.hourly_ai_usage:
        key = (installation_id, item.bucket_start, item.operation, item.provider, item.model)
        row = await db.get(TelemetryHourlyAiUsage, key)
        if row is None:
            db.add(TelemetryHourlyAiUsage(
                installation_id=installation_id, **item.model_dump(), **loc,
            ))
        else:
            # Client counters are cumulative within their hour; max makes retries idempotent.
            row.attempt_count = max(row.attempt_count, item.attempt_count)
            row.success_count = max(row.success_count, item.success_count)
            row.failure_count = max(row.failure_count, item.failure_count)
            row.total_latency_ms = max(row.total_latency_ms, item.total_latency_ms)
            row.country_code, row.region_code, row.city = loc.values()

    for item in batch.errors:
        if await db.get(TelemetryError, item.id) is None:
            db.add(TelemetryError(
                id=item.id,
                installation_id=installation_id,
                **item.model_dump(exclude={"id"}),
                **loc,
            ))

    if batch.installation_state is not None:
        data = batch.installation_state.model_dump()
        row = await db.get(InstallationTelemetry, installation_id)
        if row is None:
            db.add(InstallationTelemetry(installation_id=installation_id, **data, **loc))
        elif data["captured_at"] >= row.captured_at:
            for key, value in {**data, **loc}.items():
                if key in {"first_project_at", "first_version_at"}:
                    if value is not None and (getattr(row, key) is None or value < getattr(row, key)):
                        setattr(row, key, value)
                else:
                    setattr(row, key, value)

    for item in batch.projects:
        data = item.model_dump(exclude={"project_telemetry_id"})
        latest_removal = await db.scalar(
            select(TelemetryProjectRemoval.occurred_at)
            .where(
                TelemetryProjectRemoval.installation_id == installation_id,
                TelemetryProjectRemoval.project_telemetry_id == item.project_telemetry_id,
            )
            .order_by(TelemetryProjectRemoval.occurred_at.desc())
            .limit(1)
        )
        if latest_removal is not None and latest_removal >= item.captured_at:
            continue
        row = await db.get(ProjectTelemetry, item.project_telemetry_id)
        if row is None:
            db.add(ProjectTelemetry(
                id=item.project_telemetry_id, installation_id=installation_id, **data,
            ))
        elif row.installation_id == installation_id and data["captured_at"] >= row.captured_at:
            for key, value in data.items():
                setattr(row, key, value)

    delete_ids = set(batch.deleted_project_ids)
    for project_id in delete_ids:
        row = await db.get(ProjectTelemetry, project_id)
        if row is not None and row.installation_id == installation_id:
            await db.delete(row)

    if batch.final:
        await db.execute(delete(InstallationTelemetry).where(
            InstallationTelemetry.installation_id == installation_id
        ))
        await db.execute(delete(ProjectTelemetry).where(
            ProjectTelemetry.installation_id == installation_id
        ))

    await db.commit()
