from dataclasses import dataclass
from uuid import UUID

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt

from app.core.config import get_settings

bearer_scheme = HTTPBearer(auto_error=False)
settings = get_settings()

@dataclass(frozen=True, slots=True)
class AuthContext:
    user_id: UUID
    tenant_id: UUID
    permissions: frozenset[str]

def get_auth_context(credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme)) -> AuthContext:
    if credentials is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Authentication required")
    try:
        payload = jwt.decode(credentials.credentials, settings.jwt_secret, algorithms=[settings.jwt_algorithm])
        if payload.get("type") != "access":
            raise ValueError("Invalid token type")
        return AuthContext(
            user_id=UUID(payload["sub"]),
            tenant_id=UUID(payload["tenant_id"]),
            permissions=frozenset(payload.get("permissions", [])),
        )
    except (JWTError, KeyError, ValueError):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")

def require_permission(permission: str):
    def dependency(context: AuthContext = Depends(get_auth_context)) -> AuthContext:
        if permission not in context.permissions:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Permission denied")
        return context
    return dependency
