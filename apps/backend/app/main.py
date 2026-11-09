import sys
from pathlib import Path

# Add workspace root to sys.path to allow sibling apps/ packages imports
workspace_root = Path(__file__).resolve().parent.parent.parent.parent
if str(workspace_root) not in sys.path:
    sys.path.insert(0, str(workspace_root))

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.v1.routes.auth import router as auth_router
from app.api.v1.routes.interview import router as interview_router
from app.api.v1.routes.live import router as live_router
from app.api.v1.routes.voice import router as voice_router
from app.api.v1.routes.interns import router as interns_router
from app.api.v1.routes.pathway_selection import router as pathway_selection_router
from app.api.v1.routes.recording import router as recording_router
from app.core.config import settings
from app.core.logging import configure_logging
from app.core.middleware import RequestLoggingMiddleware

configure_logging()

app = FastAPI(
    title="JOBRO Backend",
    version="0.1.0",
    description="FastAPI API gateway for the JOBRO interview intelligence platform.",
)

import os

allowed_origins = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "http://localhost:8000",
    "http://127.0.0.1:8000",
    "https://jobro.netlify.app",
    "https://jobro-2-0.netlify.app"
]
env_origins = os.getenv("CORS_ALLOWED_ORIGINS")
if env_origins:
    allowed_origins.extend([o.strip() for o in env_origins.split(",") if o.strip()])

# Allow all origins dynamically as a fallback if the above isn't enough
# But it's better to be explicit.
allowed_origins.append("*")

app.add_middleware(RequestLoggingMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router, prefix="/api/v1/auth", tags=["auth"])
app.include_router(interview_router, prefix="/api/v1/interview", tags=["interview"])
app.include_router(live_router, prefix="/api/v1/live", tags=["live"])
app.include_router(voice_router, prefix="/api/v1/voice", tags=["voice"])
app.include_router(interns_router, prefix="/api/v1/interns", tags=["interns"])
app.include_router(pathway_selection_router, prefix="/api/v1/pathway-selection", tags=["pathway-selection"])
app.include_router(recording_router, prefix="/api/v1", tags=["recording"])

@app.get("/", summary="Root Health check")
def root_check():
    return {"status": "ok"}

@app.get("/api/v1/health", summary="Health check")
def health_check():
    return {"status": "ok", "environment": settings.APP_ENV}

