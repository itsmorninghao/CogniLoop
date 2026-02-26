"""试题生成器：基于 RAG 检索知识库并使用 LLM 生成试题（JSON 格式）"""

import json
import logging
from datetime import UTC, datetime

from langchain_openai import ChatOpenAI
from sqlalchemy.ext.asyncio import AsyncSession

from backend.app.graph.prompts import (
    QUESTION_GENERATION_SYSTEM,
    QUESTION_GENERATION_USER,
    QUESTION_MODIFY_SYSTEM,
    QUESTION_MODIFY_USER,
)
from backend.app.models.question_set import QuestionSet
from backend.app.rag.retriever import KnowledgeRetriever
from backend.app.services.config_service import get_config, get_config_int
from backend.app.services.question_service import QuestionService

logger = logging.getLogger(__name__)

_MAX_RETRY = 3


def _parse_json_response(raw: str) -> dict:
    """从 LLM 响应中提取并解析 JSON，剥除可能的 markdown 代码块包裹。"""
    text = raw.strip()
    # 去掉可能的 ```json ... ``` 包裹
    if text.startswith("```"):
        lines = text.splitlines()
        inner = []
        in_block = False
        for line in lines:
            if line.startswith("```") and not in_block:
                in_block = True
                continue
            if line.startswith("```") and in_block:
                break
            if in_block:
                inner.append(line)
        text = "\n".join(inner)
    return json.loads(text)


class QuestionGenerator:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session
        self.llm = ChatOpenAI(
            api_key=get_config("openai_api_key"),
            base_url=get_config("openai_base_url"),
            model=get_config("openai_model"),
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
            top_k=get_config_int("retrieval_top_k"),
        )

        knowledge_context = (
            "\n\n".join(
                f"【知识点 {i + 1}】\n{chunk.content}"
                for i, chunk in enumerate(knowledge_chunks)
            )
            or "（暂无相关知识库内容，请根据通用知识生成）"
        )

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

        last_error: Exception | None = None
        for attempt in range(_MAX_RETRY):
            response = await self.llm.ainvoke(messages)
            try:
                data = _parse_json_response(response.content)
            except (json.JSONDecodeError, ValueError) as e:
                last_error = e
                logger.warning(f"普通生成 JSON 解析失败（第 {attempt + 1} 次）: {e}")
                messages.append({"role": "assistant", "content": response.content})
                messages.append(
                    {
                        "role": "user",
                        "content": f"你的输出不是合法 JSON，解析错误：{e}。请只输出合法 JSON，不要有任何其他文字。",
                    }
                )
                continue

            title: str = data.get("title") or f"试题集_{datetime.now(UTC).strftime('%Y%m%d_%H%M%S')}"
            json_content = json.dumps(data, ensure_ascii=False)

            return await self.question_service.create_question_set(
                title=title,
                course_id=course_id,
                teacher_id=teacher_id,
                json_content=json_content,
                description=f"根据需求自动生成：{request[:100]}...",
            )

        raise RuntimeError(f"生成试题集失败（JSON 解析连续 {_MAX_RETRY} 次失败）: {last_error}")

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

        last_error: Exception | None = None
        for attempt in range(_MAX_RETRY):
            response = await self.llm.ainvoke(messages)
            try:
                data = _parse_json_response(response.content)
            except (json.JSONDecodeError, ValueError) as e:
                last_error = e
                logger.warning(f"修改 JSON 解析失败（第 {attempt + 1} 次）: {e}")
                messages.append({"role": "assistant", "content": response.content})
                messages.append(
                    {
                        "role": "user",
                        "content": f"你的输出不是合法 JSON，解析错误：{e}。请只输出合法 JSON，不要有任何其他文字。",
                    }
                )
                continue

            json_content = json.dumps(data, ensure_ascii=False)
            return await self.question_service.update_question_set_content(
                question_set_id, json_content
            )

        raise RuntimeError(f"修改试题集失败（JSON 解析连续 {_MAX_RETRY} 次失败）: {last_error}")
