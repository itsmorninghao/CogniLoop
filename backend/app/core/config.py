"""应用配置"""

from pathlib import Path
from typing import Literal

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

_PROJECT_ROOT = Path(__file__).resolve().parents[3]
_ENV_FILE = _PROJECT_ROOT / ".env"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=str(_ENV_FILE),
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # 由 docker-compose.yml 的 environment.DATABASE_URL 注入
    database_url: str = Field(...)

    # JWT 配置
    jwt_secret_key: str = Field(...)
    jwt_algorithm: str = "HS256"
    jwt_access_token_expire_minutes: int = 30

    # 文件存储配置
    upload_dir: Path = Path("./uploads")
    question_sets_dir: Path = Path("./question_sets")
    max_upload_size: int = 200 * 1024 * 1024  # 200MB

    # 日志配置
    log_level: Literal["DEBUG", "INFO", "WARNING", "ERROR"] = "INFO"

    def ensure_dirs(self) -> None:
        """确保必要的目录存在"""
        self.upload_dir.mkdir(parents=True, exist_ok=True)
        self.question_sets_dir.mkdir(parents=True, exist_ok=True)


settings = Settings()
