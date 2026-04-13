/**
 * Oracle's Dilemma scorer — pure function, mirrors SQL in migration 055.
 *
 * Oracle (truth path):     base_points x 0.5 (guaranteed, reduced risk)
 * Oracle (deception path): base_points x (deceived_count / total_non_oracle)
 *   Scored after reveal — initial submit returns 0, host re-scores.
 * Non-oracle players:      standard MCQ scoring (oracle hint is just info)
 *
 * Used client-side for optimistic score preview only.
 * Server (submit_answer RPC) is always authoritative.
 */
export function scoreOraclesDilemma({
  isOracle,
  oracleChoice,
  isCorrect,
  basePoints,
  timeTakenMs,
  timeLimitSeconds,
  timeBonusEnabled,
  // Only for deception re-scoring
  deceivedCount,
  totalNonOracle,
}: {
  isOracle: boolean;
  oracleChoice?: "truth" | "deception";
  isCorrect: boolean;
  basePoints: number;
  timeTakenMs: number;
  timeLimitSeconds: number;
  timeBonusEnabled: boolean;
  deceivedCount?: number;
  totalNonOracle?: number;
}): number {
  if (isOracle) {
    if (oracleChoice === "truth") {
      return Math.floor(basePoints * 0.5);
    }
    // Deception: scored based on how many were fooled
    if (oracleChoice === "deception" && deceivedCount !== undefined && totalNonOracle) {
      return Math.floor(basePoints * (deceivedCount / totalNonOracle));
    }
    return 0; // Deception not yet scored
  }

  // Non-oracle: standard MCQ scoring
  if (!isCorrect) return 0;

  let points = basePoints;
  if (timeBonusEnabled) {
    const timeLimitMs = timeLimitSeconds * 1000;
    const clamped = Math.min(timeTakenMs, timeLimitMs);
    const ratio = Math.max(0, 1 - clamped / timeLimitMs);
    points += Math.floor(basePoints * ratio);
  }

  return points;
}
