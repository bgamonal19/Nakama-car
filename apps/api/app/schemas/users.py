from uuid import UUID

from pydantic import BaseModel, EmailStr, Field

from app.models.identity import UserStatus


class UserCreate(BaseModel):
    email: EmailStr
    password: str = Field(min_length=10)
    first_name: str
    last_name: str
    role_code: str


class UserRead(BaseModel):
    id: UUID
    email: EmailStr
    first_name: str
    last_name: str
    status: UserStatus
    role_codes: list[str]
