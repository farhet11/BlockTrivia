/**
 * Landing page stats bar — horizontal row of big numbers + small labels.
 *
 * Per DESIGN.md §5 "Landing Page Stats Bar".
 * NOT for in-app stats (profile, results) — those keep their own sizing.
 */

type Stat = {
  number: string;
  label: string;
};

const TONES = {
  /** For Warm Canvas sections — Ink number, Stone label. */
  light: { number: "#1a1917", label: "#78756e" },
  /** For Ink sections — Snow number, Ash label. */
  dark: { number: "#fafafa", label: "#a1a1aa" },
} as const;

export function StatsBar({
  stats,
  tone = "light",
}: {
  stats: Stat[];
  tone?: keyof typeof TONES;
}) {
  const palette = TONES[tone];
  return (
    <div className="flex flex-wrap items-end justify-center gap-y-8 gap-x-12 sm:gap-x-20">
      {stats.map((s) => (
        <div key={s.label} className="text-center">
          <p
            className="font-heading tabular-nums leading-none"
            style={{ fontSize: 36, fontWeight: 800, color: palette.number }}
          >
            {s.number}
          </p>
          <p
            className="mt-2"
            style={{ fontSize: 14, fontWeight: 400, color: palette.label }}
          >
            {s.label}
          </p>
        </div>
      ))}
    </div>
  );
}
