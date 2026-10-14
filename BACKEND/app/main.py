import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI

from app.core.config import secret_key_weakness, settings
from app.core.rate_limit import RateLimitExceeded, rate_limit_exceeded_handler
from app.db.redis import close_redis
from app.routes import router

logger = logging.getLogger(__name__)

GENERATE_KEY_HINT = (
    'generate one with: python -c "import secrets; print(secrets.token_urlsafe(48))"'
)


def check_secret_key() -> None:
    """Refuse a weak SECRET_KEY in production; warn about one in development (SRS 21, 27)."""

    weakness = secret_key_weakness(settings.secret_key)

    if weakness is None:
        return

    if settings.environment == "production":
        raise RuntimeError(f"SECRET_KEY {weakness}; {GENERATE_KEY_HINT}")

    logger.warning("SECRET_KEY %s; production would refuse to start", weakness)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Release shared connections when the app shuts down."""

    yield

    await close_redis()


def create_app() -> FastAPI:
    """Build the API for the configured environment.

    Refuses to start in production with a weak SECRET_KEY. Swagger, ReDoc
    and the OpenAPI schema are served only outside production (SRS 24).
    """

    check_secret_key()

    production = settings.environment == "production"

    app = FastAPI(
        title="Pikva API",
        description="Secure school pickup verification platform",
        version="0.1.0",
        lifespan=lifespan,
        docs_url=None if production else "/docs",
        redoc_url=None if production else "/redoc",
        openapi_url=None if production else "/openapi.json",
    )

    app.add_exception_handler(RateLimitExceeded, rate_limit_exceeded_handler)
    app.include_router(router)

    return app


app = create_app()
