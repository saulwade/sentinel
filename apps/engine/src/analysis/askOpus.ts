/**
 * Ask Opus — CISO conversational over Sentinel's full operational history.
 *
 * Loads ALL runs + ALL events + policies + blast radii into Opus's context
 * (1M window) and asks it to answer the user's question with grounded
 * evidence citations.
 *
 * This pushes Opus 4.7 in two ways:
 *   1. Uses the 1M context window — payload is the entire platform state
 *   2. Extended thinking (6k budget) — reasons over structured operational data
 */

import Anthropic from '@anthropic-ai/sdk';
import type { AskResponse, AskEvidence } from '@sentinel/shared';
import { getAllRuns } from '../agent/runner.js';
import { getAllEvents } from '../timetravel/snapshot.js';
import { computeBlastRadius } from './blastRadius.js';
import { getActivePolicies } from '../interceptor.js';

const client = new Anthropic();
const MODEL = 'claude-opus-4-7';
const THINKING_BUDGET = 6_000;
const MAX_TOKENS = 8_000;

// ─── Compact event serialization ──────────────────────────────────────────────
// Full events contain large payloads. Compress to keep context efficient.

interface CompactEvent {
  seq: number;
  type: string;
  tool?: string;
  verdict?: string;
  riskSignals?: string[];
  brief?: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function compactEvent(ev: { seq: number; type: string; payload: any }): CompactEvent {
  const out: CompactEvent = { seq: ev.seq, type: ev.type };
  const p = ev.payload ?? {};
  if (ev.type === 'tool_call') {
    out.tool = p.tool;
    // One-line summary of the most security-relevant args
    const args = p.args ?? {};
    if (args.to)          out.brief = `to=${args.to}`;
    else if (args.customer_id) out.brief = `customer=${args.customer_id}` + (args.amount ? ` amount=$${args.amount}` : '');
    else if (args.ticket_id)   out.brief = `ticket=${args.ticket_id}` + (args.status ? ` status=${args.status}` : '');
    else if (args.id)          out.brief = `id=${args.id}`;
  } else if (ev.type === 'decision') {
    out.verdict = p.verdict;
    if (Array.isArray(p.riskSignals) && p.riskSignals.length > 0) {
      out.riskSignals = p.riskSignals;
    }
  } else if (ev.type === 'observation') {
    if (p.kind) out.brief = p.kind;
  }
  return out;
}

// ─── Context builder ──────────────────────────────────────────────────────────

export interface AskContext {
  generatedAt: number;
  stats: {
    totalRuns: number;
    totalInterdictions: number;
    totalMoneyInterdicted: number;
    piiExfiltrationAttempts: number;
  };
  policies: ReturnType<typeof getActivePolicies>;
  runs: Array<{
    id: string;
    createdAt: number;
    agentConfig: string;
    status: string;
    blast: ReturnType<typeof computeBlastRadius> | null;
    events: CompactEvent[];
  }>;
}

export function buildContext(): AskContext {
  const runs = getAllRuns();
  const policies = getActivePolicies();

  let totalInterdictions = 0;
  let totalMoneyInterdicted = 0;
  let piiExfiltrationAttempts = 0;

  const serializedRuns = runs.map((r) => {
    const events = getAllEvents(r.id);
    const blast = events.length > 0 ? computeBlastRadius(events) : null;
    if (blast) {
      totalInterdictions += blast.actionsInterdicted;
      totalMoneyInterdicted += blast.moneyInterdicted;
      if (blast.piiExfiltrationAttempted) piiExfiltrationAttempts++;
    }
    return {
      id: r.id,
      createdAt: r.createdAt,
      agentConfig: r.agentConfig,
      status: r.status,
      blast,
      events: events.map(compactEvent),
    };
  });

  return {
    generatedAt: Date.now(),
    stats: {
      totalRuns: runs.length,
      totalInterdictions,
      totalMoneyInterdicted,
      piiExfiltrationAttempts,
    },
    policies,
    runs: serializedRuns,
  };
}

// ─── Prompt ───────────────────────────────────────────────────────────────────

const ASK_SYSTEM = `You are the CISO of a company running AI agents in production. You have access to Sentinel's complete operational history: every run, every tool call, every policy decision, every blast radius computation.

Answer the user's question as a pragmatic CISO would: direct, grounded, no hedging.

## Output format

Respond with ONLY a JSON object matching this schema (no markdown fences, no prose):

{
  "tldr": string,              // 1-2 sentences — the answer itself
  "analysis": string,          // 2-5 sentence paragraph with specifics
  "evidence": [                // 1-5 concrete references that back the analysis
    {
      "runId": string,         // MUST be a real runId from the data
      "eventSeq": number|null, // MUST be a real seq from that run, or null
      "quote": string          // short quote or paraphrase of the event
    }
  ],
  "recommendation": string|null  // one concrete action, or null if none
}

## Rules

- Cite evidence by runId + eventSeq whenever you make a factual claim.
- NEVER invent runIds, seqs, dollar amounts, or policy IDs. Only use values present in the data.
- Be specific with numbers: "$47,320" not "a lot of money".
- If the user asks about trends, compare first-half vs second-half of runs.
- If the data is insufficient to answer, say so in the tldr and set recommendation to null.
- Keep tldr under 220 chars. Keep analysis under 800 chars.`;

function buildUserPrompt(question: string, ctx: AskContext): string {
  const contextJson = JSON.stringify(ctx, null, 2);
  return `## Operational data\n\n\`\`\`json\n${contextJson}\n\`\`\`\n\n## User question\n\n${question}\n\nRespond with ONLY the JSON object.`;
}

// ─── Parser ───────────────────────────────────────────────────────────────────

function stripFences(text: string): string {
  return text.replace(/```(?:json)?\n?/g, '').replace(/```\s*$/g, '').trim();
}

function parseAskResponse(raw: string, validRunIds: Set<string>): AskResponse {
  const clean = stripFences(raw);
  let obj: Record<string, unknown>;
  try {
    obj = JSON.parse(clean);
  } catch {
    // Last-ditch: try to find the first {...} block
    const match = clean.match(/\{[\s\S]*\}/);
    if (!match) throw new Error('Opus returned no JSON object');
    try {
      obj = JSON.parse(match[0]);
    } catch {
      throw new Error('Opus returned unparseable JSON');
    }
  }

  const evidenceRaw = Array.isArray(obj.evidence) ? obj.evidence : [];
  const evidence: AskEvidence[] = evidenceRaw
    .map((e): AskEvidence | null => {
      const r = e as Record<string, unknown>;
      const runId = typeof r.runId === 'string' ? r.runId : '';
      if (!runId || !validRunIds.has(runId)) return null; // drop hallucinated refs
      return {
        runId,
        eventSeq: typeof r.eventSeq === 'number' ? r.eventSeq : null,
        quote: String(r.quote ?? '').slice(0, 280),
      };
    })
    .filter((x): x is AskEvidence => x !== null)
    .slice(0, 5);

  return {
    tldr: String(obj.tldr ?? '').slice(0, 280),
    analysis: String(obj.analysis ?? '').slice(0, 1200),
    evidence,
    recommendation: obj.recommendation ? String(obj.recommendation).slice(0, 400) : null,
  };
}

// ─── Main entrypoint ──────────────────────────────────────────────────────────

export interface AskOpusOptions {
  question: string;
  onThinkingDelta?: (delta: string) => void;
  onTextDelta?: (delta: string) => void;
}

export interface AskOpusResult {
  response: AskResponse;
  thinkingText: string;
  rawText: string;
  contextTokens: number; // approx
}

export async function askOpus(opts: AskOpusOptions): Promise<AskOpusResult> {
  const ctx = buildContext();
  const validRunIds = new Set(ctx.runs.map((r) => r.id));
  const userPrompt = buildUserPrompt(opts.question, ctx);

  let thinkingText = '';
  let responseText = '';

  const stream = client.messages.stream({
    model: MODEL,
    max_tokens: MAX_TOKENS,
    thinking: { type: 'enabled', budget_tokens: THINKING_BUDGET },
    system: ASK_SYSTEM,
    messages: [{ role: 'user', content: userPrompt }],
  });

  for await (const event of stream) {
    if (event.type === 'content_block_delta') {
      if (event.delta.type === 'thinking_delta') {
        thinkingText += event.delta.thinking;
        opts.onThinkingDelta?.(event.delta.thinking);
      } else if (event.delta.type === 'text_delta') {
        responseText += event.delta.text;
        opts.onTextDelta?.(event.delta.text);
      }
    }
  }

  const response = parseAskResponse(responseText, validRunIds);
  response.thinkingTokens = Math.ceil(thinkingText.length / 4);

  return {
    response,
    thinkingText,
    rawText: responseText,
    contextTokens: Math.ceil(userPrompt.length / 4),
  };
}
