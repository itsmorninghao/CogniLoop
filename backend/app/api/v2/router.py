"""
v2 API router — aggregates all endpoint routers.
"""

from fastapi import APIRouter

from backend.app.api.v2.endpoints.admin import router as admin_router
from backend.app.api.v2.endpoints.assistant import router as assistant_router
from backend.app.api.v2.endpoints.auth import router as auth_router
from backend.app.api.v2.endpoints.courses import router as courses_router
from backend.app.api.v2.endpoints.course_generation import router as course_generation_router
from backend.app.api.v2.endpoints.exam_templates import router as exam_templates_router
from backend.app.api.v2.endpoints.quiz_presets import router as quiz_presets_router
from backend.app.api.v2.endpoints.challenges import router as challenges_router
from backend.app.api.v2.endpoints.circles import router as circles_router
from backend.app.api.v2.endpoints.kb_plaza import router as kb_plaza_router
from backend.app.api.v2.endpoints.knowledge_bases import router as kb_router
from backend.app.api.v2.endpoints.notifications import router as notifications_router
from backend.app.api.v2.endpoints.profiles import router as profiles_router
from backend.app.api.v2.endpoints.quiz import router as quiz_router
from backend.app.api.v2.endpoints.quiz_plaza import router as quiz_plaza_router
from backend.app.api.v2.endpoints.users import router as users_router

api_v2_router = APIRouter(prefix="/api/v2")

api_v2_router.include_router(auth_router)
api_v2_router.include_router(users_router)
api_v2_router.include_router(assistant_router)
api_v2_router.include_router(challenges_router)
api_v2_router.include_router(kb_router)
api_v2_router.include_router(kb_plaza_router)
api_v2_router.include_router(circles_router)
api_v2_router.include_router(admin_router)
api_v2_router.include_router(quiz_router)
api_v2_router.include_router(quiz_plaza_router)
api_v2_router.include_router(profiles_router)
api_v2_router.include_router(notifications_router)
api_v2_router.include_router(quiz_presets_router)
api_v2_router.include_router(exam_templates_router)
api_v2_router.include_router(courses_router)
api_v2_router.include_router(course_generation_router)
