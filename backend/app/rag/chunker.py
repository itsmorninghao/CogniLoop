"""
Intelligent text chunker — inspired by RAGFlow parent-child chunking.

Key features:
1. Heading-aware splitting — respects document structure
2. Parent context injection — each chunk carries its section path context
3. Configurable chunk sizing with sentence-level boundaries
4. Overlap between chunks for context continuity
"""

from __future__ import annotations

import logging
import re
from dataclasses import dataclass, field

logger = logging.getLogger(__name__)


@dataclass
class Chunk:
    """A text chunk enriched with structural metadata."""

    index: int
    content: str
    context_prefix: str = ""  # "Chapter 1 > Section 2.1:\n" prepended for embedding
    page_number: int | None = None
    section_path: str = ""
    heading: str | None = None
    metadata: dict = field(default_factory=dict)

    @property
    def content_for_embedding(self) -> str:
        """Content with section context injected for better embedding quality."""
        if self.context_prefix:
            return f"{self.context_prefix}\n{self.content}"
        return self.content


class ChunkingStrategy:
    """Base class for chunking strategies — extensible."""

    def chunk(
        self,
        sections: list[dict],
        *,
        chunk_size: int = 800,
        chunk_overlap: int = 150,
    ) -> list[Chunk]:
        raise NotImplementedError


class SemanticSectionChunker(ChunkingStrategy):
    """
    Primary chunking strategy:
    1. Group body sections under their nearest heading
    2. Merge small consecutive sections to form coherent chunks
    3. Split large sections at sentence boundaries
    4. Inject section path as context prefix
    """

    def chunk(
        self,
        sections: list[dict],
        *,
        chunk_size: int = 800,
        chunk_overlap: int = 150,
    ) -> list[Chunk]:
        # Group sections by heading context
        groups = self._group_by_heading(sections)

        chunks: list[Chunk] = []
        for group in groups:
            heading = group["heading"]
            section_path = group["section_path"]
            body_sections = group["body"]

            # Concatenate all body text in this group
            full_text = "\n\n".join(
                s["content"] for s in body_sections if s["content"].strip()
            )
            if not full_text.strip():
                continue

            # Get representative page number
            page = None
            for s in body_sections:
                if s.get("page_number"):
                    page = s["page_number"]
                    break

            # Build context prefix for embedding quality
            context_prefix = section_path if section_path else ""

            # Split into sized chunks with sentence awareness
            text_chunks = self._split_with_overlap(
                full_text,
                chunk_size=chunk_size,
                chunk_overlap=chunk_overlap,
            )

            for text in text_chunks:
                chunks.append(
                    Chunk(
                        index=len(chunks),
                        content=text,
                        context_prefix=context_prefix,
                        page_number=page,
                        section_path=section_path,
                        heading=heading,
                        metadata={
                            "char_count": len(text),
                            **({"page": page} if page else {}),
                        },
                    )
                )

        logger.info("Chunked %d sections into %d chunks", len(sections), len(chunks))
        return chunks

    @staticmethod
    def _group_by_heading(sections: list[dict]) -> list[dict]:
        """Group body paragraphs under their nearest heading."""
        groups: list[dict] = []
        current_group: dict = {
            "heading": "",
            "section_path": "",
            "body": [],
        }

        for s in sections:
            if s.get("heading_level", 0) > 0:
                # Flush previous group
                if current_group["body"]:
                    groups.append(current_group)
                current_group = {
                    "heading": s["content"],
                    "section_path": s.get("section_path", ""),
                    "body": [],
                }
            else:
                current_group["body"].append(s)

        # Flush last group
        if current_group["body"]:
            groups.append(current_group)

        return groups

    @staticmethod
    def _split_with_overlap(
        text: str,
        *,
        chunk_size: int = 800,
        chunk_overlap: int = 150,
    ) -> list[str]:
        """
        Split text into chunks at sentence boundaries.
        Sentences are preferred split points to avoid breaking mid-thought.
        """
        if len(text) <= chunk_size:
            return [text]

        # Split into sentences (Chinese + English)
        sentences = re.split(r"(?<=[。！？.!?\n])\s*", text)
        sentences = [s.strip() for s in sentences if s.strip()]

        chunks: list[str] = []
        current_chunk: list[str] = []
        current_len = 0

        for sentence in sentences:
            if current_len + len(sentence) > chunk_size and current_chunk:
                # Save current chunk
                chunks.append(" ".join(current_chunk))

                # Calculate overlap: keep last N chars worth of sentences
                overlap_text = ""
                overlap_sentences = []
                for s in reversed(current_chunk):
                    if len(overlap_text) + len(s) > chunk_overlap:
                        break
                    overlap_sentences.insert(0, s)
                    overlap_text = " ".join(overlap_sentences)

                current_chunk = overlap_sentences
                current_len = len(overlap_text)

            current_chunk.append(sentence)
            current_len += len(sentence)

        if current_chunk:
            chunks.append(" ".join(current_chunk))

        return chunks


class FixedSizeChunker(ChunkingStrategy):
    """
    Fallback chunker — fixed character-count splitting.
    Used when document structure is unknown or flat.
    """

    def chunk(
        self,
        sections: list[dict],
        *,
        chunk_size: int = 800,
        chunk_overlap: int = 150,
    ) -> list[Chunk]:
        full_text = "\n\n".join(s["content"] for s in sections if s.get("content"))
        if not full_text.strip():
            return []

        chunks: list[Chunk] = []
        start = 0
        while start < len(full_text):
            end = start + chunk_size

            # Try to break at a sentence boundary
            if end < len(full_text):
                boundary = max(
                    full_text.rfind("。", start, end),
                    full_text.rfind(".", start, end),
                    full_text.rfind("\n", start, end),
                )
                if boundary > start + chunk_size // 2:
                    end = boundary + 1

            content = full_text[start:end].strip()
            if content:
                chunks.append(
                    Chunk(
                        index=len(chunks),
                        content=content,
                        metadata={"char_start": start, "char_end": end},
                    )
                )

            start = end - chunk_overlap

        return chunks


def chunk_sections(
    sections: list[dict],
    *,
    strategy: str = "semantic",
    chunk_size: int = 800,
    chunk_overlap: int = 150,
) -> list[Chunk]:
    """
    Chunk parsed document sections into retrievable chunks.

    Args:
        sections: List of section dicts from ParseResult.sections.
        strategy: "semantic" (heading-aware) or "fixed" (size-based).
        chunk_size: Target characters per chunk.
        chunk_overlap: Overlap between chunks.

    Returns:
        List of Chunk objects with metadata.
    """
    section_dicts = [
        {
            "content": s.content if hasattr(s, "content") else s.get("content", ""),
            "heading_level": s.heading_level
            if hasattr(s, "heading_level")
            else s.get("heading_level", 0),
            "heading": s.heading if hasattr(s, "heading") else s.get("heading"),
            "section_path": s.section_path
            if hasattr(s, "section_path")
            else s.get("section_path", ""),
            "page_number": s.page_number
            if hasattr(s, "page_number")
            else s.get("page_number"),
        }
        for s in sections
    ]

    strategies = {
        "semantic": SemanticSectionChunker,
        "fixed": FixedSizeChunker,
    }

    chunker_cls = strategies.get(strategy, SemanticSectionChunker)
    chunker = chunker_cls()

    return chunker.chunk(
        section_dicts,
        chunk_size=chunk_size,
        chunk_overlap=chunk_overlap,
    )
