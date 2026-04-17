/**
 * WipeOut scorer — pure function, mirrors the SQL scorer in submit_answer RPC (migration 067).
 *
 * Model: base_points + % of banked score (Option A)
 *   wagerAmt = floor(max(50, bankedScore) × wagerPct)
 *   Correct:  base_points + wagerAmt
 *   Wrong:    −min(wagerAmt, bankedScore)   ← floor at 0, can't go negative
 *
 * The 50pt floor ensures players at 0 can still wager.
 * base_points guarantees a minimum reward for correct answers regardless of score.
 *
 * Used client-side for optimistic score preview only.
 * Server (submit_answer RPC) is always authoritative.
 */
export function scoreWipeOut({
  isCorrect,
  wagerPct,
  bankedScore,
  basePoints,
}: {
  isCorrect: boolean;
  wagerPct: number;     // 0.10–1.00
  bankedScore: number;
  basePoints: number;
}): number {
  const wagerAmt = Math.floor(Math.max(50, bankedScore) * wagerPct);

  if (isCorrect) return basePoints + wagerAmt;
  return -Math.min(wagerAmt, bankedScore);
}
