from typing import Any
from uuid import UUID

from sqlalchemy.orm import Session

from app.db import TraceEvent


def emit_event(db: Session, *, trace_id: UUID, event_type: str, session_id: UUID | None = None,
               turn_id: str | None = None, tool_execution_id: str | None = None,
               details: dict[str, Any] | None = None) -> TraceEvent:
    event = TraceEvent(trace_id=trace_id, event_type=event_type, session_id=session_id,
                       turn_id=turn_id, tool_execution_id=tool_execution_id, details=details or {})
    db.add(event)
    db.flush()
    return event
