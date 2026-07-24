"""Read-only, aggregate-only queries for the admin dashboard."""

from collections import defaultdict
from datetime import datetime, time, timedelta, timezone
import uuid
from statistics import median

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.control_plane import (
    Installation,
    InstallationTelemetry,
    ProjectTelemetry,
    TelemetryError,
    TelemetryHourlyAiUsage,
    TelemetryHourlyUsage,
    TelemetrySession,
)
from app.models.user import User
from app.schemas.admin_stats import (
    AdminAiModelAggregate,
    AdminAiStatistics,
    AdminCategoryCount,
    AdminErrorAggregate,
    AdminInventoryAverages,
    AdminOverview,
    AdminSearchStatistics,
    AdminStatistics,
    AdminTimeSeriesPoint,
)


def _ratio(numerator: int, denominator: int) -> float:
    return round(numerator / denominator, 2) if denominator else 0.0


def _day_start(value: datetime) -> datetime:
    value = _utc(value)
    day = value.date()
    return datetime.combine(day, time.min, tzinfo=timezone.utc)


def _utc(value: datetime) -> datetime:
    return value.replace(tzinfo=timezone.utc) if value.tzinfo is None else value.astimezone(timezone.utc)


def _series(values: dict[datetime, int]) -> list[AdminTimeSeriesPoint]:
    return [
        AdminTimeSeriesPoint(bucket_start=bucket, count=count)
        for bucket, count in sorted(values.items())
    ]


async def read_admin_statistics(
    db: AsyncSession,
    period_days: int,
    now: datetime | None = None,
    account_id: uuid.UUID | None = None,
    country: str | None = None,
    os_family: str | None = None,
) -> AdminStatistics:
    generated_at = now or datetime.now(timezone.utc)
    window_start = generated_at - timedelta(days=period_days)

    registered_accounts = int(await db.scalar(select(func.count()).select_from(User)) or 0)
    registered_installations = int(
        await db.scalar(select(func.count()).select_from(Installation)) or 0
    )
    estimated_active_installations = int(
        await db.scalar(
            select(func.count(func.distinct(TelemetrySession.installation_id))).where(
                TelemetrySession.opened_at >= window_start
            )
        )
        or 0
    )
    reporting_installations = int(
        await db.scalar(select(func.count()).select_from(InstallationTelemetry)) or 0
    )
    installation_rows = list((await db.scalars(select(Installation))).all())

    allowed_installations = {
        row.id for row in installation_rows
        if (account_id is None or row.user_id == account_id)
        and (os_family is None or row.os_family == os_family)
    }
    if country is not None:
        country_installations = set((await db.scalars(
            select(InstallationTelemetry.installation_id).where(
                InstallationTelemetry.country_code == country
            )
        )).all())
        allowed_installations &= country_installations
    estimated_active_installations = int(
        await db.scalar(
            select(func.count(func.distinct(TelemetrySession.installation_id))).where(
                TelemetrySession.opened_at >= window_start,
                TelemetrySession.installation_id.in_(allowed_installations),
                *([TelemetrySession.country_code == country] if country else []),
            )
        ) or 0
    )
    reporting_installations = int(
        await db.scalar(
            select(func.count()).select_from(InstallationTelemetry).where(
                InstallationTelemetry.installation_id.in_(allowed_installations)
            )
        ) or 0
    )
    projects = [
        row for row in (await db.scalars(select(ProjectTelemetry))).all()
        if row.installation_id in allowed_installations
    ]
    current_projects = len(projects)
    tracked_files = sum(row.asset_count for row in projects)
    current_versions = sum(row.version_count for row in projects)

    linked_project_count = int(
        await db.scalar(
            select(func.count(ProjectTelemetry.id))
            .join(Installation, Installation.id == ProjectTelemetry.installation_id)
            .where(Installation.user_id.is_not(None))
        )
        or 0
    )

    file_type_distribution = [
        AdminCategoryCount(label="PNG", count=sum(row.png_count for row in projects)),
        AdminCategoryCount(label="JPG", count=sum(row.jpg_count for row in projects)),
        AdminCategoryCount(label="Other", count=sum(row.other_count for row in projects)),
    ]

    version_inventory: dict[datetime, int] = defaultdict(int)
    for row in projects:
        if _utc(row.captured_at) >= window_start:
            version_inventory[_day_start(row.captured_at)] += row.version_count

    ai_rows = list(
        (
            await db.scalars(
                select(TelemetryHourlyAiUsage).where(
                    TelemetryHourlyAiUsage.bucket_start >= window_start,
                    TelemetryHourlyAiUsage.installation_id.in_(allowed_installations),
                )
            )
        ).all()
    )
    ai_mix: dict[tuple[str, str, str], list[int]] = defaultdict(lambda: [0, 0, 0, 0])
    ai_over_time: dict[datetime, int] = defaultdict(int)
    for row in ai_rows:
        totals = ai_mix[(row.operation, row.provider, row.model)]
        totals[0] += row.attempt_count
        totals[1] += row.success_count
        totals[2] += row.failure_count
        totals[3] += row.total_latency_ms
        ai_over_time[_day_start(row.bucket_start)] += row.attempt_count

    ai_attempts = sum(row.attempt_count for row in ai_rows)
    ai_successes = sum(row.success_count for row in ai_rows)
    ai_failures = sum(row.failure_count for row in ai_rows)
    ai_latency = sum(row.total_latency_ms for row in ai_rows)
    ai_provider_model_mix = [
        AdminAiModelAggregate(
            operation=operation,
            provider=provider,
            model=model,
            attempt_count=totals[0],
            success_count=totals[1],
            failure_count=totals[2],
            average_latency_ms=_ratio(totals[3], totals[0]),
            token_count=None,
        )
        for (operation, provider, model), totals in sorted(ai_mix.items())
    ]

    search_rows = list(
        (
            await db.scalars(
                select(TelemetryHourlyUsage).where(
                    TelemetryHourlyUsage.bucket_start >= window_start,
                    TelemetryHourlyUsage.installation_id.in_(allowed_installations),
                )
            )
        ).all()
    )
    search_over_time: dict[datetime, int] = defaultdict(int)
    version_over_time: dict[datetime, int] = defaultdict(int)
    for row in search_rows:
        search_over_time[_day_start(row.bucket_start)] += row.search_count
        version_over_time[_day_start(row.bucket_start)] += row.version_capture_count
    search_total = sum(row.search_count for row in search_rows)
    keyword_searches = sum(row.keyword_search_count for row in search_rows)
    semantic_searches = sum(row.semantic_search_count for row in search_rows)
    versions_captured = sum(row.version_capture_count for row in search_rows)
    project_creations = sum(row.project_create_count for row in search_rows)
    restores = sum(row.restore_count for row in search_rows)
    weekly_cutoff = generated_at - timedelta(days=7)
    weekly_active_creative = len({
        row.installation_id for row in search_rows
        if _utc(row.bucket_start) >= weekly_cutoff and row.version_capture_count > 0
    })
    installation_by_id = {row.id: row for row in installation_rows}
    telemetry_states = list((await db.scalars(
        select(InstallationTelemetry).where(
            InstallationTelemetry.installation_id.in_(allowed_installations)
        )
    )).all())
    activated = [
        row for row in telemetry_states
        if row.first_version_at is not None
        and row.installation_id in installation_by_id
        and (_utc(row.first_version_at) - _utc(installation_by_id[row.installation_id].first_seen_at)) <= timedelta(hours=24)
    ]
    eligible_d7 = [row for row in activated if _utc(row.first_version_at) <= generated_at - timedelta(days=7)]
    session_rows = list((await db.scalars(
        select(TelemetrySession).where(TelemetrySession.installation_id.in_(allowed_installations))
    )).all())
    retained_d7 = sum(any(
        _utc(state.first_version_at) + timedelta(days=7) <= _utc(session.opened_at)
        < _utc(state.first_version_at) + timedelta(days=8)
        for session in session_rows if session.installation_id == state.installation_id
    ) for state in eligible_d7)

    error_rows = list(
        (
            await db.scalars(
                select(TelemetryError).where(
                    TelemetryError.occurred_at >= window_start,
                    TelemetryError.installation_id.in_(allowed_installations),
                )
            )
        ).all()
    )
    error_groups: dict[tuple[str, str, str | None, str, str], tuple[int, datetime]] = {}
    for row in error_rows:
        key = (
            row.component,
            row.error_name,
            row.error_code,
            row.stack_fingerprint,
            row.severity,
        )
        occurred_at = _utc(row.occurred_at)
        count, last_seen = error_groups.get(key, (0, occurred_at))
        error_groups[key] = (count + 1, max(last_seen, occurred_at))
    errors = [
        AdminErrorAggregate(
            component=key[0],
            error_name=key[1],
            error_code=key[2],
            stack_fingerprint=key[3],
            severity=key[4],
            count=value[0],
            last_seen_at=value[1],
        )
        for key, value in sorted(
            error_groups.items(), key=lambda item: (-item[1][0], item[0])
        )[:20]
    ]

    location_counts: dict[str, int] = defaultdict(int)
    for country, region, city in (
        await db.execute(
            select(
                TelemetrySession.country_code,
                TelemetrySession.region_code,
                TelemetrySession.city,
            ).where(
                TelemetrySession.opened_at >= window_start,
                TelemetrySession.installation_id.in_(allowed_installations),
            )
        )
    ).all():
        label = " · ".join(part for part in (country, region, city) if part) or "Unknown"
        location_counts[label] += 1
    coarse_locations = [
        AdminCategoryCount(label=label, count=count)
        for label, count in sorted(location_counts.items(), key=lambda item: (-item[1], item[0]))[:12]
    ]

    return AdminStatistics(
        generated_at=generated_at,
        period_days=period_days,
        overview=AdminOverview(
            registered_accounts=registered_accounts,
            registered_installations=registered_installations,
            estimated_active_installations=estimated_active_installations,
            reporting_installations=reporting_installations,
            current_projects=current_projects,
            tracked_files=tracked_files,
            current_versions=current_versions,
            weekly_active_creative_installations=weekly_active_creative,
            versions_captured=versions_captured,
            project_creations=project_creations,
            restores=restores,
            activation_rate=_ratio(len(activated), len(telemetry_states)),
            d7_retention_rate=_ratio(retained_d7, len(eligible_d7)),
        ),
        inventory_averages=AdminInventoryAverages(
            projects_per_registered_account=_ratio(
                linked_project_count, registered_accounts
            ),
            projects_per_registered_installation=_ratio(
                current_projects, registered_installations
            ),
            tracked_files_per_project=_ratio(tracked_files, current_projects),
            versions_per_project=_ratio(current_versions, current_projects),
            median_versions_per_project=float(median(
                [row.version_count for row in projects]
            )) if projects else 0.0,
        ),
        file_type_distribution=file_type_distribution,
        version_inventory_over_time=_series(version_over_time or version_inventory),
        ai=AdminAiStatistics(
            attempt_count=ai_attempts,
            success_count=ai_successes,
            failure_count=ai_failures,
            success_rate=_ratio(ai_successes, ai_attempts),
            average_latency_ms=_ratio(ai_latency, ai_attempts),
            token_counts_available=False,
            total_token_count=None,
            provider_model_mix=ai_provider_model_mix,
            over_time=_series(ai_over_time),
        ),
        search=AdminSearchStatistics(
            total_count=search_total,
            mode_counts_available=True,
            by_mode=[
                AdminCategoryCount(label="Keyword", count=keyword_searches),
                AdminCategoryCount(label="Semantic", count=semantic_searches),
            ],
            over_time=_series(search_over_time),
        ),
        errors=errors,
        coarse_locations=coarse_locations,
    )
