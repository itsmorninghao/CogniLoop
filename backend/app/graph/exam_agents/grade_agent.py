"""GradeAgent —— 评判 SolveAgent 的作答（独立模型，降低偏差）"""

import json
import logging
import re

from langchain_openai import ChatOpenAI

from backend.app.graph.exam_agents.prompts import (
    GRADE_AGENT_SYSTEM,
    GRADE_AGENT_USER_SHORT_ANSWER,
)
from backend.app.graph.exam_agents.schemas import (
    GeneratedQuestion,
    GradeResult,
    SolveAttempt,
)
from backend.app.services.config_service import get_agent_llm_config

logger = logging.getLogger(__name__)

_CHOICE_TYPES = {"single_choice", "multiple_choice"}
_FILL_TYPES = {"fill_blank"}


class GradeAgent:
    def __init__(self) -> None:
        cfg = get_agent_llm_config("grade")
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
        attempt: SolveAttempt,
        tracer=None,
        position_index: int | None = None,
    ) -> GradeResult:
        is_choice = question.question_type in _CHOICE_TYPES

        if is_choice:
            correct = question.correct_answer.strip().upper()
            student = attempt.student_answer.strip().upper()

            # 从学生回答中提取选项字母集合
            all_letters = re.findall(r"[A-D]", student)

            if question.question_type == "multiple_choice":
                # 多选题：比对字母集合（顺序无关）
                correct_set = set(re.findall(r"[A-D]", correct))
                student_set = set(all_letters)
                is_correct = bool(student_set) and student_set == correct_set
                student_display = (
                    "".join(sorted(student_set)) if student_set else student[:10]
                )
            else:
                # 单选题：优先从结尾/结论处提取答案字母，防止解析过程中提到其他选项
                # 尝试匹配"选X""答案是X"等结论性表达，取最后一个
                conclusion_match = re.findall(
                    r"(?:选|答案[是为]?|应选|故选|所以选|因此选)\s*([A-D])", student
                )
                if conclusion_match:
                    student_letter = conclusion_match[-1]
                elif all_letters:
                    # 回退：取最后出现的字母（学生通常把答案写在最后）
                    student_letter = all_letters[-1]
                else:
                    student_letter = ""
                is_correct = bool(student_letter) and student_letter == correct
                student_display = student_letter or student[:10]

            return GradeResult(
                task_id=question.task_id,
                attempt_index=attempt.attempt_index,
                is_correct=is_correct,
                partial_score=1.0 if is_correct else 0.0,
                grade_reasoning=f"标准答案={correct}，学生答案={student_display}",
            )

        if question.question_type in _FILL_TYPES:
            # 填空题：使用 LLM 评分（正确答案为文本，简单包含检查误差大）
            correct = question.correct_answer.strip()
            student = attempt.student_answer.strip()
            if not correct:
                # 无标准答案时默认通过
                return GradeResult(
                    task_id=question.task_id,
                    attempt_index=attempt.attempt_index,
                    is_correct=True,
                    partial_score=0.5,
                    grade_reasoning="无标准答案，默认 0.5",
                )
            # 先尝试简单包含检查，再交给 LLM
            correct_lower = correct.lower()
            student_lower = student.lower()
            if correct_lower == student_lower:
                return GradeResult(
                    task_id=question.task_id,
                    attempt_index=attempt.attempt_index,
                    is_correct=True,
                    partial_score=1.0,
                    grade_reasoning="填空完全匹配",
                )
            # 语义相近：交给 LLM 判断
            user_prompt = GRADE_AGENT_USER_SHORT_ANSWER.format(
                question_text=question.question_text[:500],
                correct_answer=correct[:300],
                scoring_points=correct[:300],
                student_answer=student[:300],
            )
            span_id = None
            if tracer is not None:
                span_id = tracer.start_span(
                    agent="GradeAgent",
                    model=self.model_name,
                    system_prompt=GRADE_AGENT_SYSTEM,
                    user_prompt=user_prompt,
                    position_index=position_index,
                    attempt_index=attempt.attempt_index,
                )
            try:
                resp = await self.llm.ainvoke(
                    [
                        {"role": "system", "content": GRADE_AGENT_SYSTEM},
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
                score = float(data.get("score", 0.0))
                score = max(0.0, min(1.0, score))
                return GradeResult(
                    task_id=question.task_id,
                    attempt_index=attempt.attempt_index,
                    is_correct=score >= 0.6,
                    partial_score=score,
                    grade_reasoning=data.get("reasoning", ""),
                )
            except Exception as e:
                logger.warning(
                    f"GradeAgent 填空题评分失败 task={question.task_id}: {e}"
                )
                if tracer is not None and span_id:
                    tracer.end_span(span_id, error=str(e))
                # 回退：简单包含检查
                is_correct = (
                    correct_lower in student_lower or student_lower in correct_lower
                )
                return GradeResult(
                    task_id=question.task_id,
                    attempt_index=attempt.attempt_index,
                    is_correct=is_correct,
                    partial_score=0.8 if is_correct else 0.2,
                    grade_reasoning=f"LLM 评分失败，字符串匹配回退: {e}",
                )

        # 主观题：使用 LLM 评分
        scoring_points = question.scoring_points or question.explanation[:300]
        user_prompt = GRADE_AGENT_USER_SHORT_ANSWER.format(
            question_text=question.question_text[:500],
            correct_answer=question.correct_answer[:500],
            scoring_points=scoring_points[:500],
            student_answer=attempt.student_answer[:500],
        )

        span_id = None
        if tracer is not None:
            span_id = tracer.start_span(
                agent="GradeAgent",
                model=self.model_name,
                system_prompt=GRADE_AGENT_SYSTEM,
                user_prompt=user_prompt,
                position_index=position_index,
                attempt_index=attempt.attempt_index,
            )

        try:
            resp = await self.llm.ainvoke(
                [
                    {"role": "system", "content": GRADE_AGENT_SYSTEM},
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
            score = float(data.get("score", 0.5))
            score = max(0.0, min(1.0, score))
            return GradeResult(
                task_id=question.task_id,
                attempt_index=attempt.attempt_index,
                is_correct=score >= 0.6,
                partial_score=score,
                grade_reasoning=data.get("reasoning", ""),
            )
        except Exception as e:
            logger.warning(f"GradeAgent LLM 评分失败 task={question.task_id}: {e}")
            if tracer is not None and span_id:
                tracer.end_span(span_id, error=str(e))
            return GradeResult(
                task_id=question.task_id,
                attempt_index=attempt.attempt_index,
                is_correct=False,
                partial_score=0.5,
                grade_reasoning=f"评分异常，默认 0.5: {e}",
            )
