from contextlib import asynccontextmanager

from fastapi import FastAPI

from app.core.config import settings
from app.core.rate_limit import RateLimitExceeded, rate_limit_exceeded_handler
from app.db.redis import close_redis
from app.routes import router


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Release shared connections when the app shuts down."""

    yield

    await close_redis()


def create_app() -> FastAPI:
    """Build the API for the configured environment.

    Swagger, ReDoc and the OpenAPI schema are served only outside
    production (SRS 24).
    """

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
