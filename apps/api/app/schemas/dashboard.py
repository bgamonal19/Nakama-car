from pydantic import BaseModel


class DashboardPractice(BaseModel):
    code: str
    plate: str
    car: str
    client: str
    status: str


class DashboardSummary(BaseModel):
    open_cases: int
    waiting_approval: int
    in_progress: int
    waiting_parts: int = 0
    ready: int
    recent_practices: list[DashboardPractice]
