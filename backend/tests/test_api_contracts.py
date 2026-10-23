from app.schemas import EventIn, UpdateDemoStatusIn


def test_status_tool_schema_rejects_unknown_status():
    try:
        UpdateDemoStatusIn(status="deleted", idempotency_key="test-key-123", turn_id="turn-1")
    except Exception:
        return
    raise AssertionError("Unknown status must not validate")


def test_trace_event_schema_only_accepts_allowlisted_event_types():
    event = EventIn(event_type="transcript.final", turn_id="turn-1", details={"transcript": "hello"})
    assert event.event_type == "transcript.final"

    try:
        EventIn(event_type="arbitrary.internal.event", details={})
    except Exception:
        return
    raise AssertionError("Arbitrary trace event types must not validate")
