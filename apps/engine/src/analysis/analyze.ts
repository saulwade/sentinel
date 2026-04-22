/**
 * Opus-driven incident analysis.
 *
 * Given a run's full event stream + computed blast radius + world snapshot,
 * calls Opus with extended thinking (10k budget) and returns a structured
 * RunAnalysis. Streams thinking tokens so callers can surface them live.
 */

import Anthropic from '@anthropic-ai/sdk';
import type { AgentEvent, RunAnalysis, RiskGrade } from '@sentinel/shared';
import type { BlastRadius } from './blastRadius.js';
import type { WorldState } from '../agent/world.js';
import { ANALYSIS_SYSTEM, buildAnalysisUserPrompt } from './prompts.js';

const client = new Anthropic();

const MODEL = 'claude-opus-4-6';
const THINKING_BUDGET = 10_000;
const MAX_TOKENS = 20_000;

export interface AnalyzeOptions {
  scenario: string;
  events: AgentEvent[];
  blast: BlastRadius;
  world: Partial<WorldState>;
  onThinkingDelta?: (delta: string) => void;
  onTextDelta?: (delta: string) => void;
}

export interface AnalyzeResult {
  analysis: RunAnalysis;
  thinkingText: string;
  rawJson: string;
}

export async function analyzeRun(opts: AnalyzeOptions): Promise<AnalyzeResult> {
  const userPrompt = buildAnalysisUserPrompt(
    opts.scenario,
    opts.events,
    opts.blast,
    opts.world,
  );

  let thinkingText = '';
  let responseText = '';

  const stream = client.messages.stream({
    model: MODEL,
    max_tokens: MAX_TOKENS,
    thinking: { type: 'enabled', budget_tokens: THINKING_BUDGET },
    system: ANALYSIS_SYSTEM,
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

  const analysis = parseAnalysis(responseText);
  return { analysis, thinkingText, rawJson: responseText };
}

// ─── Parser ───────────────────────────────────────────────────────────────────

const VALID_GRADES: RiskGrade[] = ['A+', 'A', 'B', 'C', 'D', 'F'];

function parseAnalysis(text: string): RunAnalysis {
  try {
    const clean = text.replace(/```json?\n?/g, '').replace(/```/g, '').trim();
    const obj = JSON.parse(clean) as Record<string, unknown>;

    const grade = typeof obj.riskGrade === 'string' && VALID_GRADES.includes(obj.riskGrade as RiskGrade)
      ? (obj.riskGrade as RiskGrade)
      : 'C';

    return {
      executiveSummary: String(obj.executiveSummary ?? '').slice(0, 600),
      attackChain: Array.isArray(obj.attackChain) ? obj.attackChain.map(normalizeChainStep) : [],
      keyInterdictions: Array.isArray(obj.keyInterdictions) ? obj.keyInterdictions.map(normalizeInterdiction) : [],
      businessImpact: normalizeBusinessImpact(obj.businessImpact),
      recommendations: Array.isArray(obj.recommendations) ? obj.recommendations.map(normalizeRecommendation) : [],
      riskGrade: grade,
    };
  } catch (err) {
    console.warn('[analysis] failed to parse, returning stub:', text.slice(0, 200));
    return {
      executiveSummary: 'Analysis could not be parsed from model output.',
      attackChain: [],
      keyInterdictions: [],
      businessImpact: { immediate: '', reputational: '', compliance: '' },
      recommendations: [],
      riskGrade: 'C',
    };
  }
}

function normalizeChainStep(raw: unknown): RunAnalysis['attackChain'][number] {
  const r = raw as Record<string, unknown>;
  return {
    seq: Number(r.seq ?? 0),
    action: String(r.action ?? ''),
    intent: String(r.intent ?? ''),
    outcome: r.outcome === 'interdicted' ? 'interdicted' : 'executed',
  };
}

function normalizeInterdiction(raw: unknown): RunAnalysis['keyInterdictions'][number] {
  const r = raw as Record<string, unknown>;
  return {
    seq: Number(r.seq ?? 0),
    what: String(r.what ?? ''),
    why: String(r.why ?? ''),
    source: r.source === 'pre-cog' ? 'pre-cog' : 'policy',
  };
}

function normalizeBusinessImpact(raw: unknown): RunAnalysis['businessImpact'] {
  const r = (raw as Record<string, unknown>) ?? {};
  return {
    immediate: String(r.immediate ?? ''),
    reputational: String(r.reputational ?? ''),
    compliance: String(r.compliance ?? ''),
  };
}

function normalizeRecommendation(raw: unknown): RunAnalysis['recommendations'][number] {
  const r = raw as Record<string, unknown>;
  return {
    title: String(r.title ?? ''),
    rationale: String(r.rationale ?? ''),
    policyHint: r.policyHint ? String(r.policyHint) : undefined,
  };
}
