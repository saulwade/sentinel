/**
 * Policy Drift Detector — Opus meta-audits the active policy set.
 *
 * Pre-processing is deterministic: we count how many historical events each
 * policy would match using the real evaluator. Opus receives these counts as
 * ground truth and focuses on semantic reasoning (redundancy, blind spots).
 */

import Anthropic from '@anthropic-ai/sdk';
import type { DriftAuditResponse, DriftFinding, Policy } from '@sentinel/shared';
import { getAllRuns } from '../agent/runner.js';
import { getAllEvents } from '../timetravel/snapshot.js';
import { getActivePolicies } from '../interceptor.js';
import { evaluatePolicies } from '../policies/engine.js';
import { getWorld } from '../agent/world.js';

const client = new Anthropic();
const MODEL = 'claude-opus-4-6';
const THINKING_BUDGET = 5_000;
const MAX_TOKENS = 8_000;

// ─── Deterministic match counting ─────────────────────────────────────────────

interface PolicyStats {
  policy: Policy;
  matchesInRuns: number;          // how many distinct runs this policy would fire on
  totalMatches: number;           // total tool_call events matched
}

interface CompactEvent {
  runId: string;
  seq: number;
  type: string;
  tool?: string;
  verdict?: string;
  riskSignals?: string[];
  brief?: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function compactEvent(ev: { runId: string; seq: number; type: string; payload: any }): CompactEvent {
  const out: CompactEvent = { runId: ev.runId, seq: ev.seq, type: ev.type };
  const p = ev.payload ?? {};
  if (ev.type === 'tool_call') {
    out.tool = p.tool;
    const args = p.args ?? {};
    if (args.to) out.brief = `to=${args.to}`;
    else if (args.customer_id) out.brief = `customer=${args.customer_id}` + (args.amount ? ` amount=$${args.amount}` : '');
    else if (args.ticket_id) out.brief = `ticket=${args.ticket_id}`;
    else if (args.id) out.brief = `id=${args.id}`;
  } else if (ev.type === 'decision') {
    out.verdict = p.verdict;
    if (Array.isArray(p.riskSignals) && p.riskSignals.length > 0) {
      out.riskSignals = p.riskSignals;
    }
  }
  return out;
}

export interface AuditContext {
  policyStats: PolicyStats[];
  events: CompactEvent[];
  runsReviewed: number;
}

export function buildAuditContext(): AuditContext {
  const policies = getActivePolicies();
  const runs = getAllRuns();
  const world = getWorld();

  // Collect all tool_call + decision events across all runs
  const allEvents: Array<{ runId: string; seq: number; type: string; payload: unknown }> = [];
  const perPolicyMatches = new Map<string, { matchesInRuns: Set<string>; totalMatches: number }>();
  for (const p of policies) {
    perPolicyMatches.set(p.id, { matchesInRuns: new Set(), totalMatches: 0 });
  }

  for (const run of runs) {
    const events = getAllEvents(run.id);
    for (const ev of events) {
      if (ev.type !== 'tool_call' && ev.type !== 'decision') continue;
      allEvents.push({ runId: run.id, seq: ev.seq, type: ev.type, payload: ev.payload });

      if (ev.type !== 'tool_call') continue;
      const payload = ev.payload as { tool?: string; args?: Record<string, unknown> };
      const call = { tool: String(payload.tool ?? ''), args: payload.args ?? {} };
      if (!call.tool) continue;

      // Evaluate each policy independently to count matches
      for (const p of policies) {
        const match = evaluatePolicies([p], call, world);
        if (match) {
          const stat = perPolicyMatches.get(p.id);
          if (stat) {
            stat.totalMatches++;
            stat.matchesInRuns.add(run.id);
          }
        }
      }
    }
  }

  const policyStats: PolicyStats[] = policies.map((p) => ({
    policy: p,
    matchesInRuns: perPolicyMatches.get(p.id)?.matchesInRuns.size ?? 0,
    totalMatches: perPolicyMatches.get(p.id)?.totalMatches ?? 0,
  }));

  // Keep the most recent 120 events so the prompt stays reasonable
  const sortedEvents = allEvents
    .sort((a, b) => (a.runId === b.runId ? a.seq - b.seq : 0))
    .slice(-120)
    .map(compactEvent);

  return { policyStats, events: sortedEvents, runsReviewed: runs.length };
}

// ─── Prompt ───────────────────────────────────────────────────────────────────

const AUDIT_SYSTEM = `You are a security auditor reviewing Sentinel's active policy set.

You receive:
  - policyStats: each active policy with a GROUND-TRUTH match count computed deterministically
  - events: compact tool_call + decision events from recent runs
  - runsReviewed: total runs in the dataset

Emit 2-5 findings of three kinds:

## Finding schema

{ "kind": "redundant",
  "policyId": string,         // MUST be an id from policyStats
  "coveredBy": string,         // MUST be another id from policyStats
  "reasoning": string }

{ "kind": "blind-spot",
  "pattern": string,           // 1 sentence describing the uncovered attack pattern
  "evidenceRuns": [string],    // runIds from events where the pattern appears
  "suggestedPolicy": {         // valid Policy DSL (see below)
    "id": string,              // use prefix "drift-suggested-"
    "name": string,
    "description": string,
    "severity": "critical"|"high"|"medium"|"low",
    "action": "block"|"pause",
    "when": [ Condition, ... ],
    "reasoning": string,
    "source": "auto-synthesized",
    "enabled": true,
    "createdAt": 0
  },
  "reasoning": string }

{ "kind": "dead-code",
  "policyId": string,                // MUST be an id from policyStats
  "matchesInRuns": number,           // MUST equal policyStats[].matchesInRuns (which must be 0)
  "totalRunsConsidered": number,     // MUST equal runsReviewed
  "reasoning": string }

## Policy DSL condition kinds

  { "kind": "tool",           "equals": string | string[] }
  { "kind": "argEquals",      "arg": string, "value": primitive }
  { "kind": "argMatches",     "arg": string, "pattern": string, "flags"?: "i" }
  { "kind": "argContains",    "arg": string, "substring": string, "caseSensitive"?: boolean }
  { "kind": "argAbsent",      "arg": string }
  { "kind": "domainNotIn",    "arg": string, "allowlist": string[] }
  { "kind": "domainIn",       "arg": string, "blocklist": string[] }
  { "kind": "valueThreshold", "arg": string, "op": "gt"|"gte"|"lt"|"lte", "value": number }

## Rules

- NEVER invent policy IDs, runIds, or match counts. Use only data from the input.
- For dead-code: only flag if matchesInRuns === 0 AND runsReviewed >= 5. Never guess.
- For redundant: only flag if policy A's match set is a strict subset of policy B's (reason about it).
- For blind-spot: the evidenceRuns MUST be real runIds from the events array. The suggestedPolicy must be syntactically valid DSL.
- Be selective: 2-5 findings. Quality over quantity. If the policy set is already well-tuned, return fewer findings.
- Output ONLY a JSON object: { "findings": [ DriftFinding, ... ] }. No prose, no markdown fences.`;

function buildUserPrompt(ctx: AuditContext): string {
  return `## policyStats\n\`\`\`json\n${JSON.stringify(ctx.policyStats, null, 2)}\n\`\`\`\n\n## events (most recent ${ctx.events.length})\n\`\`\`json\n${JSON.stringify(ctx.events, null, 2)}\n\`\`\`\n\n## runsReviewed: ${ctx.runsReviewed}\n\nReturn ONLY the JSON object { "findings": [ ... ] }.`;
}

// ─── Parser ───────────────────────────────────────────────────────────────────

function stripFences(t: string): string {
  return t.replace(/```(?:json)?\n?/g, '').replace(/```\s*$/g, '').trim();
}

function parseFindings(raw: string, ctx: AuditContext): DriftFinding[] {
  const clean = stripFences(raw);
  let obj: Record<string, unknown>;
  try {
    obj = JSON.parse(clean);
  } catch {
    const match = clean.match(/\{[\s\S]*\}/);
    if (!match) throw new Error('Opus returned no JSON object');
    try {
      obj = JSON.parse(match[0]);
    } catch {
      throw new Error('Opus returned unparseable JSON');
    }
  }

  const rawFindings = Array.isArray(obj.findings) ? obj.findings : [];
  const validPolicyIds = new Set(ctx.policyStats.map((s) => s.policy.id));
  const validRunIds = new Set(ctx.events.map((e) => e.runId));
  const out: DriftFinding[] = [];

  for (const f of rawFindings as Array<Record<string, unknown>>) {
    const kind = f.kind;

    if (kind === 'redundant') {
      const pid = String(f.policyId ?? '');
      const covered = String(f.coveredBy ?? '');
      if (!validPolicyIds.has(pid) || !validPolicyIds.has(covered) || pid === covered) continue;
      out.push({
        kind: 'redundant',
        policyId: pid,
        coveredBy: covered,
        reasoning: String(f.reasoning ?? '').slice(0, 600),
      });
    } else if (kind === 'dead-code') {
      const pid = String(f.policyId ?? '');
      if (!validPolicyIds.has(pid)) continue;
      const stat = ctx.policyStats.find((s) => s.policy.id === pid);
      // Ground truth: only accept if deterministic count is 0
      if (!stat || stat.matchesInRuns !== 0) continue;
      if (ctx.runsReviewed < 5) continue;
      out.push({
        kind: 'dead-code',
        policyId: pid,
        matchesInRuns: 0,
        totalRunsConsidered: ctx.runsReviewed,
        reasoning: String(f.reasoning ?? '').slice(0, 600),
      });
    } else if (kind === 'blind-spot') {
      const suggested = f.suggestedPolicy as Record<string, unknown> | undefined;
      if (!suggested || !suggested.id || !Array.isArray(suggested.when) || suggested.when.length === 0) continue;
      const evidenceRuns = Array.isArray(f.evidenceRuns)
        ? (f.evidenceRuns as unknown[]).filter((r): r is string => typeof r === 'string' && validRunIds.has(r))
        : [];
      if (evidenceRuns.length === 0) continue;

      const pol: Policy = {
        id: String(suggested.id),
        name: String(suggested.name ?? 'Suggested policy'),
        description: String(suggested.description ?? ''),
        severity: (['critical', 'high', 'medium', 'low'] as const).includes(suggested.severity as 'critical')
          ? (suggested.severity as Policy['severity']) : 'high',
        action: suggested.action === 'block' ? 'block' : 'pause',
        when: suggested.when as Policy['when'],
        reasoning: String(suggested.reasoning ?? ''),
        source: 'auto-synthesized',
        enabled: true,
        createdAt: Date.now(),
      };

      out.push({
        kind: 'blind-spot',
        pattern: String(f.pattern ?? '').slice(0, 280),
        evidenceRuns: evidenceRuns.slice(0, 5),
        suggestedPolicy: pol,
        reasoning: String(f.reasoning ?? '').slice(0, 600),
      });
    }
  }

  return out.slice(0, 6);
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export interface AuditOptions {
  onThinkingDelta?: (delta: string) => void;
}

export interface AuditResult {
  response: DriftAuditResponse;
  thinkingText: string;
  rawText: string;
}

export async function auditPolicies(opts: AuditOptions = {}): Promise<AuditResult> {
  const ctx = buildAuditContext();
  const userPrompt = buildUserPrompt(ctx);

  let thinkingText = '';
  let responseText = '';

  const stream = client.messages.stream({
    model: MODEL,
    max_tokens: MAX_TOKENS,
    thinking: { type: 'enabled', budget_tokens: THINKING_BUDGET },
    system: AUDIT_SYSTEM,
    messages: [{ role: 'user', content: userPrompt }],
  });

  for await (const event of stream) {
    if (event.type === 'content_block_delta') {
      if (event.delta.type === 'thinking_delta') {
        thinkingText += event.delta.thinking;
        opts.onThinkingDelta?.(event.delta.thinking);
      } else if (event.delta.type === 'text_delta') {
        responseText += event.delta.text;
      }
    }
  }

  const findings = parseFindings(responseText, ctx);

  const response: DriftAuditResponse = {
    findings,
    policiesReviewed: ctx.policyStats.length,
    runsReviewed: ctx.runsReviewed,
    eventsReviewed: ctx.events.length,
    thinkingTokens: Math.ceil(thinkingText.length / 4),
    contextTokens: Math.ceil(userPrompt.length / 4),
  };

  return { response, thinkingText, rawText: responseText };
}
