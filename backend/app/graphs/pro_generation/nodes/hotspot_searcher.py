import asyncio
import json
import logging
import xml.etree.ElementTree as ET

import httpx
from langchain_core.messages import HumanMessage, SystemMessage

from backend.app.core.database import async_session_factory
from backend.app.core.llm import get_node_chat_model
from backend.app.core.sse import emit_node_complete, emit_node_start
from backend.app.graphs.pro_generation.state import ProQuizState

logger = logging.getLogger(__name__)

DEFAULT_RSS_FEEDS = [
    "https://feedx.net/rss/people.xml",
    "https://feedx.net/rss/jingjiribao.xml",
    "https://feedx.net/rss/chinadaily.xml",
    "https://feedx.net/rss/zaobao.xml",
]

_RSS_CACHE_KEY = "hotspot_rss_headlines"
_RSS_CACHE_TTL = 1800  # 30 minutes


async def _fetch_feed(client: httpx.AsyncClient, url: str) -> list[tuple[str, str]]:
    """Fetch one RSS feed and return (title, description) pairs."""
    try:
        resp = await client.get(url, timeout=8, follow_redirects=True)
        resp.raise_for_status()
        root = ET.fromstring(resp.text)
        items: list[tuple[str, str]] = []
        for item in root.iter("item"):
            title = (item.findtext("title") or "").strip()
            desc = (item.findtext("description") or "").strip()
            if title:
                items.append((title, desc))
        return items
    except Exception as e:
        logger.debug("RSS feed %s failed: %s", url, e)
        return []


async def _fetch_all_headlines(feed_urls: list[str]) -> list[dict]:
    """Concurrently fetch all feeds and return deduplicated headlines."""
    async with httpx.AsyncClient() as client:
        results = await asyncio.gather(
            *[_fetch_feed(client, url) for url in feed_urls],
            return_exceptions=True,
        )

    seen: set[str] = set()
    headlines: list[dict] = []
    for result in results:
        if isinstance(result, Exception):
            continue
        for title, desc in result:
            key = title[:50]
            if key not in seen:
                seen.add(key)
                headlines.append({"title": title, "desc": desc})
            if len(headlines) >= 50:
                return headlines
    return headlines


async def _get_cached_headlines() -> list[dict] | None:
    """Try to load headlines from Redis cache. Returns None if cache miss or Redis unavailable."""
    try:
        from backend.app.core.redis_pubsub import get_redis

        data = await get_redis().get(_RSS_CACHE_KEY)
        if data:
            return json.loads(data)
    except Exception as e:
        logger.debug("Redis cache read failed: %s", e)
    return None


async def _set_cached_headlines(headlines: list[dict]) -> None:
    """Write headlines to Redis cache. Silently ignores errors."""
    try:
        from backend.app.core.redis_pubsub import get_redis

        await get_redis().set(_RSS_CACHE_KEY, json.dumps(headlines), ex=_RSS_CACHE_TTL)
    except Exception as e:
        logger.debug("Redis cache write failed: %s", e)


async def hotspot_searcher_node(state: ProQuizState) -> dict:
    """Fetch recent news from RSS feeds and use LLM to select subject-relevant hotspots."""
    session_id = state.get("session_id", "")
    await emit_node_start(session_id, "hotspot_searcher", "正在检索时事热点...")

    # Respect user toggle — default True
    use_hotspot = state.get("quiz_config", {}).get("use_hotspot", True)
    if not use_hotspot:
        await emit_node_complete(
            session_id,
            "hotspot_searcher",
            "已跳过时事热点（用户已关闭）",
            input_summary={"use_hotspot": False},
            output_summary={"count": 0},
            progress=0.12,
        )
        return {"hotspot_items": []}

    subject = state.get("subject_scope", "综合")
    total_q = sum(state.get("target_count", {}).values())
    n_items = max(total_q, 3)

    # --- Step 1: Collect RSS feed URLs (default + admin-configured extra) ---
    feed_urls = list(DEFAULT_RSS_FEEDS)
    extra_urls: list[str] = []
    try:
        async with async_session_factory() as session:
            from backend.app.services.config_service import get_config

            extra_raw = await get_config("HOTSPOT_RSS_EXTRA", session)
            if extra_raw:
                extra_urls = [u.strip() for u in extra_raw.split(",") if u.strip()]
                feed_urls.extend(extra_urls)
    except Exception as e:
        logger.debug("Failed to read HOTSPOT_RSS_EXTRA config: %s", e)

    # --- Step 2: Get headlines (cache first, then fresh fetch) ---
    cache_hit = False
    headlines = await _get_cached_headlines()
    if headlines is not None:
        cache_hit = True
        logger.info("hotspot_searcher: using cached %d headlines", len(headlines))
    else:
        headlines = await _fetch_all_headlines(feed_urls)
        if headlines:
            await _set_cached_headlines(headlines)
        logger.info(
            "hotspot_searcher: fetched %d headlines from %d feeds",
            len(headlines),
            len(feed_urls),
        )

    # --- Step 3: LLM filtering or fallback ---
    hotspot_items: list[str] = []
    llm_sys_content: str = ""
    llm_usr_content: str = ""
    llm_raw_output: str = ""

    if headlines:
        # Build the headlines text block (max 50, each capped at 200 chars)
        headlines_text = "\n".join(
            f"【{h['title']}】{h['desc']}"[:200] for h in headlines[:50]
        )
        n_headlines = len(headlines[:50])

        llm_sys_content = (
            f"你是一个学科出题热点素材筛选专家。\n"
            f"请从以下真实新闻标题和摘要中，筛选出最适合在【{subject}】学科考试中"
            f"作为出题背景材料的条目，整理成 {n_items} 条简洁的事件背景描述"
            f"（每条 1-3 句话，突出与该学科的关联，保留具体时间/地名/数据等真实细节）。\n"
            f"以 JSON 数组形式输出：[\"背景描述1\", \"背景描述2\", ...]\n"
            f"只输出 JSON，不要其他文字。"
        )
        llm_usr_content = (
            f"出题学科/领域：{subject}\n\n"
            f"近期官方新闻（共 {n_headlines} 条）：\n{headlines_text}"
        )

        try:
            async with async_session_factory() as session:
                llm = await get_node_chat_model("hotspot_searcher", session)

            response = await llm.ainvoke(
                [
                    SystemMessage(content=llm_sys_content),
                    HumanMessage(content=llm_usr_content),
                ]
            )
            llm_raw_output = str(response.content).strip()
            raw = llm_raw_output
            if raw.startswith("```"):
                raw = raw.split("```")[1]
                if raw.startswith("json"):
                    raw = raw[4:]
            parsed = json.loads(raw.strip())
            if isinstance(parsed, list):
                hotspot_items = [str(item) for item in parsed if item]
        except Exception as e:
            logger.warning("hotspot_searcher LLM filtering failed: %s", e)

    # --- Step 4: Fallback — original LLM self-generation ---
    if not hotspot_items:
        logger.info("hotspot_searcher: falling back to LLM self-generation (no headlines or LLM failed)")
        llm_sys_content = (
            "你是一个时事热点追踪专家。请根据用户指定的【学科/知识范围】，"
            f"想出或搜索出 **{n_items} 个最近2年内相关的真实社会热点、科技突破、或有趣味性与教育意义的事件**。\n"
            "每条热点独立成段，格式要求：\n"
            "- 每条只写事件背景描述（1-3句话），不加编号和标题\n"
            "- 以 JSON 数组形式输出，例如：\n"
            '["事件背景描述1", "事件背景描述2", ...]'
        )
        llm_usr_content = f"我的出题领域范围是: {subject}"
        try:
            async with async_session_factory() as session:
                llm = await get_node_chat_model("hotspot_searcher", session)
            response = await llm.ainvoke(
                [
                    SystemMessage(content=llm_sys_content),
                    HumanMessage(content=llm_usr_content),
                ]
            )
            llm_raw_output = str(response.content).strip()
            raw = llm_raw_output
            if raw.startswith("```"):
                raw = raw.split("```")[1]
                if raw.startswith("json"):
                    raw = raw[4:]
            parsed = json.loads(raw.strip())
            if isinstance(parsed, list):
                hotspot_items = [str(item) for item in parsed if item]
        except Exception as e:
            logger.warning("hotspot_searcher fallback LLM also failed (%s), trying plaintext split", e)
            try:
                lines = [ln.strip() for ln in str(response.content).splitlines() if ln.strip()]  # type: ignore[possibly-undefined]
                hotspot_items = lines if lines else []
            except Exception:
                pass

    if not hotspot_items:
        hotspot_items = ["（热点素材获取失败，请以常规方式出题，无需强行融入时事背景）"]

    input_summary: dict = {
        "subject": subject,
        "requested_count": n_items,
        "rss_feed_count": len(feed_urls),
        "cache_hit": cache_hit,
    }
    if llm_sys_content:
        input_summary["system_prompt"] = llm_sys_content[:3000]
    if llm_usr_content:
        input_summary["user_prompt"] = llm_usr_content[:2000]

    output_summary: dict = {
        "count": len(hotspot_items),
        "headlines_fetched": len(headlines),
        "rss_feed_count": len(feed_urls) if not cache_hit else 0,
        "items": [item[:100] for item in hotspot_items[:5]],
    }
    if llm_raw_output:
        output_summary["llm_output"] = llm_raw_output[:2000]

    await emit_node_complete(
        session_id,
        "hotspot_searcher",
        f"已获取 {len(hotspot_items)} 条 {subject} 领域热点素材",
        input_summary=input_summary,
        output_summary=output_summary,
        progress=0.12,
    )

    return {"hotspot_items": hotspot_items}
