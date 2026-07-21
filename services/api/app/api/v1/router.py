from fastapi import APIRouter

from app.api.v1.endpoints import account, auth, hello, installations, permissions, roles, users

router = APIRouter(prefix="/api/v1")

router.include_router(auth.router)
router.include_router(users.router)
router.include_router(roles.router)
router.include_router(permissions.router)
router.include_router(hello.router)
router.include_router(account.router)
router.include_router(installations.router)
