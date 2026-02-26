"""LLM 调用追踪器 —— 记录每次 LLM 调用的提示词和输出，用于类 LangSmith 可视化"""

import time
import uuid
from collections.abc import Callable
from dataclasses import dataclass, field

MAX_PROMPT_LEN = 3000  # 提示词最大保留长度
MAX_OUTPUT_LEN = 2000  # 输出最大保留长度


@dataclass
class TraceSpan:
    span_id: str
    agent: str
    model: str
    system_prompt: str
    user_prompt: str
    position_index: int | None = None
    attempt_index: int | None = None
    output: str | None = None
    error: str | None = None
    status: str = "running"  # running / success / error
    started_at: float = field(default_factory=time.time)
    elapsed_ms: int | None = None

    def to_dict(self) -> dict:
        return {
            "span_id": self.span_id,
            "agent": self.agent,
            "model": self.model,
            "system_prompt": self.system_prompt,
            "user_prompt": self.user_prompt,
            "position_index": self.position_index,
            "attempt_index": self.attempt_index,
            "output": self.output,
            "error": self.error,
            "status": self.status,
            "started_at": self.started_at,
            "elapsed_ms": self.elapsed_ms,
        }


class TraceCollector:
    """收集所有 LLM 调用的 span，并通过 emit_fn 实时推送 SSE 事件。"""

    def __init__(self, emit_fn: Callable[[str, dict], None] | None = None) -> None:
        self.emit_fn = emit_fn or (lambda e, d: None)
        self.spans: list[TraceSpan] = []

    def start_span(
        self,
        agent: str,
        model: str,
        system_prompt: str,
        user_prompt: str,
        position_index: int | None = None,
        attempt_index: int | None = None,
    ) -> str:
        """记录一次 LLM 调用开始，返回 span_id 供后续 end_span 使用。"""
        span_id = str(uuid.uuid4())[:8]
        span = TraceSpan(
            span_id=span_id,
            agent=agent,
            model=model,
            system_prompt=system_prompt[:MAX_PROMPT_LEN],
            user_prompt=user_prompt[:MAX_PROMPT_LEN],
            position_index=position_index,
            attempt_index=attempt_index,
        )
        self.spans.append(span)
        self.emit_fn(
            "trace_span_start",
            {
                "span_id": span_id,
                "agent": agent,
                "model": model,
                "system_prompt": span.system_prompt,
                "user_prompt": span.user_prompt,
                "position_index": position_index,
                "attempt_index": attempt_index,
                "started_at": span.started_at,
            },
        )
        return span_id

    def end_span(
        self,
        span_id: str,
        output: str | None = None,
        error: str | None = None,
    ) -> None:
        """记录一次 LLM 调用结束。"""
        span = next((s for s in self.spans if s.span_id == span_id), None)
        if not span:
            return
        span.elapsed_ms = int((time.time() - span.started_at) * 1000)
        span.output = (output or "")[:MAX_OUTPUT_LEN]
        span.error = error
        span.status = "error" if error else "success"
        self.emit_fn(
            "trace_span_end",
            {
                "span_id": span_id,
                "status": span.status,
                "output": span.output,
                "error": error,
                "elapsed_ms": span.elapsed_ms,
            },
        )

    def to_json_list(self) -> list[dict]:
        """序列化所有 span 为 dict 列表，供存储到数据库。"""
        return [s.to_dict() for s in self.spans]
