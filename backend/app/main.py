"""
CogniLoop v2 — FastAPI application entry point.
"""

import logging
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from starlette.middleware.base import BaseHTTPMiddleware

from backend.app.api.v2.router import api_v2_router
from backend.app.core.config import settings
from backend.app.tasks.scheduler import create_scheduler

logging.basicConfig(level=getattr(logging, settings.LOG_LEVEL.upper(), logging.INFO))
logger = logging.getLogger("cogniloop")

FRONTEND_DIST = Path(__file__).resolve().parent.parent.parent / "frontend" / "dist"


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan — startup / shutdown hooks."""
    logger.info("CogniLoop v2 starting up...")
    settings.upload_path  # triggers mkdir
    if FRONTEND_DIST.exists():
        logger.info(f"Serving frontend from {FRONTEND_DIST}")
    else:
        logger.info("Frontend dist not found — API-only mode")

    scheduler = create_scheduler()
    scheduler.start()
    logger.info("APScheduler started (daily assistant @ 00:00 UTC)")

    yield

    scheduler.shutdown(wait=False)
    logger.info("CogniLoop v2 shutting down...")


app = FastAPI(
    title="CogniLoop v2",
    description="AI 驱动的去中心化知识学习社区",
    version="2.0.0",
    lifespan=lifespan,
    docs_url="/docs",
    redoc_url="/redoc",
)


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request, call_next):
        response = await call_next(request)
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        response.headers["Permissions-Policy"] = (
            "camera=(), microphone=(), geolocation=()"
        )
        return response


app.add_middleware(SecurityHeadersMiddleware)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization"],
)

app.include_router(api_v2_router)

_UPLOAD_PATH = settings.upload_path  # also triggers mkdir via property
app.mount("/uploads", StaticFiles(directory=str(_UPLOAD_PATH)), name="uploads")


@app.get("/health")
async def health():
    return {"status": "ok", "version": "2.0.0"}


# Serve frontend static files (Docker deployment)
if FRONTEND_DIST.exists():
    app.mount(
        "/assets",
        StaticFiles(directory=str(FRONTEND_DIST / "assets")),
        name="static-assets",
    )

    # SPA fallback: any non-API, non-static route → index.html
    @app.get("/{full_path:path}")
    async def spa_fallback(request: Request, full_path: str):  # noqa: ARG001
        index = FRONTEND_DIST / "index.html"
        if index.exists():
            return FileResponse(str(index))
        return {"error": "Frontend not built"}
