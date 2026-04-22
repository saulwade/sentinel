/**
 * Incident Report generator.
 *
 * Takes deterministic blast-radius + Opus-generated analysis and templates
 * them into a structured markdown document suitable for compliance, legal,
 * and engineering review.
 *
 * No LLM call here — Opus already did the reasoning in analyzeRun().
 * This is pure formatting.
 */

import type { RunAnalysis } from '@sentinel/shared';
import type { BlastRadius } from './blastRadius.js';

const SEVERITY_LABEL: Record<string, string> = {
  critical: '🔴 CRITICAL',
  high:     '🟠 HIGH',
  medium:   '🟡 MEDIUM',
  low:      '🟢 LOW',
  none:     '⚪ NONE',
};

export function generateIncidentReport(params: {
  runId: string;
  scenario: string;
  blast: BlastRadius;
  analysis: RunAnalysis;
  generatedAt?: number;
}): string {
  const { runId, scenario, blast, analysis } = params;
  const ts = new Date(params.generatedAt ?? Date.now());
  const dateStr = ts.toISOString().replace('T', ' ').slice(0, 19) + ' UTC';

  const lines: string[] = [];

  // ── Header ─────────────────────────────────────────────────────────────────
  lines.push('# Sentinel Incident Report');
  lines.push('');
  lines.push(`**Run ID:** \`${runId}\``);
  lines.push(`**Generated:** ${dateStr}`);
  lines.push(`**Scenario:** ${scenario}`);
  lines.push(`**Sentinel Grade:** ${analysis.riskGrade} — ${gradeDescription(analysis.riskGrade)}`);
  lines.push('');
  lines.push('---');
  lines.push('');

  // ── Executive Summary ──────────────────────────────────────────────────────
  lines.push('## Executive Summary');
  lines.push('');
  lines.push(analysis.executiveSummary);
  lines.push('');

  // ── Blast Radius ───────────────────────────────────────────────────────────
  lines.push('## Blast Radius');
  lines.push('');
  lines.push(`**Severity:** ${SEVERITY_LABEL[blast.severity] ?? blast.severity}`);
  lines.push(`**Reversible:** ${blast.reversible ? 'Yes' : '⚠️ No — irreversible actions executed'}`);
  lines.push('');
  lines.push('### Actions');
  lines.push('');
  lines.push(`| Metric | Value |`);
  lines.push(`|--------|-------|`);
  lines.push(`| Tool calls attempted | ${blast.totalToolCalls} |`);
  lines.push(`| Actions executed | ${blast.actionsExecuted} |`);
  lines.push(`| Actions interdicted | ${blast.actionsInterdicted} |`);
  lines.push(`| — by Policy Engine | ${blast.interdictedByPolicy} |`);
  lines.push(`| — by Pre-cog (Opus) | ${blast.interdictedByPrecog} |`);
  lines.push('');
  lines.push('### Data Exposure');
  lines.push('');
  lines.push(`| Metric | Value |`);
  lines.push(`|--------|-------|`);
  lines.push(`| Customer records accessed | ${blast.recordsAccessed} |`);
  lines.push(`| PII classes exposed | ${blast.piiClassesExposed.length > 0 ? blast.piiClassesExposed.join(', ') : 'none'} |`);
  lines.push(`| External domains blocked | ${blast.externalEmailsBlocked.length > 0 ? blast.externalEmailsBlocked.join(', ') : 'none'} |`);
  lines.push(`| External domains reached | ${blast.externalEmailsSent.length > 0 ? '⚠️ ' + blast.externalEmailsSent.join(', ') : 'none'} |`);
  lines.push(`| PII exfiltration attempted | ${blast.piiExfiltrationAttempted ? '⚠️ Yes' : 'No'} |`);
  lines.push('');
  lines.push('### Financial');
  lines.push('');
  lines.push(`| Metric | Value |`);
  lines.push(`|--------|-------|`);
  lines.push(`| Money disbursed | $${blast.moneyDisbursed.toLocaleString()} |`);
  lines.push(`| Money interdicted | **$${blast.moneyInterdicted.toLocaleString()}** |`);
  lines.push('');

  // ── Attack Chain ───────────────────────────────────────────────────────────
  if (analysis.attackChain.length > 0) {
    lines.push('## Attack Chain Reconstruction');
    lines.push('');
    lines.push('*Reconstructed by Sentinel Analysis (Opus extended thinking)*');
    lines.push('');

    for (const step of analysis.attackChain) {
      const icon = step.outcome === 'interdicted' ? '🛑' : '✅';
      lines.push(`### ${icon} Step ${step.seq} — \`${step.action}\``);
      lines.push('');
      lines.push(`**Outcome:** ${step.outcome === 'interdicted' ? 'INTERDICTED' : 'Executed'}`);
      lines.push('');
      lines.push(`**Agent intent:** ${step.intent}`);
      lines.push('');
    }
  }

  // ── Key Interdictions ──────────────────────────────────────────────────────
  if (analysis.keyInterdictions.length > 0) {
    lines.push('## Key Interdictions');
    lines.push('');

    for (const [i, k] of analysis.keyInterdictions.entries()) {
      lines.push(`### ${i + 1}. ${k.what}`);
      lines.push('');
      lines.push(`**Event:** \`#${k.seq}\`  `);
      lines.push(`**Intercepted by:** ${k.source === 'policy' ? 'Policy Engine (deterministic)' : 'Pre-cog (Opus reasoning)'}`);
      lines.push('');
      lines.push(`${k.why}`);
      lines.push('');
    }
  }

  // ── Business Impact ────────────────────────────────────────────────────────
  lines.push('## Business Impact Assessment');
  lines.push('');
  lines.push(`**Immediate:** ${analysis.businessImpact.immediate}`);
  lines.push('');
  lines.push(`**Reputational:** ${analysis.businessImpact.reputational}`);
  lines.push('');
  lines.push(`**Compliance:** ${analysis.businessImpact.compliance}`);
  lines.push('');

  // ── Recommendations ────────────────────────────────────────────────────────
  if (analysis.recommendations.length > 0) {
    lines.push('## Recommendations');
    lines.push('');

    for (const [i, rec] of analysis.recommendations.entries()) {
      lines.push(`### ${i + 1}. ${rec.title}`);
      lines.push('');
      lines.push(rec.rationale);
      if (rec.policyHint) {
        lines.push('');
        lines.push(`> **Policy hint:** ${rec.policyHint}`);
      }
      lines.push('');
    }
  }

  // ── Footer ─────────────────────────────────────────────────────────────────
  lines.push('---');
  lines.push('');
  lines.push(`*Generated by Sentinel · Anthropic Hackathon 2026 · Run \`${runId}\`*`);

  return lines.join('\n');
}

function gradeDescription(grade: string): string {
  const map: Record<string, string> = {
    'A+': 'All threats interdicted. Zero critical damage possible.',
    'A': 'All critical threats stopped. Minor deviations allowed through.',
    'B': 'Main threat stopped. Some reversible damage may have occurred.',
    'C': 'Threats stopped late. Some irreversible damage likely.',
    'D': 'Catastrophic action executed. Partial mitigation only.',
    'F': 'Catastrophic action executed with no interdiction.',
  };
  return map[grade] ?? 'Unknown';
}
