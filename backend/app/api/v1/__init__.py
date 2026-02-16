"""API v1 路由"""

from fastapi import APIRouter

from backend.app.api.v1.endpoints import (
    admin,
    answer,
    auth,
    config,
    course,
    document,
    plaza,
    question,
    statistics,
    student_course,
    student_question,
)

api_router = APIRouter()

api_router.include_router(auth.router, prefix="/auth", tags=["认证"])
api_router.include_router(admin.router, prefix="/admin", tags=["管理员"])
api_router.include_router(course.router, prefix="/course", tags=["课程管理"])
api_router.include_router(
    student_course.router, prefix="/student-course", tags=["学生课程"]
)
api_router.include_router(document.router, prefix="/document", tags=["文档管理"])
api_router.include_router(question.router, prefix="/question", tags=["试题集"])
api_router.include_router(
    student_question.router, prefix="/student-question", tags=["学生试题"]
)
api_router.include_router(answer.router, prefix="/answer", tags=["答案"])
api_router.include_router(plaza.router, prefix="/plaza", tags=["题目广场"])
api_router.include_router(statistics.router, prefix="/statistics", tags=["统计"])
api_router.include_router(config.router, prefix="/admin", tags=["系统配置"])
