"""GAOKAO-Bench 数据导入后台任务

支持三种来源：
  1. 一键从 GitHub 下载 ZIP 并导入
  2. 服务器端目录路径（data_dir）
  3. 已上传到临时目录的 JSON 文件（tmp_dir）

进度状态存储在模块级字典（进程级缓存），供 GET /import/status 轮询。
"""

import asyncio
import json
import logging
import re
import shutil
import tempfile
import zipfile
from datetime import UTC, datetime
from pathlib import Path

import httpx
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# GitHub / 镜像源 URL 列表（按优先级排序，自动故障转移）
# ---------------------------------------------------------------------------

GITHUB_ZIP_URLS = [
    # 镜像源（国内优先）
    "https://mirror.ghproxy.com/https://github.com/itsmorninghao/GAOKAO-Bench/archive/refs/heads/main.zip",
    "https://ghfast.top/https://github.com/itsmorninghao/GAOKAO-Bench/archive/refs/heads/main.zip",
    # 官方源
    "https://github.com/itsmorninghao/GAOKAO-Bench/archive/refs/heads/main.zip",
]

DOWNLOAD_TIMEOUT = 300  # 5 分钟超时

# ---------------------------------------------------------------------------
# 进度状态（进程级，单任务）
# ---------------------------------------------------------------------------

ImportStatus = dict  # 类型别名，便于阅读

_import_state: ImportStatus = {
    "running": False,
    "phase": "idle",  # idle / downloading / extracting / importing / done
    "download_progress": 0,  # 0-100
    "download_url": None,
    "started_at": None,
    "finished_at": None,
    "total_files": 0,
    "processed_files": 0,
    "total_imported": 0,
    "total_skipped": 0,
    "current_file": None,
    "error": None,
    "log": [],  # 最近 50 条日志
    "stats": {},  # {subject: count}
}


def get_import_status() -> ImportStatus:
    return dict(_import_state)


def _log(msg: str) -> None:
    logger.info(msg)
    _import_state["log"] = ([msg] + _import_state["log"])[:50]


# ---------------------------------------------------------------------------
# 文件名 → (subject, question_type) 映射
# ---------------------------------------------------------------------------

FILENAME_MAP: dict[str, tuple[str, str]] = {
    # ---- 原始 OpenLMLab 命名 ----
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
    "Political_Science_Subjective": ("政治", "short_answer"),
    "History_Subjective": ("历史", "short_answer"),
    "Geography_Subjective": ("地理", "short_answer"),
    "Biology_Subjective": ("生物", "short_answer"),
    "Chemistry_Subjective": ("化学", "short_answer"),
    "Physics_Subjective": ("物理", "short_answer"),
    "Math_I_Subjective": ("数学（文）", "short_answer"),
    "Math_II_Subjective": ("数学（理）", "short_answer"),
    "Chinese_Subjective": ("语文", "short_answer"),
    # ---- itsmorninghao fork 命名（英语） ----
    "English_Language_Cloze_Passage": ("英语", "fill_blank"),
    "English_Language_Error_Correction": ("英语", "fill_blank"),
    # ---- itsmorninghao fork 命名（理科） ----
    "Physics_Open-ended_Questions": ("物理", "short_answer"),
    "Chemistry_Open-ended_Questions": ("化学", "short_answer"),
    "Biology_Open-ended_Questions": ("生物", "short_answer"),
    # ---- itsmorninghao fork 命名（数学） ----
    "Math_I_Open-ended_Questions": ("数学（文）", "short_answer"),
    "Math_I_Fill-in-the-Blank": ("数学（文）", "fill_blank"),
    "Math_II_Open-ended_Questions": ("数学（理）", "short_answer"),
    "Math_II_Fill-in-the-Blank": ("数学（理）", "fill_blank"),
    # ---- itsmorninghao fork 命名（文科） ----
    "History_Open-ended_Questions": ("历史", "short_answer"),
    "Geography_Open-ended_Questions": ("地理", "short_answer"),
    "Political_Science_Open-ended_Questions": ("政治", "short_answer"),
    # ---- itsmorninghao fork 命名（语文） ----
    "Chinese_Language_Practical_Text_Reading": ("语文", "short_answer"),
    "Chinese_Language_Literary_Text_Reading": ("语文", "short_answer"),
    "Chinese_Language_Language_and_Writing_Skills_Open-ended_Questions": ("语文", "short_answer"),
    "Chinese_Language_Famous_Passages_and_Sentences_Dictation": ("语文", "short_answer"),
    "Chinese_Language_Classical_Chinese_Reading": ("语文", "short_answer"),
    "Chinese_Language_Ancient_Poetry_Reading": ("语文", "short_answer"),
}


def _parse_filename(filename: str) -> tuple[str, str] | None:
    stem = Path(filename).stem
    name = re.sub(r"^\d{4}-\d{4}_", "", stem)
    return FILENAME_MAP.get(name)


def _normalize_region(category: str) -> str:
    mapping = {
        "新课标": "全国甲卷",
        "新课标ⅰ": "全国甲卷",
        "新课标i": "全国甲卷",
        "新课标1": "全国甲卷",
        "新课标ⅱ": "全国乙卷",
        "新课标ii": "全国乙卷",
        "新课标2": "全国乙卷",
        "全国甲卷": "全国甲卷",
        "全国乙卷": "全国乙卷",
        "全国丙卷": "全国丙卷",
        "全国卷ⅰ": "全国甲卷",
        "全国卷i": "全国甲卷",
        "全国卷ⅱ": "全国乙卷",
        "全国卷ii": "全国乙卷",
        "全国卷ⅲ": "全国丙卷",
        "全国卷iii": "全国丙卷",
    }
    cleaned = re.sub(r"[（）()\s]", "", category).lower()
    return mapping.get(cleaned, category.strip("（）()").strip() or "全国甲卷")


def _format_answer(answer: list | str) -> str:
    if isinstance(answer, list):
        return "、".join(str(a) for a in answer)
    return str(answer)


async def _import_single_file(
    session: AsyncSession,
    json_path: Path,
    subject: str,
    question_type: str,
    embed_service,
) -> tuple[int, int]:
    """导入单个 JSON 文件，返回 (imported, skipped)"""
    from sqlalchemy import select

    from backend.app.models.exam_paper import ExamPaper, ExamQuestion

    with open(json_path, encoding="utf-8") as f:
        data = json.load(f)

    items = data.get("example", [])
    if not items:
        return 0, 0

    paper_cache: dict[tuple[int, str], int] = {}
    imported = 0
    skipped = 0

    for item in items:
        year = int(item.get("year", 0))
        if year == 0:
            skipped += 1
            continue
        raw_category = item.get("category", "（新课标）")
        region = _normalize_region(raw_category)
        position_index = int(item.get("index", 0)) + 1
        content = item.get("question", "").strip()
        answer = _format_answer(item.get("answer", ""))
        analysis = item.get("analysis", "").strip() or None
        score = item.get("score")

        if not content:
            skipped += 1
            continue

        # 查找或创建 ExamPaper
        paper_key = (year, region)
        if paper_key not in paper_cache:
            stmt = select(ExamPaper).where(
                ExamPaper.subject == subject,
                ExamPaper.year == year,
                ExamPaper.region == region,
            )
            result = await session.execute(stmt)
            paper = result.scalar_one_or_none()
            if not paper:
                paper = ExamPaper(
                    subject=subject,
                    year=year,
                    region=region,
                    title=f"{year}年{region}{subject}",
                    source="gaokao_bench",
                )
                session.add(paper)
                await session.flush()
                await session.refresh(paper)
            paper_cache[paper_key] = paper.id

        paper_id = paper_cache[paper_key]

        # 幂等检查
        stmt = select(ExamQuestion).where(
            ExamQuestion.subject == subject,
            ExamQuestion.year == year,
            ExamQuestion.region == region,
            ExamQuestion.question_type == question_type,
            ExamQuestion.position_index == position_index,
        )
        result = await session.execute(stmt)
        if result.scalar_one_or_none():
            skipped += 1
            continue

        # Embedding（可选）
        embedding = None
        if embed_service:
            try:
                embedding = await embed_service.embed_text(content[:2000])
            except Exception as e:
                logger.warning(f"Embedding 失败: {e}")

        question = ExamQuestion(
            exam_paper_id=paper_id,
            subject=subject,
            year=year,
            region=region,
            question_type=question_type,
            position_index=position_index,
            position_label=f"第{position_index}题",
            difficulty_level="medium",
            content=content,
            answer=answer,
            analysis=analysis,
            score=float(score) if score is not None else None,
            embedding=embedding,
        )
        session.add(question)
        imported += 1

    await session.flush()
    return imported, skipped


async def _run_import_async(
    data_dir: Path,
    skip_embedding: bool,
    cleanup_tmp: bool = False,
    _managed: bool = False,
) -> None:
    """
    实际执行导入的异步函数。
    _managed=True 时 finally 块不设置 running/finished_at（由调用方管理）。
    """
    from backend.app.core.config import settings
    from backend.app.services.config_service import load_config_cache

    engine = create_async_engine(settings.database_url, echo=False, pool_pre_ping=True)
    async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    try:
        async with async_session() as session:
            await load_config_cache(session)

        embed_service = None
        if not skip_embedding:
            try:
                from backend.app.rag.embeddings import get_embedding_service

                embed_service = get_embedding_service()
                _log("✓ Embedding 服务已初始化")
            except Exception as e:
                _log(f"⚠ Embedding 初始化失败，跳过向量化: {e}")

        # 收集 JSON 文件
        json_files: list[Path] = []
        for subdir in ["Objective_Questions", "Subjective_Questions"]:
            p = data_dir / subdir
            if p.exists():
                json_files.extend(p.glob("*.json"))
        # 支持直接放在根目录的情况
        json_files.extend(f for f in data_dir.glob("*.json") if f not in json_files)

        if not json_files:
            _import_state["error"] = f"在 {data_dir} 下未找到任何 JSON 文件"
            _import_state["running"] = False
            return

        _import_state["total_files"] = len(json_files)
        _log(f"找到 {len(json_files)} 个 JSON 文件，开始导入…")

        total_imported = 0
        total_skipped = 0
        stats: dict[str, int] = {}

        async with async_session() as session:
            for i, json_path in enumerate(sorted(json_files)):
                parsed = _parse_filename(json_path.name)
                if not parsed:
                    _log(f"⚠ 无法识别文件名，跳过: {json_path.name}")
                    _import_state["processed_files"] = i + 1
                    continue

                subject, question_type = parsed
                _import_state["current_file"] = json_path.name
                _log(
                    f"[{i + 1}/{len(json_files)}] {json_path.name} → {subject} / {question_type}"
                )

                imported, skipped = await _import_single_file(
                    session, json_path, subject, question_type, embed_service
                )
                total_imported += imported
                total_skipped += skipped
                _import_state["total_imported"] = total_imported
                _import_state["total_skipped"] = total_skipped
                stats[subject] = stats.get(subject, 0) + imported
                _import_state["stats"] = stats
                _import_state["processed_files"] = i + 1

                _log(f"  ✓ 新增 {imported} 题，跳过 {skipped} 题（已存在）")

            await session.commit()

        _log(f"✅ 导入完成！共新增 {total_imported} 题，跳过 {total_skipped} 题")
        _import_state["current_file"] = None

    except Exception as e:
        _import_state["error"] = str(e)
        _log(f"❌ 导入异常: {e}")
        logger.error(f"导入异常: {e}", exc_info=True)
    finally:
        await engine.dispose()
        if cleanup_tmp and data_dir.exists():
            shutil.rmtree(data_dir, ignore_errors=True)
        if not _managed:
            _import_state["running"] = False
            _import_state["phase"] = "done"
            _import_state["finished_at"] = (
                datetime.now(UTC).replace(tzinfo=None).isoformat()
            )


def _reset_state(phase: str = "idle", download_url: str | None = None) -> None:
    _import_state.update(
        {
            "running": True,
            "phase": phase,
            "download_progress": 0,
            "download_url": download_url,
            "started_at": datetime.now(UTC).replace(tzinfo=None).isoformat(),
            "finished_at": None,
            "total_files": 0,
            "processed_files": 0,
            "total_imported": 0,
            "total_skipped": 0,
            "current_file": None,
            "error": None,
            "log": [],
            "stats": {},
        }
    )


def run_import_in_background(
    data_dir: Path,
    skip_embedding: bool = False,
    cleanup_tmp: bool = False,
) -> None:
    """同步入口，由 BackgroundTasks 在线程池中调用"""
    _reset_state(phase="importing")
    asyncio.run(_run_import_async(data_dir, skip_embedding, cleanup_tmp))


# ---------------------------------------------------------------------------
# 一键从 GitHub 下载并导入
# ---------------------------------------------------------------------------


async def _download_zip(tmp_dir: Path) -> Path:
    """
    逐个尝试 URL，下载 ZIP 到 tmp_dir/gaokao.zip。
    实时更新 _import_state["download_progress"]。
    """
    zip_path = tmp_dir / "gaokao.zip"
    last_error: Exception | None = None

    for url in GITHUB_ZIP_URLS:
        _log(f"尝试下载：{url}")
        _import_state["download_url"] = url
        try:
            async with (
                httpx.AsyncClient(
                    timeout=httpx.Timeout(DOWNLOAD_TIMEOUT),
                    follow_redirects=True,
                ) as client,
                client.stream("GET", url) as resp,
            ):
                resp.raise_for_status()
                total = int(resp.headers.get("content-length", 0))
                downloaded = 0
                with zip_path.open("wb") as f:
                    async for chunk in resp.aiter_bytes(chunk_size=65536):
                        f.write(chunk)
                        downloaded += len(chunk)
                        if total > 0:
                            _import_state["download_progress"] = min(
                                99, int(downloaded / total * 100)
                            )
            _import_state["download_progress"] = 100
            _log(f"✓ 下载完成（{downloaded / 1024 / 1024:.1f} MB）")
            return zip_path
        except Exception as e:
            last_error = e
            _log(f"✗ 下载失败：{e}，尝试下一个镜像…")
            if zip_path.exists():
                zip_path.unlink()

    raise RuntimeError(f"所有 URL 均下载失败：{last_error}")


async def _run_github_import_async(skip_embedding: bool) -> None:
    """下载 → 解压 → 导入 → 清理"""
    tmp_dir = Path(tempfile.mkdtemp(prefix="gaokao_github_"))
    try:
        # 1. 下载
        _import_state["phase"] = "downloading"
        zip_path = await _download_zip(tmp_dir)

        # 2. 解压
        _import_state["phase"] = "extracting"
        _log("解压中…")
        extract_dir = tmp_dir / "extracted"
        extract_dir.mkdir()
        with zipfile.ZipFile(zip_path, "r") as zf:
            zf.extractall(extract_dir)
        zip_path.unlink()  # 释放空间

        # 定位 Data/ 目录（ZIP 解压后通常是 GAOKAO-Bench-main/Data/）
        data_dir: Path | None = None
        for candidate in extract_dir.rglob("Objective_Questions"):
            data_dir = candidate.parent
            break
        if not data_dir:
            # 尝试直接用根目录
            data_dir = extract_dir

        _log(f"✓ 解压完成，数据目录：{data_dir}")

        # 3. 导入
        _import_state["phase"] = "importing"
        await _run_import_async(
            data_dir, skip_embedding, cleanup_tmp=False, _managed=True
        )

    except Exception as e:
        _import_state["error"] = str(e)
        _log(f"❌ 失败：{e}")
        logger.error(f"GitHub 导入失败: {e}", exc_info=True)
    finally:
        _import_state["running"] = False
        _import_state["phase"] = "done"
        _import_state["finished_at"] = (
            datetime.now(UTC).replace(tzinfo=None).isoformat()
        )
        shutil.rmtree(tmp_dir, ignore_errors=True)


def run_github_import_in_background(skip_embedding: bool = False) -> None:
    """一键从 GitHub 下载并导入，由 BackgroundTasks 调用"""
    _reset_state(phase="downloading")
    asyncio.run(_run_github_import_async(skip_embedding))
