/**
 * The Narrative scorer — pure function, mirrors SQL in migration 055.
 *
 * Formula:
 *   Voted with majority:  base_points + time_bonus
 *   Voted against:        0
 *
 * The majority option is determined server-side after all answers are in
 * (or timer expires). The host triggers "Tally Votes" which writes
 * round_state.majority_option.
 *
 * Used client-side for optimistic score preview only.
 * Server (submit_answer RPC) is always authoritative.
 */
export function scoreTheNarrative({
  selectedAnswer,
  majorityOption,
  basePoints,
  timeTakenMs,
  timeLimitSeconds,
  timeBonusEnabled,
}: {
  selectedAnswer: number;
  majorityOption: number | null;
  basePoints: number;
  timeTakenMs: number;
  timeLimitSeconds: number;
  timeBonusEnabled: boolean;
}): number {
  if (majorityOption === null) return 0;
  if (selectedAnswer !== majorityOption) return 0;

  let points = basePoints;

  if (timeBonusEnabled) {
    const timeLimitMs = timeLimitSeconds * 1000;
    const clamped = Math.min(timeTakenMs, timeLimitMs);
    const ratio = Math.max(0, 1 - clamped / timeLimitMs);
    points += Math.floor(basePoints * ratio);
  }

  return points;
}
