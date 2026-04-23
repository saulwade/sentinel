"use client";

import { use, useEffect, useState } from "react";
import Timeline from "../../components/Timeline";
import { ENGINE } from "../../lib/engine";

type State = "loading" | "ok" | "not-found" | "error";

export default function SharePage({ params }: { params: Promise<{ runId: string }> }) {
  const { runId } = use(params);
  const [state, setState] = useState<State>("loading");
  const [errorMsg, setErrorMsg] = useState<string>("");

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), 5000);

    fetch(`${ENGINE}/runs/${runId}`, { signal: controller.signal })
      .then((res) => {
        if (cancelled) return;
        if (res.status === 404) setState("not-found");
        else if (!res.ok) { setState("error"); setErrorMsg(`Engine returned ${res.status}`); }
        else setState("ok");
      })
      .catch((err: Error) => {
        if (cancelled) return;
        setState("error");
        setErrorMsg(err.name === "AbortError" ? "Engine unreachable (timed out after 5s)" : err.message);
      })
      .finally(() => clearTimeout(t));

    return () => { cancelled = true; controller.abort(); clearTimeout(t); };
  }, [runId]);

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

      {/* Body */}
      <div className="flex-1 min-h-0">
        {state === "loading" && (
          <div className="h-full flex items-center justify-center">
            <div className="flex flex-col items-center gap-3">
              <div className="w-6 h-6 rounded-full border-2 border-t-transparent animate-spin" style={{ borderColor: "#A78BFA", borderTopColor: "transparent" }} />
              <span className="text-[11px] font-mono" style={{ color: "#8A8A93" }}>Loading shared run…</span>
            </div>
          </div>
        )}

        {state === "not-found" && (
          <div className="h-full flex items-center justify-center p-6">
            <div className="max-w-md text-center space-y-4">
              <div className="w-12 h-12 mx-auto rounded-xl flex items-center justify-center" style={{ background: "rgba(247,185,85,0.1)", border: "1px solid rgba(247,185,85,0.3)" }}>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#F7B955" strokeWidth="1.5"><circle cx="12" cy="12" r="10" /><path d="M12 8v4M12 16h.01" /></svg>
              </div>
              <div className="space-y-1.5">
                <p className="text-sm font-mono font-semibold" style={{ color: "#F5F5F7" }}>Run not found</p>
                <p className="text-xs font-mono leading-relaxed" style={{ color: "#8A8A93" }}>
                  This run <code style={{ color: "#A78BFA" }}>{runId.slice(0, 12)}…</code> doesn&apos;t exist on this Sentinel instance. It may have been deleted, or the link points to a different deployment.
                </p>
              </div>
              <a
                href="/"
                className="inline-block px-4 py-2 rounded-xl text-xs font-mono font-semibold transition-all active:scale-95 hover:brightness-110"
                style={{ background: "#A78BFA", color: "#0A0A0D" }}
              >
                ← Back to Sentinel
              </a>
            </div>
          </div>
        )}

        {state === "error" && (
          <div className="h-full flex items-center justify-center p-6">
            <div className="max-w-md text-center space-y-4">
              <div className="w-12 h-12 mx-auto rounded-xl flex items-center justify-center" style={{ background: "rgba(255,90,90,0.1)", border: "1px solid rgba(255,90,90,0.3)" }}>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#FF5A5A" strokeWidth="1.5"><path d="M12 2L2 22h20L12 2z" /><path d="M12 9v5M12 18h.01" /></svg>
              </div>
              <div className="space-y-1.5">
                <p className="text-sm font-mono font-semibold" style={{ color: "#F5F5F7" }}>Couldn&apos;t load this run</p>
                <p className="text-xs font-mono leading-relaxed" style={{ color: "#8A8A93" }}>{errorMsg || "Engine unreachable"}</p>
              </div>
              <a
                href="/"
                className="inline-block px-4 py-2 rounded-xl text-xs font-mono font-semibold transition-all active:scale-95 hover:brightness-110"
                style={{ background: "#14141A", color: "#F5F5F7", border: "1px solid #262630" }}
              >
                ← Back to Sentinel
              </a>
            </div>
          </div>
        )}

        {state === "ok" && <Timeline runId={runId} visible />}
      </div>
    </div>
  );
}
