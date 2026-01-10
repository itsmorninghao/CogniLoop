"""FastAPI 应用入口"""

import logging
from contextlib import asynccontextmanager
from datetime import UTC, datetime
from pathlib import Path

from fastapi import FastAPI, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from starlette.middleware.base import BaseHTTPMiddleware

from backend.app.api.v1 import api_router
from backend.app.core.config import settings
from backend.app.core.security import create_access_token, decode_access_token

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

        # 只处理成功的请求（2xx 状态码）
        if not (200 <= response.status_code < 300):
            return response

        # 获取 Authorization header
        auth_header = request.headers.get("Authorization")
        if not auth_header or not auth_header.startswith("Bearer "):
            return response

        token = auth_header[7:]  # 移除 "Bearer " 前缀
        payload = decode_access_token(token)
        if not payload:
            return response

        # 生成新的 token 并添加到响应头
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
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["X-New-Token"],
)


# 全局异常处理
@app.exception_handler(RequestValidationError)
async def validation_exception_handler(
    _request: Request, exc: RequestValidationError
) -> JSONResponse:
    """处理请求验证错误"""
    return JSONResponse(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        content={
            "detail": "请求参数验证失败",
            "errors": exc.errors(),
        },
    )


@app.exception_handler(Exception)
async def global_exception_handler(_request: Request, exc: Exception) -> JSONResponse:
    """全局异常处理"""
    logger.error(f"未处理的异常: {exc}", exc_info=True)
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={"detail": "服务器内部错误"},
    )


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
        file_path = STATIC_DIR / full_path
        if file_path.exists() and file_path.is_file():
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
