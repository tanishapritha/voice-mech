import { useCallback, useEffect, useRef, useState } from "react";
import { Activity, AudioLines, CheckCircle2, CircleStop, Database, Mic, MicOff, RefreshCw, Radio, Server, ShieldAlert, Wifi, WifiOff } from "lucide-react";
import { api, type DemoStatus, type TraceEvent, type VoiceSession } from "./api";

type FinalResult = { isFinal: boolean; 0?: { transcript?: string } };
type ResultList = { length: number; [index: number]: FinalResult };
type RecognitionEvent = Event & { results: ResultList; resultIndex: number };
type Recognition = {
  lang: string; continuous: boolean; interimResults: boolean;
  onresult: ((event: RecognitionEvent) => void) | null;
  onerror: ((event: Event & { error?: string }) => void) | null;
  onend: (() => void) | null; start: () => void; stop: () => void;
};
type RecognitionConstructor = new () => Recognition;
declare global { interface Window { SpeechRecognition?: RecognitionConstructor; webkitSpeechRecognition?: RecognitionConstructor } }

function parseStatus(text: string): DemoStatus["status"] | null {
  const value = text.toLowerCase();
  if (/\b(blocked|block|stuck|can't proceed|cannot proceed)\b/.test(value)) return "blocked";
  if (/\b(complete|completed|finish|finished|done)\b/.test(value)) return "complete";
  if (/\b(working|in progress|start work|started)\b/.test(value)) return "working";
  if (/\b(ready|available|standby)\b/.test(value)) return "ready";
  return null;
}

function speak(text: string) {
  if (!("speechSynthesis" in window)) return;
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(new SpeechSynthesisUtterance(text));
}

export default function App() {
  const [health, setHealth] = useState<"checking" | "connected" | "failed">("checking");
  const [dbStatus, setDbStatus] = useState<DemoStatus | null>(null);
  const [session, setSession] = useState<VoiceSession | null>(null);
  const [events, setEvents] = useState<TraceEvent[]>([]);
  const [busy, setBusy] = useState(false);
  const [listening, setListening] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("Start a session, then speak a status command.");
  const [selectedStatus, setSelectedStatus] = useState<DemoStatus["status"]>("working");
  const [transcript, setTranscript] = useState("");
  const [interim, setInterim] = useState("");
  const recognitionRef = useRef<Recognition | null>(null);
  const sessionRef = useRef<VoiceSession | null>(null);
  const busyRef = useRef(false);

  const refresh = useCallback(async () => {
    try {
      const values = await Promise.all([api.health(), api.getStatus()]);
      setHealth(values[0].database === "connected" ? "connected" : "failed");
      setDbStatus(values[1]);
      if (sessionRef.current) setEvents(await api.events(sessionRef.current.session_id));
      setError("");
    } catch (e) {
      setHealth("failed");
      setError(e instanceof Error ? e.message : "Could not connect to backend.");
    }
  }, []);
  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => { sessionRef.current = session; }, [session]);
  useEffect(() => () => {
    recognitionRef.current?.stop();
    if ("speechSynthesis" in window) window.speechSynthesis.cancel();
  }, []);

  async function logEvent(event_type: "transcript.final" | "voice.command.parse_failed" | "response.started" | "response.completed" | "voice.error", turn_id: string, details: Record<string, unknown>) {
    const active = sessionRef.current;
    if (!active) return;
    await api.addEvent(active.session_id, { event_type, turn_id, details });
    setEvents(await api.events(active.session_id));
  }

  async function startSession() {
    setBusy(true); setError("");
    try {
      const result = await api.startSession();
      sessionRef.current = result; setSession(result); setEvents([]);
      setNotice("Session started. Try saying: set status to blocked.");
    } catch (e) { setError(e instanceof Error ? e.message : "Could not start session."); }
    finally { setBusy(false); }
  }

  async function endSession() {
    const active = sessionRef.current;
    if (!active) return;
    setBusy(true); recognitionRef.current?.stop(); setListening(false);
    try {
      await api.endSession(active.session_id);
      sessionRef.current = null; setSession(null); setEvents([]); setTranscript(""); setInterim("");
      setNotice("Session ended. Writes from this session are no longer accepted.");
    } catch (e) { setError(e instanceof Error ? e.message : "Could not end session."); }
    finally { setBusy(false); await refresh(); }
  }

  async function executeStatus(status: DemoStatus["status"], turnId = crypto.randomUUID()) {
    const active = sessionRef.current;
    if (busyRef.current) return;
    busyRef.current = true; setBusy(true); setError("");
    try {
      const result = await api.updateStatus({
        status: status, idempotency_key: crypto.randomUUID(),
        session_id: active ? active.session_id : null, turn_id: turnId,
      });
      if (!result.success || !result.verified) throw new Error("Backend did not verify the committed result.");
      setDbStatus(await api.getStatus());
      if (active) setEvents(await api.events(active.session_id));
      const responseText = "Confirmed. Status is now " + result.status + ". Revision " + result.revision + " is saved.";
      setNotice(responseText);
      if (active) {
        await logEvent("response.started", turnId, { response_text: responseText });
        speak(responseText);
        await logEvent("response.completed", turnId, { source: "browser_speech_synthesis" });
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : "Tool call failed.";
      setError(message);
      if (active) try { await logEvent("voice.error", turnId, { message: message }); } catch { /* preserve original error */ }
    } finally { busyRef.current = false; setBusy(false); }
  }

  function startListening() {
    setError("");
    if (!sessionRef.current) { setError("Start a session before using the microphone."); return; }
    const Speech = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Speech) { setError("Speech recognition is not supported in this browser. Try Chrome or Edge."); return; }
    recognitionRef.current?.stop();
    const recognition = new Speech();
    recognition.lang = "en-IN"; recognition.continuous = false; recognition.interimResults = true;
    recognition.onresult = (event) => {
      let finalText = ""; let partial = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const part = event.results[i][0]?.transcript || "";
        if (event.results[i].isFinal) finalText += part; else partial += part;
      }
      setInterim(partial);
      if (!finalText.trim()) return;
      const spoken = finalText.trim();
      const turnId = crypto.randomUUID();
      setTranscript(spoken);
      void (async () => {
        try {
          await logEvent("transcript.final", turnId, { transcript: spoken, language: recognition.lang });
          const status = parseStatus(spoken);
          if (!status) {
            await logEvent("voice.command.parse_failed", turnId, { transcript: spoken });
            const help = "I heard you, but this demo only updates status. Say ready, working, blocked, or complete.";
            setNotice(help); speak(help);
            await logEvent("response.completed", turnId, { response_text: help, source: "browser_speech_synthesis" });
            return;
          }
          setSelectedStatus(status);
          await executeStatus(status, turnId);
        } catch (e) { setError(e instanceof Error ? e.message : "Could not process speech."); }
      })();
    };
    recognition.onerror = (event) => {
      const message = event.error || "Speech recognition failed.";
      setError(message);
      void logEvent("voice.error", crypto.randomUUID(), { message: message }).catch(() => undefined);
    };
    recognition.onend = () => { setListening(false); setInterim(""); };
    recognitionRef.current = recognition;
    try { recognition.start(); setListening(true); setNotice("Listening in English (India)."); }
    catch (e) { setListening(false); setError(e instanceof Error ? e.message : "Could not start microphone."); }
  }

  async function refreshEvents() {
    const active = sessionRef.current;
    if (!active) return;
    try { setEvents(await api.events(active.session_id)); }
    catch (e) { setError(e instanceof Error ? e.message : "Could not load events."); }
  }

  return (
    <main className="shell">
      <header className="topbar">
        <div className="brand"><div className="brand-mark"><AudioLines size={22} /></div><div><strong>voice mech</strong><span>Phase 1 · voice loop verification</span></div></div>
        <div className={"connection " + health}>{health === "connected" ? <Wifi size={16} /> : health === "failed" ? <WifiOff size={16} /> : <RefreshCw size={16} className="spin" />}{health === "connected" ? "API + database connected" : health === "failed" ? "Connection failed" : "Connecting…"}</div>
      </header>
      <section className="intro">
        <p className="eyebrow">END-TO-END TEST BENCH</p><h1>Make every voice action<br /><em>verifiable.</em></h1>
        <p className="intro-copy">Speak a status command, execute it through FastAPI, verify the Neon write, and inspect the complete event trace.</p>
      </section>
      <section className="grid">
        <article className="panel main-panel">
          <div className="panel-heading"><div><p className="eyebrow">SESSION</p><h2>Voice connection</h2></div><span className={"pill " + (session ? "live" : "")}><span className="dot" />{session ? "Session active" : "No active session"}</span></div>
          <div className="session-box">
            <div className={"mic-orbit " + (listening ? "listening" : "")}><div className="mic-core">{listening ? <Radio size={28} /> : <Mic size={28} />}</div><div className="orbit orbit-one" /><div className="orbit orbit-two" /></div>
            <p className="session-title">{listening ? "Listening…" : session ? "Trace is running" : "Start a session first"}</p>
            <p className="muted">{session ? "Session " + session.session_id.slice(0, 8) + "…" : "Create a session to correlate speech, writes, and responses."}</p>
            <div className="session-actions">
              {!session ? <button className="button primary" onClick={() => void startSession()} disabled={busy || health !== "connected"}><Radio size={16} /> Start session</button> :
                <div className="button-row"><button className="button primary" onClick={startListening} disabled={busy || listening}><Mic size={16} /> Start speaking</button><button className="button secondary" onClick={() => { recognitionRef.current?.stop(); setListening(false); }} disabled={!listening}><MicOff size={16} /> Stop listening</button><button className="button secondary" onClick={() => void endSession()} disabled={busy || listening}><CircleStop size={16} /> End session</button></div>}
            </div>
          </div>
          <div className="transcript-box"><div className="transcript-label">FINAL TRANSCRIPT</div><p>{transcript || "Your finalized words will appear here."}</p>{interim && <small>Hearing: {interim}</small>}<div className="command-hint">Try: “set status to working”, “report blocked”, “mark complete”.</div></div>
          <div className="note"><ShieldAlert size={17} /><span>This first proof uses browser speech recognition and speech synthesis. Support varies by browser; demo data only. This app does not store raw audio.</span></div>
        </article>
        <article className="panel">
          <div className="panel-heading"><div><p className="eyebrow">AUTHORITATIVE STATE</p><h2>Demo record</h2></div><Database size={20} className="subtle-icon" /></div>
          <div className="state-card"><span className="state-label">Current status</span><strong className={"status status-" + (dbStatus?.status || "unknown")}>{dbStatus?.status || "—"}</strong><div className="state-meta"><span>Record ID <b>{dbStatus?.id ?? "—"}</b></span><span>Revision <b>{dbStatus?.revision ?? "—"}</b></span></div><p className="state-updated">{dbStatus ? "Last updated " + new Date(dbStatus.updated_at).toLocaleString() : "Waiting for database"}</p></div>
          <label className="field-label" htmlFor="status">Manual tool test</label>
          <select id="status" value={selectedStatus} onChange={(e) => setSelectedStatus(e.target.value as DemoStatus["status"])} disabled={busy}><option value="ready">Set to ready</option><option value="working">Set to working</option><option value="blocked">Report blocked</option><option value="complete">Mark complete</option></select>
          <button className="button primary full" onClick={() => void executeStatus(selectedStatus)} disabled={busy || health !== "connected"}><CheckCircle2 size={16} />{busy ? "Executing…" : "Execute + verify DB write"}</button>
          <p className="microcopy">Voice and manual actions share the same backend tool. Success is returned only after a committed value is verified.</p>
        </article>
        <article className="panel trace-panel">
          <div className="panel-heading"><div><p className="eyebrow">OBSERVABILITY</p><h2>Session trace</h2></div><button className="icon-button" onClick={() => void refreshEvents()} disabled={!session || busy} aria-label="Refresh trace"><RefreshCw size={16} /></button></div>
          <div className="trace-meta"><span><Activity size={15} /> {events.length} events</span><span><Server size={15} /> PostgreSQL persisted</span></div>
          {session && <div className="trace-ids"><span>trace_id</span><code>{session.trace_id}</code><span>session_id</span><code>{session.session_id}</code></div>}
          {events.length ? <div className="timeline">{events.map((event) => <div className="event" key={event.id}><div className="event-line"><span className="event-dot" /><span className="event-time">{new Date(event.occurred_at).toLocaleTimeString()}</span></div><div className="event-body"><strong>{event.event_type}</strong><code>{JSON.stringify(event.details)}</code>{event.tool_execution_id && <small>tool: {event.tool_execution_id.slice(0, 12)}…</small>}</div></div>)}</div> : <div className="empty-trace"><Activity size={24} /><p>No events yet</p><span>Start a session and speak or execute a tool to populate the trace.</span></div>}
        </article>
      </section>
      <footer><span>VOICE MECH / LAB 001</span><span>Backend-authoritative · Traceable · No simulated success</span></footer>
      {error && <div className="toast error" role="alert">{error}<button onClick={() => setError("")}>Dismiss</button></div>}
      {notice && <div className="toast notice" role="status">{notice}<button onClick={() => setNotice("")}>Dismiss</button></div>}
    </main>
  );
}
