"""
Application configuration.

Only the most basic settings live in .env.
Runtime-mutable configs (LLM keys, model selection, etc.) are stored in
the `system_configs` DB table and managed via the Admin GUI.
"""

from pathlib import Path

from pydantic import computed_field
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    # Database
    DB_HOST: str = "db"
    DB_PORT: int = 5432
    DB_USER: str = "cogniloop"
    DB_NAME: str = "cogniloop_db"
    DB_PASSWORD: str = ""

    @computed_field
    @property
    def DATABASE_URL(self) -> str:
        return (
            f"postgresql+asyncpg://{self.DB_USER}:{self.DB_PASSWORD}"
            f"@{self.DB_HOST}:{self.DB_PORT}/{self.DB_NAME}"
        )

    # JWT
    JWT_SECRET_KEY: str = ""
    JWT_ALGORITHM: str = "HS256"
    JWT_ACCESS_TOKEN_EXPIRE_MINUTES: int = 1440  # 24h

    # File upload
    UPLOAD_DIR: str = "./uploads"
    MAX_AVATAR_SIZE_BYTES: int = 5 * 1024 * 1024  # 5 MB

    # Logging
    LOG_LEVEL: str = "INFO"

    # Redis
    REDIS_URL: str = "redis://localhost:6379/0"

    # Encryption
    ENCRYPTION_KEY: str = ""

    # Login brute-force protection
    LOGIN_MAX_ATTEMPTS: int = 5
    LOGIN_FAIL_WINDOW_MINUTES: int = 10
    LOGIN_BLOCK_MINUTES: int = 30

    @property
    def upload_path(self) -> Path:
        p = Path(self.UPLOAD_DIR)
        p.mkdir(parents=True, exist_ok=True)
        return p

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8"}


settings = Settings()
