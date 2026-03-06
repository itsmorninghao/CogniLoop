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
    bank_kb_ids: list[int]  # question_bank KB IDs for few-shot examples
    doc_ids: list[int]  # individual document IDs within document KBs
    target_count: dict[str, int]  # e.g. {"single_choice": 5}
    target_difficulty: str  # "easy", "medium", "hard"

    # Pre-fetched context pools
    rag_chunks: list[
        dict
    ]  # [{index, content, similarity}] — raw chunks for distributor
    hotspot_items: list[
        str
    ]  # list of hotspot strings — for distributor to assign individually
    few_shot_pool: dict[
        str, list[dict]
    ]  # qtype -> list of examples — for rule-based distribution

    # Distributed context map (output of distributor)
    # key: "{qtype}_{local_index}", e.g. "single_choice_0"
    # value: {rag_context, hotspot, few_shot_examples}
    question_context_map: dict[str, dict]

    # Working questions
    completed_questions: list[ProQuizQuestionDict]

    # Batch pipeline state
    # each entry is a context key: "{qtype}_{local_index}", e.g. "single_choice_0"
    current_batch_types: list[str]
    batch_results: list[ProQuizQuestionDict]

    final_questions: list[Any]
    messages: Annotated[list[BaseMessage], add_messages]
