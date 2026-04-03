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

export function RankBadge({
  rank,
  size = 36,
  variant = "row",
}: {
  rank: number;
  size?: number;
  /** "row" = Option A (tinted bg + left bar + colored number). "podium" = Option B (solid fill + white number). */
  variant?: "row" | "podium";
}) {
  const cfg = RANKS[rank];

  if (!cfg) {
    // Plain number for 4th place and beyond
    return (
      <span
        style={{
          width: size,
          height: size,
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "Inter, sans-serif",
          fontSize: size * 0.42,
          fontWeight: 600,
          color: "#78756e",
          flexShrink: 0,
        }}
      >
        {rank}
      </span>
    );
  }

  if (variant === "podium") {
    // Option B: solid fill, white number — used on podium blocks
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 36 36"
        style={{ flexShrink: 0 }}
        aria-label={`Rank ${rank}`}
      >
        <rect x="0" y="0" width="36" height="36" rx="0" fill={cfg.fill} />
        <text
          x="18"
          y="25"
          fontFamily="Outfit, sans-serif"
          fontSize="20"
          fontWeight="800"
          fill="#ffffff"
          textAnchor="middle"
        >
          {rank}
        </text>
      </svg>
    );
  }

  // Option A: tinted bg + left accent bar + colored number — used in ranking rows
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
