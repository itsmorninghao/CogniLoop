"""QualityCheckAgent —— 题目质量审核"""

import json
import logging
import re

from langchain_openai import ChatOpenAI

from backend.app.graph.exam_agents.prompts import (
    QUALITY_CHECK_SYSTEM,
    QUALITY_CHECK_USER,
)
from backend.app.graph.exam_agents.schemas import GeneratedQuestion, QualityCheckResult
from backend.app.services.config_service import get_agent_llm_config

logger = logging.getLogger(__name__)


class QualityCheckAgent:
    def __init__(self) -> None:
        cfg = get_agent_llm_config("qc")
        self.model_name = cfg["model"]
        self.llm = ChatOpenAI(
            api_key=cfg["api_key"],
            base_url=cfg["base_url"],
            model=cfg["model"],
            temperature=0,
        )

    async def run(
        self,
        question: GeneratedQuestion,
        tracer=None,
        position_index: int | None = None,
    ) -> QualityCheckResult:
        user_prompt = QUALITY_CHECK_USER.format(question_markdown=question.raw_markdown)

        span_id = None
        if tracer is not None:
            span_id = tracer.start_span(
                agent="QualityCheckAgent",
                model=self.model_name,
                system_prompt=QUALITY_CHECK_SYSTEM,
                user_prompt=user_prompt,
                position_index=position_index,
            )

        try:
            resp = await self.llm.ainvoke(
                [
                    {"role": "system", "content": QUALITY_CHECK_SYSTEM},
                    {"role": "user", "content": user_prompt},
                ]
            )
            raw = resp.content.strip()
            if tracer is not None and span_id:
                tracer.end_span(span_id, output=raw)
            m = re.search(r"\{.*\}", raw, re.DOTALL)
            if not m:
                raise ValueError("未返回 JSON")
            data = json.loads(m.group(0))
            return QualityCheckResult(
                task_id=question.task_id,
                passed=bool(data.get("passed", False)),
                rejection_reasons=data.get("rejection_reasons", []),
            )
        except Exception as e:
            logger.error(f"QualityCheckAgent 异常 task={question.task_id}: {e}")
            if tracer is not None and span_id:
                tracer.end_span(span_id, error=str(e))
            # 降级：允许通过，避免无限重试
            return QualityCheckResult(
                task_id=question.task_id,
                passed=True,
                rejection_reasons=[f"质检服务异常（已降级放行）: {e}"],
            )
