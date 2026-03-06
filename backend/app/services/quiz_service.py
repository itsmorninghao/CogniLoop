"""
Quiz service — orchestrates quiz creation, answering, and grading.
"""

from __future__ import annotations

import asyncio
import logging
import secrets
from datetime import datetime, timezone

from sqlalchemy import delete, func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import select

from backend.app.core.exceptions import BadRequestError, ForbiddenError, NotFoundError
from backend.app.core.sse import (
    emit_complete,
    emit_error,
    emit_node_start,
    emit_progress,
)
from backend.app.models.circle import CircleMember, CircleSessionParticipant
from backend.app.models.quiz import (
    QuizAcquisition,
    QuizQuestion,
    QuizResponse,
    QuizSession,
)
from backend.app.models.user import User
from backend.app.schemas.quiz import (
    AcquireQuizRequest,
    QuestionResponse,
    QuizCreateRequest,
    QuizPlazaItem,
    QuizResponseResult,
    QuizResponseSubmit,
    QuizSessionListItem,
    QuizSessionResponse,
    _normalize_options,
)

logger = logging.getLogger(__name__)

# Keeps strong references to background tasks so GC doesn't cancel them mid-run.
_background_tasks: set = set()


async def create_quiz_session(
    req: QuizCreateRequest,
    user: User,
    session: AsyncSession,
) -> QuizSessionResponse:
    """Create a quiz session and trigger background generation."""
    quiz = QuizSession(
        creator_id=user.id,
        solver_id=req.solver_id or user.id,
        mode=req.mode,
        generation_mode=req.generation_mode,
        title=req.title,
        knowledge_scope=req.knowledge_scope,
        quiz_config=req.quiz_config,
        circle_id=req.circle_id,
        status="generating",
    )
    session.add(quiz)
    await session.flush()
    await session.refresh(quiz)

    session_id = quiz.id

    task = asyncio.create_task(
        _generate_quiz_background(
            session_id=session_id,
            user_id=user.id,
            knowledge_scope=req.knowledge_scope,
            quiz_config=req.quiz_config,
            generation_mode=req.generation_mode,
        )
    )
    _background_tasks.add(task)
    task.add_done_callback(_background_tasks.discard)

    return QuizSessionResponse.model_validate(quiz)


async def _generate_quiz_background(
    session_id: str,
    user_id: int,
    knowledge_scope: dict,
    quiz_config: dict,
    generation_mode: str,
) -> None:
    """Background task: run the quiz generation graph."""
    from backend.app.core.database import async_session_factory
    from backend.app.graphs.pro_generation.graph import pro_generation_graph
    from backend.app.graphs.quiz_generation.graph import quiz_generation_graph

    try:
        # Give the frontend 500ms to establish the SSE connection before we start emitting events
        await asyncio.sleep(0.5)

        await emit_node_start(session_id, "quiz_generation", "开始生成题目...")

        if generation_mode == "pro":
            # Pro Graph State Requirements
            initial_state = {
                "session_id": session_id,
                "knowledge_scope": knowledge_scope,
                "quiz_config": quiz_config,
                "completed_questions": [],
                "final_questions": [],
            }
            result = await pro_generation_graph.ainvoke(initial_state)
            validated_questions = result.get("final_questions", [])

        else:
            # Standard Graph
            initial_state = {
                "session_id": session_id,
                "user_id": user_id,
                "knowledge_scope": knowledge_scope,
                "quiz_config": quiz_config,
                "generation_mode": generation_mode,
                "errors": [],
                "retry_count": 0,
                "is_complete": False,
            }
            result = await quiz_generation_graph.ainvoke(initial_state)
            validated_questions = result.get("validated_questions", [])

        # Save generated questions to DB
        async with async_session_factory() as db_session:
            for i, q in enumerate(validated_questions):
                db_question = QuizQuestion(
                    session_id=session_id,
                    question_index=i,
                    question_type=q.get("question_type", "single_choice"),
                    content=q.get("content", ""),
                    options=_normalize_options(q.get("options")),
                    correct_answer=q.get("correct_answer", ""),
                    analysis=q.get("analysis"),
                    score=q.get("score", 1.0),
                    source_chunks=q.get("source_chunks"),
                )
                db_session.add(db_question)

            # Update session status
            stmt = select(QuizSession).where(QuizSession.id == session_id)
            quiz_result = await db_session.execute(stmt)
            quiz = quiz_result.scalar_one_or_none()
            if quiz:
                quiz.status = "ready"
                db_session.add(quiz)

            await db_session.commit()

        await emit_progress(
            session_id, 1.0, f"出题完成！共 {len(validated_questions)} 道题目"
        )
        await emit_complete(
            session_id,
            {
                "question_count": len(validated_questions),
                "session_id": session_id,
            },
        )

        logger.info(
            "Quiz %s generated: %d questions", session_id, len(validated_questions)
        )

    except Exception as e:
        logger.error("Quiz generation failed for %s: %s", session_id, e, exc_info=True)
        await emit_error(session_id, str(e)[:200])

        # Update status to error
        try:
            async with async_session_factory() as db_session:
                stmt = select(QuizSession).where(QuizSession.id == session_id)
                quiz_result = await db_session.execute(stmt)
                quiz = quiz_result.scalar_one_or_none()
                if quiz:
                    quiz.status = "error"
                    db_session.add(quiz)
                await db_session.commit()
        except Exception:
            pass


async def get_quiz_session(
    session_id: str,
    user: User,
    db_session: AsyncSession,
    *,
    include_answers: bool = False,
) -> QuizSessionResponse:
    """Get quiz session with questions."""
    quiz = await _get_session_or_404(session_id, db_session)
    await _check_session_access(quiz, user, db_session)

    # For circle sessions, check participant status to determine visibility
    participant = None
    if quiz.circle_id:
        p_result = await db_session.execute(
            select(CircleSessionParticipant).where(
                CircleSessionParticipant.session_id == session_id,
                CircleSessionParticipant.user_id == user.id,
            )
        )
        participant = p_result.scalar_one_or_none()

    q_result = await db_session.execute(
        select(QuizQuestion)
        .where(QuizQuestion.session_id == session_id)
        .order_by(QuizQuestion.question_index)
    )
    questions = q_result.scalars().all()

    r_result = await db_session.execute(
        select(QuizResponse).where(
            QuizResponse.session_id == session_id, QuizResponse.user_id == user.id
        )
    )
    responses = r_result.scalars().all()

    # Determine whether to show answers
    participant_completed = participant and participant.status == "completed"
    show_answers = include_answers or quiz.status == "graded" or participant_completed

    question_list = []
    for q in questions:
        qr = QuestionResponse.model_validate(q)
        if not show_answers:
            qr.correct_answer = None
            qr.analysis = None
        question_list.append(qr)

    response_list = [QuizResponseResult.model_validate(r) for r in responses]

    result = QuizSessionResponse.model_validate(quiz)
    result.questions = question_list
    result.responses = response_list

    # For circle sessions: overlay participant data so polling/result page works
    if quiz.circle_id and participant:
        if participant.status == "completed":
            result.status = "graded"
            result.accuracy = participant.accuracy
            result.total_score = participant.total_score
        elif participant.status == "grading":
            result.status = "grading"

    return result


async def submit_response(
    session_id: str,
    submissions: list[QuizResponseSubmit],
    user: User,
    db_session: AsyncSession,
) -> list[QuizResponseResult]:
    """Submit answers to quiz questions."""
    quiz = await _get_session_or_404(session_id, db_session)
    await _check_session_access(quiz, user, db_session)

    if quiz.status not in ("ready", "in_progress"):
        raise BadRequestError(f"Cannot submit to quiz in '{quiz.status}' status")

    if quiz.circle_id:
        # Circle session: upsert participant record, never change session status
        p_result = await db_session.execute(
            select(CircleSessionParticipant).where(
                CircleSessionParticipant.session_id == session_id,
                CircleSessionParticipant.user_id == user.id,
            )
        )
        participant = p_result.scalar_one_or_none()
        if not participant:
            participant = CircleSessionParticipant(
                session_id=session_id,
                user_id=user.id,
                status="in_progress",
            )
            db_session.add(participant)
    else:
        # Non-circle: mark session as in progress on first submission
        if quiz.status == "ready":
            quiz.status = "in_progress"
            quiz.started_at = datetime.now(timezone.utc).replace(tzinfo=None)
            db_session.add(quiz)

    results = []
    for sub in submissions:
        # Check if response already exists
        existing = await db_session.execute(
            select(QuizResponse).where(
                QuizResponse.session_id == session_id,
                QuizResponse.question_id == sub.question_id,
                QuizResponse.user_id == user.id,
            )
        )
        resp = existing.scalar_one_or_none()

        if resp:
            resp.user_answer = sub.user_answer
            resp.time_spent = sub.time_spent
        else:
            resp = QuizResponse(
                session_id=session_id,
                question_id=sub.question_id,
                user_id=user.id,
                user_answer=sub.user_answer,
                time_spent=sub.time_spent,
            )
        db_session.add(resp)
        await db_session.flush()
        await db_session.refresh(resp)
        results.append(QuizResponseResult.model_validate(resp))

    return results


async def submit_quiz(
    session_id: str,
    user: User,
    db_session: AsyncSession,
) -> QuizSessionResponse:
    """Finalize quiz and trigger grading."""
    quiz = await _get_session_or_404(session_id, db_session)
    await _check_session_access(quiz, user, db_session)

    if quiz.status not in ("in_progress", "ready"):
        raise BadRequestError(f"Cannot submit quiz in '{quiz.status}' status")

    if quiz.circle_id:
        # Circle session: update participant to grading, keep session status as ready
        p_result = await db_session.execute(
            select(CircleSessionParticipant).where(
                CircleSessionParticipant.session_id == session_id,
                CircleSessionParticipant.user_id == user.id,
            )
        )
        participant = p_result.scalar_one_or_none()
        if not participant:
            participant = CircleSessionParticipant(
                session_id=session_id,
                user_id=user.id,
            )
        participant.status = "grading"
        db_session.add(participant)
    else:
        # Non-circle: update session status
        quiz.status = "grading"
        quiz.completed_at = datetime.now(timezone.utc).replace(tzinfo=None)
        db_session.add(quiz)

    await db_session.flush()

    # Kick off background grading
    task = asyncio.create_task(_grade_quiz_background(session_id, user.id))
    _background_tasks.add(task)
    task.add_done_callback(_background_tasks.discard)

    result = QuizSessionResponse.model_validate(quiz)
    if quiz.circle_id:
        # Tell the client it's grading so the result page shows the spinner
        result.status = "grading"
    return result


async def _grade_quiz_background(session_id: str, user_id: int) -> None:
    """Background task: run the grading graph."""
    from backend.app.core.database import async_session_factory
    from backend.app.graphs.grading.graph import grading_graph

    try:
        await emit_node_start(session_id, "grading", "开始批改...")

        async with async_session_factory() as db_session:
            # Load questions
            q_result = await db_session.execute(
                select(QuizQuestion).where(QuizQuestion.session_id == session_id)
            )
            questions = q_result.scalars().all()

            # Load responses
            r_result = await db_session.execute(
                select(QuizResponse).where(
                    QuizResponse.session_id == session_id,
                    QuizResponse.user_id == user_id,
                )
            )
            responses = r_result.scalars().all()

            # Build grading state
            q_list = [
                {
                    "id": q.id,
                    "content": q.content,
                    "question_type": q.question_type,
                    "options": q.options,
                    "correct_answer": q.correct_answer,
                    "analysis": q.analysis,
                    "score": q.score,
                }
                for q in questions
            ]
            r_list = [
                {"question_id": r.question_id, "user_answer": r.user_answer or ""}
                for r in responses
            ]

        # Run grading graph
        result = await grading_graph.ainvoke(
            {
                "session_id": session_id,
                "user_id": user_id,
                "questions": q_list,
                "responses": r_list,
            }
        )

        # Save grading results
        async with async_session_factory() as db_session:
            graded_results = result.get("graded_results", [])

            for gr in graded_results:
                stmt = select(QuizResponse).where(
                    QuizResponse.session_id == session_id,
                    QuizResponse.question_id == gr["question_id"],
                    QuizResponse.user_id == user_id,
                )
                r_result = await db_session.execute(stmt)
                resp = r_result.scalar_one_or_none()
                if resp:
                    resp.is_correct = gr.get("is_correct")
                    resp.score = gr.get("score", 0)
                    resp.ai_feedback = gr.get("ai_feedback", "")
                    db_session.add(resp)

            # Update quiz session or participant depending on session type
            stmt = select(QuizSession).where(QuizSession.id == session_id)
            q_result = await db_session.execute(stmt)
            quiz = q_result.scalar_one_or_none()
            if quiz:
                if quiz.circle_id:
                    # Circle session: update participant record, keep session as ready
                    p_stmt = select(CircleSessionParticipant).where(
                        CircleSessionParticipant.session_id == session_id,
                        CircleSessionParticipant.user_id == user_id,
                    )
                    p_result = await db_session.execute(p_stmt)
                    participant = p_result.scalar_one_or_none()
                    if participant:
                        participant.status = "completed"
                        participant.accuracy = result.get("accuracy", 0)
                        participant.total_score = result.get("total_score", 0)
                        participant.completed_at = datetime.now(timezone.utc).replace(
                            tzinfo=None
                        )
                        db_session.add(participant)
                else:
                    # Non-circle: update session
                    quiz.status = "graded"
                    quiz.total_score = result.get("total_score", 0)
                    quiz.accuracy = result.get("accuracy", 0)
                    db_session.add(quiz)

            await db_session.commit()

        # Update user profile after grading
        try:
            from backend.app.services import profile_service

            async with async_session_factory() as profile_db:
                await profile_service.incremental_update(
                    user_id, session_id, profile_db
                )
            logger.info(
                "Profile updated for user %d after quiz %s", user_id, session_id
            )
        except Exception as profile_err:
            logger.warning(
                "Profile update failed for user %d: %s", user_id, profile_err
            )

        # Trigger AI assistant graph (event-driven)
        try:
            from backend.app.graphs.assistant.graph import assistant_graph

            task = asyncio.create_task(
                assistant_graph.ainvoke(
                    {
                        "user_id": user_id,
                        "session_id": session_id,
                        "trigger_type": "event",
                    }
                )
            )
            _background_tasks.add(task)
            task.add_done_callback(_background_tasks.discard)
            logger.info(
                "AssistantGraph triggered for user %d after quiz %s",
                user_id,
                session_id,
            )
        except Exception as assistant_err:
            logger.warning(
                "AssistantGraph trigger failed for user %d: %s", user_id, assistant_err
            )

        await emit_progress(session_id, 1.0, result.get("feedback_summary", "批改完成"))
        await emit_complete(
            session_id,
            {
                "total_score": result.get("total_score", 0),
                "accuracy": result.get("accuracy", 0),
            },
        )

        logger.info(
            "Quiz %s graded: score=%.1f", session_id, result.get("total_score", 0)
        )

    except Exception as e:
        logger.error("Grading failed for %s: %s", session_id, e, exc_info=True)
        await emit_error(session_id, str(e)[:200])


async def list_quiz_sessions(
    user: User,
    db_session: AsyncSession,
    *,
    limit: int = 20,
    offset: int = 0,
) -> list[QuizSessionListItem]:
    """List quiz sessions for a user."""
    result = await db_session.execute(
        select(QuizSession)
        .where((QuizSession.creator_id == user.id) | (QuizSession.solver_id == user.id))
        .order_by(QuizSession.created_at.desc())
        .offset(offset)
        .limit(limit)
    )
    return [QuizSessionListItem.model_validate(s) for s in result.scalars().all()]


async def _get_session_or_404(session_id: str, db_session: AsyncSession) -> QuizSession:
    result = await db_session.execute(
        select(QuizSession).where(QuizSession.id == session_id)
    )
    quiz = result.scalar_one_or_none()
    if not quiz:
        raise NotFoundError("Quiz session")
    return quiz


async def _check_session_access(
    quiz: QuizSession, user: User, db_session: AsyncSession
) -> None:
    if user.is_admin or quiz.creator_id == user.id or quiz.solver_id == user.id:
        return
    # Circle session: allow any circle member
    if quiz.circle_id:
        member_result = await db_session.execute(
            select(CircleMember).where(
                CircleMember.circle_id == quiz.circle_id,
                CircleMember.user_id == user.id,
            )
        )
        if member_result.scalar_one_or_none():
            return
    # Acquired quiz: allow acquisition holder
    acq_result = await db_session.execute(
        select(QuizAcquisition).where(
            QuizAcquisition.session_id == quiz.id,
            QuizAcquisition.user_id == user.id,
        )
    )
    if acq_result.scalar_one_or_none():
        return
    raise ForbiddenError("No access to this quiz session")


def _question_count_subq():
    return (
        select(
            QuizQuestion.session_id,
            func.count(QuizQuestion.id).label("qcount"),
        )
        .group_by(QuizQuestion.session_id)
        .subquery()
    )


async def delete_quiz_session(session_id: str, user: User, db: AsyncSession) -> None:
    quiz = await _get_session_or_404(session_id, db)
    if quiz.creator_id != user.id and not user.is_admin:
        raise ForbiddenError("Only the creator can delete this quiz")
    if quiz.circle_id is not None:
        raise BadRequestError("Cannot delete circle quiz sessions")
    if quiz.status not in ("graded", "error", "ready"):
        raise BadRequestError(f"Cannot delete quiz in '{quiz.status}' status")

    await db.execute(
        delete(QuizAcquisition).where(QuizAcquisition.session_id == session_id)
    )
    await db.execute(delete(QuizResponse).where(QuizResponse.session_id == session_id))
    await db.execute(delete(QuizQuestion).where(QuizQuestion.session_id == session_id))
    await db.delete(quiz)


async def generate_share_code(
    session_id: str, user: User, db: AsyncSession
) -> QuizSessionResponse:
    quiz = await _get_session_or_404(session_id, db)
    if quiz.creator_id != user.id:
        raise ForbiddenError("Only the creator can manage share settings")
    if not quiz.share_code:
        quiz.share_code = secrets.token_urlsafe(8)[:12]
        db.add(quiz)
        await db.flush()
        await db.refresh(quiz)
    return QuizSessionResponse.model_validate(quiz)


async def revoke_share_code(
    session_id: str, user: User, db: AsyncSession
) -> QuizSessionResponse:
    quiz = await _get_session_or_404(session_id, db)
    if quiz.creator_id != user.id:
        raise ForbiddenError("Only the creator can manage share settings")
    quiz.share_code = None
    quiz.shared_to_plaza_at = None
    db.add(quiz)
    await db.flush()
    await db.refresh(quiz)
    return QuizSessionResponse.model_validate(quiz)


async def publish_to_plaza(
    session_id: str, user: User, db: AsyncSession
) -> QuizSessionResponse:
    quiz = await _get_session_or_404(session_id, db)
    if quiz.creator_id != user.id:
        raise ForbiddenError("Only the creator can manage share settings")
    if quiz.status != "graded":
        raise BadRequestError("Only graded quizzes can be published to the plaza")
    quiz.shared_to_plaza_at = datetime.now(timezone.utc).replace(tzinfo=None)
    db.add(quiz)
    await db.flush()
    await db.refresh(quiz)
    return QuizSessionResponse.model_validate(quiz)


async def unpublish_from_plaza(
    session_id: str, user: User, db: AsyncSession
) -> QuizSessionResponse:
    quiz = await _get_session_or_404(session_id, db)
    if quiz.creator_id != user.id:
        raise ForbiddenError("Only the creator can manage share settings")
    quiz.shared_to_plaza_at = None
    db.add(quiz)
    await db.flush()
    await db.refresh(quiz)
    return QuizSessionResponse.model_validate(quiz)


async def acquire_quiz(req: AcquireQuizRequest, user: User, db: AsyncSession) -> dict:
    result = await db.execute(
        select(QuizSession).where(QuizSession.share_code == req.share_code)
    )
    quiz = result.scalar_one_or_none()
    if not quiz:
        raise NotFoundError("Quiz with this share code")
    if quiz.creator_id == user.id:
        raise BadRequestError("Cannot acquire your own quiz")

    existing = await db.execute(
        select(QuizAcquisition).where(
            QuizAcquisition.user_id == user.id,
            QuizAcquisition.session_id == quiz.id,
        )
    )
    if existing.scalar_one_or_none():
        raise BadRequestError("Already acquired")

    acq = QuizAcquisition(user_id=user.id, session_id=quiz.id)
    db.add(acq)
    await db.flush()
    return {"message": "Quiz acquired successfully"}


async def list_my_quizzes(
    user: User,
    db: AsyncSession,
    *,
    limit: int = 20,
    offset: int = 0,
) -> list[QuizSessionListItem]:
    count_subq = _question_count_subq()
    result = await db.execute(
        select(QuizSession, func.coalesce(count_subq.c.qcount, 0))
        .outerjoin(count_subq, QuizSession.id == count_subq.c.session_id)
        .where(QuizSession.creator_id == user.id)
        .order_by(QuizSession.created_at.desc())
        .offset(offset)
        .limit(limit)
    )
    items = []
    for qs, qcount in result.all():
        item = QuizSessionListItem.model_validate(qs)
        item.question_count = qcount
        items.append(item)
    return items


async def list_acquired(
    user: User,
    db: AsyncSession,
) -> list[QuizSessionListItem]:
    count_subq = _question_count_subq()
    result = await db.execute(
        select(
            QuizSession,
            func.coalesce(count_subq.c.qcount, 0),
            User.full_name,
            User.username,
            QuizAcquisition.acquired_at,
        )
        .join(QuizAcquisition, QuizSession.id == QuizAcquisition.session_id)
        .outerjoin(count_subq, QuizSession.id == count_subq.c.session_id)
        .join(User, QuizSession.creator_id == User.id)
        .where(QuizAcquisition.user_id == user.id)
        .order_by(QuizAcquisition.acquired_at.desc())
    )
    items = []
    for qs, qcount, full_name, username, acquired_at in result.all():
        item = QuizSessionListItem.model_validate(qs)
        item.question_count = qcount
        item.creator_full_name = full_name
        item.creator_username = username
        item.acquired_at = acquired_at
        items.append(item)
    return items


async def list_quiz_plaza(db: AsyncSession) -> list[QuizPlazaItem]:
    count_subq = _question_count_subq()
    acq_count_subq = (
        select(
            QuizAcquisition.session_id,
            func.count(QuizAcquisition.id).label("acquire_count"),
        )
        .group_by(QuizAcquisition.session_id)
        .subquery()
    )
    result = await db.execute(
        select(
            QuizSession,
            User.full_name,
            User.username,
            func.coalesce(count_subq.c.qcount, 0),
            func.coalesce(acq_count_subq.c.acquire_count, 0),
        )
        .join(User, QuizSession.creator_id == User.id)
        .outerjoin(count_subq, QuizSession.id == count_subq.c.session_id)
        .outerjoin(acq_count_subq, QuizSession.id == acq_count_subq.c.session_id)
        .where(QuizSession.shared_to_plaza_at.isnot(None))
        .order_by(QuizSession.shared_to_plaza_at.desc())
    )
    return [
        QuizPlazaItem(
            id=qs.id,
            title=qs.title,
            mode=qs.mode,
            question_count=qcount,
            accuracy=qs.accuracy,
            creator_full_name=full_name,
            creator_username=username,
            acquire_count=acquire_count,
            shared_to_plaza_at=qs.shared_to_plaza_at,
            share_code=qs.share_code,
        )
        for qs, full_name, username, qcount, acquire_count in result.all()
    ]
