"""Course CRUD and learning endpoints."""

from fastapi import APIRouter, Depends, File, Query, UploadFile
from sqlalchemy.ext.asyncio import AsyncSession

from backend.app.core.database import get_session
from backend.app.core.deps import get_current_user
from backend.app.models.user import User
from backend.app.schemas.course import (
    CoursePlazaItem,
    CourseListItem,
    CourseResponse,
    CourseUpdateRequest,
    GenerationStatusResponse,
    NodeContentResponse,
    NodeProgressResponse,
    NodeProgressUpdate,
)
from backend.app.services import course_service

router = APIRouter(prefix="/courses", tags=["Courses"])


@router.get("/", response_model=list[CourseListItem])
async def list_my_courses(
    limit: int = Query(default=100, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    return await course_service.list_my_courses(user, session, limit=limit, offset=offset)


@router.get("/plaza", response_model=list[CoursePlazaItem])
async def list_plaza_courses(
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    return await course_service.list_plaza_courses(session, limit=limit, offset=offset)


@router.get("/{course_id}", response_model=CourseResponse)
async def get_course(
    course_id: int,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    return await course_service.get_course_detail(course_id, user, session)


@router.patch("/{course_id}", response_model=CourseResponse)
async def update_course(
    course_id: int,
    req: CourseUpdateRequest,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    return await course_service.update_course(course_id, req, user, session)


@router.delete("/{course_id}", status_code=204)
async def delete_course(
    course_id: int,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    await course_service.delete_course(course_id, user, session)


@router.post("/{course_id}/cover", response_model=CourseResponse)
async def upload_cover(
    course_id: int,
    file: UploadFile = File(...),
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    return await course_service.upload_cover(course_id, file, user, session)


@router.post("/{course_id}/publish", response_model=CourseResponse)
async def toggle_publish(
    course_id: int,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    return await course_service.toggle_publish(course_id, user, session)


@router.get("/{course_id}/nodes/{node_id}", response_model=NodeContentResponse)
async def get_node_content(
    course_id: int,
    node_id: int,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    return await course_service.get_node_content(course_id, node_id, user, session)


@router.post("/{course_id}/nodes/{node_id}/progress", response_model=NodeProgressResponse)
async def update_node_progress(
    course_id: int,
    node_id: int,
    req: NodeProgressUpdate,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    return await course_service.update_node_progress(course_id, node_id, req, user, session)


@router.get("/{course_id}/generation-status", response_model=GenerationStatusResponse)
async def get_generation_status(
    course_id: int,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    return await course_service.get_generation_status(course_id, user, session)
