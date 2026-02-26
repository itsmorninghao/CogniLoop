"""SolveAgent —— 模拟普通考生作答（弱模型，不看答案）

支持多模型实例：通过 config 参数传入不同模型配置，
每个实例模拟不同水平的考生，用于并行试做和难度评估。
"""

import logging

from langchain_openai import ChatOpenAI

from backend.app.graph.exam_agents.prompts import (
    SOLVE_AGENT_SYSTEM,
    SOLVE_AGENT_USER_CHOICE,
    SOLVE_AGENT_USER_FILL_BLANK,
    SOLVE_AGENT_USER_SHORT_ANSWER,
)
from backend.app.graph.exam_agents.schemas import GeneratedQuestion, SolveAttempt
from backend.app.services.config_service import get_agent_llm_config

logger = logging.getLogger(__name__)

_CHOICE_TYPES = {"single_choice", "multiple_choice"}
_FILL_TYPES = {"fill_blank"}


class SolveAgent:
    def __init__(self, config: dict | None = None) -> None:
        if config is None:
            cfg = get_agent_llm_config("solve")
            config = {"label": "默认模型", **cfg, "temperature": 0.9}
        self.label = config.get("label", "模型")
        self.model_name = config["model"]
        self.llm = ChatOpenAI(
            api_key=config["api_key"],
            base_url=config["base_url"],
            model=config["model"],
            temperature=config.get("temperature", 0.9),
        )

    async def run(
        self,
        question: GeneratedQuestion,
        attempt_index: int,
        tracer=None,
        position_index: int | None = None,
    ) -> SolveAttempt:
        is_choice = question.question_type in _CHOICE_TYPES
        is_fill = question.question_type in _FILL_TYPES

        if is_choice:
            options_text = ""
            if question.options:
                options_text = "\n".join(
                    f"{k}. {v}" for k, v in question.options.items()
                )
            user_prompt = SOLVE_AGENT_USER_CHOICE.format(
                question_text=question.question_text,
                options_text=options_text,
            )
        elif is_fill:
            user_prompt = SOLVE_AGENT_USER_FILL_BLANK.format(
                question_text=question.question_text,
            )
        else:
            user_prompt = SOLVE_AGENT_USER_SHORT_ANSWER.format(
                question_text=question.question_text,
            )

        span_id = None
        if tracer is not None:
            span_id = tracer.start_span(
                agent=f"SolveAgent[{self.label}]",
                model=self.model_name,
                system_prompt=SOLVE_AGENT_SYSTEM,
                user_prompt=user_prompt,
                position_index=position_index,
                attempt_index=attempt_index,
            )

        try:
            resp = await self.llm.ainvoke(
                [
                    {"role": "system", "content": SOLVE_AGENT_SYSTEM},
                    {"role": "user", "content": user_prompt},
                ]
            )
            student_answer = resp.content.strip()[:1000]
            if tracer is not None and span_id:
                tracer.end_span(span_id, output=student_answer)
        except Exception as e:
            logger.warning(
                f"SolveAgent 异常 task={question.task_id} attempt={attempt_index}: {e}"
            )
            student_answer = "(作答失败)"
            if tracer is not None and span_id:
                tracer.end_span(span_id, error=str(e))

        return SolveAttempt(
            task_id=question.task_id,
            attempt_index=attempt_index,
            student_answer=student_answer,
        )
