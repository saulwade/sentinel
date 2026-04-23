"use client";

import { use } from "react";
import Timeline from "../../components/Timeline";

export default function SharePage({ params }: { params: Promise<{ runId: string }> }) {
  const { runId } = use(params);

  return (
    <div className="flex flex-col h-screen" style={{ background: "#0A0A0D" }}>
      {/* Minimal header */}
      <div className="flex items-center gap-3 px-4 py-2 border-b shrink-0" style={{ borderColor: "#262630" }}>
        <div className="w-5 h-5 rounded flex items-center justify-center shrink-0" style={{ background: "#A78BFA" }}>
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#0A0A0D" strokeWidth="2.5" strokeLinecap="round">
            <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
          </svg>
        </div>
        <span className="font-mono text-xs font-medium tracking-widest" style={{ color: "#F5F5F7" }}>
          SENTINEL
        </span>
        <span className="text-[10px] font-mono" style={{ color: "#8A8A93" }}>
          · shared run
        </span>
        <code className="ml-2 text-[10px] font-mono px-1.5 py-0.5 rounded" style={{ background: "#14141A", color: "#A78BFA", border: "1px solid #262630" }}>
          {runId.slice(0, 12)}…
        </code>
        <a
          href="/"
          className="ml-auto text-[10px] font-mono px-2 py-0.5 rounded transition-all hover:brightness-125"
          style={{ background: "#14141A", color: "#8A8A93", border: "1px solid #262630" }}
        >
          Open Sentinel →
        </a>
      </div>

      {/* Timeline */}
      <div className="flex-1 min-h-0">
        <Timeline runId={runId} visible />
      </div>
    </div>
  );
}
