from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field


class SessionCreated(BaseModel):
    session_id: UUID
    trace_id: UUID
    status: str


class EventIn(BaseModel):
    event_type: Literal[
        "transcript.final", "voice.command.parse_failed",
        "response.started", "response.completed", "voice.error",
    ]
    turn_id: str | None = Field(default=None, max_length=100)
    details: dict = Field(default_factory=dict)


class EventOut(BaseModel):
    id: int
    session_id: UUID | None
    trace_id: UUID
    turn_id: str | None
    tool_execution_id: str | None
    event_type: str
    occurred_at: datetime
    details: dict


class DemoStatusOut(BaseModel):
    id: int
    status: str
    revision: int
    updated_at: datetime


class UpdateDemoStatusIn(BaseModel):
    status: Literal["ready", "working", "blocked", "complete"]
    idempotency_key: str = Field(min_length=8, max_length=180)
    session_id: UUID | None = None
    turn_id: str = Field(min_length=1, max_length=100)


class ToolResultOut(BaseModel):
    success: bool
    tool_execution_id: str
    trace_id: UUID
    status: str
    revision: int
    verified: bool
    message: str
