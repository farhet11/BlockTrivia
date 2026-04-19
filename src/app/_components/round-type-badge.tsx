/**
 * RoundTypeBadge — filled violet square with a Lucide icon inside.
 *
 * Per DESIGN.md §11 "Round Type Badges". Visually distinct from bare UI
 * action icons:
 *   - container: 32px violet square (vs none for action icons)
 *   - icon stroke: 2.0 (vs 2.5 for action icons)
 *   - icon color: white on violet (vs Stone/Ash for action icons)
 *
 * Future: when custom illustrations are commissioned, the Lucide icon
 * inside the badge swaps for a custom SVG. The container + sizing system
 * is the placeholder-stable contract.
 */

import {
  ListChecks,
  ToggleLeft,
  Bomb,
  Ruler,
  Gem,
  RefreshCcw,
  Gauge,
  UsersRound,
  ScanEye,
  BookOpen,
  Eye,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

const ROUND_ICONS = {
  // Per DESIGN.md §11 mapping
  mcq: ListChecks,
  true_false: ToggleLeft,
  wipeout: Bomb,
  closest_wins: Ruler,
  jackpot: Gem,
  reversal: RefreshCcw,
  pressure_cooker: Gauge,
  consensus: UsersRound,
  // Extended round types from src/lib/game/round-registry.ts
  pixel_reveal: ScanEye,
  the_narrative: BookOpen,
  oracles_dilemma: Eye,
} as const satisfies Record<string, LucideIcon>;

export type RoundType = keyof typeof ROUND_ICONS;

const ROUND_LABELS: Record<RoundType, string> = {
  mcq: "Multiple choice",
  true_false: "True or false",
  wipeout: "WipeOut",
  closest_wins: "Closest wins",
  jackpot: "Jackpot",
  reversal: "Reversal",
  pressure_cooker: "Pressure cooker",
  consensus: "Consensus",
  pixel_reveal: "Pixel reveal",
  the_narrative: "The narrative",
  oracles_dilemma: "Oracle's dilemma",
};

export function RoundTypeBadge({
  type,
  size = 32,
  className,
}: {
  /** Round type or modifier key. Unknown values fall back to ListChecks. */
  type: RoundType | string;
  /** Container edge length in px. Icon scales to ~56% (matches 18px @ 32px). */
  size?: number;
  className?: string;
}) {
  const Icon = (ROUND_ICONS as Record<string, LucideIcon>)[type] ?? ListChecks;
  const label = ROUND_LABELS[type as RoundType] ?? type;
  const iconSize = Math.round(size * 0.56);
  return (
    <div
      className={className}
      style={{
        width: size,
        height: size,
        borderRadius: 6,
        background: "var(--bt-violet)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
      }}
      role="img"
      aria-label={label}
    >
      <Icon size={iconSize} strokeWidth={2} color="#ffffff" />
    </div>
  );
}

/** Public helpers — useful for switch/case rendering or fallback labels. */
export const ROUND_TYPE_LABELS = ROUND_LABELS;
export const ROUND_TYPES = Object.keys(ROUND_ICONS) as RoundType[];
