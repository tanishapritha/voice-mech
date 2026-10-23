# Voice Mech — Phase 1

A minimal, traceable voice-to-database proof of concept.

## Architecture

- `frontend/`: Vite + React + TypeScript session/debug UI.
- `backend/`: FastAPI, PostgreSQL (Neon), deterministic tool execution, trace events.
- `voice-agent/`: optional LiveKit Agents worker entry point. The backend can be tested without voice credentials.

The UI's demo controls use the same backend tool that a voice runtime will call. Database changes are performed by the backend, never by the browser.

## Requirements

- Python 3.11+
- Node.js 20+
- PostgreSQL database (Neon is supported)
- Optional LiveKit Cloud credentials and a compatible LLM/STT/TTS setup for the real-time worker.

## Run locally

### 1. Backend

```bash
cd backend
python -m venv .venv
# Windows PowerShell:
.venv\\Scripts\\Activate.ps1
# macOS/Linux:
# source .venv/bin/activate
pip install -r requirements.txt
copy .env.example .env
# Set DATABASE_URL in backend/.env
uvicorn app.main:app --reload --port 8000
```

On macOS/Linux, replace `copy .env.example .env` with `cp .env.example .env`.

Open `http://localhost:8000/docs`. The app will create the Phase 1 tables at startup. `GET /health` checks the service and database.

### 2. Frontend

```bash
cd frontend
npm install
copy .env.example .env.local
npm run dev
```

On macOS/Linux, use `cp .env.example .env.local`. Open the URL Vite prints (normally `http://localhost:5173`).

The frontend provides a connection check, session start/end, a trace timeline, and a test tool call. Browser microphone access is not yet wired to a speech provider; it is deliberately not simulated. Connect the selected voice runtime in Phase 1 integration after configuring LiveKit and model/STT/TTS credentials.

### 3. Optional voice agent

The worker is an explicit integration boundary; install and run it only after choosing the LiveKit Agents version and model/audio plugins for your provider. See `voice-agent/README.md`.

## Environment variables

Backend (`backend/.env`):

- `DATABASE_URL`: Neon/Postgres connection string. Use the pooled URL for app traffic if desired; ensure migrations/schema setup uses a compatible URL.
- `FRONTEND_ORIGIN`: local frontend origin or deployed frontend origin.
- `APP_ENV`: `development` or `production`.
- `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`: required only for server-issued LiveKit tokens.
- `SESSION_TOKEN_TTL_SECONDS`: short-lived token expiry.

Frontend (`frontend/.env.local`):

- `VITE_API_BASE_URL`: backend URL, e.g. `http://localhost:8000`.

Never put server secrets or database credentials in frontend environment variables. Never commit real `.env` files.

## API

- `GET /health`: service/database health.
- `POST /api/v1/sessions`: create traceable session.
- `POST /api/v1/sessions/{session_id}/end`: end session.
- `GET /api/v1/sessions/{session_id}/events`: ordered events.
- `GET /api/v1/demo/status`: read the demo record.
- `POST /api/v1/tools/update-demo-status`: idempotent status write (demo UI/voice tool entry point).
- `POST /api/v1/voice/token`: mint short-lived LiveKit room token when credentials are configured.

## Phase 1 limitations

- The demo status action is not production authorization. There is no user authentication or tenant isolation yet; do not use real customer data.
- Live audio is not falsely represented as implemented. The app gives you a real backend/database/trace slice; a selected provider's realtime transport + STT/TTS/LLM plugins must still be configured to complete actual spoken input/output.
- Do not report an operation successful until the database write has committed and been re-read/verified.
