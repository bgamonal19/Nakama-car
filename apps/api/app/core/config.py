from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
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

    # Plate lookup (targa.co.it / RegCheck). Leave the username empty to disable it.
    targa_api_username: str | None = None
    targa_api_url: str = "https://www.regcheck.org.uk/api/reg.asmx/CheckItaly"
    targa_api_timeout_seconds: float = 15
    plate_lookup_monthly_limit: int = 300
    plate_lookup_cache_days: int = 365

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")


@lru_cache
def get_settings() -> Settings:
    return Settings()
