"use client";

import { useEffect, useState } from "react";
import type { ToastDetail } from "../lib/engine";

interface Toast extends ToastDetail {
  id: number;
}

const COLORS: Record<ToastDetail["kind"], { fg: string; border: string; bg: string; icon: string }> = {
  error: { fg: "#FF5A5A", border: "rgba(255,90,90,0.4)", bg: "rgba(255,90,90,0.08)", icon: "⚠" },
  warn: { fg: "#F7B955", border: "rgba(247,185,85,0.4)", bg: "rgba(247,185,85,0.08)", icon: "!" },
  info: { fg: "#7DD3FC", border: "rgba(125,211,252,0.4)", bg: "rgba(125,211,252,0.08)", icon: "ℹ" },
};

let nextId = 1;

export default function Toasts() {
  const [toasts, setToasts] = useState<Toast[]>([]);

  useEffect(() => {
    function onToast(e: Event) {
      const detail = (e as CustomEvent<ToastDetail>).detail;
      if (!detail) return;
      const toast: Toast = { ...detail, id: nextId++ };
      setToasts((prev) => [...prev, toast]);
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== toast.id));
      }, 5000);
    }
    window.addEventListener("sentinel:toast", onToast);
    return () => window.removeEventListener("sentinel:toast", onToast);
  }, []);

  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-[70] flex flex-col gap-2 max-w-sm">
      {toasts.map((t) => {
        const c = COLORS[t.kind];
        return (
          <div
            key={t.id}
            className="flex items-start gap-2 px-3 py-2 rounded-lg font-mono text-[11px] leading-relaxed animate-slide-up"
            style={{ background: c.bg, border: `1px solid ${c.border}`, backdropFilter: "blur(8px)" }}
          >
            <span style={{ color: c.fg }}>{c.icon}</span>
            <span className="flex-1 break-words" style={{ color: "#F5F5F7" }}>{t.message}</span>
            <button
              onClick={() => setToasts((prev) => prev.filter((x) => x.id !== t.id))}
              className="shrink-0 text-[10px] transition-all hover:brightness-150"
              style={{ color: "#8A8A93" }}
              aria-label="Dismiss"
            >
              ✕
            </button>
          </div>
        );
      })}
    </div>
  );
}
