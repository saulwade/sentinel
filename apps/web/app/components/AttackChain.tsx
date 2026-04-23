"use client";

interface AgentEvent {
  id: string;
  seq: number;
  type: string;
  payload: Record<string, unknown>;
}

interface ChainNode {
  seq: number;
  tool: string;
  argsSummary: string;
  verdict: "ALLOW" | "PAUSE" | "BLOCK" | null;
  attackType: string | null;
}

function escSvg(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max) + "…" : s;
}

function getAttackType(signals: string[]): string | null {
  const s = new Set(signals);
  if (s.has("agent_output_injection")) return "Agent Output Injection";
  if (s.has("authority_impersonation")) return "Authority Impersonation";
  if (s.has("compliance_framing")) return "Compliance Bypass";
  if (s.has("prompt_injection_chain")) return "Prompt Injection";
  if (s.has("data_exfiltration")) return "Data Exfiltration";
  if (s.has("bulk_pii_access")) return "Bulk PII Access";
  if (s.has("high_value_action")) return "High-Value Action";
  return null;
}

function nodeColors(verdict: ChainNode["verdict"]): { fill: string; stroke: string; text: string } {
  if (verdict === "ALLOW") return { fill: "rgba(45,212,164,0.12)", stroke: "#2DD4A4", text: "#2DD4A4" };
  if (verdict === "PAUSE") return { fill: "rgba(247,185,85,0.12)", stroke: "#F7B955", text: "#F7B955" };
  if (verdict === "BLOCK") return { fill: "rgba(255,90,90,0.15)", stroke: "#FF5A5A", text: "#FF5A5A" };
  return { fill: "rgba(245,245,247,0.06)", stroke: "#262630", text: "#8A8A93" };
}

// ─── Layout constants ────────────────────────────────────────────────────────

const NODE_W = 148;
const NODE_H = 60;
const GAP = 36;
const PAD_X = 16;
const PAD_Y = 16;
const SVG_H = NODE_H + PAD_Y * 2 + 28; // extra for attack type label below

// ─── Component ────────────────────────────────────────────────────────────────

export interface AttackChainProps {
  events: AgentEvent[];
  onSelectSeq: (seq: number) => void;
  selectedSeq: number | null;
}

export default function AttackChain({ events, onSelectSeq, selectedSeq }: AttackChainProps) {
  // Build (toolCall, verdict) pairs
  const bySeq = new Map(events.map((e) => [e.seq, e]));
  const toolCalls = events.filter((e) => e.type === "tool_call");

  const nodes: ChainNode[] = toolCalls.map((ev) => {
    const p = ev.payload as Record<string, unknown>;
    const tool = String(p.tool ?? "unknown");
    const args = (p.args ?? {}) as Record<string, unknown>;
    const argsSummary = truncate(JSON.stringify(args), 32);

    const decEv = bySeq.get(ev.seq + 1);
    const dec = decEv?.type === "decision" ? (decEv.payload as Record<string, unknown>) : null;
    const verdict = dec ? (String(dec.verdict ?? "") as ChainNode["verdict"]) : null;
    const riskSignals = dec ? (dec.riskSignals as string[] ?? []) : [];
    const attackType = verdict === "BLOCK" || verdict === "PAUSE" ? getAttackType(riskSignals) : null;

    return { seq: ev.seq, tool, argsSummary, verdict, attackType };
  });

  if (nodes.length === 0) {
    return (
      <div className="flex items-center justify-center py-10">
        <p className="text-xs font-mono" style={{ color: "#8A8A93" }}>No tool calls yet — run a scenario first.</p>
      </div>
    );
  }

  const svgWidth = PAD_X * 2 + nodes.length * NODE_W + Math.max(0, nodes.length - 1) * GAP;

  return (
    <div style={{ overflowX: "auto", overflowY: "visible" }}>
      <svg
        width={svgWidth}
        height={SVG_H}
        style={{ display: "block", minWidth: svgWidth }}
        viewBox={`0 0 ${svgWidth} ${SVG_H}`}
      >
        <defs>
          <marker
            id="arrow"
            markerWidth="7"
            markerHeight="7"
            refX="6"
            refY="3.5"
            orient="auto"
          >
            <path d="M0,0 L7,3.5 L0,7 L1.5,3.5 Z" fill="#262630" />
          </marker>
        </defs>

        {nodes.map((node, i) => {
          const x = PAD_X + i * (NODE_W + GAP);
          const y = PAD_Y;
          const cx = x + NODE_W / 2;
          const cy = y + NODE_H / 2;
          const colors = nodeColors(node.verdict);
          const isSelected = node.seq === selectedSeq;

          return (
            <g
              key={node.seq}
              onClick={() => onSelectSeq(node.seq)}
              style={{ cursor: "pointer" }}
            >
              {/* Selection ring */}
              {isSelected && (
                <rect
                  x={x - 3}
                  y={y - 3}
                  width={NODE_W + 6}
                  height={NODE_H + 6}
                  rx={10}
                  fill="none"
                  stroke="#A78BFA"
                  strokeWidth={2}
                  opacity={0.6}
                />
              )}

              {/* Node box */}
              <rect
                x={x}
                y={y}
                width={NODE_W}
                height={NODE_H}
                rx={8}
                fill={colors.fill}
                stroke={colors.stroke}
                strokeWidth={isSelected ? 1.5 : 1}
              />

              {/* Verdict badge */}
              {node.verdict && (
                <text
                  x={x + 8}
                  y={y + 14}
                  fontSize={9}
                  fontFamily="monospace"
                  fontWeight="bold"
                  fill={colors.text}
                >
                  {node.verdict === "BLOCK" ? "🔴 BLOCK" : node.verdict === "PAUSE" ? "⚠ PAUSE" : "✓ ALLOW"}
                </text>
              )}

              {/* Tool name */}
              <text
                x={cx}
                y={cy - 2}
                fontSize={11}
                fontFamily="monospace"
                fontWeight="600"
                fill={colors.text}
                textAnchor="middle"
                dominantBaseline="middle"
              >
                {escSvg(truncate(node.tool.replace(/_/g, " "), 18))}
              </text>

              {/* Args summary */}
              <text
                x={cx}
                y={cy + 16}
                fontSize={9}
                fontFamily="monospace"
                fill={colors.text}
                textAnchor="middle"
                dominantBaseline="middle"
                opacity={0.65}
              >
                {escSvg(node.argsSummary)}
              </text>

              {/* Attack type label below node (BLOCK/PAUSE only) */}
              {node.attackType && (
                <text
                  x={cx}
                  y={y + NODE_H + 14}
                  fontSize={9}
                  fontFamily="monospace"
                  fontWeight="bold"
                  fill={colors.text}
                  textAnchor="middle"
                  dominantBaseline="middle"
                >
                  ⚡ {escSvg(truncate(node.attackType, 22))}
                </text>
              )}

              {/* Arrow to next node */}
              {i < nodes.length - 1 && (
                <line
                  x1={x + NODE_W}
                  y1={y + NODE_H / 2}
                  x2={x + NODE_W + GAP}
                  y2={y + NODE_H / 2}
                  stroke="#262630"
                  strokeWidth={1.5}
                  markerEnd="url(#arrow)"
                />
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}
