"""
Retriever — hybrid search (vector + keyword) with LLM reranking.

Inspired by RAGFlow's approach:
1. Vector search via pgvector cosine distance
2. Keyword search via PostgreSQL ts_vector (BM25-like)
3. Reciprocal Rank Fusion (RRF) to merge results
4. Optional LLM reranking for final top-k selection

Supports scoped retrieval: filter by KB IDs, document IDs.
"""

from __future__ import annotations

import json
import logging
from dataclasses import dataclass
from typing import Any

from sqlalchemy import text as sa_text
from sqlalchemy.ext.asyncio import AsyncSession

from backend.app.core.llm import get_chat_model, get_embeddings_model

logger = logging.getLogger(__name__)


@dataclass
class RetrievedChunk:
    """A retrieved chunk with relevance scoring."""
    id: int
    content: str
    document_id: int
    knowledge_base_id: int
    chunk_index: int
    similarity: float
    metadata: dict
    section_path: str = ""
    heading: str | None = None


async def retrieve_chunks(
    query: str,
    session: AsyncSession,
    *,
    knowledge_base_ids: list[int] | None = None,
    document_ids: list[int] | None = None,
    top_k: int = 8,
    similarity_threshold: float = 0.25,
    use_hybrid: bool = True,
    use_rerank: bool = True,
    rerank_top_k: int | None = None,
) -> list[dict]:
    """
    Retrieve the most relevant chunks for a query using hybrid search.

    Pipeline:
      1. Vector search (cosine similarity via pgvector)
      2. Keyword search (PostgreSQL full-text search)
      3. RRF fusion of both result lists
      4. Optional LLM reranking of fused results

    Args:
        query: Search query.
        session: DB session.
        knowledge_base_ids: Limit to these KBs.
        document_ids: Limit to specific documents.
        top_k: Final number of results to return.
        similarity_threshold: Minimum vector similarity.
        use_hybrid: Enable keyword search + RRF fusion.
        use_rerank: Enable LLM reranking.
        rerank_top_k: How many candidates to rerank (default: top_k * 3).

    Returns:
        list of dicts with chunk info and scores.
    """
    if rerank_top_k is None:
        rerank_top_k = top_k * 3

    # Step 1: Vector search
    vector_results = await _vector_search(
        query, session,
        knowledge_base_ids=knowledge_base_ids,
        document_ids=document_ids,
        top_k=rerank_top_k if use_rerank else top_k,
        similarity_threshold=similarity_threshold,
    )

    if not use_hybrid:
        results = vector_results
    else:
        # Step 2: Keyword search
        keyword_results = await _keyword_search(
            query, session,
            knowledge_base_ids=knowledge_base_ids,
            document_ids=document_ids,
            top_k=rerank_top_k if use_rerank else top_k,
        )

        # Step 3: RRF fusion
        results = _reciprocal_rank_fusion(
            [vector_results, keyword_results],
            k=60,
        )

    candidates = results[: rerank_top_k]

    if use_rerank and len(candidates) > top_k:
        # Step 4: LLM reranking
        try:
            candidates = await _llm_rerank(
                query, candidates, session, top_k=top_k
            )
        except Exception as e:
            logger.warning("LLM rerank failed, falling back to score-based: %s", e)
            candidates = candidates[:top_k]
    else:
        candidates = candidates[:top_k]

    logger.info(
        "Retrieved %d chunks (query: '%s...', hybrid=%s, rerank=%s)",
        len(candidates), query[:40], use_hybrid, use_rerank,
    )
    return candidates


async def _vector_search(
    query: str,
    session: AsyncSession,
    *,
    knowledge_base_ids: list[int] | None,
    document_ids: list[int] | None,
    top_k: int,
    similarity_threshold: float,
) -> list[dict]:
    """Cosine similarity search via pgvector."""
    embeddings_model = await get_embeddings_model(session)
    query_vector = await embeddings_model.aembed_query(query)

    where_parts = []
    params: dict[str, Any] = {"query_vec": str(query_vector), "top_k": top_k}

    scope_conditions = []
    if document_ids:
        scope_conditions.append("document_id = ANY(:doc_ids)")
        params["doc_ids"] = document_ids
    if knowledge_base_ids:
        scope_conditions.append("knowledge_base_id = ANY(:kb_ids)")
        params["kb_ids"] = knowledge_base_ids

    if scope_conditions:
        where_parts.append(f"({' OR '.join(scope_conditions)})")

    where_sql = " AND ".join(where_parts) if where_parts else "TRUE"

    sql = sa_text(f"""
        SELECT
            id, content, document_id, knowledge_base_id, chunk_index,
            metadata AS metadata_extra,
            1 - (embedding <=> CAST(:query_vec AS vector)) AS similarity
        FROM kb_chunks
        WHERE {where_sql}
          AND embedding IS NOT NULL
        ORDER BY embedding <=> CAST(:query_vec AS vector)
        LIMIT :top_k
    """)

    result = await session.execute(sql, params)
    rows = result.mappings().all()

    return [
        {
            "id": row["id"],
            "content": row["content"],
            "document_id": row["document_id"],
            "knowledge_base_id": row["knowledge_base_id"],
            "chunk_index": row["chunk_index"],
            "similarity": float(row["similarity"]),
            "metadata": row["metadata_extra"] or {},
            "section_path": (row["metadata_extra"] or {}).get("section_path", ""),
            "heading": (row["metadata_extra"] or {}).get("heading"),
        }
        for row in rows
        if float(row["similarity"]) >= similarity_threshold
    ]


async def _keyword_search(
    query: str,
    session: AsyncSession,
    *,
    knowledge_base_ids: list[int] | None,
    document_ids: list[int] | None,
    top_k: int,
) -> list[dict]:
    """
    PostgreSQL full-text search using to_tsvector/to_tsquery.
    Supports both Chinese and English via 'simple' config + LIKE fallback.
    """
    where_parts = []
    params: dict[str, Any] = {"top_k": top_k}

    scope_conditions = []
    if document_ids:
        scope_conditions.append("document_id = ANY(:doc_ids)")
        params["doc_ids"] = document_ids
    if knowledge_base_ids:
        scope_conditions.append("knowledge_base_id = ANY(:kb_ids)")
        params["kb_ids"] = knowledge_base_ids

    if scope_conditions:
        where_parts.append(f"({' OR '.join(scope_conditions)})")

    where_sql = " AND ".join(where_parts) if where_parts else "TRUE"

    # For Chinese text, use ILIKE matching as a reliable fallback
    # since PostgreSQL ts_vector works best with space-separated tokens
    keywords = query.strip().split()
    if not keywords:
        return []

    like_conditions = []
    for i, kw in enumerate(keywords[:5]):
        param_name = f"kw_{i}"
        like_conditions.append(f"content ILIKE :{param_name}")
        params[param_name] = f"%{kw}%"

    like_sql = " OR ".join(like_conditions)

    sql = sa_text(f"""
        SELECT
            id, content, document_id, knowledge_base_id, chunk_index,
            metadata AS metadata_extra,
            0.5 AS similarity
        FROM kb_chunks
        WHERE {where_sql}
          AND ({like_sql})
        LIMIT :top_k
    """)

    result = await session.execute(sql, params)
    rows = result.mappings().all()

    return [
        {
            "id": row["id"],
            "content": row["content"],
            "document_id": row["document_id"],
            "knowledge_base_id": row["knowledge_base_id"],
            "chunk_index": row["chunk_index"],
            "similarity": 0.5,
            "metadata": row["metadata_extra"] or {},
            "section_path": (row["metadata_extra"] or {}).get("section_path", ""),
            "heading": (row["metadata_extra"] or {}).get("heading"),
        }
        for row in rows
    ]


def _reciprocal_rank_fusion(
    result_lists: list[list[dict]],
    k: int = 60,
) -> list[dict]:
    """
    Merge multiple ranked lists using Reciprocal Rank Fusion.
    RRF score = Σ 1 / (k + rank_i) across all lists.
    """
    scores: dict[int, float] = {}
    chunk_map: dict[int, dict] = {}

    for results in result_lists:
        for rank, chunk in enumerate(results):
            chunk_id = chunk["id"]
            rrf_score = 1.0 / (k + rank + 1)
            scores[chunk_id] = scores.get(chunk_id, 0) + rrf_score
            if chunk_id not in chunk_map:
                chunk_map[chunk_id] = chunk

    sorted_ids = sorted(scores, key=lambda x: scores[x], reverse=True)

    fused = []
    for cid in sorted_ids:
        chunk = chunk_map[cid].copy()
        chunk["rrf_score"] = scores[cid]
        fused.append(chunk)

    return fused


async def _llm_rerank(
    query: str,
    candidates: list[dict],
    session: AsyncSession,
    *,
    top_k: int,
) -> list[dict]:
    """
    Use the LLM to rerank candidate chunks by relevance to the query.

    Sends a structured prompt asking the LLM to score each chunk's relevance
    on a 1-10 scale, then re-sorts by the score.
    """
    if len(candidates) <= top_k:
        return candidates

    chunk_descriptions = []
    for i, chunk in enumerate(candidates):
        preview = chunk["content"][:300].replace("\n", " ")
        chunk_descriptions.append(f"[{i}] {preview}")

    chunks_text = "\n".join(chunk_descriptions)

    prompt = f"""You are a relevance judge. Given a query and a list of text chunks, rate each chunk's relevance to the query on a scale of 1-10.

Query: {query}

Chunks:
{chunks_text}

Respond with ONLY a JSON array of objects, each with "index" (int) and "score" (int 1-10).
Example: [{{"index": 0, "score": 8}}, {{"index": 1, "score": 3}}]
Return the JSON array and nothing else."""

    try:
        llm = await get_chat_model(session, temperature=0)
        response = await llm.ainvoke(prompt)
        content = response.content.strip()

        import json
        if content.startswith("```"):
            content = content.split("```")[1]
            if content.startswith("json"):
                content = content[4:]

        scores = json.loads(content)
        score_map = {item["index"]: item["score"] for item in scores}

        for i, chunk in enumerate(candidates):
            chunk["rerank_score"] = score_map.get(i, 5)

        candidates.sort(key=lambda c: c.get("rerank_score", 0), reverse=True)

    except Exception as e:
        logger.warning("LLM rerank parsing failed: %s", e)

    return candidates[:top_k]
