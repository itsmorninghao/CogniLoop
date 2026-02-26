"""DispatchAgent —— 任务分发：为每个题目位置确定知识点、检索 few-shot、准备 RAG"""

import json
import logging
import uuid

from langchain_openai import ChatOpenAI
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.app.graph.exam_agents.prompts import (
    DIFFICULTY_LABELS,
    DISPATCH_KNOWLEDGE_POINT_SYSTEM,
    DISPATCH_KNOWLEDGE_POINT_USER,
    QUESTION_TYPE_LABELS,
)
from backend.app.graph.exam_agents.schemas import (
    HotspotResult,
    PaperRequirement,
    QuestionTask,
    SamePositionExample,
)
from backend.app.models.knowledge_chunk import KnowledgeChunk
from backend.app.rag.embeddings import get_embedding_service
from backend.app.rag.exam_retriever import ExamRetriever
from backend.app.services.config_service import get_agent_llm_config, get_config_int

logger = logging.getLogger(__name__)

# 难度系数目标区间映射
DIFFICULTY_RANGES = {
    "easy": (0.65, 1.0),
    "medium": (0.45, 0.75),
    "hard": (0.0, 0.5),
}


async def _infer_knowledge_point(
    llm: ChatOpenAI,
    model_name: str,
    subject: str,
    position_index: int,
    examples: list[SamePositionExample],
    tracer=None,
) -> str:
    """用 LLM 从 few-shot 样本推断本题位置最常考察的知识点"""
    if not examples:
        return f"{subject}通用知识"

    examples_text = "\n\n".join(
        f"【{ex.year}年 {ex.region}】{ex.content[:300]}" for ex in examples[:3]
    )
    system_prompt = DISPATCH_KNOWLEDGE_POINT_SYSTEM
    user_prompt = DISPATCH_KNOWLEDGE_POINT_USER.format(
        subject=subject,
        position_index=position_index,
        examples_text=examples_text,
    )

    span_id = None
    if tracer is not None:
        span_id = tracer.start_span(
            agent="DispatchAgent",
            model=model_name,
            system_prompt=system_prompt,
            user_prompt=user_prompt,
            position_index=position_index,
        )

    try:
        resp = await llm.ainvoke(
            [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ]
        )
        result = resp.content.strip()[:50] or f"{subject}通用"
        if tracer is not None and span_id:
            tracer.end_span(span_id, output=result)
        return result
    except Exception as e:
        logger.warning(f"知识点推断失败（位置{position_index}）: {e}")
        if tracer is not None and span_id:
            tracer.end_span(span_id, error=str(e))
        return f"{subject}通用"


async def _check_has_rag(session: AsyncSession, course_id: int) -> bool:
    """检查课程是否有可用的 RAG 知识库"""
    stmt = select(func.count(KnowledgeChunk.id)).where(
        KnowledgeChunk.course_id == course_id
    )
    result = await session.execute(stmt)
    count = result.scalar() or 0
    return count > 0


async def _retrieve_rag_context(
    session: AsyncSession,
    course_id: int,
    query: str,
    top_k: int = 5,
) -> str | None:
    """从课程 RAG 知识库检索相关内容"""
    try:
        embed_service = get_embedding_service()
        embedding = await embed_service.embed_text(query)
        stmt = (
            select(KnowledgeChunk)
            .where(KnowledgeChunk.course_id == course_id)
            .order_by(KnowledgeChunk.embedding.cosine_distance(embedding))
            .limit(top_k)
        )
        result = await session.execute(stmt)
        chunks = result.scalars().all()
        if not chunks:
            return None
        return "\n\n".join(
            f"【知识点 {i + 1}】\n{c.content}" for i, c in enumerate(chunks)
        )
    except Exception as e:
        logger.warning(f"RAG 检索失败: {e}")
        return None


class DispatchAgent:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session
        cfg = get_agent_llm_config("dispatch")
        self.model_name = cfg["model"]
        self.llm = ChatOpenAI(
            api_key=cfg["api_key"],
            base_url=cfg["base_url"],
            model=cfg["model"],
            temperature=0.2,
        )
        self.retriever = ExamRetriever(session)

    async def dispatch(
        self,
        requirement: PaperRequirement,
        hotspot_result: HotspotResult | None = None,
        already_done_positions: set[int] | None = None,
        tracer=None,
    ) -> list[QuestionTask]:
        """生成所有待处理的 QuestionTask 列表"""
        fewshot_count = get_config_int("exam_agent_fewshot_count")
        has_rag = await _check_has_rag(self.session, requirement.course_id)
        tasks: list[QuestionTask] = []
        position_index = 0

        for type_config in requirement.question_distribution:
            for q_idx in range(type_config.count):
                position_index += 1
                if already_done_positions and position_index in already_done_positions:
                    continue

                # 三层检索 few-shot 真题样本
                examples_raw = await self.retriever.get_same_position_examples(
                    subject=requirement.subject,
                    question_type=type_config.question_type,
                    position_index=position_index,
                    target_region=requirement.target_region,
                    top_k=fewshot_count,
                )
                examples = [
                    SamePositionExample(
                        year=ex.year,
                        region=ex.region,
                        content=ex.content,
                        answer=ex.answer,
                    )
                    for ex in examples_raw
                ]

                # 推断知识点
                knowledge_point = await _infer_knowledge_point(
                    llm=self.llm,
                    model_name=self.model_name,
                    subject=requirement.subject,
                    position_index=position_index,
                    examples=examples,
                    tracer=tracer,
                )

                # RAG 上下文
                rag_context: str | None = None
                if has_rag:
                    query = f"{requirement.subject} {knowledge_point} {type_config.question_type}"
                    rag_context = await _retrieve_rag_context(
                        self.session, requirement.course_id, query
                    )

                # 热点素材
                hotspot_material: str | None = None
                if requirement.use_hotspot and hotspot_result:
                    matching = [
                        h
                        for h in hotspot_result.items
                        if requirement.subject in h.applicable_subjects
                        and type_config.question_type in h.applicable_question_types
                    ]
                    if matching:
                        best = matching[q_idx % len(matching)]
                        hotspot_material = f"【热点】{best.topic}\n{best.summary}"

                # 按分布确定目标难度
                dist = requirement.difficulty_distribution
                positions_in_type = q_idx + 1
                total = type_config.count
                ratio = (positions_in_type - 1) / max(total - 1, 1)
                if ratio < dist.easy:
                    target_diff = "easy"
                elif ratio < dist.easy + dist.medium:
                    target_diff = "medium"
                else:
                    target_diff = "hard"

                task = QuestionTask(
                    task_id=str(uuid.uuid4()),
                    question_type=type_config.question_type,
                    position_index=position_index,
                    position_label=f"第{position_index}题",
                    target_difficulty_level=target_diff,
                    knowledge_point=knowledge_point,
                    same_position_examples=examples,
                    rag_context=rag_context,
                    hotspot_material=hotspot_material,
                )
                tasks.append(task)
                logger.debug(
                    f"Dispatch: 位置{position_index} {type_config.question_type}"
                    f" 知识点={knowledge_point} 难度={target_diff}"
                )

        logger.info(f"DispatchAgent: 共分发 {len(tasks)} 个任务")
        return tasks
