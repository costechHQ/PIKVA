from fastapi import FastAPI
from app.routes import router


app = FastAPI(
    title="Pikva API",
    description="Secure school pickup verification platform",
    version="0.1.0",
)

app.include_router(router)
