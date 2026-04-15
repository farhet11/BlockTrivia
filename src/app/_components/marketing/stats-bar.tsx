/**
 * Landing page stats bar — horizontal row of big numbers + small labels.
 * Also exports ValuePropsBar — 3 positioning props for pre-launch / no-data state.
 *
 * Per DESIGN.md §5 "Landing Page Stats Bar".
 * NOT for in-app stats (profile, results) — those keep their own sizing.
 */

type Stat = {
  number: string;
  label: string;
};

type ValueProp = {
  headline: string;
  sub: string;
};

const VALUE_PROPS: ValueProp[] = [
  { headline: "Knowledge, not clicks", sub: "Scoring rewards understanding. Airdrop farmers can't fake it." },
  { headline: "Real community signal", sub: "Surfaces contributors, ambassadors, and future hires." },
  { headline: "Live & competitive", sub: "Not another static quest. An experience people remember." },
];

export function ValuePropsBar({ tone = "dark" }: { tone?: keyof typeof TONES }) {
  const palette = TONES[tone];
  return (
    <div className="flex flex-wrap items-start justify-center gap-y-8 gap-x-12 sm:gap-x-20">
      {VALUE_PROPS.map((p) => (
        <div key={p.headline} className="text-center max-w-[200px]">
          <p
            className="font-heading leading-tight"
            style={{ fontSize: 18, fontWeight: 700, color: palette.number }}
          >
            {p.headline}
          </p>
          <p
            className="mt-1.5 leading-snug"
            style={{ fontSize: 13, fontWeight: 400, color: palette.label }}
          >
            {p.sub}
          </p>
        </div>
      ))}
    </div>
  );
}

const TONES = {
  /** For Warm Canvas sections — Ink number, Stone label. */
  light: { number: "#1a1917", label: "#78756e" },
  /** For Ink sections — Snow number, Ash label. */
  dark: { number: "#fafafa", label: "#a1a1aa" },
  /** For Mint sections — Ink heading, semi-transparent Ink body. */
  mint: { number: "#1a1917", label: "rgba(26, 25, 23, 0.7)" },
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
