/**
 * Adversarial Evolution Arena — two Opus instances co-evolving in real time.
 * Red generates attacks, Blue synthesizes defenses, loop for N rounds.
 */

import type { Policy } from './policies.js';
import type { Attack, TestResult } from './redteam.js';

export interface ArenaRoundStats {
  round: number;
  generated: number;
  blocked: number;
  pausedSafe: number;
  bypassed: number;
  policiesSynthesized: number;
  trustScore: number;          // 0-100 at end of this round
  trustGrade: string;          // "F"|"D"|"C"|"B"|"A"|"A+"
}

export interface ArenaSummary {
  rounds: number;
  totalAttacks: number;
  blocked: number;
  pausedSafe: number;
  bypassed: number;
  policiesSynthesized: Policy[];
  trustScoreTrajectory: number[];  // score per round
  trustGradeTrajectory: string[];
  durationMs: number;
}

export interface ArenaBattleReport {
  markdown: string;
  techniquesDetected: string[];
  mostDangerousAttackId?: string;
}

export type ArenaEvent =
  | { kind: 'arena_start'; rounds: number; attacksPerRound: number }
  | { kind: 'round_start'; round: number; totalRounds: number; priorBypassCount: number }
  | { kind: 'red_thinking'; round: number; delta: string }
  | { kind: 'red_attack'; round: number; attack: Attack }
  | { kind: 'test_result'; round: number; attackId: string; result: TestResult }
  | { kind: 'blue_thinking'; round: number; delta: string }
  | { kind: 'blue_policy'; round: number; policy: Policy; sourceAttackId: string }
  | { kind: 'round_end'; stats: ArenaRoundStats }
  | { kind: 'battle_report'; report: ArenaBattleReport }
  | { kind: 'arena_end'; summary: ArenaSummary }
  | { kind: 'error'; message: string };
