"""Embedding 服务"""

import threading

from openai import AsyncOpenAI

from backend.app.services.config_service import get_config, get_config_int

_lock = threading.Lock()
_instance: "EmbeddingService | None" = None


def get_embedding_service() -> "EmbeddingService":
    """获取或创建 EmbeddingService 单例。"""
    global _instance
    if _instance is None:
        with _lock:
            if _instance is None:
                _instance = EmbeddingService()
    return _instance


def reset_embedding_service() -> None:
    """重置单例"""
    global _instance
    with _lock:
        _instance = None


class EmbeddingService:
    def __init__(self) -> None:
        self.client = AsyncOpenAI(
            api_key=get_config("embedding_api_key"),
            base_url=get_config("embedding_base_url"),
        )
        self.model = get_config("embedding_model")
        self.dimensions = get_config_int("embedding_dims")

    async def embed_text(self, text: str) -> list[float]:
        response = await self.client.embeddings.create(
            input=text,
            model=self.model,
            dimensions=self.dimensions,
        )
        return response.data[0].embedding

    async def embed_texts(self, texts: list[str]) -> list[list[float]]:
        if not texts:
            return []
        response = await self.client.embeddings.create(
            input=texts,
            model=self.model,
            dimensions=self.dimensions,
        )
        return [item.embedding for item in response.data]
