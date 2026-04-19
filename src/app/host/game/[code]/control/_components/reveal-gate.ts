/**
 * Pure gate for the host's "Reveal Answer" button during the playing phase.
 *
 * Reveal is blocked while the timer is still running UNLESS every player has
 * already submitted — early reveal is only allowed once nobody is left to
 * answer. This keeps the host from accidentally cutting players off mid-answer
 * (see PR #136 regression: the button looked ghosted but still fired).
 */
export function isRevealBlocked(
  timeLeft: number | null,
  answeredCount: number,
  playerCount: number,
): boolean {
  if (timeLeft === null) return false;
  if (timeLeft <= 0) return false;
  return answeredCount < playerCount;
}
