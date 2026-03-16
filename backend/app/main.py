"""
CogniLoop v2 — FastAPI application entry point.
"""

import logging
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
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

_FIELD_CN: dict[str, str] = {
    "email": "邮箱",
    "username": "用户名",
    "password": "密码",
    "full_name": "姓名",
    "captcha_answer": "验证码",
    "captcha_id": "验证码",
    "name": "名称",
    "title": "标题",
    "content": "内容",
}

_TYPE_CN: dict[str, str] = {
    "missing": "不能为空",
    "string_too_short": "内容太短",
    "string_too_long": "内容太长",
    "value_error": "格式不正确",
    "string_type": "请填写文字",
    "int_type": "请填写整数",
    "float_type": "请填写数字",
    "bool_type": "请填写布尔值",
    "literal_error": "取值不合法",
    "enum": "取值不合法",
}


@app.exception_handler(RequestValidationError)
async def _validation_handler(_request: Request, exc: RequestValidationError) -> JSONResponse:
    errors = exc.errors()
    first = errors[0] if errors else {}
    loc = first.get("loc") or []
    field = str(loc[-1]) if loc else ""
    err_type: str = first.get("type", "")
    raw_msg: str = str(first.get("msg", ""))

    # EmailStr validation errors contain "not a valid email address" in the message
    if "email" in raw_msg.lower() or field == "email":
        detail = "邮箱地址格式不正确"
    else:
        field_cn = _FIELD_CN.get(field, "")
        type_cn = _TYPE_CN.get(err_type, "格式有误")
        detail = f"{field_cn}{type_cn}" if field_cn else "输入内容格式有误"

    return JSONResponse(status_code=422, content={"detail": detail})


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

_UPLOAD_PATH = settings.upload_path  # triggers mkdir via property
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

    # SPA fallback: real static files take priority, unknown paths fall through to index.html
    @app.get("/{full_path:path}")
    async def spa_fallback(request: Request, full_path: str):  # noqa: ARG001
        candidate = (FRONTEND_DIST / full_path).resolve()
        if candidate.is_file() and str(candidate).startswith(str(FRONTEND_DIST.resolve())):
            return FileResponse(str(candidate))
        index = FRONTEND_DIST / "index.html"
        if index.exists():
            return FileResponse(str(index))
        return {"error": "Frontend not built"}
