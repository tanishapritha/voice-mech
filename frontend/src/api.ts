const API_BASE = (import.meta.env.VITE_API_BASE_URL || "http://localhost:8000").replace(/\/$/, "");

export type DemoStatus = {
  id: number;
  status: "ready" | "working" | "blocked" | "complete";
  revision: number;
  updated_at: string;
};

export type TraceEvent = {
  id: number;
  session_id: string | null;
  trace_id: string;
  turn_id: string | null;
  tool_execution_id: string | null;
  event_type: string;
  occurred_at: string;
  details: Record<string, unknown>;
};

export type VoiceSession = { session_id: string; trace_id: string; status: string };
export type TraceEventIn = {
  event_type: "transcript.final" | "voice.command.parse_failed" | "response.started" | "response.completed" | "voice.error";
  turn_id?: string;
  details: Record<string, unknown>;
};

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers || {}) },
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.detail || `Request failed (${response.status})`);
  }
  return response.json() as Promise<T>;
}

export const api = {
  health: () => request<{ status: string; database: string }>("/health"),
  getStatus: () => request<DemoStatus>("/api/v1/demo/status"),
  startSession: () => request<VoiceSession>("/api/v1/sessions", { method: "POST", body: "{}" }),
  endSession: (id: string) => request<{ status: string }>(`/api/v1/sessions/${id}/end`, { method: "POST" }),
  events: (id: string) => request<TraceEvent[]>(`/api/v1/sessions/${id}/events`),
  addEvent: (id: string, body: TraceEventIn) =>
    request<TraceEvent>(`/api/v1/sessions/${id}/events`, { method: "POST", body: JSON.stringify(body) }),
  updateStatus: (body: { status: DemoStatus["status"]; idempotency_key: string; session_id: string | null; turn_id: string }) =>
    request<{ success: boolean; tool_execution_id: string; trace_id: string; status: string; revision: number; verified: boolean; message: string }>(
      "/api/v1/tools/update-demo-status",
      { method: "POST", body: JSON.stringify(body) },
    ),
};
