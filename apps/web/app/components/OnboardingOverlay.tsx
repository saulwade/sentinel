"use client";

interface OnboardingOverlayProps {
  onStartDemo: () => void;
  onSkip: () => void;
}

const STEPS = [
  {
    number: "01",
    headline: "Run a scenario",
    description: "Watch a real AI agent get attacked in real-time. Sentinel intercepts every tool call before it executes.",
    icon: "▶",
    color: "#A78BFA",
  },
  {
    number: "02",
    headline: "See the damage prevented",
    description: "After the run, Sentinel shows exactly what was stopped — dollars, customer records, external data leaks.",
    icon: "◈",
    color: "#FF5A5A",
  },
  {
    number: "03",
    headline: "Fix it in one click",
    description: "Analyze the attack, generate a security policy with Opus, and adopt it. Your agent is now protected against that attack vector.",
    icon: "✦",
    color: "#2DD4A4",
  },
];

export default function OnboardingOverlay({ onStartDemo, onSkip }: OnboardingOverlayProps) {
  return (
    <div
      className="fixed inset-0 flex items-center justify-center"
      style={{ background: "rgba(10,10,13,0.88)", backdropFilter: "blur(6px)", zIndex: 60 }}
    >
      <div
        className="flex flex-col gap-8 p-8 rounded-2xl max-w-2xl w-full mx-4"
        style={{ background: "#0D0D12", border: "1px solid #262630" }}
      >
        {/* Header */}
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-3">
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
              style={{ background: "#A78BFA" }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#0A0A0D" strokeWidth="2.5" strokeLinecap="round">
                <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
              </svg>
            </div>
            <span className="font-mono text-xl font-bold tracking-widest" style={{ color: "#F5F5F7" }}>
              SENTINEL
            </span>
          </div>
          <p className="font-mono text-sm" style={{ color: "#8A8A93" }}>
            AI Agent Security Platform — stop attacks before they execute
          </p>
        </div>

        {/* Steps */}
        <div className="flex flex-col gap-4">
          {STEPS.map((step) => (
            <div
              key={step.number}
              className="flex items-start gap-4 p-4 rounded-xl"
              style={{ background: "#14141A", border: "1px solid #1C1C24" }}
            >
              <div
                className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0 text-lg"
                style={{ background: `${step.color}15`, border: `1px solid ${step.color}30`, color: step.color }}
              >
                {step.icon}
              </div>
              <div className="flex flex-col gap-0.5 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-mono" style={{ color: step.color }}>{step.number}</span>
                  <span className="text-sm font-mono font-semibold" style={{ color: "#F5F5F7" }}>{step.headline}</span>
                </div>
                <p className="text-xs font-mono leading-relaxed" style={{ color: "#8A8A93" }}>
                  {step.description}
                </p>
              </div>
            </div>
          ))}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-3">
          <button
            onClick={onStartDemo}
            className="flex-1 py-3 rounded-xl text-sm font-mono font-bold transition-all active:scale-95 hover:brightness-110"
            style={{ background: "#A78BFA", color: "#0A0A0D" }}
          >
            ▶  Start Demo — CEO Override attack
          </button>
          <button
            onClick={onSkip}
            className="px-5 py-3 rounded-xl text-sm font-mono transition-all hover:brightness-110"
            style={{ background: "#14141A", color: "#8A8A93", border: "1px solid #262630" }}
          >
            Skip
          </button>
        </div>
      </div>
    </div>
  );
}
