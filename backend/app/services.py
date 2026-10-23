from uuid import UUID, uuid4

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.db import DemoStatus, ToolExecution, VoiceSession, utcnow
from app.tracing import emit_event


def create_session(db: Session, channel: str = "web") -> VoiceSession:
    session = VoiceSession(channel=channel)
    db.add(session)
    db.flush()
    emit_event(db, trace_id=session.trace_id, session_id=session.id,
               event_type="session.started", details={"channel": channel})
    db.commit()
    db.refresh(session)
    return session


def end_session(db: Session, session_id: UUID) -> VoiceSession | None:
    session = db.get(VoiceSession, session_id)
    if session is None:
        return None
    if session.status != "ended":
        session.status = "ended"
        session.ended_at = utcnow()
        emit_event(db, trace_id=session.trace_id, session_id=session.id,
                   event_type="session.ended", details={"reason": "client_requested"})
        db.commit()
        db.refresh(session)
    return session


def run_update_demo_tool(db: Session, *, status: str, idempotency_key: str,
                         session_id: UUID | None, turn_id: str) -> dict:
    # Reserve the idempotency key before mutating operational state, in the same transaction.
    existing = db.query(ToolExecution).filter_by(idempotency_key=idempotency_key).first()
    if existing is not None:
        result = dict(existing.result_json)
        return {
            "success": existing.outcome == "succeeded",
            "tool_execution_id": existing.id,
            "trace_id": str(existing.trace_id),
            **result,
            "message": "Returned the original idempotent result.",
        }

    session = db.get(VoiceSession, session_id) if session_id else None
    if session_id and session is None:
        raise ValueError("Session not found.")
    if session and session.status != "active":
        raise ValueError("Session has ended; refusing a stale tool call.")

    trace_id = session.trace_id if session else uuid4()
    execution_id = str(uuid4())
    try:
        # Insert a pending execution first. The unique key prevents concurrent duplicates.
        execution = ToolExecution(
            id=execution_id, session_id=session_id, trace_id=trace_id,
            tool_name="update_demo_status", idempotency_key=idempotency_key,
            outcome="pending", result_json={},
        )
        db.add(execution)
        db.flush()
        emit_event(db, trace_id=trace_id, session_id=session_id, turn_id=turn_id,
                   tool_execution_id=execution_id, event_type="tool.requested",
                   details={"tool": "update_demo_status", "status": status})

        row = db.execute(
            select(DemoStatus).where(DemoStatus.id == 1).with_for_update()
        ).scalar_one()
        row.status = status
        row.revision += 1
        db.flush()
        expected_status, expected_revision = row.status, row.revision
        execution.outcome = "succeeded"
        execution.result_json = {
            "status": expected_status, "revision": expected_revision, "verified": True,
        }
        emit_event(db, trace_id=trace_id, session_id=session_id, turn_id=turn_id,
                   tool_execution_id=execution_id, event_type="db.write.completed",
                   details={"record_id": 1, "revision": expected_revision})
        db.commit()
    except IntegrityError:
        db.rollback()
        # Another concurrent request may have committed this exact key first.
        prior = db.query(ToolExecution).filter_by(idempotency_key=idempotency_key).first()
        if prior is not None:
            result = dict(prior.result_json)
            return {
                "success": prior.outcome == "succeeded",
                "tool_execution_id": prior.id,
                "trace_id": str(prior.trace_id),
                **result,
                "message": "Returned the original idempotent result.",
            }
        raise
    except Exception:
        db.rollback()
        raise

    # Re-read the committed state in a fresh transaction before reporting success.
    db.expire_all()
    committed = db.get(DemoStatus, 1)
    if committed is None or committed.status != expected_status or committed.revision != expected_revision:
        raise RuntimeError("Commit verification failed.")

    emit_event(db, trace_id=trace_id, session_id=session_id, turn_id=turn_id,
               tool_execution_id=execution_id, event_type="tool.completed",
               details={"outcome": "succeeded", "revision": committed.revision})
    db.commit()
    return {
        "success": True, "tool_execution_id": execution_id, "trace_id": str(trace_id),
        "status": committed.status, "revision": committed.revision, "verified": True,
        "message": "Status updated to " + committed.status + ".",
    }
