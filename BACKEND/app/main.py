from contextlib import asynccontextmanager

from fastapi import FastAPI

from app.core.rate_limit import RateLimitExceeded, rate_limit_exceeded_handler
from app.db.redis import close_redis
from app.routes import router


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Release shared connections when the app shuts down."""

    yield

    await close_redis()


app = FastAPI(
    title="Pikva API",
    description="Secure school pickup verification platform",
    version="0.1.0",
    lifespan=lifespan,
)

app.add_exception_handler(RateLimitExceeded, rate_limit_exceeded_handler)
app.include_router(router)
