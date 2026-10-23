from contextlib import asynccontextmanager
from uuid import UUID
import secrets

from fastapi import Depends, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.config import get_settings
from app.db import DemoStatus, SessionLocal, TraceEvent, VoiceSession, initialize_database
from app.schemas import DemoStatusOut, EventOut, SessionCreated, ToolResultOut, UpdateDemoStatusIn
from app.services import create_session, end_session, run_update_demo_tool

settings = get_settings()


@asynccontextmanager
async def lifespan(_: FastAPI):
    initialize_database()
    yield


app = FastAPI(title="Voice Mech API", version="0.1.0", lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=[settings.frontend_origin], allow_credentials=False,
                   allow_methods=["GET", "POST", "OPTIONS"], allow_headers=["Content-Type", "X-Request-ID"])


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
    return db.query(TraceEvent).filter(TraceEvent.session_id == session_id).order_by(TraceEvent.id.asc()).all()


@app.get("/api/v1/demo/status", response_model=DemoStatusOut)
def read_demo_status(db: Session = Depends(get_db)):
    row = db.get(DemoStatus, 1)
    if row is None:
        raise HTTPException(status_code=503, detail="Demo record is not initialized.")
    return row


@app.post("/api/v1/tools/update-demo-status", response_model=ToolResultOut)
def update_demo_status(body: UpdateDemoStatusIn, db: Session = Depends(get_db)):
    try:
        return run_update_demo_tool(db, status=body.status, idempotency_key=body.idempotency_key,
                                    session_id=body.session_id, turn_id=body.turn_id)
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail="Tool execution failed; no success was reported.") from exc


@app.post("/api/v1/voice/token")
def create_voice_token():
    if not settings.livekit_url or not settings.livekit_api_key or not settings.livekit_api_secret:
        raise HTTPException(status_code=503, detail="LiveKit credentials are not configured.")
    try:
        from livekit import api
        room_name = f"voice-mech-{secrets.token_hex(8)}"
        token = (api.AccessToken(settings.livekit_api_key, settings.livekit_api_secret)
                 .with_identity(f"web-{secrets.token_hex(5)}")
                 .with_name("Voice Mech tester")
                 .with_grants(api.VideoGrants(room_join=True, room=room_name, can_publish=True, can_subscribe=True))
                 .with_ttl(settings.session_token_ttl_seconds))
        return {"url": settings.livekit_url, "token": token.to_jwt(), "room_name": room_name}
    except Exception as exc:
        raise HTTPException(status_code=500, detail="Could not create voice token.") from exc
