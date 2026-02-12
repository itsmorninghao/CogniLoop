"""答案批改器"""

import json
import re
from typing import Any

from langchain_openai import ChatOpenAI
from sqlalchemy.ext.asyncio import AsyncSession

from backend.app.graph.prompts import GRADING_SYSTEM, GRADING_USER
from backend.app.services.answer_service import AnswerService
from backend.app.services.config_service import get_config
from backend.app.services.question_service import QuestionService


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

            # 2. 获取试题集内容
            markdown_content = await self.question_service.get_question_set_content(
                answer.question_set_id
            )
            if not markdown_content:
                logger.error(
                    f"批改失败: 试题集内容不存在, question_set_id={answer.question_set_id}"
                )
                await self.answer_service.mark_grading_failed(
                    answer_id, "试题集内容不存在"
                )
                return False

            logger.info(f"试题集内容长度: {len(markdown_content)}")

            # 3. 解析试题
            questions = self._parse_questions(markdown_content)
            if not questions:
                logger.error(
                    f"批改失败: 试题解析失败, markdown_content 前200字符: {markdown_content[:200]}"
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

    def _parse_questions(self, markdown_content: str) -> dict[str, dict]:
        """解析 Markdown 试题内容"""
        questions = {}

        # 匹配题目模式：## 题目 N [type]
        pattern = r"##\s+题目\s+(\d+)\s+\[(\w+)\](.*?)(?=##\s+题目|\Z)"
        matches = re.findall(pattern, markdown_content, re.DOTALL)

        for match in matches:
            q_num = match[0]
            q_type = match[1]
            q_content = match[2].strip()

            question_data = {
                "number": q_num,
                "type": q_type,
                "raw_content": q_content,
            }

            # 解析题目内容
            content_match = re.search(
                r"\*\*题目内容\*\*[：:]\s*(.+?)(?=\*\*选项|\*\*正确答案|\*\*参考答案|\Z)",
                q_content,
                re.DOTALL,
            )
            if content_match:
                question_data["content"] = content_match.group(1).strip()

            # 解析选项（选择题）
            if q_type in ["single_choice", "multiple_choice"]:
                options = {}
                option_pattern = (
                    r"\*\*选项\s*([A-Z])\*\*[：:]\s*(.+?)(?=\*\*选项|\*\*正确答案|\Z)"
                )
                option_matches = re.findall(option_pattern, q_content, re.DOTALL)
                for opt_letter, opt_content in option_matches:
                    options[opt_letter] = opt_content.strip()
                question_data["options"] = options

            # 解析正确答案
            answer_match = re.search(
                r"\*\*正确答案\*\*[：:]\s*(.+?)(?=\*\*解析|\*\*评分要点|\Z)",
                q_content,
                re.DOTALL,
            )
            if answer_match:
                question_data["correct_answer"] = answer_match.group(1).strip()

            # 解析参考答案（简答题）
            ref_answer_match = re.search(
                r"\*\*参考答案\*\*[：:]\s*(.+?)(?=\*\*评分要点|\Z)",
                q_content,
                re.DOTALL,
            )
            if ref_answer_match:
                question_data["reference_answer"] = ref_answer_match.group(1).strip()

            # 解析评分要点
            scoring_match = re.search(
                r"\*\*评分要点\*\*[：:]\s*(.+?)(?=\Z)",
                q_content,
                re.DOTALL,
            )
            if scoring_match:
                question_data["scoring_points"] = scoring_match.group(1).strip()

            # 解析解析
            explanation_match = re.search(
                r"\*\*解析\*\*[：:]\s*(.+?)(?=\Z)",
                q_content,
                re.DOTALL,
            )
            if explanation_match:
                question_data["explanation"] = explanation_match.group(1).strip()

            questions[f"q{q_num}"] = question_data

        return questions

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

        # 构建提示词
        user_prompt = GRADING_USER.format(
            question=question.get("content", ""),
            reference_answer=question.get("reference_answer", ""),
            scoring_points=question.get("scoring_points", ""),
            student_answer=student_answer,
        )

        # 调用 LLM 批改
        messages = [
            {"role": "system", "content": GRADING_SYSTEM},
            {"role": "user", "content": user_prompt},
        ]

        try:
            response = await self.llm.ainvoke(messages)
            result = json.loads(response.content)

            return {
                "question_id": question.get("number", ""),
                "question_type": "short_answer",
                "score": float(result.get("score", 0)),
                "max_score": 1.0,
                "feedback": result.get("feedback", ""),
                "analysis": result.get("analysis", ""),
                "correct_answer": None,
            }
        except (json.JSONDecodeError, KeyError):
            # LLM 输出格式错误，给予部分分数
            return {
                "question_id": question.get("number", ""),
                "question_type": "short_answer",
                "score": 0.5,
                "max_score": 1.0,
                "feedback": "自动批改遇到问题，已给予部分分数，请教师复核",
                "correct_answer": None,
            }
