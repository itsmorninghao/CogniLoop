"""文档管理相关 API"""

from fastapi import APIRouter, File, Form, HTTPException, UploadFile, status

from backend.app.api.v1.deps import CurrentTeacher, SessionDep
from backend.app.rag.processor import DocumentProcessor
from backend.app.schemas.document import (
    ChunkResponse,
    DocumentListResponse,
    DocumentResponse,
)
from backend.app.services.course_service import CourseService
from backend.app.services.document_service import DocumentService

router = APIRouter()


@router.post("/upload", response_model=DocumentResponse)
async def upload_document(
    session: SessionDep,
    teacher: CurrentTeacher,
    file: UploadFile = File(...),
    course_id: int = Form(...),
    subject: str | None = Form(None),
    chapter_id: int | None = Form(None),
) -> DocumentResponse:
    """上传文档并自动处理"""
    # 验证课程权限
    course_service = CourseService(session)
    course = await course_service.verify_teacher_owns_course(course_id, teacher.id)
    if not course:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="课程不存在或无权访问",
        )

    document_service = DocumentService(session)
    try:
        document = await document_service.upload_document(
            file=file,
            course_id=course_id,
            subject=subject,
            chapter_id=chapter_id,
        )

        # 异步处理文档（在后台生成向量）
        processor = DocumentProcessor(session)
        await processor.process_document(document.id)

        # 刷新获取最新状态
        await session.refresh(document)
        return DocumentResponse.model_validate(document)
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )


@router.get("/list", response_model=DocumentListResponse)
async def list_documents(
    course_id: int,
    session: SessionDep,
    teacher: CurrentTeacher,
) -> DocumentListResponse:
    """获取课程下的文档列表"""
    # 验证课程权限
    course_service = CourseService(session)
    course = await course_service.verify_teacher_owns_course(course_id, teacher.id)
    if not course:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="课程不存在或无权访问",
        )

    document_service = DocumentService(session)
    documents = await document_service.get_course_documents(course_id)
    return DocumentListResponse(
        documents=[DocumentResponse.model_validate(d) for d in documents],
        total=len(documents),
    )


@router.delete("/{document_id}")
async def delete_document(
    document_id: int,
    session: SessionDep,
    teacher: CurrentTeacher,
) -> dict:
    """删除文档及知识块"""
    document_service = DocumentService(session)

    # 验证权限
    document = await document_service.verify_teacher_owns_document(
        document_id, teacher.id
    )
    if not document:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="文档不存在或无权访问",
        )

    success = await document_service.delete_document(document_id)
    if not success:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="删除失败",
        )
    return {"message": "删除成功"}


@router.get("/{document_id}/chunks", response_model=list[ChunkResponse])
async def get_document_chunks(
    document_id: int,
    session: SessionDep,
    teacher: CurrentTeacher,
) -> list[ChunkResponse]:
    """查询文档的知识块"""
    document_service = DocumentService(session)

    # 验证权限
    document = await document_service.verify_teacher_owns_document(
        document_id, teacher.id
    )
    if not document:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="文档不存在或无权访问",
        )

    chunks = await document_service.get_document_chunks(document_id)
    return [ChunkResponse.model_validate(c) for c in chunks]
