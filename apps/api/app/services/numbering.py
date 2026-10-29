from datetime import datetime, timezone

from sqlalchemy import func, select
from sqlalchemy.orm import Session


def next_number(db: Session, column, tenant_column, tenant_id, prefix: str, width: int = 6) -> str:
    """Next "<prefix><year>-<n>" number after the highest one in use.

    Counting rows would hand out a number that already exists once a record has been
    deleted (e.g. 4 estimates left, but NC-P-2026-000005 still there).
    """
    full = f"{prefix}{datetime.now(timezone.utc).year}-"
    last = db.scalar(select(func.max(column)).where(tenant_column == tenant_id, column.like(f"{full}%")))
    tail = last[len(full):] if last else ""
    return f"{full}{(int(tail) if tail.isdigit() else 0) + 1:0{width}d}"
