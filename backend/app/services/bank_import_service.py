"""Bank import service — handles importing JSON files into BankQuestion."""

import json
import logging
import re
import shutil
import tempfile
import uuid
import zipfile
from pathlib import Path
from typing import Any

import httpx
from fastapi import UploadFile
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.app.core.llm import get_embeddings_model
from backend.app.models.bank_question import BankQuestion
from backend.app.models.knowledge_base import KnowledgeBase

logger = logging.getLogger(__name__)

MAX_DOWNLOAD_SIZE = 200 * 1024 * 1024  # 200MB
MAX_FILE_COUNT = 500
TEMP_BASE = Path(tempfile.gettempdir()) / "cogniloop_bank_import"

FILENAME_MAP: dict[str, tuple[str, str]] = {
    # Objective questions
    "Political_Science_MCQs": ("政治", "single_choice"),
    "History_MCQs": ("历史", "single_choice"),
    "Geography_MCQs": ("地理", "single_choice"),
    "Biology_MCQs": ("生物", "single_choice"),
    "Chemistry_MCQs": ("化学", "single_choice"),
    "Physics_MCQs": ("物理", "single_choice"),
    "Math_I_MCQs": ("数学（文）", "single_choice"),
    "Math_II_MCQs": ("数学（理）", "single_choice"),
    "Chinese_Lang_and_Usage_MCQs": ("语文", "single_choice"),
    "Chinese_Modern_Lit": ("语文", "short_answer"),
    "English_MCQs": ("英语", "single_choice"),
    "English_Reading_Comp": ("英语", "short_answer"),
    "English_Fill_in_Blanks": ("英语", "fill_blank"),
    "English_Cloze_Test": ("英语", "fill_blank"),
    # Legacy subjective (kept for compat)
    "Political_Science_Subjective": ("政治", "short_answer"),
    "History_Subjective": ("历史", "short_answer"),
    "Geography_Subjective": ("地理", "short_answer"),
    "Biology_Subjective": ("生物", "short_answer"),
    "Chemistry_Subjective": ("化学", "short_answer"),
    "Physics_Subjective": ("物理", "short_answer"),
    "Math_I_Subjective": ("数学（文）", "short_answer"),
    "Math_II_Subjective": ("数学（理）", "short_answer"),
    "Chinese_Subjective": ("语文", "short_answer"),
    # Subjective questions
    "Biology_Open-ended_Questions": ("生物", "short_answer"),
    "Chemistry_Open-ended_Questions": ("化学", "short_answer"),
    "Physics_Open-ended_Questions": ("物理", "short_answer"),
    "Geography_Open-ended_Questions": ("地理", "short_answer"),
    "History_Open-ended_Questions": ("历史", "short_answer"),
    "Political_Science_Open-ended_Questions": ("政治", "short_answer"),
    "Math_I_Open-ended_Questions": ("数学（文）", "short_answer"),
    "Math_II_Open-ended_Questions": ("数学（理）", "short_answer"),
    "Math_I_Fill-in-the-Blank": ("数学（文）", "fill_blank"),
    "Math_II_Fill-in-the-Blank": ("数学（理）", "fill_blank"),
    "Chinese_Language_Ancient_Poetry_Reading": ("语文", "short_answer"),
    "Chinese_Language_Classical_Chinese_Reading": ("语文", "short_answer"),
    "Chinese_Language_Famous_Passages_and_Sentences_Dictation": ("语文", "fill_blank"),
    "Chinese_Language_Language_and_Writing_Skills_Open-ended_Questions": (
        "语文",
        "short_answer",
    ),
    "Chinese_Language_Literary_Text_Reading": ("语文", "short_answer"),
    "Chinese_Language_Practical_Text_Reading": ("语文", "short_answer"),
    "English_Language_Error_Correction": ("英语", "short_answer"),
    "English_Language_Cloze_Passage": ("英语", "fill_blank"),
}


def _parse_filename(filename: str) -> tuple[str, str] | None:
    stem = Path(filename).stem
    name = re.sub(r"^\d{4}-\d{4}_", "", stem)
    return FILENAME_MAP.get(name)


def _format_answer(answer: Any) -> str:
    if isinstance(answer, list):
        return "、".join(str(a) for a in answer)
    return str(answer)


async def import_json_files(
    session: AsyncSession,
    kb_id: int,
    files: list[UploadFile],
    override_subject: str | None = None,
    override_question_type: str | None = None,
) -> dict[str, Any]:
    """Import multiple JSON files into the BankQuestion table.
    Expects standard format: {"example": [{"question": "...", "answer": "...", ...}]}
    """
    total_imported = 0
    total_skipped = 0
    errors = []

    try:
        embed_service = await get_embeddings_model(session)
    except Exception as e:
        logger.warning(f"Embedding service init failed: {e}")
        embed_service = None

    # Pre-fetch all existing question contents for this KB to avoid N+1 queries.
    existing_result = await session.execute(
        select(BankQuestion.content).where(BankQuestion.knowledge_base_id == kb_id)
    )
    existing_contents: set[str] = {row[0] for row in existing_result.all()}

    for file in files:
        try:
            content = await file.read()
            data = json.loads(content)
            items = data.get("example", [])

            if not items:
                # Support direct array format as fallback
                if isinstance(data, list):
                    items = data
                else:
                    errors.append(
                        f"{file.filename}: No 'example' array found or not a JSON array."
                    )
                    continue

            # Determine subject and type
            subject = override_subject
            qtype = override_question_type

            if not subject or not qtype:
                parsed = _parse_filename(file.filename)
                if parsed:
                    if not subject:
                        subject = parsed[0]
                    if not qtype:
                        qtype = parsed[1]
                else:
                    # Fallback defaults if cannot parse
                    if not subject:
                        subject = "综合"
                    if not qtype:
                        qtype = "short_answer"

            for item in items:
                question_text = str(item.get("question", "")).strip()
                answer_text = _format_answer(item.get("answer", ""))
                analysis_text = item.get("analysis", "")
                if not analysis_text:
                    analysis_text = None
                else:
                    analysis_text = str(analysis_text).strip()

                difficulty = str(item.get("difficulty", "medium"))

                source_info = {}
                for k in ["year", "category", "index", "score"]:
                    if k in item:
                        source_info[k] = item[k]

                if not question_text:
                    total_skipped += 1
                    continue

                # Deduplication check using pre-fetched set (avoids N+1 queries)
                if question_text in existing_contents:
                    total_skipped += 1
                    continue

                # Generate embedding for retrieval
                embedding = None
                if embed_service:
                    try:
                        embed_text = f"Question: {question_text}\nAnswer: {answer_text}"
                        # aembed_documents expects a list, returns a list of vectors
                        # we take the first item
                        vectors = await embed_service.aembed_documents(
                            [embed_text[:2000]]
                        )
                        if vectors:
                            embedding = vectors[0]
                    except Exception as e:
                        logger.warning(f"Embedding failed for question: {e}")

                bank_q = BankQuestion(
                    knowledge_base_id=kb_id,
                    question_type=qtype,
                    subject=subject,
                    difficulty=difficulty,
                    knowledge_points=None,
                    content=question_text,
                    answer=answer_text,
                    analysis=analysis_text,
                    source_info=source_info,
                    embedding=embedding,
                )
                session.add(bank_q)
                existing_contents.add(question_text)  # prevent intra-batch duplicates
                total_imported += 1

        except json.JSONDecodeError:
            errors.append(f"{file.filename}: Invalid JSON format.")
        except Exception as e:
            errors.append(f"{file.filename}: Unexpected error: {str(e)}")
            logger.error(f"Error importing {file.filename}: {e}", exc_info=True)

    # Update document_count in knowledge_base
    stmt = select(KnowledgeBase).where(KnowledgeBase.id == kb_id)
    kb = (await session.execute(stmt)).scalar_one_or_none()
    if kb:
        kb.document_count = (kb.document_count or 0) + total_imported

    await session.commit()
    return {"imported": total_imported, "skipped": total_skipped, "errors": errors}


async def _download_github_zip(url: str, dest_dir: Path) -> Path:
    """Convert GitHub repo URL to ZIP download URL and download."""
    match = re.match(r"https?://github\.com/([^/]+)/([^/]+?)(?:\.git)?(?:/.*)?$", url)
    if not match:
        raise ValueError("不支持的 URL 格式，请提供 GitHub 仓库地址")

    owner, repo = match.groups()
    zip_url = f"https://github.com/{owner}/{repo}/archive/refs/heads/main.zip"

    zip_path = dest_dir / "repo.zip"
    async with httpx.AsyncClient(follow_redirects=True, timeout=60) as client:
        async with client.stream("GET", zip_url) as resp:
            resp.raise_for_status()
            total = 0
            with open(zip_path, "wb") as f:
                async for chunk in resp.aiter_bytes(8192):
                    total += len(chunk)
                    if total > MAX_DOWNLOAD_SIZE:
                        raise ValueError(
                            f"下载超过 {MAX_DOWNLOAD_SIZE // 1024 // 1024}MB 限制"
                        )
                    f.write(chunk)
    return zip_path


def _safe_extract_zip(zip_path: Path, dest: Path) -> None:
    """Extract ZIP with security checks: path traversal, file count, size."""
    dest.mkdir(parents=True, exist_ok=True)

    with zipfile.ZipFile(zip_path, "r") as zf:
        if len(zf.namelist()) > MAX_FILE_COUNT:
            raise ValueError(f"压缩包包含超过 {MAX_FILE_COUNT} 个文件")

        for info in zf.infolist():
            if info.is_dir():
                continue

            # Path traversal prevention
            target = (dest / info.filename).resolve()
            if not str(target).startswith(str(dest.resolve())):
                raise ValueError(f"检测到路径穿越攻击: {info.filename}")

            # Size check per file
            if info.file_size > 100 * 1024 * 1024:
                continue

            # Only extract .json files
            if not info.filename.lower().endswith(".json"):
                continue

            target.parent.mkdir(parents=True, exist_ok=True)
            with zf.open(info) as src, open(target, "wb") as dst:
                dst.write(src.read())


def _scan_json_files(content_dir: Path) -> list[dict]:
    """Walk content_dir, find JSON files in standard question bank format."""
    results = []
    for json_path in sorted(content_dir.rglob("*.json")):
        try:
            data = json.loads(json_path.read_text(encoding="utf-8"))
            items = data.get("example", []) if isinstance(data, dict) else []
            if not items and isinstance(data, list):
                items = data
            if not items or not isinstance(items, list):
                continue

            first = items[0]
            if not isinstance(first, dict) or "question" not in first:
                continue

            parsed = _parse_filename(json_path.name)
            subject = parsed[0] if parsed else "综合"
            qtype = parsed[1] if parsed else "short_answer"

            sample = str(first.get("question", ""))[:120]

            results.append(
                {
                    "filename": json_path.name,
                    "relative_path": str(json_path.relative_to(content_dir)),
                    "subject": subject,
                    "question_type": qtype,
                    "question_count": len(items),
                    "sample": sample,
                }
            )
        except (json.JSONDecodeError, UnicodeDecodeError):
            continue

    return results


async def scan_archive(
    url: str | None = None,
    zip_file: UploadFile | None = None,
) -> dict:
    """Download/extract archive, scan for question bank JSON files.

    Returns dict with scan_id and list of discovered files.
    """
    scan_id = str(uuid.uuid4())
    extract_dir = TEMP_BASE / scan_id
    extract_dir.mkdir(parents=True, exist_ok=True)

    try:
        if url:
            zip_path = await _download_github_zip(url, extract_dir)
        elif zip_file:
            zip_path = extract_dir / "upload.zip"
            content = await zip_file.read()
            if len(content) > MAX_DOWNLOAD_SIZE:
                raise ValueError("文件超过 200MB 限制")
            zip_path.write_bytes(content)
        else:
            raise ValueError("必须提供 URL 或 ZIP 文件")

        _safe_extract_zip(zip_path, extract_dir / "content")
        zip_path.unlink(missing_ok=True)

        files = _scan_json_files(extract_dir / "content")
        return {"scan_id": scan_id, "files": files}

    except Exception:
        shutil.rmtree(extract_dir, ignore_errors=True)
        raise


async def import_from_scan(
    session: AsyncSession,
    kb_id: int,
    scan_id: str,
    selected_files: list[str],
) -> dict[str, Any]:
    """Import selected JSON files from a previous scan."""
    try:
        uuid.UUID(scan_id)
    except ValueError:
        raise ValueError("无效的 scan_id")

    content_dir = TEMP_BASE / scan_id / "content"
    if not content_dir.exists():
        raise ValueError("扫描结果已过期，请重新扫描")

    class _FakeUploadFile:
        def __init__(self, filename: str, content: bytes):
            self.filename = filename
            self._content = content

        async def read(self) -> bytes:
            return self._content

    files = []
    for rel_path in selected_files:
        full_path = (content_dir / rel_path).resolve()
        if not str(full_path).startswith(str(content_dir.resolve())):
            continue
        if not full_path.exists():
            continue
        files.append(_FakeUploadFile(full_path.name, full_path.read_bytes()))

    result = await import_json_files(session, kb_id, files)  # type: ignore[arg-type]

    # Cleanup temp directory
    shutil.rmtree(TEMP_BASE / scan_id, ignore_errors=True)

    return result
