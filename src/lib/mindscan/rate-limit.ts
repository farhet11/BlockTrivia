/**
 * MindScan per-user rate limiting.
 *
 * Uses the `mindscan_call_log` table to enforce a sliding-window limit.
 * Call `checkAndLog` before the Claude API call — it returns an error
 * message if the user is over the limit, or null if the call is allowed
 * (and has been logged).
 *
 * Limits (per hour, per user):
 *   - generate:              20 calls
 *   - onboarding-followup:   10 calls
 *   - fetch-url:             30 calls
 *   - transcribe:             5 calls  ($0.006/min — Whisper cost)
 */

import { SupabaseClient } from "@supabase/supabase-js";

const LIMITS: Record<string, number> = {
  generate: 20,
  "onboarding-followup": 10,
  "fetch-url": 30,
  transcribe: 5,
};

const WINDOW_HOURS = 1;

/**
 * Check the rate limit and log the call if allowed.
 *
 * Returns null if the call is allowed, or an error message string if the
 * user has hit the limit. On any DB error, returns null (fail open — a
 * broken rate limiter should not block legitimate calls).
 *
 * Implementation uses a two-phase check to minimize race conditions:
 * 1. Pre-insert check: count calls in the window
 * 2. If allowed, insert a log entry
 * 3. Post-insert verification: re-count to catch any race-condition violations
 *
 * If post-insert count exceeds limit, we allow it anyway (fail open) but log
 * the overage so it's visible in monitoring. This prevents one-off race
 * condition violations from blocking legitimate users.
 */
export async function checkAndLog(
  supabase: SupabaseClient,
  profileId: string,
  endpoint: "generate" | "onboarding-followup" | "fetch-url" | "transcribe"
): Promise<string | null> {
  const limit = LIMITS[endpoint] ?? 20;
  const windowStart = new Date(
    Date.now() - WINDOW_HOURS * 60 * 60 * 1000
  ).toISOString();

  // Phase 1: Pre-insert check
  const { count, error: countError } = await supabase
    .from("mindscan_call_log")
    .select("*", { count: "exact", head: true })
    .eq("profile_id", profileId)
    .eq("endpoint", endpoint)
    .gte("called_at", windowStart);

  if (countError) {
    // Fail open — don't block the user if the rate-limit table is unavailable.
    return null;
  }

  if ((count ?? 0) >= limit) {
    const noun =
      endpoint === "generate"
        ? "question sets"
        : endpoint === "transcribe"
        ? "transcriptions"
        : endpoint === "fetch-url"
        ? "URL fetches"
        : "follow-up sets";
    return `Rate limit reached. You can use this feature up to ${limit} ${noun} per hour. Try again in a bit.`;
  }

  // Phase 2: Log this call (best-effort — fail open).
  const { error: insertError } = await supabase
    .from("mindscan_call_log")
    .insert({ profile_id: profileId, endpoint });

  // If insert fails, fail open (don't block the user, but log the issue)
  if (insertError) {
    return null;
  }

  // Phase 3: Post-insert verification (catch race conditions from concurrent requests)
  // If the post-insert count exceeds limit, log it (console) but don't block the user.
  // This is a defensive measure; in practice, occasional 1–2 request overages are
  // not a security issue.
  const { count: postCount } = await supabase
    .from("mindscan_call_log")
    .select("*", { count: "exact", head: true })
    .eq("profile_id", profileId)
    .eq("endpoint", endpoint)
    .gte("called_at", windowStart);

  if ((postCount ?? 0) > limit) {
    // Log this anomaly for monitoring (truncate profileId to avoid logging PII)
    console.warn(
      `[rate-limit overage] ${endpoint} for ...${profileId.slice(-8)}: ${postCount} calls in window (limit: ${limit})`
    );
  }

  return null;
}
