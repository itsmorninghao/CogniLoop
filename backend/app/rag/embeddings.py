"""Embedding 服务"""

from openai import AsyncOpenAI

from backend.app.core.config import settings


class EmbeddingService:
    def __init__(self) -> None:
        self.client = AsyncOpenAI(
            api_key=settings.embedding_api_key or settings.openai_api_key,
            base_url=settings.embedding_base_url or settings.openai_base_url,
        )
        self.model = settings.embedding_model
        self.dimensions = settings.embedding_dims

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
