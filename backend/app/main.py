"""FastAPI 应用入口"""

import asyncio
import logging
import time
from contextlib import asynccontextmanager
from datetime import UTC, datetime
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from starlette.middleware.base import BaseHTTPMiddleware

from backend.app.api.v1 import api_router
from backend.app.core.config import settings
from backend.app.core.database import async_session_factory
from backend.app.core.exception_handlers import (
    global_exception_handler,
    validation_exception_handler,
)
from backend.app.core.security import create_access_token, decode_access_token
from backend.app.services.config_service import load_config_cache
from backend.app.services.exam_paper_task import set_main_loop

# 静态文件目录（支持 Docker 一体化部署）
STATIC_DIR = Path("/app/static")
STATIC_INDEX = STATIC_DIR / "index.html"

# 配置日志
logging.basicConfig(
    level=getattr(logging, settings.log_level),
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger(__name__)


class JWTRefreshMiddleware(BaseHTTPMiddleware):
    """JWT 自动续期中间件"""

    async def dispatch(self, request: Request, call_next):
        response = await call_next(request)

        if not (200 <= response.status_code < 300):
            return response

        auth_header = request.headers.get("Authorization")
        if not auth_header or not auth_header.startswith("Bearer "):
            return response

        token = auth_header[7:]
        payload = decode_access_token(token)
        if not payload:
            return response

        exp = payload.get("exp", 0)
        remaining = exp - time.time()
        total = settings.jwt_access_token_expire_minutes * 60
        if remaining < total * 0.5:
            new_token = create_access_token(
                data={"sub": payload["sub"], "type": payload["type"]}
            )
            response.headers["X-New-Token"] = new_token

        return response


@asynccontextmanager
async def lifespan(_app: FastAPI):
    """应用生命周期管理"""
    # 启动时
    logger.info("正在启动 CogniLoop 后端服务...")
    settings.ensure_dirs()

    # 注册主事件循环，供后台线程跨线程推送 SSE 事件使用
    set_main_loop(asyncio.get_running_loop())

    # 从数据库加载业务配置到内存缓存
    async with async_session_factory() as session:
        await load_config_cache(session)

    logger.info("CogniLoop 后端服务启动完成")
    yield
    # 关闭时
    logger.info("正在关闭 CogniLoop 后端服务...")


app = FastAPI(
    title="CogniLoop API",
    description="基于 LangGraph 的智能助教系统 API",
    version="0.1.0",
    lifespan=lifespan,
)

# JWT 自动续期中间件
app.add_middleware(JWTRefreshMiddleware)

# CORS 配置
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["X-New-Token"],
)


# 全局异常处理
app.add_exception_handler(RequestValidationError, validation_exception_handler)
app.add_exception_handler(Exception, global_exception_handler)


# 健康检查 API
@app.get("/health", tags=["健康检查"])
async def health_check() -> dict:
    """基础健康检查"""
    return {"status": "healthy"}


@app.get("/health/detailed", tags=["健康检查"])
async def detailed_health_check() -> dict:
    """详细健康检查（数据库连接状态）"""
    from sqlalchemy import text

    from backend.app.core.database import engine

    try:
        async with engine.connect() as conn:
            await conn.execute(text("SELECT 1"))
        db_status = "connected"
    except Exception as e:
        logger.error(f"数据库连接失败: {e}")
        db_status = "disconnected"

    return {
        "status": "healthy" if db_status == "connected" else "unhealthy",
        "database": db_status,
        "timestamp": datetime.now(UTC).isoformat(),
    }


# 注册 API 路由
app.include_router(api_router, prefix="/api/v1")

# 仅在 Docker 一体化部署时生效（/app/static 目录存在时）
if STATIC_DIR.exists() and STATIC_INDEX.exists():
    logger.info(f"检测到静态文件目录: {STATIC_DIR}，启用前端服务")

    # 挂载静态资源
    app.mount("/assets", StaticFiles(directory=STATIC_DIR / "assets"), name="assets")

    # SPA 路由回退
    @app.get("/{full_path:path}")
    async def serve_spa(full_path: str):
        """SPA 路由回退"""
        file_path = (STATIC_DIR / full_path).resolve()
        if file_path.is_relative_to(STATIC_DIR) and file_path.is_file():
            return FileResponse(file_path)
        return FileResponse(STATIC_INDEX)


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "backend.app.main:app",
        host="0.0.0.0",
        port=8000,
        reload=True,
    )
