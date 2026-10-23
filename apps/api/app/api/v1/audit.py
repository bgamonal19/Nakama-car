from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.deps import get_db
from app.models.identity import AccessLog, AuditLog
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


@router.get("/access")
def list_access_logs(
    email: str | None = Query(default=None, max_length=255),
    db: Session = Depends(get_db),
    auth: AuthContext = Depends(require_permission("audit.read")),
):
    """Access log for an inspection: who entered, when, from where and with which app (last 12 months)."""
    query = select(AccessLog).where(AccessLog.tenant_id == auth.tenant_id)
    if email and email.strip():
        query = query.where(AccessLog.email.ilike(f"%{email.strip()}%"))
    rows = db.scalars(query.order_by(AccessLog.created_at.desc()).limit(500)).all()
    return [{
        "id": str(row.id), "created_at": row.created_at, "account_type": row.account_type, "email": row.email,
        "event": row.event, "method": row.method, "client": row.client, "ip_address": row.ip_address, "user_agent": row.user_agent,
    } for row in rows]
