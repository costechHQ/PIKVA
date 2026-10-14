from typing import Literal

from pydantic import SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    # Unknown values fail at startup, so a typo never runs as development.
    environment: Literal["development", "production"] = "development"

    database_url: str
    secret_key: str
    access_token_expire_minutes: int = 30
    database_echo: bool = False

    # Rate-limit counters. Database 0 for the app; tests switch to 15.
    redis_url: str = "redis://127.0.0.1:6379/0"

    # Email notifications (SRS 20). Without both, emails are logged, not sent.
    resend_api_key: SecretStr | None = None
    email_from: str | None = None

    model_config = SettingsConfigDict(env_file=".env")


settings = Settings()
