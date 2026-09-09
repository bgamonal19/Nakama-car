from dataclasses import dataclass
from uuid import UUID

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt

from app.core.config import get_settings
from sqlalchemy import select
from sqlalchemy.orm import Session
from app.db.deps import get_db
from app.models.identity import User, UserStatus, UserTenant

bearer_scheme = HTTPBearer(auto_error=False)
settings = get_settings()

@dataclass(frozen=True, slots=True)
class AuthContext:
    user_id: UUID
    tenant_id: UUID
    permissions: frozenset[str]

def get_auth_context(credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme), db: Session = Depends(get_db)) -> AuthContext:
    if credentials is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Authentication required")
    try:
        payload = jwt.decode(credentials.credentials, settings.jwt_secret, algorithms=[settings.jwt_algorithm])
        if payload.get("type") != "access":
            raise ValueError("Invalid token type")
        user_id = UUID(payload["sub"])
        tenant_id = UUID(payload["tenant_id"])
        user = db.scalar(select(User).join(UserTenant, UserTenant.user_id == User.id).where(
            User.id == user_id, UserTenant.tenant_id == tenant_id,
        ))
        if user is None or user.status != UserStatus.ACTIVE or payload.get("auth_version", 0) != user.auth_version:
            raise ValueError("Session revoked")
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
