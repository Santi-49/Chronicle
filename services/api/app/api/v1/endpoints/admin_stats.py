"""Admin-only aggregate statistics; never returns event-level or creative data."""

import uuid
from datetime import date, datetime, time, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Path, Query, Response, status
from sqlalchemy import delete, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.dependencies import require_permission
from app.models.control_plane import (
    ExternalIdentity,
    Installation,
    ProjectTelemetry,
    TelemetryError,
)
from app.models.role import Role
from app.models.user import User
from app.schemas.admin_stats import AdminAccountSummary, AdminStatistics
from app.services.admin_stats_service import read_admin_statistics

router = APIRouter(prefix="/admin/statistics", tags=["admin"])


@router.get("", response_model=AdminStatistics)
async def get_admin_statistics(
    period_days: int = Query(default=30, ge=1, le=366),
    all_time: bool = False,
    start_date: date | None = None,
    end_date: date | None = None,
    account_id: uuid.UUID | None = None,
    country: str | None = Query(default=None, min_length=2, max_length=2),
    os_family: str | None = Query(default=None, pattern="^(windows|macos|linux|other)$"),
    app_version: str | None = Query(default=None, min_length=1, max_length=32),
    _: User = require_permission("admin_statistics", "read"),
    db: AsyncSession = Depends(get_db),
) -> AdminStatistics:
    if all_time and (start_date is not None or end_date is not None):
        raise HTTPException(status_code=422, detail="all_time cannot be combined with custom dates")
    if (start_date is None) != (end_date is None):
        raise HTTPException(status_code=422, detail="start_date and end_date must be provided together")
    start_at = end_at = None
    if all_time:
        end_at = datetime.now(timezone.utc)
        first_seen = await db.scalar(select(func.min(Installation.first_seen_at)))
        first_seen_utc = (
            first_seen.replace(tzinfo=timezone.utc)
            if first_seen is not None and first_seen.tzinfo is None
            else (first_seen or end_at).astimezone(timezone.utc)
        )
        start_at = datetime.combine(
            first_seen_utc.date(),
            time.min,
            tzinfo=timezone.utc,
        )
        period_days = max(1, (end_at.date() - start_at.date()).days + 1)
    elif start_date is not None and end_date is not None:
        if end_date < start_date:
            raise HTTPException(status_code=422, detail="end_date must not precede start_date")
        custom_days = (end_date - start_date).days + 1
        if custom_days > 366:
            raise HTTPException(status_code=422, detail="custom range cannot exceed 366 days")
        period_days = custom_days
        start_at = datetime.combine(start_date, time.min, tzinfo=timezone.utc)
        end_at = datetime.combine(end_date + timedelta(days=1), time.min, tzinfo=timezone.utc)
    return await read_admin_statistics(
        db, period_days, start_at=start_at, end_at=end_at, account_id=account_id,
        country=country.upper() if country else None, os_family=os_family,
        app_version=app_version,
    )


async def _account_summary(db: AsyncSession, user: User) -> AdminAccountSummary:
    installations = list((await db.scalars(
        select(Installation).where(Installation.user_id == user.id)
    )).all())
    installation_ids = [item.id for item in installations]
    projects = list((await db.scalars(
        select(ProjectTelemetry).where(ProjectTelemetry.installation_id.in_(installation_ids))
    )).all()) if installation_ids else []
    identities = list((await db.scalars(
        select(ExternalIdentity).where(ExternalIdentity.user_id == user.id)
    )).all())
    latest = max(installations, key=lambda item: item.last_seen_at, default=None)
    return AdminAccountSummary(
        id=user.id,
        email=user.email,
        display_name=f"{user.name} {user.surname}".strip(),
        google_linked=any(item.provider == "google" for item in identities),
        is_active=user.is_active,
        is_admin="admin" in user.role_names,
        last_login_at=max(
            (item.last_login_at for item in identities), default=None
        ),
        installation_count=len(installations),
        current_project_count=len(projects),
        current_version_count=sum(project.version_count for project in projects),
        latest_app_version=latest.app_version if latest else None,
        latest_os_family=latest.os_family if latest else None,
    )


@router.get("/accounts", response_model=list[AdminAccountSummary])
async def search_admin_accounts(
    search: str = Query(default="", max_length=100),
    _: User = require_permission("admin_statistics", "read"),
    db: AsyncSession = Depends(get_db),
) -> list[AdminAccountSummary]:
    query = select(User).order_by(User.email).limit(200)
    if term := search.strip():
        pattern = f"%{term}%"
        query = query.where(or_(User.email.ilike(pattern), User.name.ilike(pattern), User.surname.ilike(pattern)))
    result: list[AdminAccountSummary] = []
    for user in (await db.scalars(query)).unique().all():
        result.append(await _account_summary(db, user))
    return result


@router.put("/accounts/{user_id}/admin", response_model=AdminAccountSummary)
async def promote_admin(
    user_id: uuid.UUID,
    _: User = require_permission("admin_statistics", "write"),
    db: AsyncSession = Depends(get_db),
) -> AdminAccountSummary:
    user = await db.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=404, detail="Account not found")
    admin_role = await db.scalar(select(Role).where(Role.name == "admin"))
    if admin_role is None:
        raise HTTPException(status_code=500, detail="Admin role is not configured")
    if "admin" not in user.role_names:
        user.roles.append(admin_role)
        await db.commit()
    return await _account_summary(db, user)


@router.delete("/accounts/{user_id}/admin", response_model=AdminAccountSummary)
async def demote_admin(
    user_id: uuid.UUID,
    _: User = require_permission("admin_statistics", "write"),
    db: AsyncSession = Depends(get_db),
) -> AdminAccountSummary:
    user = await db.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=404, detail="Account not found")
    if "admin" in user.role_names:
        admin_count = sum(
            "admin" in candidate.role_names
            for candidate in (await db.scalars(select(User))).unique().all()
            if candidate.is_active
        )
        if admin_count <= 1:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="The last active administrator cannot be demoted",
            )
        user.roles = [role for role in user.roles if role.name != "admin"]
        await db.commit()
    return await _account_summary(db, user)


@router.delete("/errors", status_code=status.HTTP_204_NO_CONTENT)
async def delete_all_errors(
    _: User = require_permission("admin_statistics", "write"),
    db: AsyncSession = Depends(get_db),
) -> Response:
    """Delete every stored occurrence, without suppressing future error telemetry."""
    await db.execute(delete(TelemetryError))
    await db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.delete("/errors/{stack_fingerprint}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_error_group(
    stack_fingerprint: str = Path(min_length=16, max_length=128),
    _: User = require_permission("admin_statistics", "write"),
    db: AsyncSession = Depends(get_db),
) -> Response:
    """Delete stored occurrences, without suppressing future events with this fingerprint."""
    await db.execute(
        delete(TelemetryError).where(
            TelemetryError.stack_fingerprint == stack_fingerprint
        )
    )
    await db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
