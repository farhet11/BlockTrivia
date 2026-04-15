"use client";

/**
 * InterstitialCard — shared round-transition card used by BOTH host and
 * player interstitial views.
 *
 * Before this existed, the interstitial was dead air: a title + a countdown.
 * Now it's a teaching moment: round-type badge, one-liner brief of the round
 * mechanic, and metadata (# questions · seconds · points).
 *
 * Host vs player divergence happens ONLY in the footer:
 *   - Host: "Start Round →" button (manual advance, no auto-countdown, so
 *           the host can verbally explain the rules before kicking off)
 *   - Player: "Host is introducing the round…" waiting indicator
 *
 * Everything above that line stays identical so the public monitor and
 * player phones show the same information.
 */

import { RoundTypeBadge } from "@/app/_components/round-type-badge";
import { roundRegistry } from "@/lib/game/round-registry";

interface InterstitialCardProps {
  roundType: string;
  roundTitle: string;
  /** Host-defined one-liner from rounds.interstitial_text. Falls back to registry description. */
  description: string | null | undefined;
  questionCount: number;
  timePerQuestionSeconds: number;
  basePoints: number;

  /** Footer mode */
  mode: "host" | "player";
  /** Host-only: triggered by "Start Round" button */
  onStart?: () => void;
  loading?: boolean;
}

export function InterstitialCard({
  roundType,
  roundTitle,
  description,
  questionCount,
  timePerQuestionSeconds,
  basePoints,
  mode,
  onStart,
  loading = false,
}: InterstitialCardProps) {
  // Fall back to the round-registry description if the host hasn't written
  // a custom one-liner. This guarantees every round type introduces its
  // mechanic, even when the builder is sparse.
  const brief =
    description?.trim() ||
    roundRegistry.get(roundType)?.description ||
    null;

  return (
    <div className="w-full max-w-md mx-auto flex flex-col items-center text-center gap-5">
      {/* Round-type badge — big, to set visual identity */}
      <RoundTypeBadge type={roundType} size={56} />

      {/* Pre-title label */}
      <p className="text-[11px] font-bold text-primary uppercase tracking-widest">
        Next Round
      </p>

      {/* Round title */}
      <h2 className="font-heading text-2xl sm:text-3xl font-bold leading-tight -mt-3">
        {roundTitle}
      </h2>

      {/* Round mechanic brief — the payoff of this whole screen */}
      {brief && (
        <p className="text-sm sm:text-base text-muted-foreground leading-relaxed max-w-sm -mt-1">
          {brief}
        </p>
      )}

      {/* Metadata row — what the player is committing to */}
      <div className="flex items-center gap-0 border border-border divide-x divide-border w-full">
        <div className="flex-1 px-3 py-2.5">
          <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
            Questions
          </p>
          <p className="font-heading text-base font-bold tabular-nums">
            {questionCount}
          </p>
        </div>
        <div className="flex-1 px-3 py-2.5">
          <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
            Time
          </p>
          <p className="font-heading text-base font-bold tabular-nums">
            {timePerQuestionSeconds}s
          </p>
        </div>
        <div className="flex-1 px-3 py-2.5">
          <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
            Per Q
          </p>
          <p className="font-heading text-base font-bold tabular-nums">
            {basePoints} pts
          </p>
        </div>
      </div>

      {/* Footer — host action or player waiting */}
      {mode === "host" ? (
        <button
          onClick={onStart}
          disabled={loading}
          className="mt-2 h-12 px-10 bg-primary text-primary-foreground font-medium hover:bg-primary-hover transition-colors disabled:opacity-50"
        >
          Start Round →
        </button>
      ) : (
        <div className="mt-2 inline-flex items-center gap-2 px-4 py-2 border border-border">
          <span className="size-1.5 rounded-full bg-primary animate-pulse" />
          <span className="text-xs font-medium text-muted-foreground">
            Host is introducing the round…
          </span>
        </div>
      )}
    </div>
  );
}
