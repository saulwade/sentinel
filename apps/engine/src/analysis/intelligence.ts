/**
 * Incident Intelligence — one Opus call that produces three distinct outputs
 * from the same run analysis context:
 *
 *   1. Threat Profile  — sophistication, motivation, technique, predicted next move
 *   2. Attack Narrative — cinematic prose story of the attack
 *   3. Board Briefing   — 3-paragraph executive summary (headline, what/so-what/next)
 *
 * Uses extended thinking (10k budget) and streams deltas so the UI can surface
 * live "Opus is analyzing..." state.
 */

import Anthropic from '@anthropic-ai/sdk';
import type { AgentEvent, RunAnalysis } from '@sentinel/shared';
import type { BlastRadius } from './blastRadius.js';

const client = new Anthropic();

const MODEL = 'claude-opus-4-7';
const THINKING_BUDGET = 10_000;
const MAX_TOKENS = 20_000;

export interface ThreatProfile {
  sophistication: number;          // 1-10
  sophisticationLabel: string;     // "Expert" | "Advanced" | "Moderate" | "Novice"
  motivation: string;              // "Financial gain via refund fraud"
  technique: string;               // "Authority-based social engineering"
  mitreTactic: string;             // "T1566.002 — Phishing: Spearphishing Link"
  nextMove: string;                // "Would likely attempt data exfiltration via email next"
  attackerType: string;            // "External opportunistic" | "Insider threat" | "APT-style"
}

export interface BoardBriefing {
  headline: string;                // "$47,000 in fraud prevented; 847 customer records kept safe"
  damagePrevented: string;         // One-line damage summary
  whatHappened: string;            // Paragraph 1
  whyItMatters: string;            // Paragraph 2
  whatNext: string;                // Paragraph 3
}

export interface Intelligence {
  threatProfile: ThreatProfile;
  narrative: string;               // Markdown prose
  boardBriefing: BoardBriefing;
}

export interface IntelligenceOptions {
  scenario: string;
  events: AgentEvent[];
  blast: BlastRadius;
  analysis?: RunAnalysis;
  onThinkingDelta?: (delta: string) => void;
}

const SYSTEM_PROMPT = `You are Sentinel's incident intelligence analyst.

You are given a completed AI agent security incident: the full event stream, the computed blast radius (what was blocked, what would have been lost), and an existing technical analysis.

Produce THREE distinct outputs from this one analysis, each tuned for a different audience:

1. THREAT PROFILE — for the security team. A precise attacker profile: how sophisticated, what they wanted, what technique they used, what they would likely try next. Map to MITRE ATT&CK where appropriate, but translate to AI-agent context.

2. ATTACK NARRATIVE — for the engineering team. A cinematic prose story of how the attack unfolded, step by step, told in past tense. Start with the moment the agent received the malicious input. Build tension. Show the exact moment Sentinel intervened. End with what would have happened otherwise. 3-5 paragraphs. Do not use bullet points. Keep technical but make it compelling to read.

3. BOARD BRIEFING — for the CEO/board. Three short paragraphs in plain language, no jargon:
   - Paragraph 1 (whatHappened): What the attempted attack was, in one or two sentences a non-technical executive would understand.
   - Paragraph 2 (whyItMatters): The business impact — dollar amount, customer records, regulatory exposure, reputation risk. Be concrete.
   - Paragraph 3 (whatNext): What we learned and what protections are now in place. Reassure without being dismissive.

Return ONLY a single JSON object with this exact shape, no preamble, no markdown fences:

{
  "threatProfile": {
    "sophistication": <1-10>,
    "sophisticationLabel": "Expert" | "Advanced" | "Moderate" | "Novice",
    "motivation": "<one sentence>",
    "technique": "<one sentence>",
    "mitreTactic": "<identifier + name>",
    "nextMove": "<one sentence prediction>",
    "attackerType": "External opportunistic" | "Insider threat" | "APT-style" | "Automated probe"
  },
  "narrative": "<markdown prose, 3-5 paragraphs>",
  "boardBriefing": {
    "headline": "<one punchy line>",
    "damagePrevented": "<concrete numbers>",
    "whatHappened": "<paragraph>",
    "whyItMatters": "<paragraph>",
    "whatNext": "<paragraph>"
  }
}`;

function buildUserPrompt(opts: IntelligenceOptions): string {
  const eventSummary = opts.events.map((e) => {
    if (e.type === 'tool_call') {
      const p = e.payload as { tool?: string; args?: unknown };
      return `#${e.seq} CALL ${p.tool}(${JSON.stringify(p.args ?? {}).slice(0, 120)})`;
    }
    if (e.type === 'decision') {
      const p = e.payload as { verdict?: string; source?: string; reasoning?: string };
      return `#${e.seq} ${p.verdict} via ${p.source}: ${(p.reasoning ?? '').slice(0, 200)}`;
    }
    if (e.type === 'tool_result') {
      const p = e.payload as { tool?: string; result?: unknown };
      return `#${e.seq} RESULT ${p.tool} → ${JSON.stringify(p.result ?? {}).slice(0, 80)}`;
    }
    return `#${e.seq} ${e.type}`;
  }).join('\n');

  const analysisBlock = opts.analysis
    ? `\n\n## Prior Analysis (for context)\nExecutive summary: ${opts.analysis.executiveSummary}\nRisk grade: ${opts.analysis.riskGrade}\nKey interdictions:\n${opts.analysis.keyInterdictions.map((k) => `- #${k.seq}: ${k.what}`).join('\n')}`
    : '';

  return `## Scenario
${opts.scenario}

## Blast Radius
- Actions executed: ${opts.blast.actionsExecuted}
- Actions interdicted: ${opts.blast.actionsInterdicted} (${opts.blast.interdictedByPolicy} by policy, ${opts.blast.interdictedByPrecog} by pre-cog)
- Money disbursed: $${opts.blast.moneyDisbursed.toLocaleString()}
- Money interdicted: $${opts.blast.moneyInterdicted.toLocaleString()}
- External emails sent: ${opts.blast.externalEmailsSent.length}
- External emails blocked: ${opts.blast.externalEmailsBlocked.length}
- PII classes exposed: ${opts.blast.piiClassesExposed.join(', ') || 'none'}
- Severity: ${opts.blast.severity}
- Summary: ${opts.blast.summary}

## Event Stream
${eventSummary}${analysisBlock}

Now produce the three outputs as JSON.`;
}

function stripFences(text: string): string {
  return text.replace(/```(?:json)?\n?/g, '').replace(/```\s*$/g, '').trim();
}

function parseIntelligence(raw: string): Intelligence {
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

  const tp = obj.threatProfile as Record<string, unknown> | undefined;
  const bb = obj.boardBriefing as Record<string, unknown> | undefined;
  if (!tp || !bb || typeof obj.narrative !== 'string') {
    throw new Error('Intelligence response missing required fields');
  }

  return {
    threatProfile: {
      sophistication: Math.max(1, Math.min(10, Number(tp.sophistication ?? 5))),
      sophisticationLabel: String(tp.sophisticationLabel ?? 'Moderate'),
      motivation: String(tp.motivation ?? ''),
      technique: String(tp.technique ?? ''),
      mitreTactic: String(tp.mitreTactic ?? ''),
      nextMove: String(tp.nextMove ?? ''),
      attackerType: String(tp.attackerType ?? 'External opportunistic'),
    },
    narrative: String(obj.narrative),
    boardBriefing: {
      headline: String(bb.headline ?? ''),
      damagePrevented: String(bb.damagePrevented ?? ''),
      whatHappened: String(bb.whatHappened ?? ''),
      whyItMatters: String(bb.whyItMatters ?? ''),
      whatNext: String(bb.whatNext ?? ''),
    },
  };
}

export interface IntelligenceResult {
  intelligence: Intelligence;
  thinkingText: string;
}

export async function generateIntelligence(opts: IntelligenceOptions): Promise<IntelligenceResult> {
  const userPrompt = buildUserPrompt(opts);

  let thinkingText = '';
  let finalText = '';

  const stream = client.messages.stream({
    model: MODEL,
    max_tokens: MAX_TOKENS,
    thinking: { type: 'enabled', budget_tokens: THINKING_BUDGET },
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: userPrompt }],
  });

  for await (const event of stream) {
    if (event.type === 'content_block_delta') {
      const delta = event.delta;
      if (delta.type === 'thinking_delta') {
        thinkingText += delta.thinking;
        opts.onThinkingDelta?.(delta.thinking);
      } else if (delta.type === 'text_delta') {
        finalText += delta.text;
      }
    }
  }

  const intelligence = parseIntelligence(finalText);
  return { intelligence, thinkingText };
}
