/**
 * Opus Security Committee.
 *
 * Given a BLOCK/PAUSE decision event, spawn 3 Opus instances with
 * distinct personas (CISO, Legal, Product) to deliberate in parallel,
 * then a 4th Opus (moderator) synthesizes consensus from their opinions.
 *
 * Pushes Opus by running 4 extended-thinking calls — 3 concurrent + 1
 * serial — producing a governance transcript that becomes an audit trail.
 */

import Anthropic from '@anthropic-ai/sdk';
import type {
  CommitteeOpinion,
  CommitteePersona,
  CommitteeVerdict,
  CommitteeConsensus,
  CommitteeStreamEvent,
} from '@sentinel/shared';
import { getAllEvents } from '../timetravel/snapshot.js';
import { getAllRuns } from '../agent/runner.js';

const client = new Anthropic({ timeout: 120_000 });
const MODEL = 'claude-opus-4-7';
const PERSONA_THINKING = 4_000;
const MODERATOR_THINKING = 4_000;
const MAX_TOKENS = 6_000;

const VALID_VERDICTS: ReadonlySet<CommitteeVerdict> = new Set(['uphold', 'override', 'escalate']);

// ─── Persona system prompts ───────────────────────────────────────────────────

const CISO_SYSTEM = `You are the CISO of an enterprise running AI agents in production. You are paranoid by design — your job is to think about worst-case scenarios. You've seen 3 incidents in the last quarter and you treat every edge case as the precursor to the next breach.

Review Sentinel's decision with a security-first lens:
- Does the tool call look like part of an attack chain (recon → escalation → exfiltration)?
- Could this be data exfiltration masquerading as a legitimate request?
- What's the blast radius if the decision is wrong?
- Have you seen this pattern before? Reference precedent when possible.

Tone: terse, operational, reference specific dollar amounts / record counts. Cite blast radius explicitly.

Respond with JSON ONLY (no prose, no fences):
{
  "verdict": "uphold" | "override" | "escalate",
  "reasoning": string,          // 3-5 sentences, direct
  "concerns": [string]          // 2-4 bullet points of what worries you
}`;

const LEGAL_SYSTEM = `You are the Head of Legal & Compliance. Your concern is regulatory exposure, NOT operational security. You cite regulation explicitly (GDPR, CCPA, SOC 2 CC7.2, PCI-DSS, HIPAA where relevant). You're conservative on data movement across jurisdictions and aggressive on preserving audit trails.

Review Sentinel's decision through a compliance lens:
- Which regulations apply to this tool call?
- Is there a breach-notification trigger if this proceeds?
- Does the audit trail capture enough to defend this decision in a regulatory review?
- Is the data classification appropriate?

Tone: formal, lawyerly. Hedge with "may constitute" / "potentially triggers". Name specific controls.

Respond with JSON ONLY:
{
  "verdict": "uphold" | "override" | "escalate",
  "reasoning": string,
  "concerns": [string]
}`;

const PRODUCT_SYSTEM = `You are the Head of Product. You worry about customer experience and revenue. False positives erode trust; paranoid security kills adoption. You push back on overly-cautious blocks when you believe they harm legitimate users.

Review Sentinel's decision through a product lens:
- Is this a legitimate customer request being over-blocked?
- What's the cost of a false positive here (NPS, churn, support tickets)?
- Is there a UX-friendly path (pause + confirm vs hard block)?
- Is the friction proportional to the risk?

Tone: pragmatic, outcomes-focused. Reference customer impact in plain numbers.

Respond with JSON ONLY:
{
  "verdict": "uphold" | "override" | "escalate",
  "reasoning": string,
  "concerns": [string]
}`;

const MODERATOR_SYSTEM = `You are the Security Committee Moderator. You do NOT cast a vote. You read three opinions (CISO, Legal, Product) and synthesize a consensus:

- Compute the majority verdict. Ties resolve to "escalate".
- Identify the 2-3 key points where the personas disagreed.
- Emit ONE concrete recommended action that respects the majority and addresses the dissent.

Be brief, grounded, direct. No flowery language.

Respond with JSON ONLY:
{
  "consensus": "uphold" | "override" | "escalate",
  "voteBreakdown": { "uphold": number, "override": number, "escalate": number },
  "keyDisagreements": [string],   // 2-3 bullets
  "recommendedAction": string,     // one concrete next step
  "reasoning": string              // 2-3 sentences tying the consensus to the opinions
}`;

const PERSONA_SYSTEMS: Record<CommitteePersona, string> = {
  ciso: CISO_SYSTEM,
  legal: LEGAL_SYSTEM,
  product: PRODUCT_SYSTEM,
};

// ─── Context builder ──────────────────────────────────────────────────────────

interface DecisionContext {
  runId: string;
  decisionEventId: string;
  originalVerdict: string;
  source?: string;
  reasoning: string;
  toolCall: { tool: string; args: Record<string, unknown> };
  riskSignals: string[];
  counterfactual?: {
    narration: string;
    damageSummary: string;
    simulatedSteps?: Array<{ tool: string; outcome: string }>;
  };
}

function buildContext(decisionEventId: string): DecisionContext {
  // Scan all runs for the event (inefficient but fine for demo scale).
  for (const run of getAllRuns()) {
    const events = getAllEvents(run.id);
    const idx = events.findIndex((e) => e.id === decisionEventId);
    if (idx < 0) continue;

    const decision = events[idx];
    const callEv = events[idx - 1];
    if (!decision || !callEv || callEv.type !== 'tool_call') continue;

    const dp = decision.payload as {
      verdict?: string;
      source?: string;
      reasoning?: string;
      riskSignals?: string[];
    };
    const cp = callEv.payload as { tool?: string; args?: Record<string, unknown> };

    // Counterfactual arrives as a separate event (kind: 'counterfactual' or type: 'counterfactual')
    const cfEv = events.find(
      (e) =>
        (e.type === 'counterfactual' || (e.payload as { kind?: string }).kind === 'counterfactual') &&
        (e.parentEventId === decision.id ||
          (e.payload as { parentEventId?: string }).parentEventId === decision.id),
    );
    const cfPayload = cfEv?.payload as
      | { narration?: string; damageSummary?: string; simulatedSteps?: Array<{ tool: string; outcome: string }> }
      | undefined;

    return {
      runId: run.id,
      decisionEventId,
      originalVerdict: String(dp.verdict ?? 'UNKNOWN'),
      source: dp.source,
      reasoning: String(dp.reasoning ?? ''),
      toolCall: { tool: String(cp.tool ?? ''), args: cp.args ?? {} },
      riskSignals: Array.isArray(dp.riskSignals) ? dp.riskSignals : [],
      counterfactual: cfPayload
        ? {
            narration: String(cfPayload.narration ?? ''),
            damageSummary: String(cfPayload.damageSummary ?? ''),
            simulatedSteps: cfPayload.simulatedSteps,
          }
        : undefined,
    };
  }
  throw new Error(`decision event ${decisionEventId} not found in any run`);
}

function buildPersonaPrompt(ctx: DecisionContext): string {
  return `## Decision under review

**Original verdict:** ${ctx.originalVerdict} (by ${ctx.source ?? 'unknown'})
**Run:** ${ctx.runId}
**Event ID:** ${ctx.decisionEventId}

**Tool call:**
\`\`\`json
${JSON.stringify(ctx.toolCall, null, 2)}
\`\`\`

**Sentinel's reasoning:**
${ctx.reasoning}

**Risk signals:** ${ctx.riskSignals.length ? ctx.riskSignals.join(', ') : '(none)'}

${ctx.counterfactual ? `**Counterfactual (what would have happened):**\n${ctx.counterfactual.narration}\n\n**Estimated damage if allowed:** ${ctx.counterfactual.damageSummary}\n` : ''}

Provide your opinion now. JSON only.`;
}

// ─── Persona runner ───────────────────────────────────────────────────────────

function stripFences(t: string): string {
  return t.replace(/```(?:json)?\n?/g, '').replace(/```\s*$/g, '').trim();
}

function parseOpinion(raw: string, persona: CommitteePersona): CommitteeOpinion {
  const clean = stripFences(raw);
  let obj: Record<string, unknown>;
  try {
    obj = JSON.parse(clean);
  } catch {
    const m = clean.match(/\{[\s\S]*\}/);
    if (!m) throw new Error(`${persona} returned no JSON`);
    obj = JSON.parse(m[0]);
  }

  const verdict = VALID_VERDICTS.has(obj.verdict as CommitteeVerdict)
    ? (obj.verdict as CommitteeVerdict)
    : 'escalate';

  const concerns = Array.isArray(obj.concerns)
    ? (obj.concerns as unknown[]).filter((c): c is string => typeof c === 'string').slice(0, 5)
    : [];

  return {
    persona,
    verdict,
    reasoning: String(obj.reasoning ?? '').slice(0, 800),
    concerns,
  };
}

async function runPersona(
  persona: CommitteePersona,
  ctx: DecisionContext,
  emit: (e: CommitteeStreamEvent) => void | Promise<void>,
): Promise<CommitteeOpinion | null> {
  let responseText = '';
  let thinkingText = '';

  try {
    const stream = client.messages.stream({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      thinking: { type: 'adaptive' } as any,
      system: PERSONA_SYSTEMS[persona],
      messages: [{ role: 'user', content: buildPersonaPrompt(ctx) }],
    });

    for await (const ev of stream) {
      if (ev.type === 'content_block_delta') {
        if (ev.delta.type === 'thinking_delta') {
          thinkingText += ev.delta.thinking;
          Promise.resolve(emit({ kind: 'persona_thinking', persona, delta: ev.delta.thinking })).catch(() => {});
        } else if (ev.delta.type === 'text_delta') {
          responseText += ev.delta.text;
        }
      }
    }

    const opinion = parseOpinion(responseText, persona);
    opinion.thinkingTokens = Math.ceil(thinkingText.length / 4);
    await emit({ kind: 'persona_opinion', opinion });
    return opinion;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await emit({ kind: 'persona_error', persona, error: msg });
    return null;
  }
}

// ─── Moderator ────────────────────────────────────────────────────────────────

function parseConsensus(raw: string, opinions: CommitteeOpinion[]): CommitteeConsensus {
  const clean = stripFences(raw);
  let obj: Record<string, unknown>;
  try {
    obj = JSON.parse(clean);
  } catch {
    const m = clean.match(/\{[\s\S]*\}/);
    if (!m) throw new Error('Moderator returned no JSON');
    obj = JSON.parse(m[0]);
  }

  const consensus = VALID_VERDICTS.has(obj.consensus as CommitteeVerdict)
    ? (obj.consensus as CommitteeVerdict)
    : computeMajority(opinions);

  const voteBreakdown = (obj.voteBreakdown && typeof obj.voteBreakdown === 'object'
    ? obj.voteBreakdown as Record<string, unknown>
    : {}) as Record<CommitteeVerdict, number | undefined>;
  const uphold = Number(voteBreakdown.uphold ?? opinions.filter((o) => o.verdict === 'uphold').length);
  const override = Number(voteBreakdown.override ?? opinions.filter((o) => o.verdict === 'override').length);
  const escalate = Number(voteBreakdown.escalate ?? opinions.filter((o) => o.verdict === 'escalate').length);

  const keyDisagreements = Array.isArray(obj.keyDisagreements)
    ? (obj.keyDisagreements as unknown[]).filter((k): k is string => typeof k === 'string').slice(0, 4)
    : [];

  return {
    consensus,
    voteBreakdown: { uphold, override, escalate },
    keyDisagreements,
    recommendedAction: String(obj.recommendedAction ?? '').slice(0, 400),
    reasoning: String(obj.reasoning ?? '').slice(0, 600),
  };
}

function computeMajority(opinions: CommitteeOpinion[]): CommitteeVerdict {
  const counts = { uphold: 0, override: 0, escalate: 0 };
  for (const o of opinions) counts[o.verdict]++;
  const entries = Object.entries(counts) as Array<[CommitteeVerdict, number]>;
  entries.sort((a, b) => b[1] - a[1]);
  const top = entries[0];
  const second = entries[1];
  if (!top) return 'escalate';
  // Ties → escalate
  if (second && top[1] === second[1]) return 'escalate';
  return top[0];
}

async function runModerator(
  opinions: CommitteeOpinion[],
  ctx: DecisionContext,
  emit: (e: CommitteeStreamEvent) => void | Promise<void>,
): Promise<CommitteeConsensus> {
  const userPrompt = `## Decision under review\n${ctx.toolCall.tool} · original verdict: ${ctx.originalVerdict}\n\n## Three opinions\n\n${opinions
    .map((o) => `### ${o.persona.toUpperCase()} — ${o.verdict.toUpperCase()}\n${o.reasoning}\n\nConcerns:\n${o.concerns.map((c) => `- ${c}`).join('\n')}`)
    .join('\n\n')}\n\nSynthesize consensus. JSON only.`;

  let text = '';
  let thinking = '';

  try {
    const stream = client.messages.stream({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      thinking: { type: 'adaptive' } as any,
      system: MODERATOR_SYSTEM,
      messages: [{ role: 'user', content: userPrompt }],
    });

    for await (const ev of stream) {
      if (ev.type === 'content_block_delta') {
        if (ev.delta.type === 'thinking_delta') {
          thinking += ev.delta.thinking;
          Promise.resolve(emit({ kind: 'moderator_thinking', delta: ev.delta.thinking })).catch(() => {});
        } else if (ev.delta.type === 'text_delta') {
          text += ev.delta.text;
        }
      }
    }

    const consensus = parseConsensus(text, opinions);
    consensus.thinkingTokens = Math.ceil(thinking.length / 4);
    await emit({ kind: 'moderator_consensus', consensus });
    return consensus;
  } catch (err) {
    // Fallback: deterministic majority vote if moderator fails
    const fallback: CommitteeConsensus = {
      consensus: computeMajority(opinions),
      voteBreakdown: {
        uphold: opinions.filter((o) => o.verdict === 'uphold').length,
        override: opinions.filter((o) => o.verdict === 'override').length,
        escalate: opinions.filter((o) => o.verdict === 'escalate').length,
      },
      keyDisagreements: [`Moderator failed: ${err instanceof Error ? err.message : String(err)}. Fallback to majority rule.`],
      recommendedAction: 'Review decision manually — moderator synthesis unavailable.',
      reasoning: 'Deterministic majority consensus (moderator Opus call failed).',
    };
    await emit({ kind: 'moderator_consensus', consensus: fallback });
    return fallback;
  }
}

// ─── Main entrypoint ──────────────────────────────────────────────────────────

export interface ConvokeCommitteeOptions {
  decisionEventId: string;
  emit: (event: CommitteeStreamEvent) => void | Promise<void>;
}

export async function convokeCommittee(opts: ConvokeCommitteeOptions): Promise<void> {
  const ctx = buildContext(opts.decisionEventId);
  const startedAt = Date.now();

  await opts.emit({ kind: 'committee_start', decisionEventId: opts.decisionEventId, runId: ctx.runId });

  // Phase 1: Three personas in parallel (extended thinking × 3)
  const results = await Promise.all([
    runPersona('ciso', ctx, opts.emit),
    runPersona('legal', ctx, opts.emit),
    runPersona('product', ctx, opts.emit),
  ]);

  const opinions = results.filter((o): o is CommitteeOpinion => o !== null);

  if (opinions.length < 2) {
    await opts.emit({
      kind: 'error',
      message: `Only ${opinions.length} of 3 personas returned valid opinions — cannot form consensus.`,
    });
    return;
  }

  // Phase 2: Moderator synthesizes
  const consensus = await runModerator(opinions, ctx, opts.emit);

  await opts.emit({
    kind: 'committee_end',
    session: {
      decisionEventId: opts.decisionEventId,
      runId: ctx.runId,
      originalVerdict: ctx.originalVerdict,
      opinions,
      consensus,
      durationMs: Date.now() - startedAt,
    },
  });
}
