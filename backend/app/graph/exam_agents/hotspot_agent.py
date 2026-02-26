"""HotspotAgent —— RSS 聚合热点新闻，提炼适合出题的社会热点"""

import asyncio
import hashlib
import json
import logging
import re
import time
from datetime import UTC, datetime, timedelta

import httpx
from langchain_openai import ChatOpenAI

from backend.app.graph.exam_agents.schemas import HotspotItem, HotspotResult
from backend.app.services.config_service import get_agent_llm_config, get_config_int

logger = logging.getLogger(__name__)

# RSS 源：官方媒体，政治中立、内容可靠
RSS_FEEDS = [
    ("人民日报", "http://www.people.com.cn/rss/politics.xml"),
    ("新华社", "http://www.xinhuanet.com/rss/news.xml"),
    ("央视新闻", "http://rss.cctv.com/2006/09/25/ARTI1159166868368880.xml"),
    ("经济日报", "http://www.ce.cn/rss/sy.xml"),
]

# 简单内存缓存（进程级）
_hotspot_cache: dict[str, tuple[float, HotspotResult]] = {}


def _cache_key(subjects: list[str], threshold_days: int) -> str:
    raw = f"{sorted(subjects)}-{threshold_days}"
    return hashlib.md5(raw.encode()).hexdigest()


def _is_cache_valid(key: str, ttl: int) -> bool:
    if key not in _hotspot_cache:
        return False
    cached_at, _ = _hotspot_cache[key]
    return (time.time() - cached_at) < ttl


async def _fetch_rss(url: str, timeout: int = 10) -> list[str]:
    """拉取单个 RSS 源，提取 <title> 和 <description> 文本"""
    try:
        async with httpx.AsyncClient(timeout=timeout, follow_redirects=True) as client:
            resp = await client.get(url)
            resp.raise_for_status()
            text = resp.text

        titles = re.findall(
            r"<title><!\[CDATA\[(.*?)\]\]></title>|<title>(.*?)</title>", text
        )
        descs = re.findall(
            r"<description><!\[CDATA\[(.*?)\]\]></description>|<description>(.*?)</description>",
            text,
        )

        items: list[str] = []
        for t_pair, d_pair in zip(titles[1:], descs[1:]):  # 跳过频道标题
            title = (t_pair[0] or t_pair[1]).strip()
            desc = (d_pair[0] or d_pair[1]).strip()[:200]
            if title:
                items.append(f"{title}：{desc}" if desc else title)
        return items[:15]  # 每个源最多 15 条
    except Exception as e:
        logger.warning(f"RSS 拉取失败 [{url}]: {e}")
        return []


async def _llm_extract_hotspots(
    llm: ChatOpenAI,
    model_name: str,
    headlines: list[str],
    subjects: list[str],
    threshold_days: int,
    tracer=None,
) -> HotspotResult:
    subjects_str = "、".join(subjects)
    headlines_text = "\n".join(f"- {h}" for h in headlines[:60])

    prompt = f"""以下是最近 {threshold_days} 天的主要新闻标题和摘要，请从中筛选 5-8 条**最适合在高考{subjects_str}试卷中作为命题素材**的热点，
按以下 JSON 格式输出，不要有其他内容：

{{
  "items": [
    {{
      "topic": "热点主题（10字内）",
      "summary": "适合命题的背景摘要（50字内）",
      "applicable_subjects": ["政治", "地理"],
      "applicable_question_types": ["single_choice", "short_answer"],
      "applicable_knowledge_points": ["货币政策", "宏观调控"]
    }}
  ]
}}

新闻列表：
{headlines_text}"""

    span_id = None
    if tracer is not None:
        span_id = tracer.start_span(
            agent="HotspotAgent",
            model=model_name,
            system_prompt="（无系统提示词，仅用户消息）",
            user_prompt=prompt,
        )

    try:
        resp = await llm.ainvoke([{"role": "user", "content": prompt}])
        raw = resp.content.strip()
        if tracer is not None and span_id:
            tracer.end_span(span_id, output=raw)
        m = re.search(r"\{.*\}", raw, re.DOTALL)
        if not m:
            raise ValueError("LLM 未返回有效 JSON")
        data = json.loads(m.group(0))
        items = [HotspotItem(**item) for item in data.get("items", [])]
        return HotspotResult(items=items)
    except Exception as e:
        logger.error(f"LLM 提炼热点失败: {e}")
        if tracer is not None and span_id:
            tracer.end_span(span_id, error=str(e))
        return HotspotResult(items=[])


class HotspotAgent:
    def __init__(self) -> None:
        cfg = get_agent_llm_config("hotspot")
        self.model_name = cfg["model"]
        self.llm = ChatOpenAI(
            api_key=cfg["api_key"],
            base_url=cfg["base_url"],
            model=cfg["model"],
            temperature=0.3,
        )

    async def run(
        self,
        subjects: list[str],
        threshold_days: int | None = None,
        tracer=None,
    ) -> HotspotResult:
        threshold_days = threshold_days or get_config_int(
            "exam_agent_hotspot_threshold_days"
        )
        ttl = get_config_int("exam_agent_hotspot_cache_ttl")
        cache_key = _cache_key(subjects, threshold_days)

        if _is_cache_valid(cache_key, ttl):
            logger.info("HotspotAgent: 命中缓存")
            return _hotspot_cache[cache_key][1]

        logger.info(f"HotspotAgent: 拉取 {len(RSS_FEEDS)} 个 RSS 源...")
        tasks = [_fetch_rss(url) for _, url in RSS_FEEDS]
        results = await asyncio.gather(*tasks, return_exceptions=True)

        headlines: list[str] = []
        for feed_result in results:
            if isinstance(feed_result, list):
                headlines.extend(feed_result)

        if not headlines:
            logger.warning("HotspotAgent: 所有 RSS 源均失败，返回空热点")
            return HotspotResult(items=[])

        # 简单去重（哈希前50字）
        seen: set[str] = set()
        deduped: list[str] = []
        for h in headlines:
            key = h[:50]
            if key not in seen:
                seen.add(key)
                deduped.append(h)

        logger.info(f"HotspotAgent: 共收集 {len(deduped)} 条去重新闻，交给 LLM 提炼")
        result = await _llm_extract_hotspots(
            self.llm, self.model_name, deduped, subjects, threshold_days, tracer=tracer
        )

        _hotspot_cache[cache_key] = (time.time(), result)
        logger.info(f"HotspotAgent: 提炼出 {len(result.items)} 条热点")
        return result
