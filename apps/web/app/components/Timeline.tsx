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

function dotColor(ev: AgentEvent): string {
  if (ev.type === "decision") {
    const v = (ev.payload as { verdict?: string }).verdict;
    if (v === "ALLOW") return "bg-[#2DD4A4]";
    if (v === "PAUSE") return "bg-[#F7B955]";
    if (v === "BLOCK") return "bg-[#FF5A5A]";
  }
  if (ev.type === "tool_result") return "bg-[#8A8A93]";
  return "bg-[#F5F5F7]";
}

export default function Timeline({ runId }: { runId: string | null }) {
  const [events, setEvents] = useState<AgentEvent[]>([]);
  const [cursor, setCursor] = useState<number>(0);
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [editJson, setEditJson] = useState("");
  const [forking, setForking] = useState(false);
  const [forkRunId, setForkRunId] = useState<string | null>(null);

  // Load events when runId changes
  useEffect(() => {
    if (!runId) return;
    fetch(`${ENGINE}/timeline/${runId}`)
      .then((r) => r.json())
      .then((evts: AgentEvent[]) => {
        setEvents(evts);
        if (evts.length > 0) setCursor(evts[evts.length - 1].seq);
      });
  }, [runId]);

  // Load snapshot when cursor changes
  useEffect(() => {
    if (!runId || cursor === 0) return;
    fetch(`${ENGINE}/timeline/${runId}/snapshot/${cursor}`)
      .then((r) => r.json())
      .then((s: Snapshot) => {
        setSnap(s);
        setEditJson(JSON.stringify(s.world, null, 2));
      });
  }, [runId, cursor]);

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
      <div className="flex items-center justify-center h-full">
        <p className="font-mono text-sm" style={{ color: "#8A8A93" }}>
          Run the agent first, then switch to Timeline.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* ── Scrubber ───────────────────────────────────────────────────── */}
      <div className="px-5 py-4 border-b shrink-0" style={{ borderColor: "#262630" }}>
        <div className="flex items-center gap-2 mb-2">
          <span className="text-[10px] font-mono uppercase tracking-widest" style={{ color: "#8A8A93" }}>
            Timeline
          </span>
          <span className="text-[10px] font-mono" style={{ color: "#8A8A93" }}>
            event #{cursor} of {events.length}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          {events.map((ev) => (
            <button
              key={ev.id}
              onClick={() => setCursor(ev.seq)}
              className={`w-3 h-3 rounded-full transition-all ${dotColor(ev)} ${
                ev.seq === cursor ? "ring-2 ring-white scale-125" : "opacity-60 hover:opacity-100"
              }`}
              title={`#${ev.seq} ${ev.type}`}
            />
          ))}
        </div>
        {/* Slider for fine control */}
        {events.length > 0 && (
          <input
            type="range"
            min={events[0]?.seq ?? 1}
            max={events[events.length - 1]?.seq ?? 1}
            value={cursor}
            onChange={(e) => setCursor(Number(e.target.value))}
            className="w-full mt-2 accent-[#A78BFA]"
          />
        )}
      </div>

      {/* ── Body ──────────────────────────────────────────────────────── */}
      <div className="flex flex-1 min-h-0">
        {/* State panel */}
        <div className="flex-1 overflow-y-auto border-r p-4" style={{ borderColor: "#262630" }}>
          <div className="text-[10px] font-mono uppercase tracking-widest mb-3" style={{ color: "#8A8A93" }}>
            World State at #{cursor}
          </div>

          {snap && (
            <div className="space-y-4">
              {/* Inbox */}
              <div>
                <div className="text-xs font-mono mb-1.5" style={{ color: "#F5F5F7" }}>
                  Inbox ({snap.world.inbox.length})
                </div>
                {snap.world.inbox.map((email) => (
                  <div
                    key={email.id}
                    className="flex items-center gap-2 px-2 py-1.5 rounded mb-1 text-xs font-mono"
                    style={{ background: "#14141A" }}
                  >
                    <span className={`w-1.5 h-1.5 rounded-full ${email.read ? "bg-[#8A8A93]" : "bg-[#2DD4A4]"}`} />
                    <span style={{ color: "#8A8A93" }}>{email.from.split("@")[0]}</span>
                    <span style={{ color: "#F5F5F7" }}>{email.subject}</span>
                  </div>
                ))}
              </div>

              {/* Customers */}
              <div>
                <div className="text-xs font-mono mb-1.5" style={{ color: "#F5F5F7" }}>
                  Customers ({snap.world.customers.length})
                </div>
                {snap.world.customers.map((c) => (
                  <div
                    key={c.id}
                    className="flex items-center gap-3 px-2 py-1 text-xs font-mono"
                    style={{ color: "#8A8A93" }}
                  >
                    <span style={{ color: "#F5F5F7" }}>{c.name}</span>
                    <span>{c.company}</span>
                    <span className="ml-auto" style={{ color: "#2DD4A4" }}>
                      ${c.mrr}/mo
                    </span>
                  </div>
                ))}
              </div>

              {/* Sent emails */}
              <div>
                <div className="text-xs font-mono mb-1.5" style={{ color: "#F5F5F7" }}>
                  Sent Emails ({snap.world.sentEmails.length})
                </div>
                {snap.world.sentEmails.length === 0 ? (
                  <span className="text-xs font-mono" style={{ color: "#8A8A93" }}>none</span>
                ) : (
                  snap.world.sentEmails.map((e, i) => (
                    <div key={i} className="text-xs font-mono px-2 py-1" style={{ color: "#FF5A5A" }}>
                      → {e.to}: {e.subject}
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>

        {/* Edit panel */}
        <div className="w-[420px] shrink-0 flex flex-col p-4">
          <div className="text-[10px] font-mono uppercase tracking-widest mb-3" style={{ color: "#8A8A93" }}>
            Edit World State
          </div>
          <textarea
            value={editJson}
            onChange={(e) => setEditJson(e.target.value)}
            className="flex-1 rounded p-3 text-xs font-mono resize-none"
            style={{
              background: "#14141A",
              color: "#F5F5F7",
              border: "1px solid #262630",
            }}
            spellCheck={false}
          />
          <button
            onClick={handleFork}
            disabled={forking}
            className="mt-3 px-4 py-2 rounded text-sm font-mono font-medium transition-colors disabled:opacity-40"
            style={{ background: "#A78BFA", color: "#0A0A0D" }}
          >
            {forking ? "Replaying..." : "Replay from here"}
          </button>
          {forkRunId && (
            <div className="mt-2 text-xs font-mono" style={{ color: "#7DD3FC" }}>
              Fork created: {forkRunId.slice(0, 8)}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
