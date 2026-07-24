"""Public, content-free usage-statistics ingestion."""

from fastapi import APIRouter, Depends, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.schemas.telemetry import TelemetryBatch
from app.services import telemetry_service
from app.services.telemetry_service import RequestLocation

router = APIRouter(prefix="/telemetry", tags=["telemetry"])


def _clean_header(value: str | None, maximum: int) -> str | None:
    if value is None:
        return None
    clean = value.strip()
    return clean[:maximum] if clean else None


def cloudflare_location(request: Request) -> RequestLocation:
    """Use edge-derived location only; never retain CF-Connecting-IP."""
    country = _clean_header(request.headers.get("cf-ipcountry"), 2)
    if country in {"XX", "T1"}:
        country = None
    return RequestLocation(
        country_code=country.upper() if country else None,
        region_code=_clean_header(request.headers.get("cf-region-code"), 16),
        city=_clean_header(request.headers.get("cf-ipcity"), 128),
    )


@router.post("/batches", status_code=status.HTTP_204_NO_CONTENT)
async def ingest_batch(
    batch: TelemetryBatch,
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> None:
    await telemetry_service.ingest_batch(batch, cloudflare_location(request), db)
