"""试题生成器：基于 RAG 检索知识库并使用 LLM 生成试题"""

import re
from datetime import UTC, datetime

from langchain_openai import ChatOpenAI
from sqlalchemy.ext.asyncio import AsyncSession

from backend.app.core.config import settings
from backend.app.graph.prompts import (
    QUESTION_GENERATION_SYSTEM,
    QUESTION_GENERATION_USER,
    QUESTION_MODIFY_SYSTEM,
    QUESTION_MODIFY_USER,
)
from backend.app.models.question_set import QuestionSet
from backend.app.rag.retriever import KnowledgeRetriever
from backend.app.services.question_service import QuestionService


class QuestionGenerator:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session
        self.llm = ChatOpenAI(
            api_key=settings.openai_api_key,
            base_url=settings.openai_base_url,
            model=settings.openai_model,
            temperature=0.7,
        )
        self.retriever = KnowledgeRetriever(session)
        self.question_service = QuestionService(session)

    async def generate(
        self,
        request: str,
        course_id: int,
        teacher_id: int,
        subject: str | None = None,
        chapter_id: int | None = None,
        difficulty: str | None = None,
    ) -> QuestionSet:
        knowledge_chunks = await self.retriever.retrieve(
            query=request,
            course_id=course_id,
            subject=subject,
            chapter_id=chapter_id,
            top_k=settings.retrieval_top_k,
        )

        knowledge_context = "\n\n".join(
            f"【知识点 {i + 1}】\n{chunk.content}"
            for i, chunk in enumerate(knowledge_chunks)
        ) or "（暂无相关知识库内容，请根据通用知识生成）"

        user_prompt = QUESTION_GENERATION_USER.format(
            request=request,
            knowledge_context=knowledge_context,
            subject=subject or "未指定",
            chapter=f"第 {chapter_id} 章" if chapter_id else "未指定",
            difficulty=difficulty or "中等",
        )

        messages = [
            {"role": "system", "content": QUESTION_GENERATION_SYSTEM},
            {"role": "user", "content": user_prompt},
        ]
        response = await self.llm.ainvoke(messages)
        markdown_content = response.content

        title = (
            self._extract_title(markdown_content)
            or f"试题集_{datetime.now(UTC).strftime('%Y%m%d_%H%M%S')}"
        )

        return await self.question_service.create_question_set(
            title=title,
            course_id=course_id,
            teacher_id=teacher_id,
            markdown_content=markdown_content,
            description=f"根据需求自动生成：{request[:100]}...",
        )

    async def modify(self, question_set_id: int, request: str) -> bool:
        current_content = await self.question_service.get_question_set_content(
            question_set_id
        )
        if not current_content:
            raise ValueError("试题集内容不存在")

        user_prompt = QUESTION_MODIFY_USER.format(
            request=request,
            current_content=current_content,
        )
        messages = [
            {"role": "system", "content": QUESTION_MODIFY_SYSTEM},
            {"role": "user", "content": user_prompt},
        ]
        response = await self.llm.ainvoke(messages)

        return await self.question_service.update_question_set_content(
            question_set_id, response.content
        )

    def _extract_title(self, markdown_content: str) -> str | None:
        match = re.search(r"^#\s+(.+)$", markdown_content, re.MULTILINE)
        return match.group(1).strip() if match else None
