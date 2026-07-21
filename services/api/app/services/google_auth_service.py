import asyncio

from fastapi import HTTPException, status
from google.auth.exceptions import GoogleAuthError
from google.auth.transport import requests as google_requests
from google.oauth2 import id_token

from app.core.config import settings
from app.schemas.control_plane import GoogleIdentityClaims


def _verify(credential: str) -> dict:
    return id_token.verify_oauth2_token(
        credential,
        google_requests.Request(),
        settings.google_oauth_client_id,
    )


async def verify_google_credential(credential: str) -> GoogleIdentityClaims:
    """Validate a Google ID token without blocking FastAPI's event loop."""
    if not settings.google_oauth_client_id:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Google sign-in is not configured",
        )
    try:
        claims = await asyncio.to_thread(_verify, credential)
    except (ValueError, GoogleAuthError):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid Google credential",
        ) from None

    email = claims.get("email")
    subject = claims.get("sub")
    if not subject or not email or claims.get("email_verified") is not True:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Google account must provide a verified email",
        )

    return GoogleIdentityClaims(
        subject=subject,
        email=email,
        email_verified=True,
        given_name=claims.get("given_name") or "",
        family_name=claims.get("family_name") or "",
        display_name=claims.get("name") or "",
    )
