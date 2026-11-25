from __future__ import annotations

import json
import queue
import time
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Callable, Iterator


TraceSink = Callable[[str, str, str, str, str | None, dict[str, Any] | None], None]


@dataclass(frozen=True)
class TraceEvent:
    id: str
    key: str
    label: str
    message: str
    status: str = "running"
    provider: str | None = None
    elapsed_ms: int = 0
    metadata: dict[str, Any] = field(default_factory=dict)
    created_at: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    schema_version: str = "trace_event.v1"

    def to_dict(self) -> dict[str, Any]:
        return {
            "schema_version": self.schema_version,
            "id": self.id,
            "key": self.key,
            "label": self.label,
            "message": self.message,
            "status": self.status,
            "provider": self.provider,
            "elapsed_ms": self.elapsed_ms,
            "metadata": self.metadata,
            "created_at": self.created_at,
        }


def sse_encode(event: str, data: dict[str, Any]) -> str:
    payload = json.dumps(data, ensure_ascii=False, separators=(",", ":"))
    return f"event: {event}\ndata: {payload}\n\n"


class TraceRecorder:
    def __init__(self, session_id: str) -> None:
        self.session_id = session_id
        self.started_at = time.perf_counter()
        self.events: list[TraceEvent] = []
        self._queue: queue.Queue[tuple[str, dict[str, Any]] | None] = queue.Queue()

    def emit(
        self,
        key: str,
        label: str,
        message: str,
        status: str = "running",
        provider: str | None = None,
        metadata: dict[str, Any] | None = None,
    ) -> None:
        event = TraceEvent(
            id=f"{self.session_id}:{len(self.events) + 1:03d}",
            key=key,
            label=label,
            message=message,
            status=status,
            provider=provider,
            elapsed_ms=round((time.perf_counter() - self.started_at) * 1000),
            metadata=metadata or {},
        )
        self.events.append(event)
        self._queue.put(("trace", event.to_dict()))

    def result(self, payload: dict[str, Any]) -> None:
        self._queue.put(("result", payload))

    def error(self, message: str, status_code: int = 500) -> None:
        self._queue.put(("error", {"message": message, "status_code": status_code}))

    def close(self) -> None:
        self._queue.put(None)

    def stream(self) -> Iterator[str]:
        yield sse_encode("hello", {"session_id": self.session_id})
        while True:
            item = self._queue.get()
            if item is None:
                yield sse_encode("done", {"session_id": self.session_id})
                break
            event, data = item
            yield sse_encode(event, data)


def emit_trace(
    sink: TraceSink | None,
    key: str,
    label: str,
    message: str,
    status: str = "running",
    provider: str | None = None,
    metadata: dict[str, Any] | None = None,
) -> None:
    if sink:
        sink(key, label, message, status, provider, metadata)
