"""Explorer-only application. No legacy workbench routes or session database."""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .atlas_jobs import router as atlas_router
from .explorer import router as explorer_router
from .llm import llm_available

app = FastAPI(title="POROS Explorer", version="0.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[f"http://{host}:{port}" for host in ("127.0.0.1", "localhost") for port in (5177, 5178)],
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type"],
)
app.include_router(explorer_router)
app.include_router(atlas_router)


@app.get("/api/health")
def health():
    return {"status": "ok", "product": "explorer", "model_configured": llm_available()}
