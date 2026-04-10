/**
 * WipeOut scorer — pure function, mirrors the SQL scorer in submit_answer RPC (migration 030).
 *
 * Model: % of banked score (Option A)
 *   wagerAmt = floor(max(50, bankedScore) × wagerPct)
 *   Correct:  +wagerAmt
 *   Wrong:    −min(wagerAmt, bankedScore)   ← floor at 0, can't go negative
 *
 * The 50pt floor is the comeback mechanic — players who are at 0 can still wager.
 *
 * Used client-side for optimistic score preview only.
 * Server (submit_answer RPC) is always authoritative.
 */
export function scoreWipeOut({
  isCorrect,
  wagerPct,
  bankedScore,
}: {
  isCorrect: boolean;
  wagerPct: number;     // 0.10–1.00
  bankedScore: number;
}): number {
  const wagerAmt = Math.floor(Math.max(50, bankedScore) * wagerPct);

  if (isCorrect) return wagerAmt;
  return -Math.min(wagerAmt, bankedScore);
}
