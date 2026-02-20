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
}

# 配置分组的中文名称，前端展示用
CONFIG_GROUP_LABELS = {
    "llm": "LLM 模型配置",
    "embedding": "Embedding 模型配置",
    "rag": "RAG 检索配置",
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
            "llm": {"label": "LLM 模型配置", "items": [...]},
            "embedding": {"label": "Embedding 模型配置", "items": [...]},
            "rag": {"label": "RAG 检索配置", "items": [...]},
        }
        """
        grouped: dict[str, dict] = {}

        for key, definition in CONFIG_DEFINITIONS.items():
            group = definition["group"]
            if group not in grouped:
                grouped[group] = {
                    "label": CONFIG_GROUP_LABELS.get(group, group),
                    "items": [],
                }

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
