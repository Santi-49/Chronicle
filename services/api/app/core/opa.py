import httpx

from app.core.config import settings

_OPA_AUTHZ_URL = f"{settings.opa_url}/v1/data/authz/allow"


async def check_permission(user_id: str, roles: list[str], resource: str, action: str) -> bool:
    payload = {
        "input": {
            "user_id": user_id,
            "roles": roles,
            "resource": resource,
            "action": action,
        }
    }
    async with httpx.AsyncClient(timeout=5.0) as client:
        response = await client.post(_OPA_AUTHZ_URL, json=payload)
        response.raise_for_status()
        data = response.json()
        return bool(data.get("result", False))
