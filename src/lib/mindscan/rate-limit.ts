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
 */

import { SupabaseClient } from "@supabase/supabase-js";

const LIMITS: Record<string, number> = {
  generate: 20,
  "onboarding-followup": 10,
};

const WINDOW_HOURS = 1;

/**
 * Check the rate limit and log the call if allowed.
 *
 * Returns null if the call is allowed, or an error message string if the
 * user has hit the limit. On any DB error, returns null (fail open — a
 * broken rate limiter should not block legitimate calls).
 */
export async function checkAndLog(
  supabase: SupabaseClient,
  profileId: string,
  endpoint: "generate" | "onboarding-followup"
): Promise<string | null> {
  const limit = LIMITS[endpoint] ?? 20;
  const windowStart = new Date(
    Date.now() - WINDOW_HOURS * 60 * 60 * 1000
  ).toISOString();

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
    return `Rate limit reached. You can generate up to ${limit} ${endpoint === "generate" ? "question sets" : "follow-up sets"} per hour. Try again in a bit.`;
  }

  // Log this call (best-effort — fail open).
  await supabase
    .from("mindscan_call_log")
    .insert({ profile_id: profileId, endpoint });

  return null;
}
