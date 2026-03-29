"""
Node 4 (node graph): Quiz Generator — LLM generates quiz questions for a course node.
"""

from __future__ import annotations

import json
import logging
import uuid

from langchain_core.messages import HumanMessage, SystemMessage

from backend.app.core.database import async_session_factory
from backend.app.core.llm import get_chat_model
from backend.app.graphs.course_generation.state import NodeGenState

logger = logging.getLogger(__name__)

_QUIZ_PROMPT = """\
你是一位专业的课程评估专家。根据以下课程内容，生成高质量的测验题目。

## 节点标题
{node_title}

## 课程内容摘要
{content_summary}

## 输出要求
严格按以下 JSON 格式返回，不要包含其他文字：

{{
  "questions": [
    {{
      "question": "题目文本",
      "options": ["A. 选项1", "B. 选项2", "C. 选项3", "D. 选项4"],
      "answer": "A",
      "explanation": "解析说明"
    }}
  ]
}}

生成 3-5 道单选题，覆盖节点的核心知识点。难度适中，选项设计要有一定干扰性。"""


def _strip_fences(raw: str) -> str:
    raw = raw.strip()
    if raw.startswith("```"):
        lines = raw.split("\n")
        end = -1 if lines[-1].strip() == "```" else len(lines)
        raw = "\n".join(lines[1:end])
    return raw.strip()


async def quiz_generator(state: NodeGenState) -> dict:
    """
    Generate quiz questions for a course node.
    Saves to DB as QuizSession + QuizQuestions + CourseQuiz.
    Returns quiz_session_id.
    """
    node_id: int = state["node_id"]
    course_id: int = state["course_id"]
    node_title: str = state.get("node_title", "")
    narration_text: str = state.get("narration_text", "")
    text_content: str | None = state.get("text_content")
    user_id: int = state.get("user_id", 0)

    content_summary = text_content[:800] if text_content else narration_text[:800]

    async with async_session_factory() as session:
        llm = await get_chat_model(session, temperature=0.6)

    prompt = _QUIZ_PROMPT.format(
        node_title=node_title,
        content_summary=content_summary or "（无内容摘要）",
    )

    try:
        response = await llm.ainvoke([
            SystemMessage(content=prompt),
            HumanMessage(content="请生成测验题目。"),
        ])
        raw = _strip_fences(str(response.content))
        quiz_data = json.loads(raw)
        questions = quiz_data.get("questions", [])
    except Exception as e:
        logger.warning("quiz_generator: LLM/parse failed for node %d: %s", node_id, e)
        return {"quiz_session_id": None, "current_node": "quiz_generator"}

    if not questions:
        return {"quiz_session_id": None, "current_node": "quiz_generator"}

    quiz_session_id = await _save_quiz(
        node_id=node_id,
        course_id=course_id,
        user_id=user_id,
        node_title=node_title,
        questions=questions,
    )

    logger.info("quiz_generator: node %d → %d questions, session %s", node_id, len(questions), quiz_session_id)
    return {
        "quiz_session_id": quiz_session_id,
        "current_node": "quiz_generator",
    }


async def _save_quiz(
    node_id: int,
    course_id: int,
    user_id: int,
    node_title: str,
    questions: list[dict],
) -> str | None:
    """Persist quiz questions and link to course node."""
    from backend.app.models.quiz import QuizSession, QuizQuestion
    from backend.app.models.course import CourseQuiz

    session_id = str(uuid.uuid4())

    async with async_session_factory() as db:
        quiz_session = QuizSession(
            id=session_id,
            creator_id=user_id,
            mode="self_test",
            title=f"{node_title} — 节点测验",
            status="ready",
            knowledge_scope={},
            quiz_config={"source": "course", "node_id": node_id, "course_id": course_id},
        )
        db.add(quiz_session)
        await db.flush()

        for idx, q in enumerate(questions):
            options = q.get("options", [])
            answer_letter = q.get("answer", "A").strip().upper()

            qq = QuizQuestion(
                session_id=session_id,
                question_index=idx,
                question_type="single_choice",
                content=q.get("question", ""),
                options=options,
                correct_answer=answer_letter,
                analysis=q.get("explanation", ""),
            )
            db.add(qq)

        course_quiz = CourseQuiz(
            node_id=node_id,
            quiz_session_id=session_id,
        )
        db.add(course_quiz)

        await db.commit()

    return session_id
