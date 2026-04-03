type RankConfig = {
  fill: string;
  bar: string;
  text: string;
};

const RANKS: Record<number, RankConfig> = {
  1: { fill: "#f59e0b", bar: "#f59e0b", text: "#f59e0b" },
  2: { fill: "#a1a1aa", bar: "#a1a1aa", text: "#a1a1aa" },
  3: { fill: "#d97706", bar: "#d97706", text: "#d97706" },
};

export function RankBadge({ rank, size = 36 }: { rank: number; size?: number }) {
  const cfg = RANKS[rank];

  if (!cfg) {
    return (
      <span
        style={{
          width: size,
          height: size,
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "Outfit, sans-serif",
          fontSize: size * 0.42,
          fontWeight: 700,
          color: "var(--color-muted-foreground, #71717a)",
          flexShrink: 0,
        }}
      >
        {rank}
      </span>
    );
  }

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 36 36"
      style={{ flexShrink: 0 }}
      aria-label={`Rank ${rank}`}
    >
      <rect x="0" y="0" width="36" height="36" rx="0" fill={cfg.fill} opacity="0.15" />
      <rect x="0" y="0" width="4" height="36" fill={cfg.bar} />
      <text
        x="21"
        y="25"
        fontFamily="Outfit, sans-serif"
        fontSize="20"
        fontWeight="800"
        fill={cfg.text}
        textAnchor="middle"
      >
        {rank}
      </text>
    </svg>
  );
}
