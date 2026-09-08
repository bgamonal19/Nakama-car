from typing import Any
from uuid import UUID

from sqlalchemy.orm import Session

from app.models.identity import AuditLog


def record_audit(
    db: Session,
    *,
    tenant_id: UUID,
    user_id: UUID | None,
    entity_type: str,
    entity_id: UUID | None,
    action: str,
    field_name: str | None = None,
    old_value: Any = None,
    new_value: Any = None,
    ip_address: str | None = None,
    user_agent: str | None = None,
) -> AuditLog:
    log = AuditLog(
        tenant_id=tenant_id,
        user_id=user_id,
        entity_type=entity_type,
        entity_id=entity_id,
        action=action,
        field_name=field_name,
        old_value=old_value,
        new_value=new_value,
        ip_address=ip_address,
        user_agent=user_agent,
    )
    db.add(log)
    return log
