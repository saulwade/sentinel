import { jsPDF } from "jspdf";

import { ENGINE } from "../lib/engine";

interface Policy {
  id: string;
  name: string;
  description?: string;
  action: string;
  source: string;
  enabled: boolean;
}

interface BlastSummary {
  severity: string;
  actionsInterdicted: number;
  moneyInterdicted: number;
  piiExfiltrationAttempted: boolean;
  reversible: boolean;
  summary: string;
}

interface RunSummary {
  runId: string;
  createdAt: number;
  agentConfig: string;
  status: string;
  blast: BlastSummary | null;
}

interface StatsResponse {
  trust: {
    score: number;
    grade: string;
    breakdown: { interdictionEffectiveness: number; policyCoverage: number; label: string };
  };
  policies: { active: number; bySource: { default: number; autoSynthesized: number; user: number } };
  runs: { total: number; recent: RunSummary[] };
  aggregate: { totalToolCalls: number; totalInterdictions: number; totalMoneyInterdicted: number; interdictionRate: number };
}

// Sentinel palette translated for print
const INK = "#0A0A0D";
const MUTED = "#5A5A63";
const ACCENT = "#6B4EEA";   // darker purple for contrast on white
const DANGER = "#C9312C";
const SUCCESS = "#1F9A72";

export async function exportSecurityReport(): Promise<void> {
  const [statsRes, policiesRes] = await Promise.all([
    fetch(`${ENGINE}/stats`),
    fetch(`${ENGINE}/policies`),
  ]);
  if (!statsRes.ok) throw new Error("failed to load /stats");
  if (!policiesRes.ok) throw new Error("failed to load /policies");
  const stats: StatsResponse = await statsRes.json();
  const policiesJson = await policiesRes.json();
  const policies: Policy[] = Array.isArray(policiesJson) ? policiesJson : (policiesJson.policies ?? []);

  // No deep analysis in the PDF — /analysis/:runId triggers a fresh Opus
  // run. The PDF is a dashboard snapshot; per-run deep dives belong in the
  // incident-report markdown.

  const doc = new jsPDF({ unit: "pt", format: "letter" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 56;
  let y = margin;

  function ensure(space: number) {
    if (y + space > pageH - margin) {
      doc.addPage();
      y = margin;
    }
  }

  function text(str: string, opts: { size?: number; color?: string; bold?: boolean; x?: number } = {}) {
    const size = opts.size ?? 10;
    doc.setFont("helvetica", opts.bold ? "bold" : "normal");
    doc.setFontSize(size);
    doc.setTextColor(opts.color ?? INK);
    const x = opts.x ?? margin;
    const maxW = pageW - x - margin;
    const lines = doc.splitTextToSize(str, maxW);
    ensure(lines.length * size * 1.25);
    doc.text(lines, x, y);
    y += lines.length * size * 1.25;
  }

  function rule(color = "#E5E5EA") {
    ensure(8);
    doc.setDrawColor(color);
    doc.setLineWidth(0.5);
    doc.line(margin, y, pageW - margin, y);
    y += 8;
  }

  function section(title: string) {
    y += 10;
    ensure(20);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(MUTED);
    doc.text(title.toUpperCase(), margin, y);
    y += 4;
    rule("#D1D1D6");
    y += 4;
  }

  // ── Header ─────────────────────────────────────────────────────────────────
  doc.setFillColor(ACCENT);
  doc.rect(margin, y, 18, 18, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.setTextColor(INK);
  doc.text("SENTINEL", margin + 26, y + 14);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(MUTED);
  doc.text("AI Agent Security Platform", margin + 26, y + 26);
  y += 48;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(22);
  doc.setTextColor(INK);
  doc.text("Security Report", margin, y);
  y += 22;

  const now = new Date();
  text(`Generated ${now.toLocaleString()} · ${stats.runs.total} total runs`, {
    size: 9,
    color: MUTED,
  });
  y += 6;
  rule("#D1D1D6");

  // ── Trust Score hero ───────────────────────────────────────────────────────
  const boxH = 90;
  ensure(boxH + 8);
  doc.setDrawColor("#E5E5EA");
  doc.setFillColor("#F7F7F9");
  doc.roundedRect(margin, y, pageW - margin * 2, boxH, 6, 6, "FD");

  // Grade circle
  const cx = margin + 50;
  const cy = y + boxH / 2;
  doc.setFillColor(stats.trust.grade.startsWith("A") ? SUCCESS : stats.trust.grade === "B" ? ACCENT : DANGER);
  doc.circle(cx, cy, 28, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  doc.setTextColor("#FFFFFF");
  doc.text(stats.trust.grade, cx, cy + 6, { align: "center" });

  doc.setFont("helvetica", "bold");
  doc.setFontSize(28);
  doc.setTextColor(INK);
  doc.text(`${stats.trust.score}`, margin + 100, y + 42);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(MUTED);
  doc.text("/ 100  Production Readiness", margin + 140, y + 42);
  doc.setFontSize(9);
  doc.text(stats.trust.breakdown.label, margin + 100, y + 60);

  doc.text(
    `Interdiction effectiveness: ${Math.round(stats.trust.breakdown.interdictionEffectiveness * 100)}%   ·   Policy coverage: ${Math.round(stats.trust.breakdown.policyCoverage * 100)}%`,
    margin + 100,
    y + 74,
  );
  y += boxH + 6;

  // ── Aggregate stats ────────────────────────────────────────────────────────
  section("Aggregate Impact");
  const statCols = [
    { label: "Potential loss prevented", value: `$${stats.aggregate.totalMoneyInterdicted.toLocaleString()}`, color: DANGER },
    { label: "Interdictions", value: String(stats.aggregate.totalInterdictions), color: INK },
    { label: "Active policies", value: String(stats.policies.active), color: ACCENT },
    { label: "Total runs", value: String(stats.runs.total), color: INK },
  ];
  const colW = (pageW - margin * 2) / 4;
  ensure(50);
  statCols.forEach((s, i) => {
    const x = margin + colW * i;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(MUTED);
    doc.text(s.label.toUpperCase(), x, y + 10);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(18);
    doc.setTextColor(s.color);
    doc.text(s.value, x, y + 32);
  });
  y += 44;

  // ── Recent runs ────────────────────────────────────────────────────────────
  if (stats.runs.recent.length > 0) {
    section("Recent Runs");
    stats.runs.recent.forEach((r) => {
      ensure(32);
      const sev = r.blast?.severity ?? "clean";
      const sevColor = sev === "critical" ? DANGER : sev === "high" ? "#C66A0A" : sev === "medium" ? "#A8890F" : SUCCESS;
      doc.setFont("helvetica", "bold");
      doc.setFontSize(8);
      doc.setTextColor(sevColor);
      doc.text(sev.toUpperCase(), margin, y);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
      doc.setTextColor(INK);
      doc.text(`${r.agentConfig}`, margin + 60, y);
      doc.setFontSize(9);
      doc.setTextColor(MUTED);
      const subLine = r.blast
        ? `${r.blast.actionsInterdicted} interdicted` +
          (r.blast.moneyInterdicted > 0 ? ` · $${r.blast.moneyInterdicted.toLocaleString()} blocked` : "") +
          (r.blast.piiExfiltrationAttempted ? " · PII exfil stopped" : "")
        : "no threats detected";
      doc.text(subLine, margin + 60, y + 12);
      y += 26;
    });
  }

  // ── Active policies ────────────────────────────────────────────────────────
  if (policies.length > 0) {
    section("Active Policies");
    policies.filter((p) => p.enabled !== false).forEach((p) => {
      ensure(28);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9);
      doc.setTextColor(p.action === "block" ? DANGER : ACCENT);
      doc.text(p.action.toUpperCase(), margin, y);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
      doc.setTextColor(INK);
      doc.text(p.name, margin + 50, y);
      doc.setFontSize(8);
      doc.setTextColor(MUTED);
      doc.text(`[${p.source}]`, pageW - margin - 60, y);
      if (p.description) {
        doc.setFontSize(9);
        doc.setTextColor(MUTED);
        const descLines = doc.splitTextToSize(p.description, pageW - margin * 2 - 50);
        doc.text(descLines, margin + 50, y + 12);
        y += 12 + descLines.length * 11;
      } else {
        y += 18;
      }
    });
  }

  // ── Footnote ──────────────────────────────────────────────────────────────
  section("Next Step");
  text(
    "For per-incident deep dives with Opus extended thinking (attack chain, counterfactual damage, and recommended hardening), use the Incident Report markdown download from the Investigate tab.",
    { size: 9, color: MUTED },
  );

  // ── Footer on every page ──────────────────────────────────────────────────
  const total = doc.getNumberOfPages();
  for (let i = 1; i <= total; i++) {
    doc.setPage(i);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(MUTED);
    doc.text("Secured by Sentinel", margin, pageH - 24);
    doc.text(`${i} / ${total}`, pageW - margin, pageH - 24, { align: "right" });
  }

  const filename = `sentinel-report-${now.toISOString().slice(0, 10)}.pdf`;
  doc.save(filename);
}
