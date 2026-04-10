/**
 * MCQ / True-False scorer — pure function, mirrors the SQL scorer in submit_answer RPC.
 *
 * Formula:
 *   Correct:  base_points + floor(base_points × (1 - timeTaken/timeLimit))
 *   Wrong:    0
 *   Max:      base_points × 2  (i.e. 200 if base_points = 100)
 *
 * This function is intentionally kept in sync with the SQL:
 *   v_points := v_base_points + floor(v_base_points * (1.0 - v_clamped_time / (v_time_limit_seconds * 1000)))
 *
 * Used client-side for optimistic score preview only.
 * Server (submit_answer RPC) is always authoritative.
 */
export function scoreMCQ({
  isCorrect,
  basePoints,
  timeTakenMs,
  timeLimitSeconds,
  timeBonusEnabled,
}: {
  isCorrect: boolean;
  basePoints: number;
  timeTakenMs: number;
  timeLimitSeconds: number;
  timeBonusEnabled: boolean;
}): number {
  if (!isCorrect) return 0;

  const timeLimitMs = timeLimitSeconds * 1000;
  const clamped = Math.min(timeTakenMs, timeLimitMs);
  const ratio = Math.max(0, 1 - clamped / timeLimitMs);

  return basePoints + (timeBonusEnabled ? Math.floor(basePoints * ratio) : 0);
}
