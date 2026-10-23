# Voice Mech — Phase 1

A minimal, traceable voice-to-database proof of concept.

## What's implemented

- Vite + React + TypeScript UI with a live transcript area and session trace.
- Browser speech recognition (English India locale where the browser supports it).
- Browser speech synthesis for responses.
- FastAPI backend connected to PostgreSQL/Neon.
- Deterministic voice command parsing for demo status: `ready`, `working`, `blocked`, `complete`.
- Idempotent backend status tool, transaction lock, committed-value verification.
- Persisted `session.started`, `transcript.final`, `tool.requested`, `db.write.completed`, `tool.completed`, and response/error events.
- Optional LiveKit token endpoint as a future real-time voice integration boundary.

This is deliberately a constrained voice proof, not an open-ended AI agent. The browser speech service may process audio remotely depending on browser implementation. Raw audio is not stored by this app.

## Run locally

Requirements: Python 3.11+, Node.js 20+, a Neon/PostgreSQL database.

### Backend (PowerShell)

```powershell
cd backend
python -m venv .venv
.venv\\Scripts\\Activate.ps1
pip install -r requirements.txt
Copy-Item .env.example .env
# Add your Neon DATABASE_URL to backend/.env
uvicorn app.main:app --reload --port 8000
```

On macOS/Linux use `source .venv/bin/activate` and `cp .env.example .env`.

Open `http://localhost:8000/docs`; check `GET /health` returns database connected.

### Frontend

Open a new terminal:

```powershell
cd frontend
npm install
Copy-Item .env.example .env.local
npm run dev
```

On macOS/Linux use `cp .env.example .env.local`. Open `http://localhost:5173`.

## Smoke test

1. Ensure frontend and backend both run and backend health reports the database as connected.
2. Click **Start session**.
3. Click **Start speaking**, permit microphone access, and say “set status to blocked” (or working, ready, complete).
4. The finalized transcript should appear. The backend tool should commit the status and increment revision.
5. The browser should speak only the verified status/revision returned from the backend.
6. The trace should include transcript, tool, DB-write, and response events.
7. Use the manual tool test to compare behavior; both paths call the same backend service.

SpeechRecognition is browser-specific, typically best tested in a current Chrome or Edge build with microphone access. If unavailable, use the manual tool test to check the DB slice.

## Environment

Backend `backend/.env`:
- `DATABASE_URL`: Neon Postgres URL (use TLS).
- `FRONTEND_ORIGIN`: default `http://localhost:5173`.
- `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`: optional, used only by the token endpoint.
- `SESSION_TOKEN_TTL_SECONDS`: default 600.

Frontend `frontend/.env.local`:
- `VITE_API_BASE_URL=http://localhost:8000`.

Never store secret keys or the database URL in frontend variables or commit real environment files.

## API endpoints

- `GET /health`
- `POST /api/v1/sessions`
- `POST /api/v1/sessions/{session_id}/end`
- `GET /api/v1/sessions/{session_id}/events`
- `POST /api/v1/sessions/{session_id}/events`
- `GET /api/v1/demo/status`
- `POST /api/v1/tools/update-demo-status`
- `POST /api/v1/voice/token` (optional LiveKit integration)

## Scope limits

This is a Phase 1 development baseline, not production-ready multi-tenant software. It has no user authentication or tenant authorization, so use demo data only. The LiveKit token endpoint is a development convenience and must not be exposed publicly until authentication/identity controls are added. Browser speech is not a substitute for load-tested production realtime voice infrastructure.
