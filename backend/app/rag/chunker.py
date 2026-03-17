"""
ParentChildChunker — two-layer chunking strategy for RAG.

Design:
- Parent chunk (~1000 chars): complete paragraph context, stored but NOT embedded
- Child chunk (~300 chars): fine-grained, embedded for vector retrieval
- Retrieval: child chunks locate relevant passages → parent chunks provide LLM context
"""

from __future__ import annotations

import logging
import re
from dataclasses import dataclass, field

from backend.app.rag.parser import ParsedSection, ParseResult

logger = logging.getLogger(__name__)


@dataclass
class Chunk:
    """A text chunk with structural metadata, supporting parent-child hierarchy."""

    content: str
    content_for_embedding: str  # section_path-prefixed text for embedding quality
    chunk_level: str  # "parent" | "child"
    parent_chunk_index: int | None  # index into the full chunk list for the parent
    section_path: str = ""
    heading: str = ""
    document_title: str = ""
    metadata: dict = field(default_factory=dict)

    # Legacy compat
    @property
    def index(self) -> int:
        return self.metadata.get("chunk_index", 0)

    # Legacy compat
    @property
    def context_prefix(self) -> str:
        return self.section_path

    @property
    def page_number(self) -> int | None:
        return self.metadata.get("page_number")


class ParentChildChunker:
    """Two-layer chunker producing parent (context) and child (retrieval) chunks."""

    def __init__(
        self,
        parent_size: int = 1000,
        child_size: int = 300,
        overlap: int = 50,
    ):
        self.parent_size = parent_size
        self.child_size = child_size
        self.overlap = overlap

    def chunk(self, parse_result: ParseResult) -> list[Chunk]:
        document_title = parse_result.title
        chunks: list[Chunk] = []

        parent_groups = self._build_parent_groups(parse_result.sections)

        for parent_text, section_path, heading in parent_groups:
            parent_idx = len(chunks)

            parent_ctx = (
                f"{section_path}\n{parent_text}" if section_path else parent_text
            )
            chunks.append(
                Chunk(
                    content=parent_text,
                    content_for_embedding=parent_ctx,
                    chunk_level="parent",
                    parent_chunk_index=None,
                    section_path=section_path,
                    heading=heading,
                    document_title=document_title,
                    metadata={"chunk_index": parent_idx},
                )
            )

            for child_text in self._split_children(parent_text):
                child_ctx = (
                    f"{section_path}\n{child_text}" if section_path else child_text
                )
                child_idx = len(chunks)
                chunks.append(
                    Chunk(
                        content=child_text,
                        content_for_embedding=child_ctx,
                        chunk_level="child",
                        parent_chunk_index=parent_idx,
                        section_path=section_path,
                        heading=heading,
                        document_title=document_title,
                        metadata={"chunk_index": child_idx},
                    )
                )

        logger.info(
            "ParentChildChunker: %d sections → %d chunks (%d parents, %d children)",
            len(parse_result.sections),
            len(chunks),
            sum(1 for c in chunks if c.chunk_level == "parent"),
            sum(1 for c in chunks if c.chunk_level == "child"),
        )
        return chunks

    def _build_parent_groups(
        self, sections: list[ParsedSection]
    ) -> list[tuple[str, str, str]]:
        """
        Group body sections under their nearest heading, merge into parent_size blocks.
        Returns list of (text, section_path, heading).
        """
        groups: list[tuple[str, str, str]] = []
        buffer = ""
        current_path = ""
        current_heading = ""

        def flush() -> None:
            if buffer.strip():
                for i in range(0, len(buffer), self.parent_size):
                    piece = buffer[i : i + self.parent_size].strip()
                    if piece:
                        groups.append((piece, current_path, current_heading))

        for sec in sections:
            if sec.heading_level > 0:
                flush()
                buffer = sec.content + "\n"
                current_path = sec.section_path
                current_heading = sec.content
            else:
                buffer += sec.content + "\n"
                if not current_path and sec.section_path:
                    current_path = sec.section_path
                if not current_heading and sec.heading:
                    current_heading = sec.heading

        flush()
        return groups

    def _split_children(self, text: str) -> list[str]:
        """
        Split into child chunks at sentence boundaries (Chinese + English + semicolons).
        Target child_size chars with overlap.
        """
        sentences = re.split(r"(?<=[。！？；.!?\n])\s*", text)
        sentences = [s.strip() for s in sentences if s.strip()]

        children: list[str] = []
        current = ""

        for sent in sentences:
            if len(current) + len(sent) <= self.child_size:
                current += sent
            else:
                if current:
                    children.append(current)
                    current = current[-self.overlap :] + sent if self.overlap else sent
                else:
                    for i in range(0, len(sent), self.child_size):
                        children.append(sent[i : i + self.child_size])
                    current = ""

        if current.strip():
            children.append(current)

        return children


def chunk_document(parse_result: ParseResult) -> list[Chunk]:
    """
    Chunk a parsed document using the ParentChildChunker strategy.
    Returns all chunks (parents + children) in order.
    """
    return ParentChildChunker().chunk(parse_result)


def chunk_sections(
    sections: list,
    *,
    strategy: str = "semantic",  # noqa: ARG001 — ignored, always ParentChild now
    chunk_size: int = 800,  # noqa: ARG001 — ignored
    chunk_overlap: int = 150,  # noqa: ARG001 — ignored
) -> list[Chunk]:
    """
    Deprecated — use chunk_document(parse_result) instead.
    """
    from backend.app.rag.parser import ParsedSection, ParseResult

    parsed_sections: list[ParsedSection] = []
    for s in sections:
        if isinstance(s, ParsedSection):
            parsed_sections.append(s)
        else:
            parsed_sections.append(
                ParsedSection(
                    content=s.get("content", "")
                    if isinstance(s, dict)
                    else getattr(s, "content", ""),
                    heading_level=s.get("heading_level", 0)
                    if isinstance(s, dict)
                    else getattr(s, "heading_level", 0),
                    heading=s.get("heading")
                    if isinstance(s, dict)
                    else getattr(s, "heading", None),
                    section_path=s.get("section_path", "")
                    if isinstance(s, dict)
                    else getattr(s, "section_path", ""),
                    page_number=s.get("page_number")
                    if isinstance(s, dict)
                    else getattr(s, "page_number", None),
                )
            )

    fake_result = ParseResult(sections=parsed_sections)
    return ParentChildChunker().chunk(fake_result)
