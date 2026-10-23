import { useCallback, useEffect, useState } from "react";
import { Activity, AudioLines, CheckCircle2, CircleStop, Database, Mic, RefreshCw, Radio, Server, ShieldAlert, Wifi, WifiOff } from "lucide-react";
import { api, type DemoStatus, type TraceEvent, type VoiceSession } from "./api";

export default function App() {
  const [health, setHealth] = useState<"checking" | "connected" | "failed">("checking");
  const [dbStatus, setDbStatus] = useState<DemoStatus | null>(null);
  const [session, setSession] = useState<VoiceSession | null>(null);
  const [events, setEvents] = useState<TraceEvent[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("Start a session, then test a real database tool.");
  const [selectedStatus, setSelectedStatus] = useState<DemoStatus["status"]>("working");

  const refresh = useCallback(async () => {
    try {
      const [h, status] = await Promise.all([api.health(), api.getStatus()]);
      setHealth(h.database === "connected" ? "connected" : "failed");
      setDbStatus(status);
      if (session) setEvents(await api.events(session.session_id));
      setError("");
    } catch (e) {
      setHealth("failed");
      setError(e instanceof Error ? e.message : "Could not connect to backend.");
    }
  }, [session]);

  useEffect(() => { void refresh(); }, [refresh]);

  const start = async () => {
    setBusy(true); setError("");
    try {
      const result = await api.startSession();
      setSession(result); setEvents([]);
      setNotice("Session started. The next tool call will be tied to this trace.");
    } catch (e) { setError(e instanceof Error ? e.message : "Could not start session."); }
    finally { setBusy(false); }
  };

  const stop = async () => {
    if (!session) return;
    setBusy(true); setError("");
    try {
      await api.endSession(session.session_id);
      setNotice("Session ended. New tool writes for this session will be rejected.");
      setSession(null);
    } catch (e) { setError(e instanceof Error ? e.message : "Could not end session."); }
    finally { setBusy(false); await refresh(); }
  };

  const runTool = async () => {
    setBusy(true); setError("");
    const turnId = crypto.randomUUID();
    try {
      const result = await api.updateStatus({
        status: selectedStatus, idempotency_key: crypto.randomUUID(),
        session_id: session?.session_id ?? null, turn_id: turnId,
      });
      if (!result.success || !result.verified) throw new Error("Backend did not verify the committed result.");
      setNotice(`Verified DB write: status is “${result.status}”, revision ${result.revision}. A voice response must use this result.`);
      await refresh();
    } catch (e) { setError(e instanceof Error ? e.message : "Tool call failed."); }
    finally { setBusy(false); }
  };

  const refreshEvents = async () => {
    if (!session) return;
    try { setEvents(await api.events(session.session_id)); }
    catch (e) { setError(e instanceof Error ? e.message : "Could not load events."); }
  };

  return (
    <main className="shell">
      <header className="topbar">
        <div className="brand"><div className="brand-mark"><AudioLines size={22} /></div><div><strong>voice mech</strong><span>Phase 1 · voice loop verification</span></div></div>
        <div className={`connection ${health}`}>{health === "connected" ? <Wifi size={16} /> : health === "failed" ? <WifiOff size={16} /> : <RefreshCw size={16} className="spin" />}{health === "connected" ? "API + database connected" : health === "failed" ? "Connection failed" : "Connecting…"}</div>
      </header>

      <section className="intro">
        <p className="eyebrow">END-TO-END TEST BENCH</p>
        <h1>Make every voice action<br /><em>verifiable.</em></h1>
        <p className="intro-copy">Validate the backend, Neon database, tool execution, and event trace before connecting a live audio provider.</p>
      </section>

      <section className="grid">
        <article className="panel main-panel">
          <div className="panel-heading"><div><p className="eyebrow">SESSION</p><h2>Voice connection</h2></div><span className={`pill ${session ? "live" : ""}`}><span className="dot" />{session ? "Session active" : "No active session"}</span></div>
          <div className="session-box">
            <div className="mic-orbit"><div className="mic-core">{session ? <Radio size={28} /> : <Mic size={28} />}</div><div className="orbit orbit-one" /><div className="orbit orbit-two" /></div>
            <p className="session-title">{session ? "Trace is running" : "Ready to test the voice path"}</p>
            <p className="muted">{session ? `Session ${session.session_id.slice(0, 8)}…` : "Start a traceable session, then invoke the backend tool."}</p>
            <div className="session-actions">{!session ? <button className="button primary" onClick={() => void start()} disabled={busy || health !== "connected"}><Radio size={16} /> Start session</button> : <button className="button secondary" onClick={() => void stop()} disabled={busy}><CircleStop size={16} /> End session</button>}</div>
          </div>
          <div className="note"><ShieldAlert size={17} /><span>This screen does not fake microphone input. Live audio transport and STT/TTS must be configured separately; the tool test below executes against the real backend.</span></div>
        </article>

        <article className="panel">
          <div className="panel-heading"><div><p className="eyebrow">AUTHORITATIVE STATE</p><h2>Demo record</h2></div><Database size={20} className="subtle-icon" /></div>
          <div className="state-card"><span className="state-label">Current status</span><strong className={`status status-${dbStatus?.status || "unknown"}`}>{dbStatus?.status || "—"}</strong><div className="state-meta"><span>Record ID <b>{dbStatus?.id ?? "—"}</b></span><span>Revision <b>{dbStatus?.revision ?? "—"}</b></span></div><p className="state-updated">{dbStatus ? `Last updated ${new Date(dbStatus.updated_at).toLocaleString()}` : "Waiting for database"}</p></div>
          <label className="field-label" htmlFor="status">Run a backend tool</label>
          <select id="status" value={selectedStatus} onChange={(e) => setSelectedStatus(e.target.value as DemoStatus["status"])} disabled={busy}><option value="ready">Set to ready</option><option value="working">Set to working</option><option value="blocked">Report blocked</option><option value="complete">Mark complete</option></select>
          <button className="button primary full" onClick={() => void runTool()} disabled={busy || health !== "connected"}><CheckCircle2 size={16} />{busy ? "Executing…" : "Execute + verify DB write"}</button>
          <p className="microcopy">A real API request updates Neon, writes trace events, and returns the committed record revision.</p>
        </article>

        <article className="panel trace-panel">
          <div className="panel-heading"><div><p className="eyebrow">OBSERVABILITY</p><h2>Session trace</h2></div><button className="icon-button" onClick={() => void refreshEvents()} disabled={!session || busy} aria-label="Refresh trace"><RefreshCw size={16} /></button></div>
          <div className="trace-meta"><span><Activity size={15} /> {events.length} events</span><span><Server size={15} /> PostgreSQL persisted</span></div>
          {session && <div className="trace-ids"><span>trace_id</span><code>{session.trace_id}</code><span>session_id</span><code>{session.session_id}</code></div>}
          {events.length ? <div className="timeline">{events.map((event) => <div className="event" key={event.id}><div className="event-line"><span className="event-dot" /><span className="event-time">{new Date(event.occurred_at).toLocaleTimeString()}</span></div><div className="event-body"><strong>{event.event_type}</strong><code>{JSON.stringify(event.details)}</code>{event.tool_execution_id && <small>tool: {event.tool_execution_id.slice(0, 12)}…</small>}</div></div>)}</div> : <div className="empty-trace"><Activity size={24} /><p>No events yet</p><span>Start a session and execute a tool to populate the trace.</span></div>}
        </article>
      </section>

      <footer><span>VOICE MECH / LAB 001</span><span>Backend-authoritative · Traceable · No simulated success</span></footer>
      {error && <div className="toast error" role="alert">{error}<button onClick={() => setError("")}>Dismiss</button></div>}
      {notice && <div className="toast notice" role="status">{notice}<button onClick={() => setNotice("")}>Dismiss</button></div>}
    </main>
  );
}
