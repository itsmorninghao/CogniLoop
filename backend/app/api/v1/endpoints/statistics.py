"""统计相关 API"""

from fastapi import APIRouter, HTTPException, status

from backend.app.api.v1.deps import CurrentStudent, CurrentTeacher, SessionDep
from backend.app.schemas.statistics import (
    CourseOverview,
    QuestionSetCompletionList,
    QuestionSetStatistics,
    ScoreTrend,
    StudentInfo,
    StudentStatistics,
    SubmissionTrend,
)
from backend.app.services.course_service import CourseService
from backend.app.services.question_service import QuestionService
from backend.app.services.statistics_service import StatisticsService

router = APIRouter()


@router.get("/course/{course_id}/overview", response_model=CourseOverview)
async def get_course_overview(
    course_id: int,
    session: SessionDep,
    teacher: CurrentTeacher,
) -> CourseOverview:
    """课程概览（学生数、文档数、试题集数）"""
    # 验证课程权限
    course_service = CourseService(session)
    course = await course_service.verify_teacher_owns_course(course_id, teacher.id)
    if not course:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="课程不存在或无权访问",
        )

    statistics_service = StatisticsService(session)
    overview = await statistics_service.get_course_overview(course_id)
    if not overview:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="课程不存在",
        )
    return overview


@router.get("/question-set/{question_set_id}", response_model=QuestionSetStatistics)
async def get_question_set_statistics(
    question_set_id: int,
    session: SessionDep,
    teacher: CurrentTeacher,
) -> QuestionSetStatistics:
    """试题集统计（完成率、平均分、失败数量及原因）"""
    # 验证权限
    question_service = QuestionService(session)
    question_set = await question_service.verify_teacher_owns_question_set(
        question_set_id, teacher.id
    )
    if not question_set:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="试题集不存在或无权访问",
        )

    statistics_service = StatisticsService(session)
    stats = await statistics_service.get_question_set_statistics(question_set_id)
    if not stats:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="试题集不存在",
        )
    return stats


@router.get("/course/{course_id}/students", response_model=list[StudentInfo])
async def get_course_students(
    course_id: int,
    session: SessionDep,
    teacher: CurrentTeacher,
) -> list[StudentInfo]:
    """课程学生列表"""
    # 验证课程权限
    course_service = CourseService(session)
    course = await course_service.verify_teacher_owns_course(course_id, teacher.id)
    if not course:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="课程不存在或无权访问",
        )

    statistics_service = StatisticsService(session)
    return await statistics_service.get_course_students(course_id)


@router.get("/my-statistics", response_model=StudentStatistics)
async def get_my_statistics(
    session: SessionDep,
    student: CurrentStudent,
) -> StudentStatistics:
    """学生个人统计（答题数、平均分）"""
    statistics_service = StatisticsService(session)
    return await statistics_service.get_student_statistics(student.id)


@router.get("/course/{course_id}/submission-trend", response_model=SubmissionTrend)
async def get_submission_trend(
    course_id: int,
    session: SessionDep,
    teacher: CurrentTeacher,
    days: int = 7,
) -> SubmissionTrend:
    """获取答题提交趋势（最近 N 天）"""
    # 验证课程权限
    course_service = CourseService(session)
    course = await course_service.verify_teacher_owns_course(course_id, teacher.id)
    if not course:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="课程不存在或无权访问",
        )

    statistics_service = StatisticsService(session)
    return await statistics_service.get_submission_trend(course_id, days)


@router.get(
    "/course/{course_id}/question-set-completion",
    response_model=QuestionSetCompletionList,
)
async def get_question_set_completion(
    course_id: int,
    session: SessionDep,
    teacher: CurrentTeacher,
) -> QuestionSetCompletionList:
    """获取课程下试题集完成情况"""
    # 验证课程权限
    course_service = CourseService(session)
    course = await course_service.verify_teacher_owns_course(course_id, teacher.id)
    if not course:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="课程不存在或无权访问",
        )

    statistics_service = StatisticsService(session)
    return await statistics_service.get_question_set_completion(course_id)


@router.get("/course/{course_id}/score-trend", response_model=ScoreTrend)
async def get_score_trend(
    course_id: int,
    session: SessionDep,
    teacher: CurrentTeacher,
    days: int = 7,
) -> ScoreTrend:
    """获取平均分趋势（最近 N 天）"""
    # 验证课程权限
    course_service = CourseService(session)
    course = await course_service.verify_teacher_owns_course(course_id, teacher.id)
    if not course:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="课程不存在或无权访问",
        )

    statistics_service = StatisticsService(session)
    return await statistics_service.get_score_trend(course_id, days)
