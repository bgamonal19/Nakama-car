from uuid import UUID

from pydantic import BaseModel, EmailStr, Field, field_validator, ConfigDict

from app.models.identity import UserStatus


class UserCreate(BaseModel):
    email: EmailStr
    password: str = Field(min_length=10)
    first_name: str = Field(min_length=1, max_length=120)
    last_name: str = Field(min_length=1, max_length=120)
    role_code: str

    @field_validator("first_name", "last_name", "role_code", mode="before")
    @classmethod
    def trim_profile_fields(cls, value):
        return value.strip() if isinstance(value, str) else value


class UserRead(BaseModel):
    id: UUID
    email: EmailStr
    first_name: str
    last_name: str
    status: UserStatus
    role_codes: list[str]


class UserUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    email: EmailStr
    first_name: str = Field(min_length=1, max_length=120)
    last_name: str = Field(min_length=1, max_length=120)
    role_code: str = Field(min_length=1, max_length=64)
    password: str | None = Field(default=None, min_length=10)

    @field_validator("first_name", "last_name", "role_code", mode="before")
    @classmethod
    def trim_profile_fields(cls, value):
        return value.strip() if isinstance(value, str) else value
