"""后台批改任务

独立线程 + 独立数据库连接"""

import asyncio
import logging

from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker

from backend.app.core.config import settings

logger = logging.getLogger(__name__)


def run_grading_in_background(
    answer_id: int, *, mark_student_completed: bool = False
) -> None:
    """同步入口，由 BackgroundTasks 在线程池中调用。"""
    asyncio.run(_run_grading_async(answer_id, mark_student_completed))


async def _run_grading_async(answer_id: int, mark_student_completed: bool) -> None:
    """使用独立引擎和会话执行批改，避免与请求共享连接。"""
    engine = create_async_engine(settings.database_url, echo=False, pool_pre_ping=True)
    async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    async with async_session() as session:
        try:
            from backend.app.graph.grader import AnswerGrader
            from backend.app.services.answer_service import AnswerService
            from backend.app.services.question_service import QuestionService

            grader = AnswerGrader(session)
            success = await grader.grade(answer_id)

            if success:
                if mark_student_completed:
                    answer_service = AnswerService(session)
                    answer = await answer_service.get_answer_by_id(answer_id)
                    if answer and answer.student_id:
                        question_service = QuestionService(session)
                        await question_service.mark_completed(
                            answer.question_set_id, answer.student_id
                        )
                logger.info(f"批改任务成功: answer_id={answer_id}")
            else:
                logger.warning(f"批改任务失败: answer_id={answer_id}")

            await session.commit()
        except Exception as e:
            logger.error(
                f"批改任务异常: answer_id={answer_id}, error={e}",
                exc_info=True,
            )
            await session.rollback()
            try:
                answer_service = AnswerService(session)
                await answer_service.mark_grading_failed(answer_id, str(e))
                await session.commit()
            except Exception:
                await session.rollback()
        finally:
            await engine.dispose()
