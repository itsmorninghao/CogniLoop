from typing import Annotated, Any, TypedDict

from langchain_core.messages import BaseMessage
from langgraph.graph.message import add_messages


class ProQuizQuestionDict(TypedDict, total=False):
    """A dictionary representation of a generated question."""

    question_type: str
    content: str
    options: dict[str, str] | None
    correct_answer: str | None
    analysis: str | None
    difficulty_score: float | None


class ProQuizState(TypedDict):
    """State for the advanced Pro Graph exam generator."""

    # Input
    session_id: str
    knowledge_scope: dict[str, Any]
    quiz_config: dict[str, Any]

    # Resolved context
    subject_scope: str  # E.g., "高中数学"
    kb_ids: list[int]  # Legacy: all KB IDs combined
    document_kb_ids: list[int]  # document KB IDs for RAG knowledge retrieval
    doc_ids: list[int]  # individual document IDs within document KBs
    target_difficulty: str  # "easy", "medium", "hard"

    # Exam template fields
    template_ids: list[int]  # list of exam template IDs
    selected_slot_positions: list[int]  # user-selected slot positions
    merged_slots: list[dict]  # [{position, question_type, label, question_count}]
    few_shot_map: dict[int, list[dict]]  # {position: [question_dicts]}

    # Pre-fetched context pools
    rag_chunks: list[
        dict
    ]  # [{index, content, similarity}] — raw chunks for distributor
    hotspot_items: list[
        str
    ]  # list of hotspot strings — for distributor to assign individually

    # Distributed context map (output of distributor)
    # key: "slot_{position}", e.g. "slot_1"
    # value: {rag_context, hotspot, few_shot_examples, question_type, slot_position, slot_label}
    question_context_map: dict[str, dict]

    # Working questions
    completed_questions: list[ProQuizQuestionDict]

    # Batch pipeline state
    # each entry is a context key: "slot_{position}", e.g. "slot_1"
    current_batch_types: list[str]
    batch_results: list[ProQuizQuestionDict]

    final_questions: list[Any]
    messages: Annotated[list[BaseMessage], add_messages]
