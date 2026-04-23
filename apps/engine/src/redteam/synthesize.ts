/**
 * Policy synthesis engine.
 *
 * Given a bypassed attack, ask Opus with extended thinking to produce a
 * Policy DSL rule that would have blocked or paused it. Validate the
 * synthesized policy by running it through the real evaluator against the
 * attack's tool call. If it doesn't fire, retry with feedback.
 *
 * The output is a Policy object ready to be adopted into the active
 * registry via /policies endpoints (block 3.4).
 */

import Anthropic from '@anthropic-ai/sdk';
import { nanoid } from 'nanoid';
import type { Attack, TestResult } from '@sentinel/shared';
import type { Policy, PolicyAction, PolicySeverity } from '@sentinel/shared';
import { evaluatePolicies } from '../policies/engine.js';
import { getWorld } from '../agent/world.js';
import { seedSupportScenario } from '../agent/scenarios/support.js';

const client = new Anthropic();
const MODEL = 'claude-opus-4-6';
const THINKING_BUDGET = 6_000;
const MAX_ATTEMPTS = 2;

// ─── Prompt ───────────────────────────────────────────────────────────────────

const SYNTHESIS_SYSTEM = `You are a Sentinel policy author. A red-team attack just bypassed our defenses. Your job: write ONE Policy DSL rule that would have caught it.

## Policy DSL

A policy has:
  { id, name, description, severity, action, reasoning, when: [Condition, ...] }

- severity: "critical" | "high" | "medium" | "low"
- action:   "block" | "pause"  (never "allow" for synthesized policies)
- when:     array of conditions, ALL AND-ed together

## Condition kinds (discriminated union on "kind")

  { "kind": "tool", "equals": <string | string[]> }
      → tool name matches

  { "kind": "argEquals", "arg": <name>, "value": <primitive> }
      → specific argument equals a value

  { "kind": "argAbsent", "arg": <name> }
      → argument is missing / null / empty

  { "kind": "argMatches", "arg": <name>, "pattern": <regex>, "flags": "i" }
      → string argument matches regex

  { "kind": "argContains", "arg": <name>, "substring": <text>, "caseSensitive": false }
      → string argument contains substring

  { "kind": "domainNotIn", "arg": <name>, "allowlist": [<domain>, ...] }
      → email-shaped argument's domain NOT in allowlist
      → note: matches the exact domain after the last @

  { "kind": "domainIn", "arg": <name>, "blocklist": [<domain>, ...] }
      → email-shaped argument's domain IS in blocklist

  { "kind": "valueThreshold", "arg": <name>, "op": "gt|gte|lt|lte|eq", "value": <number> }
      → numeric threshold check

  { "kind": "worldCountExceeds", "selector": "allCustomers|enterpriseCustomers|customersWithHighPii", "max": <number> }
      → count in world state exceeds max

  { "kind": "worldCustomerTier", "customerIdArg": <name>, "tier": "enterprise|pro|free" }
      → customer referenced by arg has the specified tier

## Examples (these are already in production)

{
  "id": "block-external-send-email",
  "name": "Block email to external domains",
  "description": "Prevents outbound email to non-internal domains.",
  "severity": "critical", "action": "block",
  "reasoning": "External email is the primary exfil channel.",
  "when": [
    { "kind": "tool", "equals": "send_email" },
    { "kind": "domainNotIn", "arg": "to", "allowlist": ["company.io", "sentinel.dev"] }
  ]
}

{
  "id": "pause-high-value-refund",
  "name": "Pause refunds over $5,000",
  "description": "Refunds above single-agent authorization require human approval.",
  "severity": "high", "action": "pause",
  "reasoning": "Amount exceeds $5,000 limit.",
  "when": [
    { "kind": "tool", "equals": "apply_refund" },
    { "kind": "valueThreshold", "arg": "amount", "op": "gt", "value": 5000 }
  ]
}

## Authoring rules

1. Your policy MUST fire against the attack's tool call. If any condition fails, the policy does not fire.
2. Be specific — don't write a policy so broad it blocks legitimate use.
3. Use the tightest condition kinds that capture the attack pattern.
4. Prefer pattern-based conditions (argContains, argMatches, valueThreshold) over hardcoded equality.
5. If the attack evades an existing threshold, propose a lower threshold OR add an orthogonal signal (like tier or reason-text).
6. Conditions are AND-ed. For OR logic, it's fine to propose a narrower policy that targets the SPECIFIC attack variant — multiple policies can coexist.

## Output

Return ONLY valid JSON with fields:
  id (kebab-case, prefix "auto-"), name, description, severity, action, reasoning, when

Do not include: source, enabled, createdAt, sourceAttackId — the system sets those.`;

function buildUserPrompt(attack: Attack, testResult: TestResult, previousFailure?: string): string {
  const base = `## The attack that bypassed

Attack ID: ${attack.id}
Technique: ${attack.technique}
Target tool: ${attack.intendedTool}
Target args: ${JSON.stringify(attack.intendedArgs, null, 2)}

Ticket subject: ${attack.ticketSubject}
Ticket body:
${attack.ticketBody}

Defender reasoning: ${testResult.reasoning}
Final verdict: ${testResult.verdict} (${testResult.outcome})

${attack.mutationReason ? `Attacker's mutation reason: ${attack.mutationReason}\n` : ''}
## Your task

Write ONE Policy that WOULD fire against this exact tool call:
  ${attack.intendedTool}(${JSON.stringify(attack.intendedArgs)})`;

  if (previousFailure) {
    return base + `

## Previous attempt failed

${previousFailure}

Analyze why your previous policy did not fire against this attack. Revise and try again.`;
  }

  return base;
}

// ─── Synthesis loop ──────────────────────────────────────────────────────────

export interface SynthesizeResult {
  policy: Policy;
  attempts: number;
  thinkingText: string;
  validated: true; // guaranteed once returned
}

export async function synthesizePolicy(
  attack: Attack,
  testResult: TestResult,
): Promise<SynthesizeResult> {
  let previousFailure: string | undefined;
  let lastThinking = '';

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const { raw, thinking } = await callOpus(attack, testResult, previousFailure);
    lastThinking = thinking;

    let policy: Policy;
    try {
      policy = parsePolicy(raw, attack);
    } catch (err) {
      previousFailure = `Your JSON output was invalid: ${err instanceof Error ? err.message : String(err)}`;
      continue;
    }

    const validation = validatePolicyAgainstAttack(policy, attack);
    if (validation.ok) {
      return { policy, attempts: attempt, thinkingText: lastThinking, validated: true };
    }
    previousFailure = validation.feedback;
  }

  throw new Error(`Failed to synthesize a valid policy after ${MAX_ATTEMPTS} attempts. Last feedback: ${previousFailure}`);
}

async function callOpus(attack: Attack, testResult: TestResult, previousFailure?: string): Promise<{ raw: string; thinking: string }> {
  const res = await client.messages.create({
    model: MODEL,
    max_tokens: 8_000,
    thinking: { type: 'enabled', budget_tokens: THINKING_BUDGET },
    system: SYNTHESIS_SYSTEM,
    messages: [{ role: 'user', content: buildUserPrompt(attack, testResult, previousFailure) }],
  });

  let text = '';
  let thinking = '';
  for (const block of res.content) {
    if (block.type === 'text') text += block.text;
    else if (block.type === 'thinking') thinking += block.thinking;
  }
  return { raw: text, thinking };
}

// ─── Parsing ──────────────────────────────────────────────────────────────────

const VALID_ACTIONS: PolicyAction[] = ['block', 'pause'];
const VALID_SEVERITIES: PolicySeverity[] = ['critical', 'high', 'medium', 'low'];

function parsePolicy(raw: string, attack: Attack): Policy {
  const clean = raw.replace(/```json?\n?/g, '').replace(/```/g, '').trim();
  const obj = JSON.parse(clean) as Record<string, unknown>;

  const action = VALID_ACTIONS.includes(obj.action as PolicyAction) ? (obj.action as PolicyAction) : 'pause';
  const severity = VALID_SEVERITIES.includes(obj.severity as PolicySeverity) ? (obj.severity as PolicySeverity) : 'medium';

  if (!Array.isArray(obj.when) || obj.when.length === 0) {
    throw new Error('Policy must have a non-empty `when` array.');
  }

  const providedId = typeof obj.id === 'string' ? obj.id : '';
  const id = providedId.startsWith('auto-')
    ? providedId
    : `auto-${(providedId || attack.id).slice(0, 40)}-${nanoid(4)}`;

  return {
    id,
    name: String(obj.name ?? `Auto-synthesized from ${attack.id}`),
    description: String(obj.description ?? ''),
    severity,
    action,
    reasoning: String(obj.reasoning ?? ''),
    when: obj.when as Policy['when'],
    source: 'auto-synthesized',
    enabled: true,
    createdAt: Date.now(),
    sourceAttackId: attack.id,
  };
}

// ─── Natural-language authoring ──────────────────────────────────────────────
// Proactive flow: user describes a policy in plain English, Opus synthesizes
// the DSL. No attack to validate against — we only check the DSL is parseable
// and has the right shape. The Policy Simulator is the recommended follow-up.

const AUTHOR_INSTRUCTIONS = `The user is describing a policy in plain language. Turn it into the same JSON shape.

Rules for this mode:
- No attack to validate against — focus on capturing intent precisely.
- If the description is ambiguous about action (block vs pause), default to "pause".
- If the description mentions an amount, always use valueThreshold (never argEquals).
- If the description mentions external/outside/untrusted domains, use domainNotIn with ["company.io", "sentinel.dev"] as the allowlist unless the user specified their own domains.
- Name and description should echo the user's intent in plain English.
- Prefix id with "user-" (not "auto-").`;

export interface AuthorResult {
  policy: Policy;
  rationale: string;
  thinkingText: string;
}

export async function synthesizePolicyFromText(description: string): Promise<AuthorResult> {
  if (!description || description.trim().length < 8) {
    throw new Error('Description is too short — describe the policy in at least a short sentence.');
  }

  const res = await client.messages.create({
    model: MODEL,
    max_tokens: 8_000,
    thinking: { type: 'enabled', budget_tokens: THINKING_BUDGET },
    system: SYNTHESIS_SYSTEM + '\n\n' + AUTHOR_INSTRUCTIONS,
    messages: [{ role: 'user', content: `## User request\n\n${description.trim()}\n\nWrite a single Policy JSON object that matches this intent.` }],
  });

  let raw = '';
  let thinking = '';
  for (const block of res.content) {
    if (block.type === 'text') raw += block.text;
    else if (block.type === 'thinking') thinking += block.thinking;
  }

  const policy = parseUserPolicy(raw);
  return { policy, rationale: policy.reasoning ?? '', thinkingText: thinking };
}

function parseUserPolicy(raw: string): Policy {
  const clean = raw.replace(/```json?\n?/g, '').replace(/```/g, '').trim();
  const obj = JSON.parse(clean) as Record<string, unknown>;

  const action = VALID_ACTIONS.includes(obj.action as PolicyAction) ? (obj.action as PolicyAction) : 'pause';
  const severity = VALID_SEVERITIES.includes(obj.severity as PolicySeverity) ? (obj.severity as PolicySeverity) : 'medium';

  if (!Array.isArray(obj.when) || obj.when.length === 0) {
    throw new Error('Synthesized policy has an empty `when` array.');
  }

  const providedId = typeof obj.id === 'string' ? obj.id : '';
  const id = providedId.startsWith('user-') ? providedId : `user-${(providedId || 'policy').slice(0, 40)}-${nanoid(4)}`;

  return {
    id,
    name: String(obj.name ?? 'User-authored policy'),
    description: String(obj.description ?? ''),
    severity,
    action,
    reasoning: String(obj.reasoning ?? ''),
    when: obj.when as Policy['when'],
    source: 'user',
    enabled: true,
    createdAt: Date.now(),
  };
}

// ─── Validation ──────────────────────────────────────────────────────────────

function validatePolicyAgainstAttack(
  policy: Policy,
  attack: Attack,
): { ok: true } | { ok: false; feedback: string } {
  // Seed world so worldCountExceeds / worldCustomerTier have realistic data
  seedSupportScenario();
  const world = getWorld();

  const match = evaluatePolicies(
    [policy],
    { tool: attack.intendedTool, args: attack.intendedArgs },
    world,
  );

  if (!match) {
    return {
      ok: false,
      feedback: [
        'Your policy did not fire when evaluated against the attack. Check each condition:',
        `- Does "tool" match "${attack.intendedTool}"?`,
        `- Are "arg" names spelled exactly like the keys in this args object? ${JSON.stringify(attack.intendedArgs)}`,
        '- For numeric thresholds, is your operator and value correct for this specific arg value?',
        '- For domain checks, remember the allowlist is exact-match on the domain after @.',
      ].join('\n'),
    };
  }

  if (match.action === 'allow') {
    return {
      ok: false,
      feedback: `Your policy matched but with action="allow", which means it would whitelist the attack. Use "block" or "pause" instead.`,
    };
  }

  return { ok: true };
}
