from fastapi import FastAPI

app = FastAPI(
    title="Pikva API",
    description="Secure school pickup verification platform",
    version="0.1.0",
)


@app.get("/health")
async def health_check():
    """Return the health status of the API."""

    return {"status": "ok"}
