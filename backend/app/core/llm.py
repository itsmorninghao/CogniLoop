"""
LLM integration — reads API keys from system_configs table.

Usage:
    async with async_session_factory() as session:
        chat = await get_chat_model(session)
        embeddings = await get_embeddings_model(session)
"""

import json
import logging

from langchain_openai import ChatOpenAI, OpenAIEmbeddings
from sqlalchemy.ext.asyncio import AsyncSession

from backend.app.services.config_service import get_config

logger = logging.getLogger(__name__)

_DEFAULTS = {
    "OPENAI_PROVIDER": "openai",
    "OPENAI_MODEL": "gpt-4o-mini",
    "OPENAI_BASE_URL": "https://api.openai.com/v1",
    "OPENAI_TEMPERATURE": "0.7",
    "EMBEDDING_MODEL": "text-embedding-3-small",
}

# Pro graph nodes that support per-node LLM configuration
PRO_LLM_NODES = [
    "hotspot_searcher",
    "question_generator",
    "quality_checker",
    "solve_verifier",
]


async def _get(key: str, session: AsyncSession) -> str:
    """Get config value with fallback to defaults."""
    val = await get_config(key, session)
    return val if val is not None else _DEFAULTS.get(key, "")


async def get_chat_model(
    session: AsyncSession,
    *,
    temperature: float | None = None,
    model: str | None = None,
) -> ChatOpenAI:
    """Build a ChatOpenAI instance from system_configs."""
    api_key = await get_config("OPENAI_API_KEY", session)
    if not api_key:
        raise RuntimeError(
            "LLM API key not configured. "
            "Please set 'OPENAI_API_KEY' in Admin → System Config."
        )

    return ChatOpenAI(
        api_key=api_key,
        model=model or await _get("OPENAI_MODEL", session),
        base_url=await _get("OPENAI_BASE_URL", session),
        temperature=temperature
        if temperature is not None
        else float(await _get("OPENAI_TEMPERATURE", session)),
        max_retries=2,
        request_timeout=300,
    )


async def get_embeddings_model(session: AsyncSession) -> OpenAIEmbeddings:
    """Build an OpenAIEmbeddings instance from system_configs."""
    api_key = await get_config("EMBEDDING_API_KEY", session)
    if not api_key:
        raise RuntimeError(
            "Embedding API key not configured. "
            "Please set 'EMBEDDING_API_KEY' in Admin → System Config."
        )

    return OpenAIEmbeddings(
        api_key=api_key,
        model=await _get("EMBEDDING_MODEL", session),
        base_url=await _get("EMBEDDING_BASE_URL", session),
        check_embedding_ctx_length=False,
    )


async def _resolve_node_llm_params(
    node_name: str,
    session: AsyncSession,
    *,
    temperature: float | None = None,
) -> tuple[str, str, str, float]:
    """Resolve LLM parameters (api_key, model, base_url, temperature) for a node.

    Returns a tuple of (api_key, model, base_url, temperature).
    Raises RuntimeError if API key is not configured.
    """
    prefix = f"PRO_NODE_{node_name.upper()}"
    node_key = await get_config(f"{prefix}_API_KEY", session)
    node_base = await get_config(f"{prefix}_BASE_URL", session)
    node_model = await get_config(f"{prefix}_MODEL", session)

    api_key = node_key or await get_config("OPENAI_API_KEY", session)
    if not api_key:
        raise RuntimeError(
            f"LLM API key not configured for node '{node_name}'. "
            "Please set a node-specific or global 'OPENAI_API_KEY' in Admin → System Config."
        )

    base_url = node_base or await _get("OPENAI_BASE_URL", session)
    model = node_model or await _get("OPENAI_MODEL", session)
    temp = (
        temperature
        if temperature is not None
        else float(await _get("OPENAI_TEMPERATURE", session))
    )

    if node_key or node_base or node_model:
        logger.info("Node '%s' using custom LLM: model=%s", node_name, model)

    return api_key, model, base_url, temp


async def get_node_chat_model(
    node_name: str,
    session: AsyncSession,
    *,
    temperature: float | None = None,
) -> ChatOpenAI:
    """Per-node LLM with fallback to global config.

    Reads PRO_NODE_{NODE_NAME}_API_KEY / _BASE_URL / _MODEL from system_configs.
    Falls back to global OPENAI_* config if node-specific values are not set.
    """
    api_key, model, base_url, temp = await _resolve_node_llm_params(
        node_name, session, temperature=temperature
    )
    return ChatOpenAI(
        api_key=api_key, model=model, base_url=base_url, temperature=temp, max_retries=0
    )


async def get_solve_verifier_models(session: AsyncSession) -> list[dict]:
    """Return a list of model specs for the solve verifier multi-model setup.

    Each spec is a dict with: llm (ChatOpenAI), prompt_degradation (bool)

    Reads PRO_NODE_SOLVE_VERIFIER_MODELS JSON config.
    Format: [{"label": "...", "model": "...", "api_key": "...", "base_url": "...", "prompt_degradation": false}]
    Falls back to solve_verifier single-model config, replicated 3x with different temperatures.
    """
    models_json = await get_config("PRO_NODE_SOLVE_VERIFIER_MODELS", session)
    if models_json:
        try:
            specs = json.loads(models_json)
            if isinstance(specs, list) and len(specs) >= 1:
                global_key = await get_config("OPENAI_API_KEY", session)
                global_base = await _get("OPENAI_BASE_URL", session)
                node_key = await get_config("PRO_NODE_SOLVE_VERIFIER_API_KEY", session)
                node_base = await get_config(
                    "PRO_NODE_SOLVE_VERIFIER_BASE_URL", session
                )

                models = []
                for spec in specs:
                    api_key = spec.get("api_key") or node_key or global_key
                    base_url = spec.get("base_url") or node_base or global_base
                    if not api_key:
                        raise RuntimeError("No API key for solve verifier model spec")
                    models.append(
                        {
                            "llm": ChatOpenAI(
                                api_key=api_key,
                                model=spec.get(
                                    "model", await _get("OPENAI_MODEL", session)
                                ),
                                base_url=base_url,
                                temperature=float(spec.get("temperature", 0.7)),
                                max_retries=0,
                            ),
                            "prompt_degradation": bool(
                                spec.get("prompt_degradation", False)
                            ),
                        }
                    )
                return models
        except (json.JSONDecodeError, TypeError):
            logger.warning(
                "Invalid PRO_NODE_SOLVE_VERIFIER_MODELS JSON, falling back to single model"
            )

    # Fallback: use the node-specific (or global) model, 3 copies with varied temperatures
    api_key, model_name, base_url, _ = await _resolve_node_llm_params(
        "solve_verifier", session, temperature=0.3
    )
    temps = [0.3, 0.5, 0.7]

    return [
        {
            "llm": ChatOpenAI(
                api_key=api_key,
                model=model_name,
                base_url=base_url,
                temperature=t,
                max_retries=0,
            ),
            "prompt_degradation": False,
        }
        for t in temps
    ]


async def get_llm_config(session: AsyncSession) -> dict:
    """Return all LLM-related config as a dict (for diagnostics)."""
    keys = list(_DEFAULTS.keys()) + ["OPENAI_API_KEY", "EMBEDDING_API_KEY"]
    config = {}
    for key in keys:
        val = await get_config(key, session)
        if "API_KEY" in key and val:
            config[key] = val[:8] + "..." + val[-4:]  # mask
        else:
            config[key] = val or _DEFAULTS.get(key)
    return config
