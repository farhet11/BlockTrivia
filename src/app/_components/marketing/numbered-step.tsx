/**
 * 32×32 numbered badge for "How it works" sequences.
 *
 * Per DESIGN.md §5 "Numbered Step Badges".
 * For 3-step sequences, the rotation goes: Violet → Mint → Amber.
 * Mint replaces Ink for step 2 so the badge stays visible in dark mode.
 */

const STEP_COLORS = ["var(--bt-violet)", "var(--bt-mint)", "var(--bt-timer-amber)"] as const;

export function NumberedStep({
  n,
  size = 32,
}: {
  /** 1-indexed step number. */
  n: number;
  size?: number;
}) {
  const bg = STEP_COLORS[(n - 1) % STEP_COLORS.length];
  return (
    <div
      className="font-heading flex items-center justify-center text-white"
      style={{
        width: size,
        height: size,
        borderRadius: 6,
        background: bg,
        fontSize: Math.round(size * 0.5),
        fontWeight: 700,
        flexShrink: 0,
        lineHeight: 1,
      }}
      aria-label={`Step ${n}`}
    >
      {n}
    </div>
  );
}
