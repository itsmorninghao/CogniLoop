"""
Retriever — hybrid search (vector + keyword) with MMR deduplication and LLM reranking.

Pipeline:
1. Vector search on child chunks (cosine similarity via pgvector)
2. Keyword search on child chunks (ILIKE with hit-count scoring)
3. RRF fusion of both result lists
4. MMR deduplication (diversity-aware)
5. Expand child → parent chunks (fuller LLM context)
6. LLM reranking of parent-level candidates
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from typing import Any

from sqlalchemy import and_
from sqlalchemy import text as sa_text
from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import select

from backend.app.core.llm import get_chat_model, get_embeddings_model
from backend.app.models.knowledge_base import KBChunk, KBDocument

logger = logging.getLogger(__name__)


@dataclass
class ChunkResult:
    """A retrieved chunk with relevance scores."""

    id: int
    content: str
    document_id: int
    knowledge_base_id: int
    chunk_index: int
    similarity: float
    section_path: str = ""
    heading: str | None = None
    document_title: str | None = None
    parent_chunk_id: int | None = None
    rrf_score: float = 0.0
    metadata: dict = field(default_factory=dict)


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
    Retrieve the most relevant chunks for a query.

    Returns list of dicts (parent-level content) with chunk info and scores.
    """
    chunks, _ = await _retrieve_chunks_internal(
        query,
        session,
        knowledge_base_ids=knowledge_base_ids,
        document_ids=document_ids,
        top_k=top_k,
        similarity_threshold=similarity_threshold,
        use_hybrid=use_hybrid,
        use_rerank=use_rerank,
        rerank_top_k=rerank_top_k,
        include_debug=False,
    )
    return chunks


async def retrieve_chunks_with_debug(
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
) -> tuple[list[dict], dict]:
    chunks, debug = await _retrieve_chunks_internal(
        query,
        session,
        knowledge_base_ids=knowledge_base_ids,
        document_ids=document_ids,
        top_k=top_k,
        similarity_threshold=similarity_threshold,
        use_hybrid=use_hybrid,
        use_rerank=use_rerank,
        rerank_top_k=rerank_top_k,
        include_debug=True,
    )
    return chunks, debug or {}


async def _retrieve_chunks_internal(
    query: str,
    session: AsyncSession,
    *,
    knowledge_base_ids: list[int] | None,
    document_ids: list[int] | None,
    top_k: int,
    similarity_threshold: float,
    use_hybrid: bool,
    use_rerank: bool,
    rerank_top_k: int | None,
    include_debug: bool,
) -> tuple[list[dict], dict | None]:
    """
    Retrieve the most relevant chunks for a query.

    Returns a tuple of (final_chunks, debug_payload_or_none).
    """
    if rerank_top_k is None:
        rerank_top_k = top_k * 3

    vector_results = await _vector_search(
        query,
        session,
        knowledge_base_ids=knowledge_base_ids,
        document_ids=document_ids,
        top_k=rerank_top_k if use_rerank else top_k,
        similarity_threshold=similarity_threshold,
    )

    keyword_results: list[ChunkResult] = []
    if not use_hybrid:
        results = vector_results
    else:
        keyword_results = await _keyword_search(
            query,
            session,
            knowledge_base_ids=knowledge_base_ids,
            document_ids=document_ids,
            top_k=rerank_top_k if use_rerank else top_k,
        )
        results = _reciprocal_rank_fusion([vector_results, keyword_results], k=60)

    mmr_candidates = _mmr_filter(results, top_k=rerank_top_k, lambda_param=0.6)

    expanded_candidates = await _expand_to_parents(mmr_candidates, session)
    pre_rerank_candidates = list(expanded_candidates)
    rerank_applied = use_rerank and len(expanded_candidates) > top_k

    if rerank_applied:
        try:
            final_candidates = await _llm_rerank(
                query, expanded_candidates, session, top_k=top_k
            )
        except Exception as e:
            logger.warning("LLM rerank failed, falling back to score-based: %s", e)
            final_candidates = expanded_candidates[:top_k]
    else:
        final_candidates = expanded_candidates[:top_k]

    logger.info(
        "Retrieved %d chunks (query: '%s...', hybrid=%s, rerank=%s)",
        len(final_candidates),
        query[:40],
        use_hybrid,
        use_rerank,
    )
    document_ids_in_results = {
        c.document_id for c in final_candidates
    }
    if include_debug:
        document_ids_in_results.update(c.document_id for c in pre_rerank_candidates[:5])
    document_ids_in_results = sorted(document_ids_in_results)
    document_name_map: dict[int, str] = {}
    if document_ids_in_results:
        stmt = select(KBDocument.id, KBDocument.original_filename).where(
            KBDocument.id.in_(document_ids_in_results)
        )
        rows = (await session.execute(stmt)).all()
        document_name_map = {
            int(doc_id): filename for doc_id, filename in rows if filename
        }

    debug_payload = None
    if include_debug:
        debug_payload = {
            "vector_result_count": len(vector_results),
            "keyword_result_count": len(keyword_results),
            "hybrid_result_count": len(results),
            "mmr_candidate_count": len(mmr_candidates),
            "expanded_candidate_count": len(pre_rerank_candidates),
            "rerank_applied": rerank_applied,
            "retrieval_preview": [
                _result_preview(c, document_name_map) for c in pre_rerank_candidates[:5]
            ],
            "rerank_preview": [
                _result_preview(c, document_name_map) for c in final_candidates[:5]
            ],
        }

    return (
        [_result_to_dict(c, document_name_map) for c in final_candidates],
        debug_payload,
    )


def _build_scope_condition(kb_ids: list[int], doc_ids: list[int]):
    """Build WHERE clause for KB/document scope filtering."""
    if kb_ids and doc_ids:
        return and_(
            KBChunk.knowledge_base_id.in_(kb_ids),
            KBChunk.document_id.in_(doc_ids),
        )
    elif kb_ids:
        return KBChunk.knowledge_base_id.in_(kb_ids)
    else:
        return KBChunk.document_id.in_(doc_ids)


async def _vector_search(
    query: str,
    session: AsyncSession,
    *,
    knowledge_base_ids: list[int] | None,
    document_ids: list[int] | None,
    top_k: int,
    similarity_threshold: float,
) -> list[ChunkResult]:
    """Cosine similarity search on child chunks via pgvector."""
    embeddings_model = await get_embeddings_model(session)
    query_vector = await embeddings_model.aembed_query(query)

    where_parts: list[str] = ["chunk_level = 'child'", "embedding IS NOT NULL"]
    params: dict[str, Any] = {"query_vec": str(query_vector), "top_k": top_k * 3}

    scope_conditions: list[str] = []
    if document_ids:
        scope_conditions.append("document_id = ANY(:doc_ids)")
        params["doc_ids"] = document_ids
    if knowledge_base_ids:
        scope_conditions.append("knowledge_base_id = ANY(:kb_ids)")
        params["kb_ids"] = knowledge_base_ids

    if scope_conditions:
        if document_ids and knowledge_base_ids:
            where_parts.append(
                "(knowledge_base_id = ANY(:kb_ids) AND document_id = ANY(:doc_ids))"
            )
        else:
            where_parts.append(f"({' OR '.join(scope_conditions)})")

    where_sql = " AND ".join(where_parts)

    sql = sa_text(f"""
        SELECT
            id, content, document_id, knowledge_base_id, chunk_index,
            parent_chunk_id, section_path, heading, document_title,
            metadata AS metadata_extra,
            1 - (embedding <=> CAST(:query_vec AS vector)) AS similarity
        FROM kb_chunks
        WHERE {where_sql}
        ORDER BY embedding <=> CAST(:query_vec AS vector)
        LIMIT :top_k
    """)

    result = await session.execute(sql, params)
    rows = result.mappings().all()

    return [
        ChunkResult(
            id=row["id"],
            content=row["content"],
            document_id=row["document_id"],
            knowledge_base_id=row["knowledge_base_id"],
            chunk_index=row["chunk_index"],
            similarity=float(row["similarity"]),
            section_path=row["section_path"] or "",
            heading=row["heading"],
            document_title=row["document_title"],
            parent_chunk_id=row["parent_chunk_id"],
            metadata=row["metadata_extra"] or {},
        )
        for row in rows
        if float(row["similarity"]) >= similarity_threshold
    ]


def _compute_keyword_score(content: str, keywords: list[str]) -> float:
    """Score by fraction of keywords found in content."""
    if not keywords:
        return 0.0
    content_lower = content.lower()
    hits = sum(1 for kw in keywords if kw.lower() in content_lower)
    return hits / len(keywords)


async def _keyword_search(
    query: str,
    session: AsyncSession,
    *,
    knowledge_base_ids: list[int] | None,
    document_ids: list[int] | None,
    top_k: int,
) -> list[ChunkResult]:
    """
    ILIKE keyword search on child chunks with hit-count scoring.
    Uses up to 5 query terms.
    """
    keywords = query.strip().split()
    if not keywords:
        return []

    where_parts: list[str] = ["chunk_level = 'child'"]
    params: dict[str, Any] = {"top_k": top_k}

    scope_conditions: list[str] = []
    if document_ids:
        scope_conditions.append("document_id = ANY(:doc_ids)")
        params["doc_ids"] = document_ids
    if knowledge_base_ids:
        scope_conditions.append("knowledge_base_id = ANY(:kb_ids)")
        params["kb_ids"] = knowledge_base_ids

    if scope_conditions:
        if document_ids and knowledge_base_ids:
            where_parts.append(
                "(knowledge_base_id = ANY(:kb_ids) AND document_id = ANY(:doc_ids))"
            )
        else:
            where_parts.append(f"({' OR '.join(scope_conditions)})")

    like_conditions: list[str] = []
    for i, kw in enumerate(keywords[:5]):
        param_name = f"kw_{i}"
        like_conditions.append(f"content ILIKE :{param_name}")
        params[param_name] = f"%{kw}%"

    where_parts.append(f"({' OR '.join(like_conditions)})")
    where_sql = " AND ".join(where_parts)

    sql = sa_text(f"""
        SELECT
            id, content, document_id, knowledge_base_id, chunk_index,
            parent_chunk_id, section_path, heading, document_title,
            metadata AS metadata_extra
        FROM kb_chunks
        WHERE {where_sql}
        LIMIT :top_k
    """)

    result = await session.execute(sql, params)
    rows = result.mappings().all()

    results: list[ChunkResult] = []
    for row in rows:
        score = _compute_keyword_score(row["content"], keywords[:5])
        if score > 0:
            results.append(
                ChunkResult(
                    id=row["id"],
                    content=row["content"],
                    document_id=row["document_id"],
                    knowledge_base_id=row["knowledge_base_id"],
                    chunk_index=row["chunk_index"],
                    similarity=score,
                    section_path=row["section_path"] or "",
                    heading=row["heading"],
                    document_title=row["document_title"],
                    parent_chunk_id=row["parent_chunk_id"],
                    metadata=row["metadata_extra"] or {},
                )
            )
    return results


def _reciprocal_rank_fusion(
    result_lists: list[list[ChunkResult]],
    k: int = 60,
) -> list[ChunkResult]:
    """Merge ranked lists using Reciprocal Rank Fusion (RRF)."""
    scores: dict[int, float] = {}
    chunk_map: dict[int, ChunkResult] = {}

    for results in result_lists:
        for rank, chunk in enumerate(results):
            rrf = 1.0 / (k + rank + 1)
            scores[chunk.id] = scores.get(chunk.id, 0) + rrf
            if chunk.id not in chunk_map:
                chunk_map[chunk.id] = chunk

    sorted_ids = sorted(scores, key=lambda x: scores[x], reverse=True)
    fused: list[ChunkResult] = []
    for cid in sorted_ids:
        c = chunk_map[cid]
        c.rrf_score = scores[cid]
        fused.append(c)
    return fused


def _jaccard_similarity(a: str, b: str) -> float:
    """Character bigram Jaccard similarity."""

    def bigrams(s: str) -> set[str]:
        return {s[i : i + 2] for i in range(len(s) - 1)}

    ba, bb = bigrams(a), bigrams(b)
    if not ba or not bb:
        return 0.0
    return len(ba & bb) / len(ba | bb)


def _mmr_filter(
    candidates: list[ChunkResult],
    top_k: int,
    lambda_param: float = 0.6,
) -> list[ChunkResult]:
    """
    Greedy MMR (Maximum Marginal Relevance) deduplication.
    lambda_param: 1.0 = pure relevance, 0.0 = pure diversity.
    """
    if not candidates:
        return []

    selected: list[ChunkResult] = []
    remaining = list(candidates)

    while len(selected) < top_k and remaining:
        if not selected:
            best = max(remaining, key=lambda c: c.rrf_score)
        else:
            best = max(
                remaining,
                key=lambda c: (
                    lambda_param * c.rrf_score
                    - (1 - lambda_param)
                    * max(_jaccard_similarity(c.content, s.content) for s in selected)
                ),
            )
        selected.append(best)
        remaining.remove(best)

    return selected


async def _expand_to_parents(
    results: list[ChunkResult], session: AsyncSession
) -> list[ChunkResult]:
    """
    Replace child chunks with their parent chunks for richer LLM context.
    Multiple children mapping to the same parent are deduplicated (keep best score).
    Chunks without a parent (old data, chunk_level=parent) are passed through as-is.
    """
    parent_ids = [r.parent_chunk_id for r in results if r.parent_chunk_id]
    if not parent_ids:
        return results

    stmt = select(KBChunk).where(KBChunk.id.in_(parent_ids))
    parents = {p.id: p for p in (await session.execute(stmt)).scalars().all()}

    seen: dict[int, ChunkResult] = {}  # parent_id → best scoring ChunkResult
    no_parent: list[ChunkResult] = []

    for r in results:
        if r.parent_chunk_id and r.parent_chunk_id in parents:
            pid = r.parent_chunk_id
            if pid not in seen or r.rrf_score > seen[pid].rrf_score:
                p = parents[pid]
                seen[pid] = ChunkResult(
                    id=p.id,
                    content=p.content,
                    document_id=p.document_id,
                    knowledge_base_id=p.knowledge_base_id,
                    chunk_index=p.chunk_index,
                    similarity=r.similarity,
                    rrf_score=r.rrf_score,
                    section_path=p.section_path or "",
                    heading=p.heading,
                    document_title=p.document_title,
                    parent_chunk_id=None,
                    metadata=p.metadata_extra or {},
                )
        else:
            no_parent.append(r)

    return list(seen.values()) + no_parent


async def _llm_rerank(
    query: str,
    candidates: list[ChunkResult],
    session: AsyncSession,
    *,
    top_k: int,
) -> list[ChunkResult]:
    """LLM-based reranking — score each candidate's relevance on 1-10 scale."""
    if len(candidates) <= top_k:
        return candidates

    chunk_descriptions: list[str] = []
    for i, chunk in enumerate(candidates):
        preview = chunk.content[:500].replace("\n", " ")
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
        import json

        llm = await get_chat_model(session, temperature=0)
        response = await llm.ainvoke(prompt)
        content = response.content.strip()

        if content.startswith("```"):
            content = content.split("```")[1]
            if content.startswith("json"):
                content = content[4:]

        scores = json.loads(content)
        score_map = {item["index"]: item["score"] for item in scores}

        for i, chunk in enumerate(candidates):
            chunk.metadata["rerank_score"] = score_map.get(i, 5)

        candidates.sort(key=lambda c: c.metadata.get("rerank_score", 0), reverse=True)

    except Exception as e:
        logger.warning("LLM rerank parsing failed: %s", e)

    return candidates[:top_k]


def _result_to_dict(c: ChunkResult, document_name_map: dict[int, str] | None = None) -> dict:
    document_name_map = document_name_map or {}
    return {
        "id": c.id,
        "content": c.content,
        "document_id": c.document_id,
        "original_filename": document_name_map.get(c.document_id),
        "knowledge_base_id": c.knowledge_base_id,
        "chunk_index": c.chunk_index,
        "similarity": c.similarity,
        "rrf_score": c.rrf_score,
        "section_path": c.section_path,
        "heading": c.heading,
        "document_title": c.document_title,
        "metadata": c.metadata,
    }


def _result_preview(c: ChunkResult, document_name_map: dict[int, str] | None = None) -> dict:
    document_name_map = document_name_map or {}
    snippet = c.content.strip().replace("\n", " ")
    rerank_score = c.metadata.get("rerank_score")
    return {
        "chunk_id": c.id,
        "document_id": c.document_id,
        "document_name": document_name_map.get(c.document_id)
        or c.document_title
        or f"文档 {c.document_id}",
        "heading": c.heading,
        "section_path": c.section_path,
        "snippet": snippet[:240],
        "similarity": round(float(c.similarity), 4) if c.similarity is not None else None,
        "rrf_score": round(float(c.rrf_score), 4) if c.rrf_score else 0.0,
        "rerank_score": int(rerank_score) if isinstance(rerank_score, (int, float)) else None,
    }
