from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.deps import get_db
from app.models.identity import AuditLog
from app.schemas.audit import AuditLogRead
from app.security.context import AuthContext, require_permission

router = APIRouter(prefix="/audit", tags=["audit"])


@router.get("", response_model=list[AuditLogRead])
def list_audit_logs(
    db: Session = Depends(get_db),
    auth: AuthContext = Depends(require_permission("audit.read")),
):
    return db.scalars(
        select(AuditLog)
        .where(AuditLog.tenant_id == auth.tenant_id)
        .order_by(AuditLog.created_at.desc())
        .limit(250)
    ).all()
