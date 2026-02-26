"""ExamRetriever —— 历年真题三层检索策略

优先级：
  Layer 1: subject + question_type + position_index + region（完全匹配 + 同卷型）
  Layer 2: subject + question_type + position_index（跨卷型）
  Layer 3: subject + question_type + embedding 语义相似度
"""

import json
import logging

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.app.models.exam_paper import ExamQuestion
from backend.app.rag.embeddings import get_embedding_service

logger = logging.getLogger(__name__)


class ExamRetriever:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def get_same_position_examples(
        self,
        subject: str,
        question_type: str,
        position_index: int,
        target_region: str,
        top_k: int = 3,
    ) -> list[ExamQuestion]:
        """
        三层检索策略：
        1. 精确匹配（同科目 + 同题型 + 同位置 + 同卷型）
        2. 跨卷型（同科目 + 同题型 + 同位置）
        3. 语义相似（同科目 + 同题型 + 向量相似度）
        """
        # Layer 1：精确匹配
        results = await self._layer1_exact(
            subject, question_type, position_index, target_region, top_k
        )
        if len(results) >= top_k:
            return results[:top_k]

        # Layer 2：跨卷型补充
        existing_ids = {r.id for r in results}
        layer2 = await self._layer2_cross_region(
            subject,
            question_type,
            position_index,
            top_k - len(results),
            excluded_ids=existing_ids,
        )
        results.extend(layer2)
        if len(results) >= top_k:
            return results[:top_k]

        # Layer 3：语义相似补充
        existing_ids = {r.id for r in results}
        layer3 = await self._layer3_semantic(
            subject,
            question_type,
            position_index,
            top_k - len(results),
            excluded_ids=existing_ids,
        )
        results.extend(layer3)

        return results[:top_k]

    async def _layer1_exact(
        self,
        subject: str,
        question_type: str,
        position_index: int,
        region: str,
        limit: int,
    ) -> list[ExamQuestion]:
        stmt = (
            select(ExamQuestion)
            .where(
                ExamQuestion.subject == subject,
                ExamQuestion.question_type == question_type,
                ExamQuestion.position_index == position_index,
                ExamQuestion.region == region,
            )
            .order_by(ExamQuestion.year.desc())
            .limit(limit)
        )
        result = await self.session.execute(stmt)
        return list(result.scalars().all())

    async def _layer2_cross_region(
        self,
        subject: str,
        question_type: str,
        position_index: int,
        limit: int,
        excluded_ids: set[int] | None = None,
    ) -> list[ExamQuestion]:
        conditions = [
            ExamQuestion.subject == subject,
            ExamQuestion.question_type == question_type,
            ExamQuestion.position_index == position_index,
        ]
        if excluded_ids:
            conditions.append(ExamQuestion.id.notin_(excluded_ids))

        stmt = (
            select(ExamQuestion)
            .where(*conditions)
            .order_by(ExamQuestion.year.desc())
            .limit(limit)
        )
        result = await self.session.execute(stmt)
        return list(result.scalars().all())

    async def _layer3_semantic(
        self,
        subject: str,
        question_type: str,
        position_index: int,
        limit: int,
        excluded_ids: set[int] | None = None,
    ) -> list[ExamQuestion]:
        """使用 position_index 描述文本做语义相似度检索"""
        try:
            embed_service = get_embedding_service()
            query_text = f"{subject} 第{position_index}题 {question_type}"
            embedding = await embed_service.embed_text(query_text)

            conditions = [
                ExamQuestion.subject == subject,
                ExamQuestion.question_type == question_type,
                ExamQuestion.embedding.isnot(None),
            ]
            if excluded_ids:
                conditions.append(ExamQuestion.id.notin_(excluded_ids))

            stmt = (
                select(ExamQuestion)
                .where(*conditions)
                .order_by(ExamQuestion.embedding.cosine_distance(embedding))
                .limit(limit)
            )
            result = await self.session.execute(stmt)
            return list(result.scalars().all())
        except Exception as e:
            logger.warning(f"Layer 3 语义检索失败，返回空: {e}")
            return []

    async def get_available_regions(self, subject: str) -> list[dict]:
        """返回某科目下有历年真题的卷型列表（含题目数量）"""
        from sqlalchemy import func

        stmt = (
            select(ExamQuestion.region, func.count(ExamQuestion.id).label("count"))
            .where(ExamQuestion.subject == subject)
            .group_by(ExamQuestion.region)
            .order_by(func.count(ExamQuestion.id).desc())
        )
        result = await self.session.execute(stmt)
        return [{"region": row.region, "count": row.count} for row in result.all()]

    async def get_available_subjects(self) -> list[str]:
        """返回数据库中有历年真题的科目列表"""
        from sqlalchemy import distinct

        stmt = select(distinct(ExamQuestion.subject)).order_by(ExamQuestion.subject)
        result = await self.session.execute(stmt)
        return [row[0] for row in result.all()]
