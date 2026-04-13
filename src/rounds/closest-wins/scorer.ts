/**
 * Closest Wins scorer — pure function, mirrors SQL in migration 055.
 *
 * Formula:
 *   distance = abs(answer - correct)
 *   maxDistance = toleranceMultiplier x max(abs(correct), 1)
 *   closeness = max(0, 1 - distance / maxDistance)
 *   points = floor(base_points x closeness) + time_bonus_on_closeness
 *
 * toleranceMultiplier defaults to 2.0 (answers within 2x the correct value score > 0).
 *
 * Used client-side for optimistic score preview only.
 * Server (submit_answer RPC) is always authoritative.
 */
export function scoreClosestWins({
  playerAnswer,
  correctAnswer,
  basePoints,
  timeTakenMs,
  timeLimitSeconds,
  timeBonusEnabled,
  toleranceMultiplier = 2.0,
}: {
  playerAnswer: number;
  correctAnswer: number;
  basePoints: number;
  timeTakenMs: number;
  timeLimitSeconds: number;
  timeBonusEnabled: boolean;
  toleranceMultiplier?: number;
}): { points: number; closeness: number } {
  const distance = Math.abs(playerAnswer - correctAnswer);
  const maxDistance = toleranceMultiplier * Math.max(Math.abs(correctAnswer), 1);
  const closeness = Math.max(0, 1 - distance / maxDistance);

  if (closeness === 0) return { points: 0, closeness: 0 };

  let points = Math.floor(basePoints * closeness);

  if (timeBonusEnabled) {
    const timeLimitMs = timeLimitSeconds * 1000;
    const clamped = Math.min(timeTakenMs, timeLimitMs);
    const ratio = Math.max(0, 1 - clamped / timeLimitMs);
    points += Math.floor(basePoints * closeness * ratio * 0.5);
  }

  return { points, closeness };
}
