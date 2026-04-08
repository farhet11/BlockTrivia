import Link from "next/link";

/**
 * Banner shown on the host dashboard when onboarding has been started but
 * not completed (completed_at is null). Calculates completion % from the 5
 * key signals and links back to /host/onboarding.
 */
export function OnboardingReminder({
  role,
  communityChannels,
  eventGoal,
  biggestMisconception,
  aiFollowupAnswers,
}: {
  role: string | null;
  communityChannels: string[] | null;
  eventGoal: string | null;
  biggestMisconception: string | null;
  aiFollowupAnswers: string[] | null;
}) {
  const signals = [
    Boolean(role),
    Array.isArray(communityChannels) && communityChannels.length > 0,
    Boolean(eventGoal),
    typeof biggestMisconception === "string" &&
      biggestMisconception.trim().length >= 15,
    Array.isArray(aiFollowupAnswers) &&
      aiFollowupAnswers.length > 0 &&
      aiFollowupAnswers.every((a) => a && a.trim().length > 0),
  ];

  const pct = Math.round((signals.filter(Boolean).length / signals.length) * 100);

  return (
    <div className="border border-primary/30 bg-primary/5 px-4 py-3 flex items-center justify-between gap-4">
      <div className="flex items-center gap-3 min-w-0">
        {/* Progress ring / bar */}
        <div className="shrink-0 w-9 h-9 relative">
          <svg viewBox="0 0 36 36" className="w-full h-full">
            <circle
              cx="18"
              cy="18"
              r="14"
              fill="none"
              stroke="currentColor"
              strokeWidth="3"
              className="text-primary/20"
            />
            {/* Start arc from top: offset = circumference * (1 - pct/100) */}
            <circle
              cx="18"
              cy="18"
              r="14"
              fill="none"
              stroke="currentColor"
              strokeWidth="3"
              strokeDasharray="87.96"
              strokeDashoffset={87.96 * (1 - pct / 100)}
              strokeLinecap="round"
              transform="rotate(-90 18 18)"
              className="text-primary transition-all"
            />
          </svg>
          <span className="absolute inset-0 flex items-center justify-center text-[9px] font-semibold text-primary">
            {pct}%
          </span>
        </div>

        <div className="min-w-0">
          <p className="text-sm font-medium leading-snug">
            Complete your MindScan profile
          </p>
          <p className="text-xs text-muted-foreground truncate">
            {pct === 0
              ? "Takes 2 minutes — makes generated questions sharper."
              : `${pct}% done — pick up where you left off.`}
          </p>
        </div>
      </div>

      <Link
        href="/host/onboarding"
        className="shrink-0 text-xs font-medium text-primary hover:underline underline-offset-2 whitespace-nowrap"
      >
        Continue →
      </Link>
    </div>
  );
}
