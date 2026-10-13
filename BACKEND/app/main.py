from contextlib import asynccontextmanager

from fastapi import FastAPI

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

app.include_router(router)
