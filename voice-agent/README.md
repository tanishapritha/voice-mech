# Live voice integration

The frontend and FastAPI backend currently provide the first integration slice: Neon-backed status tool, session lifecycle, trace IDs, event timeline, and a LiveKit token endpoint.

## Next integration step

Choose and pin a LiveKit Agents release and tested STT/LLM/TTS plugin set; then add an agent worker using that version's supported APIs.

Agent invariants:
- create an API session and carry `session_id` and `trace_id` in each tool request;
- invoke `POST /api/v1/tools/update-demo-status` only from finalized, validated user intent;
- reuse the same idempotency key for retries of one intended action;
- speak only the status and revision returned after backend commit verification;
- invalidate not-yet-executed tool plans after interruption;
- do not log secrets or raw audio by default.

Call `POST /api/v1/voice/token` with JSON `{"identity":"local-tester"}` to get a short-lived room token. This is a Phase 1 development convenience, not authentication. Do not expose it publicly until identity/authentication is implemented.
