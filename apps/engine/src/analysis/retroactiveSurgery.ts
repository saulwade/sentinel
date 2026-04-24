/**
 * Retroactive Policy Surgery.
 *
 * A specific tool_call slipped past the deterministic policy layer and had
 * to be caught by Pre-cog (LLM heuristics). Opus synthesizes ONE deterministic
 * policy that would have blocked the bypass IF it had existed earlier —
 * validated against all clean historical runs to guarantee zero false
 * positives, then quantified via counterfactual replay.
 *
 * Pushes Opus in two ways:
 *   1. Reads the ENTIRE historical event log in one shot (1M context)
 *   2. Extended thinking with retry loop based on deterministic feedback
 */

import Anthropic from '@anthropic-ai/sdk';
import { nanoid } from 'nanoid';
import type {
  Policy,
  PolicyAction,
  PolicySeverity,
  RetroactiveSurgeryResponse,
  RetroactiveAffectedRun,
  RetroactiveBypassEvent,
} from '@sentinel/shared';
import { getAllRuns, getRun } from '../agent/runner.js';
import { getAllEvents } from '../timetravel/snapshot.js';
import { evaluatePolicies } from '../policies/engine.js';
import { getWorld } from '../agent/world.js';

const client = new Anthropic({ timeout: 120_000 });
const MODEL = 'claude-opus-4-7';
const THINKING_BUDGET = 6_000;
const MAX_TOKENS = 8_000;
const MAX_ATTEMPTS = 3;

// ─── Bypass detection ─────────────────────────────────────────────────────────

interface ToolCallLite {
  runId: string;
  seq: number;
  tool: string;
  args: Record<string, unknown>;
}

/**
 * Find bypasses in a run: tool_calls where the subsequent decision was
 * BLOCK or PAUSE with source === 'pre-cog' (i.e., no policy caught it).
 * Returns the first such event — surgery addresses ONE bypass at a time.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function findBypass(events: Array<{ seq: number; type: string; payload: any }>, runId: string): RetroactiveBypassEvent | null {
  for (let i = 0; i < events.length - 1; i++) {
    const call = events[i];
    const decision = events[i + 1];
    if (!call || !decision) continue;
    if (call.type !== 'tool_call' || decision.type !== 'decision') continue;
    if (decision.seq !== call.seq + 1) continue;

    const dPayload = decision.payload as { verdict?: string; source?: string; reasoning?: string };
    if ((dPayload.verdict === 'BLOCK' || dPayload.verdict === 'PAUSE') && dPayload.source === 'pre-cog') {
      const cPayload = call.payload as { tool?: string; args?: Record<string, unknown> };
      return {
        runId,
        seq: call.seq,
        tool: String(cPayload.tool ?? ''),
        args: cPayload.args ?? {},
        verdict: String(dPayload.verdict),
        reasoning: String(dPayload.reasoning ?? ''),
      };
    }
  }
  return null;
}

/**
 * Collect all tool_calls across all runs, tagged with whether they ended in
 * ALLOW. Used for deterministic validation (false-positive check) and
 * counterfactual quantification.
 */
function collectAllToolCalls(): Array<{
  runId: string;
  seq: number;
  tool: string;
  args: Record<string, unknown>;
  finalVerdict: string;
}> {
  const out: Array<{
    runId: string;
    seq: number;
    tool: string;
    args: Record<string, unknown>;
    finalVerdict: string;
  }> = [];

  for (const run of getAllRuns()) {
    const events = getAllEvents(run.id);
    for (let i = 0; i < events.length - 1; i++) {
      const call = events[i];
      const decision = events[i + 1];
      if (!call || !decision) continue;
      if (call.type !== 'tool_call' || decision.type !== 'decision') continue;

      const cp = call.payload as { tool?: string; args?: Record<string, unknown> };
      const dp = decision.payload as { verdict?: string };
      out.push({
        runId: run.id,
        seq: call.seq,
        tool: String(cp.tool ?? ''),
        args: cp.args ?? {},
        finalVerdict: String(dp.verdict ?? 'UNKNOWN'),
      });
    }
  }
  return out;
}

// ─── Deterministic validation ─────────────────────────────────────────────────

interface ValidationResult {
  ok: true;
}

interface ValidationFailure {
  ok: false;
  reason: string;
}

function validatePolicy(
  policy: Policy,
  bypass: RetroactiveBypassEvent,
  allCalls: ReturnType<typeof collectAllToolCalls>,
): ValidationResult | ValidationFailure {
  const world = getWorld();

  // 1. Must match the bypass
  const bypassMatch = evaluatePolicies([policy], { tool: bypass.tool, args: bypass.args }, world);
  if (!bypassMatch) {
    return {
      ok: false,
      reason: `Your policy did NOT match the bypass event (tool="${bypass.tool}", args=${JSON.stringify(bypass.args)}). The policy must fire on that exact tool call. Revise the "when" conditions so they match this specific call.`,
    };
  }
  if (bypassMatch.action === 'allow') {
    return {
      ok: false,
      reason: `Your policy matched the bypass but with action="allow". Change action to "block" or "pause".`,
    };
  }

  // 2. Must NOT fire on any ALLOW tool_call
  for (const call of allCalls) {
    if (call.finalVerdict !== 'ALLOW') continue;
    const match = evaluatePolicies([policy], { tool: call.tool, args: call.args }, world);
    if (match && match.action !== 'allow') {
      return {
        ok: false,
        reason: `Your policy false-positived on run ${call.runId} seq ${call.seq} — a LEGITIMATE tool call (tool="${call.tool}", args=${JSON.stringify(call.args).slice(0, 200)}). Tighten the conditions so they don't match this call. Common fixes: add argMatches/valueThreshold to scope by intent, not tool name alone.`,
      };
    }
  }

  return { ok: true };
}

// ─── Counterfactual quantification ────────────────────────────────────────────

function quantifyCounterfactual(
  policy: Policy,
  bypass: RetroactiveBypassEvent,
  allCalls: ReturnType<typeof collectAllToolCalls>,
): {
  wouldHaveBlockedCount: number;
  additionalMoneyInterdicted: number;
  affectedRuns: RetroactiveAffectedRun[];
  totalRunsAnalyzed: number;
} {
  const world = getWorld();
  const affectedRuns: RetroactiveAffectedRun[] = [];
  let additionalMoneyInterdicted = 0;

  for (const call of allCalls) {
    // Skip the original bypass — we already know it's covered
    if (call.runId === bypass.runId && call.seq === bypass.seq) continue;
    // Only count calls that WEREN'T already ALLOW (since those are legitimate
    // and the policy shouldn't fire on them — validated above). We want to
    // count calls that originally went BLOCK/PAUSE via other means, which the
    // new policy would ALSO have caught (redundant-but-earlier defense).
    if (call.finalVerdict === 'ALLOW') continue;
    const match = evaluatePolicies([policy], { tool: call.tool, args: call.args }, world);
    if (!match || match.action === 'allow') continue;

    const impact = typeof call.args.amount === 'number' ? call.args.amount : undefined;
    if (impact) additionalMoneyInterdicted += impact;
    affectedRuns.push({ runId: call.runId, eventSeq: call.seq, tool: call.tool, estimatedImpact: impact });
  }

  return {
    wouldHaveBlockedCount: affectedRuns.length,
    additionalMoneyInterdicted,
    affectedRuns: affectedRuns.slice(0, 10),
    totalRunsAnalyzed: new Set(allCalls.map((c) => c.runId)).size,
  };
}

// ─── Prompt ───────────────────────────────────────────────────────────────────

const SURGERY_SYSTEM = `You are a retroactive security architect. A specific tool call bypassed Sentinel's deterministic policy layer and had to be caught by Pre-cog (LLM-based heuristics). Your job: synthesize ONE deterministic policy that would have blocked the bypass IF it had existed earlier.

## Hard constraints — validated deterministically after you respond

1. MUST match the exact bypass event (tool + args shown below).
2. MUST NOT match any tool_call that ended in ALLOW across the full history — I will validate with the real evaluator. False positives = immediate retry with feedback.
3. Use ONLY the supported DSL condition kinds listed below.
4. Prefer specificity: target the attack pattern, not broad tool-name rules.
5. Prefer "block" over "pause" for unambiguous attack signals.

## Policy DSL condition kinds

  { "kind": "tool",           "equals": string | string[] }
  { "kind": "argEquals",      "arg": string, "value": string|number|boolean }
  { "kind": "argMatches",     "arg": string, "pattern": string, "flags"?: "i" }
  { "kind": "argContains",    "arg": string, "substring": string, "caseSensitive"?: boolean }
  { "kind": "argAbsent",      "arg": string }
  { "kind": "domainNotIn",    "arg": string, "allowlist": string[] }
  { "kind": "domainIn",       "arg": string, "blocklist": string[] }
  { "kind": "valueThreshold", "arg": string, "op": "gt"|"gte"|"lt"|"lte", "value": number }

## Output

Return ONLY a JSON object (no prose, no fences) matching:

{
  "id": string,            // prefix with "retro-"
  "name": string,
  "description": string,
  "severity": "critical"|"high"|"medium"|"low",
  "action": "block"|"pause",
  "when": [ Condition, ... ],
  "reasoning": string      // why this condition set catches the bypass
}`;

interface CompactCall {
  runId: string;
  seq: number;
  tool: string;
  brief?: string;
}

function buildUserPrompt(
  bypass: RetroactiveBypassEvent,
  allCalls: ReturnType<typeof collectAllToolCalls>,
  activePolicies: Policy[],
  previousFailure?: string,
): string {
  const allowCalls: CompactCall[] = allCalls
    .filter((c) => c.finalVerdict === 'ALLOW')
    .map((c) => {
      const brief =
        typeof c.args.to === 'string' ? `to=${c.args.to}` :
        typeof c.args.customer_id === 'string' ? `customer=${c.args.customer_id}${typeof c.args.amount === 'number' ? ` amount=$${c.args.amount}` : ''}` :
        typeof c.args.ticket_id === 'string' ? `ticket=${c.args.ticket_id}` :
        typeof c.args.id === 'string' ? `id=${c.args.id}` :
        undefined;
      return { runId: c.runId, seq: c.seq, tool: c.tool, brief };
    });

  const retrySection = previousFailure
    ? `\n\n## Previous attempt failed\n${previousFailure}\nFix the exact issue described — don't start over.\n`
    : '';

  return `## Bypass event (MUST match)

\`\`\`json
${JSON.stringify(bypass, null, 2)}
\`\`\`

## Legitimate tool calls (MUST NOT false-positive on any of these)

Compact list of all ${allowCalls.length} ALLOW calls across history. Your policy's \`when\` conditions must NOT match any of these when evaluated with the real engine.

\`\`\`json
${JSON.stringify(allowCalls, null, 2)}
\`\`\`

## Currently active policies (avoid redundancy)

\`\`\`json
${JSON.stringify(activePolicies.map((p) => ({ id: p.id, name: p.name, when: p.when })), null, 2)}
\`\`\`
${retrySection}
Return ONLY the JSON Policy object.`;
}

// ─── Parser ───────────────────────────────────────────────────────────────────

const VALID_ACTIONS: PolicyAction[] = ['block', 'pause'];
const VALID_SEVERITIES: PolicySeverity[] = ['critical', 'high', 'medium', 'low'];

function parsePolicy(raw: string, bypass: RetroactiveBypassEvent): Policy {
  const clean = raw.replace(/```json?\n?/g, '').replace(/```/g, '').trim();
  let obj: Record<string, unknown>;
  try {
    obj = JSON.parse(clean);
  } catch {
    const m = clean.match(/\{[\s\S]*\}/);
    if (!m) throw new Error('Opus returned no JSON object');
    try {
      obj = JSON.parse(m[0]);
    } catch {
      throw new Error('Opus returned unparseable JSON');
    }
  }

  if (!Array.isArray(obj.when) || obj.when.length === 0) {
    throw new Error('Policy must have a non-empty `when` array.');
  }

  const action = VALID_ACTIONS.includes(obj.action as PolicyAction) ? (obj.action as PolicyAction) : 'pause';
  const severity = VALID_SEVERITIES.includes(obj.severity as PolicySeverity) ? (obj.severity as PolicySeverity) : 'high';

  const providedId = typeof obj.id === 'string' ? obj.id : '';
  const id = providedId.startsWith('retro-')
    ? providedId
    : `retro-${bypass.runId.slice(0, 8)}-${bypass.seq}-${nanoid(4)}`;

  return {
    id,
    name: String(obj.name ?? `Retroactive fix for ${bypass.tool}`),
    description: String(obj.description ?? ''),
    severity,
    action,
    reasoning: String(obj.reasoning ?? ''),
    when: obj.when as Policy['when'],
    source: 'auto-synthesized',
    enabled: true,
    createdAt: Date.now(),
  };
}

// ─── Main entrypoint ──────────────────────────────────────────────────────────

export interface SurgeryOptions {
  runId: string;
  onThinkingDelta?: (delta: string) => void;
  onAttempt?: (attempt: number, status: 'thinking' | 'validating' | 'retry', detail?: string) => void;
}

export interface SurgeryResult {
  response: RetroactiveSurgeryResponse;
  thinkingText: string;
}

export async function performSurgery(opts: SurgeryOptions, activePolicies: Policy[]): Promise<SurgeryResult> {
  const run = getRun(opts.runId);
  if (!run) throw new Error(`run ${opts.runId} not found`);

  const events = getAllEvents(opts.runId);
  const bypass = findBypass(events, opts.runId);
  if (!bypass) {
    throw new Error('No bypass found in this run — every BLOCK/PAUSE was caught by an existing policy. Nothing to fix.');
  }

  const allCalls = collectAllToolCalls();

  let thinkingText = '';
  let previousFailure: string | undefined;
  let attempt = 0;
  let lastContextTokens = 0;

  while (attempt < MAX_ATTEMPTS) {
    attempt++;
    opts.onAttempt?.(attempt, 'thinking');

    const userPrompt = buildUserPrompt(bypass, allCalls, activePolicies, previousFailure);
    lastContextTokens = Math.ceil(userPrompt.length / 4);

    let responseText = '';
    let thisAttemptThinking = '';

    const stream = client.messages.stream({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      thinking: { type: 'adaptive' } as any,
      system: SURGERY_SYSTEM,
      messages: [{ role: 'user', content: userPrompt }],
    });

    for await (const event of stream) {
      if (event.type === 'content_block_delta') {
        if (event.delta.type === 'thinking_delta') {
          thisAttemptThinking += event.delta.thinking;
          opts.onThinkingDelta?.(event.delta.thinking);
        } else if (event.delta.type === 'text_delta') {
          responseText += event.delta.text;
        }
      }
    }

    thinkingText += thisAttemptThinking;

    // Parse
    let policy: Policy;
    try {
      policy = parsePolicy(responseText, bypass);
    } catch (err) {
      previousFailure = `Your output was not valid JSON / Policy shape: ${err instanceof Error ? err.message : String(err)}`;
      opts.onAttempt?.(attempt, 'retry', previousFailure);
      continue;
    }

    // Validate
    opts.onAttempt?.(attempt, 'validating');
    const validation = validatePolicy(policy, bypass, allCalls);
    if (!validation.ok) {
      previousFailure = validation.reason;
      opts.onAttempt?.(attempt, 'retry', previousFailure);
      continue;
    }

    // Success — quantify counterfactual
    const counterfactual = quantifyCounterfactual(policy, bypass, allCalls);

    return {
      response: {
        policy,
        bypassEvent: bypass,
        counterfactual,
        attempts: attempt,
        thinkingTokens: Math.ceil(thinkingText.length / 4),
        contextTokens: lastContextTokens,
      },
      thinkingText,
    };
  }

  throw new Error(`Surgery failed after ${MAX_ATTEMPTS} attempts. Last feedback: ${previousFailure}`);
}
