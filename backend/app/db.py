from datetime import datetime, timezone
from uuid import uuid4

from sqlalchemy import DateTime, String, create_engine
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, sessionmaker

from app.config import get_settings


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


settings = get_settings()
database_url = settings.database_url
if database_url.startswith("postgresql://"):
    database_url = database_url.replace("postgresql://", "postgresql+psycopg://", 1)

engine = create_engine(database_url, pool_pre_ping=True, pool_recycle=300, connect_args={"connect_timeout": 8})
SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


class DemoStatus(Base):
    __tablename__ = "phase1_demo_status"
    id: Mapped[int] = mapped_column(primary_key=True, default=1)
    status: Mapped[str] = mapped_column(String(40), nullable=False, default="ready")
    revision: Mapped[int] = mapped_column(nullable=False, default=0)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utcnow, onupdate=utcnow)


class VoiceSession(Base):
    __tablename__ = "voice_sessions"
    id: Mapped[object] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid4)
    status: Mapped[str] = mapped_column(String(24), nullable=False, default="active")
    channel: Mapped[str] = mapped_column(String(32), nullable=False, default="web")
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utcnow)
    ended_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    trace_id: Mapped[object] = mapped_column(UUID(as_uuid=True), nullable=False, default=uuid4)


class TraceEvent(Base):
    __tablename__ = "trace_events"
    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    session_id: Mapped[object | None] = mapped_column(UUID(as_uuid=True), nullable=True, index=True)
    trace_id: Mapped[object] = mapped_column(UUID(as_uuid=True), nullable=False, index=True)
    turn_id: Mapped[str | None] = mapped_column(String(100), nullable=True, index=True)
    tool_execution_id: Mapped[str | None] = mapped_column(String(100), nullable=True, index=True)
    event_type: Mapped[str] = mapped_column(String(100), nullable=False, index=True)
    occurred_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utcnow, index=True)
    details: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)


class ToolExecution(Base):
    __tablename__ = "tool_executions"
    id: Mapped[str] = mapped_column(String(100), primary_key=True)
    session_id: Mapped[object | None] = mapped_column(UUID(as_uuid=True), nullable=True, index=True)
    trace_id: Mapped[object] = mapped_column(UUID(as_uuid=True), nullable=False, index=True)
    tool_name: Mapped[str] = mapped_column(String(100), nullable=False)
    idempotency_key: Mapped[str] = mapped_column(String(180), nullable=False, unique=True)
    outcome: Mapped[str] = mapped_column(String(24), nullable=False)
    result_json: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utcnow)


def initialize_database() -> None:
    Base.metadata.create_all(bind=engine)
    with SessionLocal() as db:
        row = db.get(DemoStatus, 1)
        if row is None:
            db.add(DemoStatus(id=1, status="ready", revision=0))
            db.commit()
