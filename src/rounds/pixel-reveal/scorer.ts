/**
 * Pixel Reveal scorer — pure function, mirrors SQL in migration 055.
 *
 * Formula:
 *   Correct:  base_points + floor(base_points x ratio^2)
 *   Wrong:    0
 *   Max:      base_points x 2  (instant answer)
 *
 * The quadratic curve heavily rewards early answers:
 *   - 100% time remaining = 100% bonus (2x total)
 *   - 50% time remaining  = 25% bonus  (1.25x total)
 *   - 25% time remaining  = 6.25% bonus
 *
 * Used client-side for optimistic score preview only.
 * Server (submit_answer RPC) is always authoritative.
 */
export function scorePixelReveal({
  isCorrect,
  basePoints,
  timeTakenMs,
  timeLimitSeconds,
}: {
  isCorrect: boolean;
  basePoints: number;
  timeTakenMs: number;
  timeLimitSeconds: number;
}): number {
  if (!isCorrect) return 0;

  const timeLimitMs = timeLimitSeconds * 1000;
  const clamped = Math.min(timeTakenMs, timeLimitMs);
  const ratio = Math.max(0, 1 - clamped / timeLimitMs);

  return basePoints + Math.floor(basePoints * ratio * ratio);
}
