from functools import lru_cache

from pydantic import BaseModel, Field, SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict


class DatevTenantConfig(BaseModel):
    # Indexed by the authenticated local tenant UUID; never a shared fallback key.
    base_url: str | None = None
    token_url: str = "https://login.datev.it/connect/token"
    client_id: str | None = None
    client_secret: SecretStr | None = None
    authorization_key: SecretStr | None = None
    scope: str | None = None
    client_credentials_confirmed: bool = False
    payment_method_id: str | None = None
    payment_type_id: str | None = None
    vat_codes: dict[str, str] = Field(default_factory=dict)


class Settings(BaseSettings):
    datev_tenants: dict[str, DatevTenantConfig] = Field(default_factory=dict)

    app_env: str = "local"
    database_url: str
    jwt_secret: str
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 30
    bootstrap_token: str | None = None

    s3_endpoint: str | None = None
    s3_region: str | None = None
    s3_bucket: str | None = None
    s3_access_key_id: str | None = None
    s3_secret_access_key: str | None = None
    s3_signed_url_ttl_seconds: int = 900

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")


@lru_cache
def get_settings() -> Settings:
    return Settings()
