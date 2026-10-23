# Voice Mech — Phase 1

A minimal, traceable voice-to-database proof of concept.

## Architecture

- `frontend/`: Vite + React + TypeScript session/debug UI.
- `backend/`: FastAPI, PostgreSQL (Neon), deterministic tool execution, trace events.
- `voice-agent/`: integration boundary for a selected LiveKit Agents worker. Actual audio plugins must be configured before live speech is available.

The UI's test control uses the same backend tool intended for voice calls. Database changes are performed by the backend, never by the browser.

## Requirements

- Python 3.11+
- Node.js 20+
- PostgreSQL database (Neon is supported)
- Optional LiveKit Cloud credentials plus compatible STT/LLM/TTS providers

## Run locally

### Backend

```powershell
cd backend
python -m venv .venv
.venv\\Scripts\\Activate.ps1
pip install -r requirements.txt
Copy-Item .env.example .env
# Edit backend/.env and set DATABASE_URL
uvicorn app.main:app --reload --port 8000
```

On macOS/Linux, activate with `source .venv/bin/activate` and copy with `cp .env.example .env`.

Open `http://localhost:8000/docs`. The app creates Phase 1 tables at startup. `GET /health` verifies API and database connectivity.

### Frontend

```powershell
cd frontend
npm install
Copy-Item .env.example .env.local
npm run dev
```

On macOS/Linux use `cp .env.example .env.local`. Open the URL Vite prints, normally `http://localhost:5173`.

The UI supports connection checks, session start/end, trace timeline, and a real database tool call. It does **not** fake microphone input. Actual realtime audio requires a chosen LiveKit Agents version and configured audio/LLM plugins.

## Environment

Backend (`backend/.env`):
- `DATABASE_URL`: Neon/Postgres connection string. For production, use TLS and a suitable pooled connection for app traffic.
- `FRONTEND_ORIGIN`: frontend origin (local default: `http://localhost:5173`).
- `APP_ENV`: development/production.
- `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`: required only for voice room token creation.
- `SESSION_TOKEN_TTL_SECONDS`: short-lived LiveKit token expiry.

Frontend (`frontend/.env.local`):
- `VITE_API_BASE_URL`: backend URL (local default: `http://localhost:8000`).

Never put database credentials or server API secrets in frontend variables. Never commit real `.env` files.

## API

- `GET /health`
- `POST /api/v1/sessions`
- `POST /api/v1/sessions/{session_id}/end`
- `GET /api/v1/sessions/{session_id}/events`
- `GET /api/v1/demo/status`
- `POST /api/v1/tools/update-demo-status`
- `POST /api/v1/voice/token`

## Smoke test

1. Start the backend and confirm `/health` returns `database: connected`.
2. Open the frontend and start a session.
3. Execute a demo status update.
4. Confirm status/revision changed and persisted.
5. Inspect the correlated `session.started`, `tool.requested`, `db.write.completed`, and `tool.completed` events.
6. End the session and confirm further write attempts using that session are rejected.

## Scope/safety limitations

This is a Phase 1 development baseline, not production-ready multi-tenant software. It has no user authentication or tenant authorization yet. Use demo data only. The LiveKit token route is not an authentication system and should not be exposed publicly before real identity controls are added.

The completed baseline covers the backend/database/trace slice. The actual LiveKit Agents worker and realtime STT/LLM/TTS plugin pipeline remains to be implemented and tested after choosing the provider stack.
