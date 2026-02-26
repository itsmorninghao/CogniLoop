"""答案批改器"""

import json
import logging
from typing import Any

from langchain_openai import ChatOpenAI
from sqlalchemy.ext.asyncio import AsyncSession

from backend.app.graph.prompts import GRADING_SYSTEM, GRADING_USER
from backend.app.services.answer_service import AnswerService
from backend.app.services.config_service import get_config
from backend.app.services.question_service import QuestionService

logger = logging.getLogger(__name__)


class AnswerGrader:
    """答案批改器类"""

    def __init__(self, session: AsyncSession) -> None:
        self.session = session
        self.llm = ChatOpenAI(
            api_key=get_config("openai_api_key"),
            base_url=get_config("openai_base_url"),
            model=get_config("openai_model"),
            temperature=0.1,  # 批改需要更稳定的输出
        )
        self.answer_service = AnswerService(session)
        self.question_service = QuestionService(session)

    async def grade(self, answer_id: int) -> bool:
        """批改答案"""
        import logging

        logger = logging.getLogger(__name__)

        try:
            # 1. 获取答案信息
            answer = await self.answer_service.get_answer_by_id(answer_id)
            if not answer:
                logger.error(f"批改失败: answer_id={answer_id} 不存在")
                return False

            logger.info(
                f"开始批改: answer_id={answer_id}, question_set_id={answer.question_set_id}"
            )

            # 2. 获取试题集内容（JSON 字符串）
            json_content = await self.question_service.get_question_set_content(
                answer.question_set_id
            )
            if not json_content:
                logger.error(
                    f"批改失败: 试题集内容不存在, question_set_id={answer.question_set_id}"
                )
                await self.answer_service.mark_grading_failed(
                    answer_id, "试题集内容不存在"
                )
                return False

            logger.info(f"试题集内容长度: {len(json_content)}")

            # 3. 解析试题
            questions = self._parse_questions(json_content)
            if not questions:
                logger.error(
                    f"批改失败: 试题解析失败, json_content 前200字符: {json_content[:200]}"
                )
                await self.answer_service.mark_grading_failed(answer_id, "试题解析失败")
                return False

            logger.info(f"解析到 {len(questions)} 道题目: {list(questions.keys())}")

            # 4. 批改每道题
            student_answers = answer.student_answers or {}
            logger.info(f"学生答案: {student_answers}")

            grading_results = {}
            total_score = 0.0
            max_total_score = 0.0

            for q_id, question in questions.items():
                student_answer = student_answers.get(q_id, "")
                result = await self._grade_question(question, student_answer)
                grading_results[q_id] = result
                total_score += result["score"]
                max_total_score += result["max_score"]
                logger.info(
                    f"题目 {q_id}: 学生答案={student_answer}, 得分={result['score']}/{result['max_score']}"
                )

            # 5. 计算总分（百分制）
            final_score = (
                (total_score / max_total_score * 100) if max_total_score > 0 else 0.0
            )
            logger.info(f"批改完成: 总分={final_score:.2f}")

            # 6. 更新批改结果
            await self.answer_service.update_grading_result(
                answer_id=answer_id,
                grading_results=grading_results,
                total_score=round(final_score, 2),
            )

            return True

        except Exception as e:
            logger.error(f"批改异常: {e}", exc_info=True)
            await self.answer_service.mark_grading_failed(answer_id, str(e))
            return False

    def _parse_questions(self, json_content: str) -> dict[str, dict]:
        """解析 JSON 格式试题内容，返回 {q1: {...}, q2: {...}} 字典。"""
        try:
            data = json.loads(json_content)
        except json.JSONDecodeError as e:
            logger.error(f"JSON 解析失败: {e}")
            return {}

        result: dict[str, dict] = {}
        questions = data.get("questions", [])
        for q in questions:
            num = q.get("number")
            if num is None:
                continue
            q_type = q.get("type", "")
            options_list = q.get("options")
            # 将 [{key, value}] 转为 {key: value} 供批改逻辑使用
            options_dict = (
                {item["key"]: item["value"] for item in options_list if "key" in item}
                if options_list
                else {}
            )
            answer = q.get("answer", "")
            question_data = {
                "number": str(num),
                "type": q_type,
                "content": q.get("content", ""),
                "options": options_dict,
                "correct_answer": answer,
                "reference_answer": answer,  # 简答题用同一字段
                "scoring_points": q.get("scoring_points") or "",
                "explanation": q.get("explanation", ""),
            }
            result[f"q{num}"] = question_data

        return result

    async def _grade_question(
        self,
        question: dict[str, Any],
        student_answer: str | list,
    ) -> dict[str, Any]:
        """批改单道题目"""
        q_type = question.get("type", "")

        if q_type == "single_choice":
            return self._grade_single_choice(question, student_answer)
        elif q_type == "multiple_choice":
            return self._grade_multiple_choice(question, student_answer)
        elif q_type == "fill_blank":
            return self._grade_fill_blank(question, student_answer)
        elif q_type == "short_answer":
            return await self._grade_short_answer(question, student_answer)
        else:
            return {
                "question_id": question.get("number", ""),
                "question_type": q_type,
                "score": 0.0,
                "max_score": 1.0,
                "feedback": "未知题型",
                "correct_answer": question.get("correct_answer", ""),
            }

    def _grade_single_choice(
        self,
        question: dict[str, Any],
        student_answer: str,
    ) -> dict[str, Any]:
        """批改单选题"""
        correct = question.get("correct_answer", "").strip().upper()
        student = student_answer.strip().upper()

        is_correct = correct == student
        score = 1.0 if is_correct else 0.0

        return {
            "question_id": question.get("number", ""),
            "question_type": "single_choice",
            "score": score,
            "max_score": 1.0,
            "feedback": "回答正确！"
            if is_correct
            else f"回答错误，正确答案是 {correct}",
            "correct_answer": correct,
        }

    def _grade_multiple_choice(
        self,
        question: dict[str, Any],
        student_answer: str | list,
    ) -> dict[str, Any]:
        """批改多选题（全对满分，漏选半分，错选零分）"""
        correct_str = question.get("correct_answer", "").strip().upper()
        correct_set = set(correct_str.replace(",", "").replace(" ", ""))

        # 处理学生答案：可能是列表或字符串
        if isinstance(student_answer, list):
            student_set = {s.strip().upper() for s in student_answer if s}
        else:
            student_str = student_answer.strip().upper()
            student_set = set(student_str.replace(",", "").replace(" ", ""))

        if correct_set == student_set:
            score = 1.0
            feedback = "回答正确！"
        elif student_set.issubset(correct_set) and len(student_set) > 0:
            score = 0.5
            feedback = f"部分正确（漏选），正确答案是 {','.join(sorted(correct_set))}"
        else:
            score = 0.0
            feedback = f"回答错误，正确答案是 {','.join(sorted(correct_set))}"

        return {
            "question_id": question.get("number", ""),
            "question_type": "multiple_choice",
            "score": score,
            "max_score": 1.0,
            "feedback": feedback,
            "correct_answer": ",".join(sorted(correct_set)),
        }

    def _grade_fill_blank(
        self,
        question: dict[str, Any],
        student_answer: str,
    ) -> dict[str, Any]:
        """批改填空题（精确匹配，忽略大小写和首尾空格）"""
        correct = question.get("correct_answer", "").strip().lower()
        student = student_answer.strip().lower()

        is_correct = correct == student
        score = 1.0 if is_correct else 0.0

        return {
            "question_id": question.get("number", ""),
            "question_type": "fill_blank",
            "score": score,
            "max_score": 1.0,
            "feedback": "回答正确！"
            if is_correct
            else f"回答错误，正确答案是 {question.get('correct_answer', '')}",
            "correct_answer": question.get("correct_answer", ""),
        }

    @staticmethod
    def _sanitize_student_answer(answer: str, max_length: int = 5000) -> str:
        """清洗学生答案，防止过长输入"""
        return answer.strip()[:max_length]

    async def _grade_short_answer(
        self,
        question: dict[str, Any],
        student_answer: str,
    ) -> dict[str, Any]:
        """批改简答题（使用 LLM）"""
        if not student_answer.strip():
            return {
                "question_id": question.get("number", ""),
                "question_type": "short_answer",
                "score": 0.0,
                "max_score": 1.0,
                "feedback": "未作答",
                "correct_answer": None,
            }

        sanitized_answer = self._sanitize_student_answer(student_answer)

        user_prompt = GRADING_USER.format(
            question=question.get("content", ""),
            reference_answer=question.get("reference_answer", ""),
            scoring_points=question.get("scoring_points", ""),
            student_answer=sanitized_answer,
        )

        messages = [
            {"role": "system", "content": GRADING_SYSTEM},
            {"role": "user", "content": user_prompt},
        ]

        try:
            response = await self.llm.ainvoke(messages)
            result = json.loads(response.content)

            score = float(result.get("score", 0))
            score = max(0.0, min(1.0, score))

            return {
                "question_id": question.get("number", ""),
                "question_type": "short_answer",
                "score": score,
                "max_score": 1.0,
                "feedback": result.get("feedback", ""),
                "analysis": result.get("analysis", ""),
                "correct_answer": None,
            }
        except (json.JSONDecodeError, KeyError, ValueError):
            logger.warning(
                f"LLM 输出解析失败: {getattr(response, 'content', '')[:500]}",
                exc_info=True,
            )
            return {
                "question_id": question.get("number", ""),
                "question_type": "short_answer",
                "score": 0.0,
                "max_score": 1.0,
                "feedback": "自动批改遇到问题，请教师人工复核",
                "needs_review": True,
                "correct_answer": None,
            }
