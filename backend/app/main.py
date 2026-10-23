from contextlib import asynccontextmanager
from uuid import UUID

from fastapi import Depends, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.config import get_settings
from app.db import DemoStatus, SessionLocal, TraceEvent, VoiceSession, initialize_database
from app.schemas import DemoStatusOut, EventIn, EventOut, SessionCreated, ToolResultOut, UpdateDemoStatusIn
from app.services import create_session, end_session, run_update_demo_tool
from app.tracing import emit_event
from app.voice import router as voice_router

settings = get_settings()


@asynccontextmanager
async def lifespan(_: FastAPI):
    initialize_database()
    yield


app = FastAPI(title="Voice Mech API", version="0.1.0", lifespan=lifespan)
app.include_router(voice_router)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.frontend_origin],
    allow_credentials=False,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["Content-Type", "X-Request-ID"],
)


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


@app.get("/health")
def health(db: Session = Depends(get_db)):
    try:
        db.execute(text("SELECT 1"))
        return {"status": "ok", "database": "connected"}
    except Exception as exc:
        raise HTTPException(status_code=503, detail="Database unavailable") from exc


@app.post("/api/v1/sessions", response_model=SessionCreated)
def start_session(db: Session = Depends(get_db)):
    session = create_session(db)
    return {"session_id": session.id, "trace_id": session.trace_id, "status": session.status}


@app.post("/api/v1/sessions/{session_id}/end")
def stop_session(session_id: UUID, db: Session = Depends(get_db)):
    session = end_session(db, session_id)
    if session is None:
        raise HTTPException(status_code=404, detail="Session not found.")
    return {"session_id": session.id, "status": session.status, "ended_at": session.ended_at}


@app.get("/api/v1/sessions/{session_id}/events", response_model=list[EventOut])
def session_events(session_id: UUID, db: Session = Depends(get_db)):
    if db.get(VoiceSession, session_id) is None:
        raise HTTPException(status_code=404, detail="Session not found.")
    return db.query(TraceEvent).filter(
        TraceEvent.session_id == session_id
    ).order_by(TraceEvent.id.asc()).all()


@app.post("/api/v1/sessions/{session_id}/events", response_model=EventOut)
def add_session_event(session_id: UUID, body: EventIn, db: Session = Depends(get_db)):
    session = db.get(VoiceSession, session_id)
    if session is None:
        raise HTTPException(status_code=404, detail="Session not found.")
    if session.status != "active":
        raise HTTPException(status_code=409, detail="Session has ended.")
    # Do not persist raw audio here. The frontend is responsible for limiting transcript data.
    event = emit_event(
        db, trace_id=session.trace_id, session_id=session.id,
        turn_id=body.turn_id, event_type=body.event_type, details=body.details,
    )
    db.commit()
    db.refresh(event)
    return event


@app.get("/api/v1/demo/status", response_model=DemoStatusOut)
def read_demo_status(db: Session = Depends(get_db)):
    row = db.get(DemoStatus, 1)
    if row is None:
        raise HTTPException(status_code=503, detail="Demo record is not initialized.")
    return row


@app.post("/api/v1/tools/update-demo-status", response_model=ToolResultOut)
def update_demo_status(body: UpdateDemoStatusIn, db: Session = Depends(get_db)):
    try:
        return run_update_demo_tool(
            db, status=body.status, idempotency_key=body.idempotency_key,
            session_id=body.session_id, turn_id=body.turn_id,
        )
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail="Tool execution failed; no success was reported.",
        ) from exc
