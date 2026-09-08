from datetime import datetime, timedelta, timezone
from uuid import UUID
from jose import jwt
from app.core.config import get_settings

settings = get_settings()

def create_access_token(*, user_id: UUID, tenant_id: UUID, permissions: list[str]) -> str:
    now = datetime.now(timezone.utc)
    payload = {
        "sub": str(user_id),
        "tenant_id": str(tenant_id),
        "permissions": permissions,
        "iat": int(now.timestamp()),
        "exp": int((now + timedelta(minutes=settings.access_token_expire_minutes)).timestamp()),
        "type": "access",
    }
    return jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)
