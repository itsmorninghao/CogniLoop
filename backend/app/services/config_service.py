"""系统配置服务

设计思路：
- 配置存储在数据库 system_configs 表中，支持管理员在线修改
- 使用模块级内存缓存实现热生效，避免每次读取都查库
- 应用启动时从数据库加载缓存；管理员修改配置时同步刷新缓存
- 配置变更自动记录审计日志
- 首次部署后，管理员通过后台「系统配置」页面填写 LLM/Embedding/RAG 参数
"""

import logging
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.app.models.system_config import ConfigAuditLog, SystemConfig

logger = logging.getLogger(__name__)


CONFIG_DEFINITIONS: dict[str, dict[str, Any]] = {
    # ---- LLM 模型配置----
    "openai_api_key": {
        "group": "llm",
        "label": "API Key",
        "type": "string",
        "default": "",
        "description": "大语言模型的 API 密钥",
    },
    "openai_base_url": {
        "group": "llm",
        "label": "API Base URL",
        "type": "string",
        "default": "https://api.openai.com/v1",
        "description": "大语言模型的 API 地址（支持 OpenAI 兼容接口）",
    },
    "openai_model": {
        "group": "llm",
        "label": "模型名称",
        "type": "string",
        "default": "gpt-4o-mini",
        "description": "使用的模型名称，如 gpt-4o-mini、deepseek-v3 等",
    },
    # ---- Embedding 模型配置----
    "embedding_api_key": {
        "group": "embedding",
        "label": "API Key",
        "type": "string",
        "default": "",
        "description": "向量模型的 API 密钥",
    },
    "embedding_base_url": {
        "group": "embedding",
        "label": "API Base URL",
        "type": "string",
        "default": "https://api.openai.com/v1",
        "description": "向量模型的 API 地址",
    },
    "embedding_model": {
        "group": "embedding",
        "label": "模型名称",
        "type": "string",
        "default": "text-embedding-3-small",
        "description": "使用的向量模型名称",
    },
    "embedding_dims": {
        "group": "embedding",
        "label": "向量维度",
        "type": "integer",
        "default": "1536",
        "description": "向量模型输出的维度（更换模型时可能需要修改）",
    },
    # ---- RAG 配置----
    "chunk_size": {
        "group": "rag",
        "label": "分块大小",
        "type": "integer",
        "default": "500",
        "description": "文档分块时每个块的最大字符数",
    },
    "chunk_overlap": {
        "group": "rag",
        "label": "分块重叠",
        "type": "integer",
        "default": "50",
        "description": "相邻文档块之间的重叠字符数",
    },
    "retrieval_top_k": {
        "group": "rag",
        "label": "检索数量",
        "type": "integer",
        "default": "10",
        "description": "知识检索时返回的最相似文档块数量",
    },
    # ---- 仿高考组卷 Multi-Agent 配置 ----
    "exam_agent_solve_count": {
        "group": "exam_agent",
        "label": "SolveAgent 试做次数 K",
        "type": "integer",
        "default": "5",
        "description": "每道题并行模拟作答的次数，越多难度评估越准确，但 Token 消耗越高",
    },
    "exam_agent_max_retry": {
        "group": "exam_agent",
        "label": "单题最大重试次数",
        "type": "integer",
        "default": "3",
        "description": "质检失败或难度不达标时的最大重试次数（质检与难度共用计数器）",
    },
    "exam_agent_concurrency": {
        "group": "exam_agent",
        "label": "并发窗口大小",
        "type": "integer",
        "default": "8",
        "description": "同时处理的题目数，调高可加速但会增加 API 并发压力（建议按 API 等级调整）",
    },
    "exam_agent_fewshot_count": {
        "group": "exam_agent",
        "label": "Few-shot 样本数量",
        "type": "integer",
        "default": "3",
        "description": "每道题注入的历年同位置真题样本数量",
    },
    # ---- 各 Agent 独立 LLM 配置（留空则回退到全局 LLM 配置） ----
    "exam_agent_question_api_key": {
        "group": "exam_agent_llm",
        "label": "出题 Agent · API Key",
        "type": "password",
        "default": "",
        "description": "QuestionAgent 使用的 API Key（留空则使用全局 LLM Key）",
    },
    "exam_agent_question_base_url": {
        "group": "exam_agent_llm",
        "label": "出题 Agent · Base URL",
        "type": "string",
        "default": "",
        "description": "QuestionAgent 使用的 API 地址（留空则使用全局 LLM 地址）",
    },
    "exam_agent_question_model": {
        "group": "exam_agent_llm",
        "label": "出题 Agent · 模型",
        "type": "string",
        "default": "",
        "description": "QuestionAgent 使用的模型名称（留空则使用全局 LLM 模型）",
    },
    "exam_agent_qc_api_key": {
        "group": "exam_agent_llm",
        "label": "质检 Agent · API Key",
        "type": "password",
        "default": "",
        "description": "QualityCheckAgent 使用的 API Key（留空则使用全局 LLM Key）",
    },
    "exam_agent_qc_base_url": {
        "group": "exam_agent_llm",
        "label": "质检 Agent · Base URL",
        "type": "string",
        "default": "",
        "description": "QualityCheckAgent 使用的 API 地址（留空则使用全局 LLM 地址）",
    },
    "exam_agent_qc_model": {
        "group": "exam_agent_llm",
        "label": "质检 Agent · 模型",
        "type": "string",
        "default": "",
        "description": "QualityCheckAgent 使用的模型名称（留空则使用全局 LLM 模型）",
    },
    "exam_agent_solve_api_key": {
        "group": "exam_agent_llm",
        "label": "模拟考生 Agent · API Key",
        "type": "password",
        "default": "",
        "description": "SolveAgent 使用的 API Key（留空则使用全局 LLM Key）",
    },
    "exam_agent_solve_base_url": {
        "group": "exam_agent_llm",
        "label": "模拟考生 Agent · Base URL",
        "type": "string",
        "default": "",
        "description": "SolveAgent 使用的 API 地址（留空则使用全局 LLM 地址）",
    },
    "exam_agent_solve_model": {
        "group": "exam_agent_llm",
        "label": "模拟考生 Agent · 模型",
        "type": "string",
        "default": "",
        "description": "SolveAgent 使用的模型名称（留空则使用全局 LLM 模型，建议用弱一档模型）",
    },
    "exam_agent_solve_models": {
        "group": "exam_agent_llm",
        "label": "模拟考生 Agent · 多模型并行配置",
        "type": "json",
        "default": "[]",
        "description": '配置多个不同模型实例并行试做，模拟不同水平考生。格式: [{"label":"名称","model":"模型名","temperature":0.9}]。留空则使用上方单一配置。',
    },
    "exam_agent_grade_api_key": {
        "group": "exam_agent_llm",
        "label": "评分 Agent · API Key",
        "type": "password",
        "default": "",
        "description": "GradeAgent 使用的 API Key（留空则使用全局 LLM Key）",
    },
    "exam_agent_grade_base_url": {
        "group": "exam_agent_llm",
        "label": "评分 Agent · Base URL",
        "type": "string",
        "default": "",
        "description": "GradeAgent 使用的 API 地址（留空则使用全局 LLM 地址）",
    },
    "exam_agent_grade_model": {
        "group": "exam_agent_llm",
        "label": "评分 Agent · 模型",
        "type": "string",
        "default": "",
        "description": "GradeAgent 使用的模型名称（留空则使用全局 LLM 模型，建议与出题模型不同）",
    },
    "exam_agent_hotspot_api_key": {
        "group": "exam_agent_llm",
        "label": "热点 Agent · API Key",
        "type": "password",
        "default": "",
        "description": "HotspotAgent 使用的 API Key（留空则使用全局 LLM Key）",
    },
    "exam_agent_hotspot_base_url": {
        "group": "exam_agent_llm",
        "label": "热点 Agent · Base URL",
        "type": "string",
        "default": "",
        "description": "HotspotAgent 使用的 API 地址（留空则使用全局 LLM 地址）",
    },
    "exam_agent_hotspot_model": {
        "group": "exam_agent_llm",
        "label": "热点 Agent · 模型",
        "type": "string",
        "default": "",
        "description": "HotspotAgent 使用的模型名称（留空则使用全局 LLM 模型）",
    },
    "exam_agent_dispatch_api_key": {
        "group": "exam_agent_llm",
        "label": "调度 Agent · API Key",
        "type": "password",
        "default": "",
        "description": "DispatchAgent 使用的 API Key（留空则使用全局 LLM Key）",
    },
    "exam_agent_dispatch_base_url": {
        "group": "exam_agent_llm",
        "label": "调度 Agent · Base URL",
        "type": "string",
        "default": "",
        "description": "DispatchAgent 使用的 API 地址（留空则使用全局 LLM 地址）",
    },
    "exam_agent_dispatch_model": {
        "group": "exam_agent_llm",
        "label": "调度 Agent · 模型",
        "type": "string",
        "default": "",
        "description": "DispatchAgent 使用的模型名称（留空则使用全局 LLM 模型）",
    },
    "exam_agent_avg_tokens_per_question": {
        "group": "exam_agent",
        "label": "单题平均 Token 消耗估算",
        "type": "integer",
        "default": "15000",
        "description": "配额预估接口使用的单题 Token 基准值（含生成、质检、K×试做评分）",
    },
    "exam_agent_hotspot_cache_ttl": {
        "group": "exam_agent",
        "label": "热点缓存 TTL（秒）",
        "type": "integer",
        "default": "21600",
        "description": "HotspotAgent 结果缓存时间（秒），默认 6 小时",
    },
    "exam_agent_hotspot_threshold_days": {
        "group": "exam_agent",
        "label": "热点时间范围（天）",
        "type": "integer",
        "default": "30",
        "description": "抓取最近 N 天内的热点新闻",
    },
}

# 配置分组的中文名称，前端展示用
CONFIG_GROUP_LABELS = {
    "llm": "LLM 模型配置",
    "embedding": "Embedding 模型配置",
    "rag": "RAG 检索配置",
    "exam_agent": "仿高考组卷 Agent 配置",
    "exam_agent_llm": "组卷 Agent 独立 LLM 配置",
}

CONFIG_GROUP_DESCRIPTIONS = {
    "llm": "全局大语言模型配置，作为所有 Agent 的默认模型。各 Agent 可单独覆盖。",
    "embedding": "文档向量化模型配置，用于 RAG 知识库检索。修改后将触发重新向量化。",
    "rag": "RAG 检索参数配置，影响文档分块和知识检索效果。",
    "exam_agent": "仿高考组卷流程的全局参数，包括试做次数、重试上限、并发控制等。",
    "exam_agent_llm": "为每个 Agent 单独配置 LLM 模型。留空的字段自动回退到全局 LLM 配置。",
}

AGENT_DESCRIPTIONS = {
    "question": {
        "name": "出题 Agent (QuestionAgent)",
        "description": "根据知识点、难度要求和历年真题样本，生成符合高考风格的试题。支持选择题、填空题和主观题。",
    },
    "qc": {
        "name": "质检 Agent (QualityCheckAgent)",
        "description": "对生成的试题进行质量审核，检查格式规范、答案正确性和题干清晰度。不合格的题目将退回重新生成。",
    },
    "solve": {
        "name": "模拟考生 Agent (SolveAgent)",
        "description": "模拟普通高中生水平作答试题，用于评估题目难度。支持配置多个不同模型做并行试做，模拟不同水平的考生，让难度评估更精准。",
    },
    "grade": {
        "name": "评分 Agent (GradeAgent)",
        "description": "对模拟考生的作答进行评判打分。选择题自动比对答案，主观题使用 LLM 语义评分。建议使用与出题不同的模型以降低偏差。",
    },
    "hotspot": {
        "name": "热点 Agent (HotspotAgent)",
        "description": "通过 RSS 聚合官方媒体新闻，使用 LLM 提炼出适合作为高考命题素材的社会热点，让试题更贴近时事。",
    },
    "dispatch": {
        "name": "调度 Agent (DispatchAgent)",
        "description": "任务分发中枢：为每个题目位置推断知识点、检索历年真题 Few-shot 样本、准备 RAG 上下文和热点素材。",
    },
}

# Embedding 相关配置 key 集合，用于判断是否需要触发重新向量化
EMBEDDING_CONFIG_KEYS = frozenset(
    {
        "embedding_api_key",
        "embedding_base_url",
        "embedding_model",
        "embedding_dims",
    }
)


# ==================== 内存缓存 ====================
# 使用模块级字典作为配置缓存，所有配置读取都从这里获取。
# 替换整个字典引用是原子操作，读取无需加锁。

_config_cache: dict[str, str] = {}


async def load_config_cache(session: AsyncSession) -> None:
    """
    从数据库加载全部配置到内存缓存。

    调用时机：
    - 应用启动时（lifespan）
    - 管理员修改配置后
    """
    global _config_cache

    stmt = select(SystemConfig)
    result = await session.execute(stmt)
    db_configs = result.scalars().all()

    # 先用默认值填充完整的配置字典，再用数据库中的实际值覆盖
    new_cache: dict[str, str] = {
        key: defn["default"] for key, defn in CONFIG_DEFINITIONS.items()
    }
    for record in db_configs:
        if record.key in CONFIG_DEFINITIONS:
            new_cache[record.key] = record.value

    # 原子替换整个字典引用，保证读取一致性
    _config_cache = new_cache
    logger.info(f"配置缓存已加载，共 {len(new_cache)} 项")


def get_config(key: str) -> str:
    """
    从内存缓存中读取配置值（同步方法，无需数据库查询）。

    如果缓存中没有该 key（例如应用未完成初始化），返回定义中的默认值。
    """
    if key in _config_cache:
        return _config_cache[key]

    # 回退到定义中的默认值
    definition = CONFIG_DEFINITIONS.get(key)
    if definition:
        return definition["default"]

    raise KeyError(f"未定义的配置项: {key}")


def get_agent_llm_config(agent_prefix: str) -> dict[str, str]:
    """
    读取某个 Agent 的独立 LLM 配置（api_key / base_url / model）。
    如果 Agent 自身的配置项为空，自动回退到全局 LLM 配置。

    agent_prefix: 如 "question", "qc", "solve", "grade", "hotspot", "dispatch"
    返回: {"api_key": ..., "base_url": ..., "model": ...}
    """
    api_key = get_config(f"exam_agent_{agent_prefix}_api_key")
    base_url = get_config(f"exam_agent_{agent_prefix}_base_url")
    model = get_config(f"exam_agent_{agent_prefix}_model")
    return {
        "api_key": api_key if api_key else get_config("openai_api_key"),
        "base_url": base_url if base_url else get_config("openai_base_url"),
        "model": model if model else get_config("openai_model"),
    }


def get_solve_agent_configs() -> list[dict[str, Any]]:
    """
    获取 SolveAgent 多模型配置列表。
    优先使用 exam_agent_solve_models JSON 配置，为空则回退到单一 solve 模型配置。
    每个模型条目中留空的 api_key/base_url 会自动回退到 solve 单一配置或全局配置。
    """
    import json as _json

    raw = get_config("exam_agent_solve_models")
    models: list[dict] = []
    if raw and raw.strip() not in ("", "[]"):
        try:
            parsed = _json.loads(raw)
            if isinstance(parsed, list):
                models = [m for m in parsed if isinstance(m, dict) and m.get("model")]
        except Exception:
            pass

    fallback = get_agent_llm_config("solve")

    if not models:
        return [{"label": "默认模型", **fallback, "temperature": 0.9}]

    result = []
    for m in models:
        result.append(
            {
                "label": m.get("label", "模型"),
                "api_key": m.get("api_key") or fallback["api_key"],
                "base_url": m.get("base_url") or fallback["base_url"],
                "model": m["model"],
                "temperature": float(m.get("temperature", 0.9)),
            }
        )
    return result


def get_config_int(key: str) -> int:
    """读取整数类型的配置值，带类型转换和安全回退。"""
    value = get_config(key)
    try:
        return int(value)
    except (ValueError, TypeError):
        default = CONFIG_DEFINITIONS[key]["default"]
        logger.warning(
            f"配置项 {key} 的值 '{value}' 不是有效整数，回退到默认值 {default}"
        )
        return int(default)


# ==================== 配置管理服务 ====================


class ConfigService:
    """配置管理服务类 —— 负责配置的查询、更新和审计日志"""

    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def get_all_grouped(self) -> dict[str, dict]:
        """
        获取所有配置项，按分组返回。

        返回格式：
        {
            "llm": {"label": "...", "description": "...", "items": [...]},
            "exam_agent_llm": {"label": "...", "description": "...", "agent_info": {...}, "items": [...]},
        }
        """
        grouped: dict[str, dict] = {}

        for key, definition in CONFIG_DEFINITIONS.items():
            group = definition["group"]
            if group not in grouped:
                group_data: dict[str, Any] = {
                    "label": CONFIG_GROUP_LABELS.get(group, group),
                    "description": CONFIG_GROUP_DESCRIPTIONS.get(group, ""),
                    "items": [],
                }
                if group == "exam_agent_llm":
                    group_data["agent_info"] = AGENT_DESCRIPTIONS
                grouped[group] = group_data

            grouped[group]["items"].append(
                {
                    "key": key,
                    "value": get_config(key),
                    "label": definition["label"],
                    "type": definition["type"],
                    "description": definition["description"],
                }
            )

        return grouped

    async def update_configs(
        self,
        updates: dict[str, str],
        admin_id: int,
        admin_username: str,
    ) -> set[str]:
        """
        批量更新配置项。

        只更新值实际发生变化的项，跳过未变更的项。
        每次变更都会写入审计日志。

        Returns:
            实际发生变更的配置 key 集合（调用方据此判断是否需要触发后续操作）
        """
        changed_keys: set[str] = set()
        committed_values: dict[str, str] = {}

        for key, new_value in updates.items():
            # 安全检查：只允许更新已定义的配置项，忽略非法 key
            if key not in CONFIG_DEFINITIONS:
                logger.warning(f"忽略未定义的配置项: {key}")
                continue

            new_value = str(new_value).strip()

            # 类型校验：整数类型必须能转换为 int
            definition = CONFIG_DEFINITIONS[key]
            if definition["type"] == "integer":
                try:
                    parsed_int = int(new_value)
                    if parsed_int < 0:
                        raise ValueError("不能为负数")
                except (ValueError, TypeError):
                    raise ValueError(f"配置项「{definition['label']}」必须是非负整数")

            # 值没变就跳过，避免无意义的写入和审计日志
            old_value = get_config(key)
            if old_value == new_value:
                continue

            # 更新或插入数据库记录（upsert 逻辑）
            stmt = select(SystemConfig).where(SystemConfig.key == key)
            result = await self.session.execute(stmt)
            config_record = result.scalar_one_or_none()

            if config_record:
                config_record.value = new_value
            else:
                config_record = SystemConfig(
                    key=key,
                    value=new_value,
                    group=definition["group"],
                    description=definition["description"],
                )
                self.session.add(config_record)

            # 写入审计日志
            audit_log = ConfigAuditLog(
                admin_id=admin_id,
                admin_username=admin_username,
                config_key=key,
                old_value=old_value,
                new_value=new_value,
            )
            self.session.add(audit_log)

            changed_keys.add(key)
            committed_values[key] = new_value

        await self.session.flush()

        # 有变更时立即更新内存缓存，使新配置对后续请求生效。
        # 直接用已知的新值更新缓存
        if changed_keys:
            global _config_cache
            _config_cache = {**_config_cache, **committed_values}

            if changed_keys & EMBEDDING_CONFIG_KEYS:
                from backend.app.rag.embeddings import reset_embedding_service

                reset_embedding_service()

        return changed_keys

    async def get_audit_logs(
        self,
        skip: int = 0,
        limit: int = 50,
    ) -> tuple[list[ConfigAuditLog], int]:
        """获取配置变更审计日志（按时间倒序）"""
        count_stmt = select(func.count()).select_from(ConfigAuditLog)
        total = (await self.session.execute(count_stmt)).scalar() or 0

        stmt = (
            select(ConfigAuditLog)
            .order_by(ConfigAuditLog.created_at.desc())
            .offset(skip)
            .limit(limit)
        )
        result = await self.session.execute(stmt)
        logs = list(result.scalars().all())

        return logs, total
