from typing import Literal

from pydantic import SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    # Unknown values fail at startup, so a typo never runs as development.
    environment: Literal["development", "production"] = "development"
    log_level: Literal["DEBUG", "INFO", "WARNING", "ERROR"] = "INFO"

    database_url: str
    secret_key: str
    access_token_expire_minutes: int = 30
    database_echo: bool = False

    # Rate-limit counters. Database 0 for the app; tests switch to 15.
    redis_url: str = "redis://127.0.0.1:6379/0"

    # Email notifications (SRS 20). Without both, emails are logged, not sent.
    resend_api_key: SecretStr | None = None
    email_from: str | None = None

    # The web app's address, for links in emails (password reset, SRS 6.6).
    web_app_url: str = "http://localhost:3000"

    model_config = SettingsConfigDict(env_file=".env")


settings = Settings()


MIN_SECRET_KEY_LENGTH = 32
MIN_SECRET_KEY_DISTINCT_CHARACTERS = 10
_PLACEHOLDER_KEYS = {"changeme", "secret", "password"}
_PLACEHOLDER_PARTS = ("change-me", "changeme", "your-secret", "replace-me")


def secret_key_weakness(secret_key: str) -> str | None:
    """Return why a SECRET_KEY is too weak for production, or None if it is fine.

    The reason never includes the key itself, so it is safe to log.
    """

    lowered = secret_key.lower()

    if lowered in _PLACEHOLDER_KEYS or any(part in lowered for part in _PLACEHOLDER_PARTS):
        return "looks like a placeholder"

    if len(secret_key) < MIN_SECRET_KEY_LENGTH:
        return f"is shorter than {MIN_SECRET_KEY_LENGTH} characters"

    if len(set(secret_key)) < MIN_SECRET_KEY_DISTINCT_CHARACTERS:
        return f"has fewer than {MIN_SECRET_KEY_DISTINCT_CHARACTERS} distinct characters"

    return None
