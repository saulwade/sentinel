"use client";

import { useState, useEffect, useCallback } from "react";

const ENGINE = "http://localhost:3001";

interface AgentEvent {
  id: string;
  runId: string;
  seq: number;
  timestamp: number;
  type: string;
  payload: Record<string, unknown>;
}

interface WorldState {
  inbox: Array<{ id: string; from: string; subject: string; read: boolean }>;
  customers: Array<{ id: string; name: string; email: string; company: string; mrr: number }>;
  sentEmails: Array<{ to: string; subject: string }>;
  slackLog: Array<{ channel: string; message: string }>;
}

interface Snapshot {
  seq: number;
  world: WorldState;
  events: AgentEvent[];
}

function eventColor(ev: AgentEvent): string {
  if (ev.type === "decision") {
    const v = (ev.payload as { verdict?: string }).verdict;
    if (v === "ALLOW") return "#2DD4A4";
    if (v === "PAUSE") return "#F7B955";
    if (v === "BLOCK") return "#FF5A5A";
  }
  if (ev.type === "tool_result") return "#8A8A93";
  return "#F5F5F7";
}

function eventIcon(ev: AgentEvent): string {
  if (ev.type === "tool_call") return (ev.payload.tool as string)?.[0]?.toUpperCase() ?? "T";
  if (ev.type === "decision") {
    const v = (ev.payload as { verdict?: string }).verdict;
    if (v === "ALLOW") return "\u2713";
    if (v === "PAUSE") return "\u23F8";
    if (v === "BLOCK") return "\u2717";
  }
  if (ev.type === "tool_result") return "\u2190";
  return "\u2022";
}

function eventLabel(ev: AgentEvent): string {
  if (ev.type === "tool_call") return String(ev.payload.tool);
  if (ev.type === "decision") return String((ev.payload as { verdict?: string }).verdict);
  if (ev.type === "tool_result") return `${ev.payload.tool} result`;
  return ev.type;
}

export default function Timeline({ runId, visible }: { runId: string | null; visible?: boolean }) {
  const [events, setEvents] = useState<AgentEvent[]>([]);
  const [cursor, setCursor] = useState<number>(0);
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [editJson, setEditJson] = useState("");
  const [forking, setForking] = useState(false);
  const [forkRunId, setForkRunId] = useState<string | null>(null);

  useEffect(() => {
    if (!runId || !visible) return;
    fetch(`${ENGINE}/timeline/${runId}`)
      .then((r) => r.json())
      .then((evts: AgentEvent[]) => {
        setEvents(evts);
        if (evts.length > 0) setCursor(evts[evts.length - 1].seq);
      });
  }, [runId, visible]);

  useEffect(() => {
    if (!runId || cursor === 0) return;
    fetch(`${ENGINE}/timeline/${runId}/snapshot/${cursor}`)
      .then((r) => r.json())
      .then((s: Snapshot) => {
        setSnap(s);
        setEditJson(JSON.stringify(s.world, null, 2));
      });
  }, [runId, cursor]);

  // Keyboard: left/right to scrub
  useEffect(() => {
    if (!visible || events.length === 0) return;
    function onKey(e: KeyboardEvent) {
      if (e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLInputElement) return;
      if (e.key === "ArrowLeft") {
        setCursor((c) => {
          const idx = events.findIndex((ev) => ev.seq === c);
          return idx > 0 ? events[idx - 1].seq : c;
        });
      }
      if (e.key === "ArrowRight") {
        setCursor((c) => {
          const idx = events.findIndex((ev) => ev.seq === c);
          return idx < events.length - 1 ? events[idx + 1].seq : c;
        });
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [visible, events]);

  const handleFork = useCallback(async () => {
    if (!runId || !editJson) return;
    setForking(true);
    try {
      const res = await fetch(`${ENGINE}/fork/${runId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fromSeq: cursor, editedWorld: JSON.parse(editJson) }),
      });
      const data = await res.json();
      setForkRunId(data.forkRunId ?? null);
    } catch (err) {
      console.error("Fork failed:", err);
    } finally {
      setForking(false);
    }
  }, [runId, cursor, editJson]);

  if (!runId) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3">
        <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ background: "#14141A" }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#8A8A93" strokeWidth="1.5">
            <circle cx="12" cy="12" r="10" />
            <polyline points="12 6 12 12 16 14" />
          </svg>
        </div>
        <p className="font-mono text-sm" style={{ color: "#F5F5F7" }}>Timeline</p>
        <p className="font-mono text-xs" style={{ color: "#8A8A93" }}>
          Run the agent first, then scrub through events with arrow keys
        </p>
      </div>
    );
  }

  const currentEvt = snap?.events.find((e) => e.seq === cursor);
  const p = currentEvt?.payload as Record<string, unknown> | undefined;

  return (
    <div className="flex flex-col h-full">
      {/* ── Event list + scrubber ──────────────────────────────────────── */}
      <div className="px-4 py-3 border-b shrink-0" style={{ borderColor: "#262630" }}>
        <div className="flex items-center gap-2 mb-3">
          <span className="text-[10px] font-mono uppercase tracking-widest" style={{ color: "#8A8A93" }}>
            Timeline
          </span>
          <span className="text-[10px] font-mono" style={{ color: "#8A8A93" }}>
            {events.length} events
          </span>
          <span className="text-[10px] font-mono ml-auto" style={{ color: "#A78BFA" }}>
            use arrow keys to scrub
          </span>
        </div>

        {/* Event chips */}
        <div className="flex gap-1 flex-wrap">
          {events.map((ev) => {
            const isCurrent = ev.seq === cursor;
            const color = eventColor(ev);
            return (
              <button
                key={ev.id}
                onClick={() => setCursor(ev.seq)}
                className="flex items-center gap-1 px-1.5 py-1 rounded text-[10px] font-mono transition-all duration-150"
                style={{
                  background: isCurrent ? color + "20" : "#14141A",
                  border: isCurrent ? `1px solid ${color}` : "1px solid #262630",
                  color: isCurrent ? color : "#8A8A93",
                  transform: isCurrent ? "scale(1.05)" : undefined,
                }}
              >
                <span>{eventIcon(ev)}</span>
                <span>#{ev.seq}</span>
              </button>
            );
          })}
        </div>

        {/* Range slider */}
        {events.length > 0 && (
          <input
            type="range"
            min={events[0]?.seq ?? 1}
            max={events[events.length - 1]?.seq ?? 1}
            value={cursor}
            onChange={(e) => setCursor(Number(e.target.value))}
            className="w-full mt-3"
          />
        )}
      </div>

      {/* ── Body ──────────────────────────────────────────────────────── */}
      <div className="flex flex-1 min-h-0">
        {/* State panel */}
        <div className="flex-1 overflow-y-auto border-r p-4" style={{ borderColor: "#262630" }}>
          {/* Current event card */}
          {currentEvt && (
            <div
              className="mb-4 p-3 rounded-lg animate-fade-in"
              style={{
                background: eventColor(currentEvt) + "08",
                border: `1px solid ${eventColor(currentEvt)}30`,
              }}
            >
              <div className="flex items-center gap-2 mb-1">
                <span
                  className="w-5 h-5 rounded flex items-center justify-center text-[10px] font-mono font-bold"
                  style={{ background: eventColor(currentEvt) + "20", color: eventColor(currentEvt) }}
                >
                  {eventIcon(currentEvt)}
                </span>
                <span className="text-[10px] font-mono uppercase tracking-widest" style={{ color: "#8A8A93" }}>
                  Event #{cursor}
                </span>
                <span className="text-xs font-mono font-bold" style={{ color: eventColor(currentEvt) }}>
                  {currentEvt.type === "tool_call" ? `${p?.tool}(${JSON.stringify(p?.args).slice(0, 30)})` :
                   currentEvt.type === "decision" ? `Pre-cog: ${p?.verdict}` :
                   currentEvt.type === "tool_result" ? `${p?.tool} returned` : currentEvt.type}
                </span>
              </div>
              {currentEvt.type === "decision" && p?.reasoning != null && (
                <p className="text-xs font-mono mt-1 leading-relaxed" style={{ color: "#8A8A93" }}>
                  {String(p.reasoning)}
                </p>
              )}
            </div>
          )}

          <div className="text-[10px] font-mono uppercase tracking-widest mb-3" style={{ color: "#8A8A93" }}>
            World State at #{cursor}
          </div>

          {snap && (
            <div className="space-y-4">
              {/* Summary counters */}
              <div className="grid grid-cols-4 gap-2">
                {[
                  { label: "Emails", value: snap.world.inbox.length, color: "#F5F5F7" },
                  { label: "Read", value: snap.world.inbox.filter((e) => e.read).length, color: "#8A8A93" },
                  { label: "Sent", value: snap.world.sentEmails.length, color: snap.world.sentEmails.length > 0 ? "#FF5A5A" : "#2DD4A4" },
                  { label: "Slack", value: snap.world.slackLog.length, color: "#8A8A93" },
                ].map((s) => (
                  <div key={s.label} className="p-2.5 rounded-lg text-center" style={{ background: "#14141A" }}>
                    <div className="text-xl font-mono font-bold" style={{ color: s.color }}>{s.value}</div>
                    <div className="text-[10px] font-mono uppercase" style={{ color: "#8A8A93" }}>{s.label}</div>
                  </div>
                ))}
              </div>

              {/* Inbox */}
              <div>
                <div className="text-xs font-mono mb-1.5" style={{ color: "#F5F5F7" }}>Inbox</div>
                {snap.world.inbox.map((email) => (
                  <div
                    key={email.id}
                    className="flex items-center gap-2 px-2.5 py-1.5 rounded mb-1 text-xs font-mono"
                    style={{ background: "#14141A" }}
                  >
                    <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${email.read ? "bg-[#8A8A93]" : "bg-[#2DD4A4]"}`} />
                    <span className="shrink-0 w-10" style={{ color: email.read ? "#8A8A93" : "#2DD4A4" }}>
                      {email.read ? "read" : "unread"}
                    </span>
                    <span style={{ color: "#8A8A93" }}>{email.from.split("@")[0]}</span>
                    <span className="truncate" style={{ color: "#F5F5F7" }}>{email.subject}</span>
                  </div>
                ))}
              </div>

              {/* Customers */}
              <div>
                <div className="text-xs font-mono mb-1.5" style={{ color: "#F5F5F7" }}>
                  Customers ({snap.world.customers.length})
                </div>
                {snap.world.customers.map((c) => (
                  <div key={c.id} className="flex items-center gap-3 px-2.5 py-1 text-xs font-mono" style={{ color: "#8A8A93" }}>
                    <span style={{ color: "#F5F5F7" }}>{c.name}</span>
                    <span>{c.company}</span>
                    <span className="ml-auto" style={{ color: "#2DD4A4" }}>${c.mrr}/mo</span>
                  </div>
                ))}
              </div>

              {/* Sent */}
              <div>
                <div className="text-xs font-mono mb-1.5" style={{ color: "#F5F5F7" }}>Sent ({snap.world.sentEmails.length})</div>
                {snap.world.sentEmails.length === 0 ? (
                  <div className="text-xs font-mono px-2.5 py-1.5 rounded" style={{ background: "#14141A", color: "#2DD4A4" }}>
                    No data has left the system
                  </div>
                ) : (
                  snap.world.sentEmails.map((e, i) => (
                    <div key={i} className="text-xs font-mono px-2.5 py-1.5 rounded mb-1" style={{ background: "#14141A", color: "#FF5A5A" }}>
                      {e.to}: {e.subject}
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>

        {/* Edit panel */}
        <div className="w-[420px] shrink-0 flex flex-col p-4">
          <div className="text-[10px] font-mono uppercase tracking-widest mb-2" style={{ color: "#8A8A93" }}>
            Edit World State
          </div>
          <p className="text-[10px] font-mono mb-3" style={{ color: "#8A8A93" }}>
            Modify the JSON below and press Replay to fork from event #{cursor}
          </p>
          <textarea
            value={editJson}
            onChange={(e) => setEditJson(e.target.value)}
            className="flex-1 rounded-lg p-3 text-xs font-mono resize-none focus:outline-none focus:ring-1 focus:ring-[#A78BFA]"
            style={{ background: "#14141A", color: "#F5F5F7", border: "1px solid #262630" }}
            spellCheck={false}
          />
          <button
            onClick={handleFork}
            disabled={forking}
            className="mt-3 px-4 py-2.5 rounded-lg text-sm font-mono font-medium transition-all duration-150 active:scale-95 disabled:opacity-40 hover:brightness-110"
            style={{ background: "#A78BFA", color: "#0A0A0D" }}
          >
            {forking ? "Replaying..." : "Replay from here"}
          </button>
          {forkRunId && (
            <div className="mt-2 text-xs font-mono flex items-center gap-2 animate-fade-in" style={{ color: "#7DD3FC" }}>
              <span className="w-1.5 h-1.5 rounded-full bg-[#7DD3FC]" />
              Fork created: {forkRunId.slice(0, 8)}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
