"""Admin-only aggregate statistics; never returns event-level or creative data."""

import uuid

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.dependencies import require_permission
from app.models.control_plane import ExternalIdentity, Installation, ProjectTelemetry
from app.models.user import User
from app.schemas.admin_stats import AdminAccountSummary, AdminStatistics
from app.services.admin_stats_service import read_admin_statistics

router = APIRouter(prefix="/admin/statistics", tags=["admin"])


@router.get("", response_model=AdminStatistics)
async def get_admin_statistics(
    period_days: int = Query(default=30, ge=7, le=90),
    account_id: uuid.UUID | None = None,
    country: str | None = Query(default=None, min_length=2, max_length=2),
    os_family: str | None = Query(default=None, pattern="^(windows|macos|linux|other)$"),
    _: User = require_permission("admin_statistics", "read"),
    db: AsyncSession = Depends(get_db),
) -> AdminStatistics:
    return await read_admin_statistics(
        db, period_days, account_id=account_id,
        country=country.upper() if country else None, os_family=os_family,
    )


@router.get("/accounts", response_model=list[AdminAccountSummary])
async def search_admin_accounts(
    search: str = Query(default="", max_length=100),
    _: User = require_permission("admin_statistics", "read"),
    db: AsyncSession = Depends(get_db),
) -> list[AdminAccountSummary]:
    query = select(User).order_by(User.email).limit(50)
    if term := search.strip():
        pattern = f"%{term}%"
        query = query.where(or_(User.email.ilike(pattern), User.name.ilike(pattern), User.surname.ilike(pattern)))
    result = []
    for user in (await db.scalars(query)).unique().all():
        installation_ids = list((await db.scalars(
            select(Installation.id).where(Installation.user_id == user.id)
        )).all())
        projects = list((await db.scalars(
            select(ProjectTelemetry).where(ProjectTelemetry.installation_id.in_(installation_ids))
        )).all()) if installation_ids else []
        google_linked = bool(await db.scalar(
            select(func.count()).select_from(ExternalIdentity).where(
                ExternalIdentity.user_id == user.id, ExternalIdentity.provider == "google"
            )
        ))
        result.append(AdminAccountSummary(
            id=user.id, email=user.email, display_name=f"{user.name} {user.surname}".strip(),
            google_linked=google_linked, installation_count=len(installation_ids),
            current_project_count=len(projects),
            current_version_count=sum(project.version_count for project in projects),
        ))
    return result
