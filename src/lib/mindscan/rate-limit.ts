/**
 * MindScan per-user rate limiting.
 *
 * Uses the `mindscan_call_log` table to enforce a sliding-window limit.
 * Call `checkAndLog` before the Claude/Whisper API call — it returns an
 * error message if the user is over the limit, or null if the call is
 * allowed (and has been logged).
 *
 * Two cost modes:
 *   - "calls":     each row counts as 1 unit (default)
 *   - "questions": sum the `questions_count` column (only `generate` uses this,
 *                  so hosts are capped on total questions produced per day
 *                  regardless of whether they request 5 / 10 / 15 per call).
 *
 * Current config:
 *   - generate:             50 questions / 24h (questions mode)
 *   - transcribe:            5 calls     / 24h (calls mode)
 *   - fetch-url:            30 calls     /  1h (calls mode)
 *   - onboarding-followup:  10 calls     /  1h (calls mode)
 */

import { SupabaseClient } from "@supabase/supabase-js";

type Endpoint =
  | "generate"
  | "onboarding-followup"
  | "fetch-url"
  | "transcribe";

type EndpointConfig = {
  limit: number;
  windowHours: number;
  costMode: "calls" | "questions";
};

const CONFIG: Record<Endpoint, EndpointConfig> = {
  generate: { limit: 50, windowHours: 24, costMode: "questions" },
  "onboarding-followup": { limit: 10, windowHours: 1, costMode: "calls" },
  "fetch-url": { limit: 30, windowHours: 1, costMode: "calls" },
  transcribe: { limit: 5, windowHours: 24, costMode: "calls" },
};

// Exported for test coverage.
export const LIMITS: Record<Endpoint, number> = {
  generate: CONFIG.generate.limit,
  "onboarding-followup": CONFIG["onboarding-followup"].limit,
  "fetch-url": CONFIG["fetch-url"].limit,
  transcribe: CONFIG.transcribe.limit,
};

function errorMessage(
  endpoint: Endpoint,
  limit: number,
  hours: number
): string {
  const window = hours >= 24 ? "day" : hours === 1 ? "hour" : `${hours} hours`;
  switch (endpoint) {
    case "generate":
      return `Daily question limit reached (${limit} questions per ${window}). Come back tomorrow.`;
    case "transcribe":
      return `Daily transcription limit reached (${limit} uploads per ${window}). Come back tomorrow.`;
    case "fetch-url":
      return `Rate limit reached (${limit} URL fetches per ${window}). Try again in a bit.`;
    case "onboarding-followup":
      return `Rate limit reached (${limit} follow-up sets per ${window}). Try again in a bit.`;
  }
}

/**
 * Check the rate limit and log the call if allowed.
 *
 * Returns null if allowed, or an error message string if blocked.
 * On any DB error, returns null (fail open — a broken limiter should not
 * block legitimate calls).
 *
 * @param cost For the `generate` endpoint, the number of questions being
 *             requested in this call. Ignored for other endpoints.
 */
export async function checkAndLog(
  supabase: SupabaseClient,
  profileId: string,
  endpoint: Endpoint,
  cost = 1
): Promise<string | null> {
  const cfg = CONFIG[endpoint];
  const windowStart = new Date(
    Date.now() - cfg.windowHours * 60 * 60 * 1000
  ).toISOString();

  // Phase 1: Pre-insert usage check.
  let currentUsage = 0;

  if (cfg.costMode === "questions") {
    // Sum questions_count across the window. Using a plain select + JS sum
    // because PostgREST doesn't expose sum() on the base client without an RPC.
    const { data, error } = await supabase
      .from("mindscan_call_log")
      .select("questions_count")
      .eq("profile_id", profileId)
      .eq("endpoint", endpoint)
      .gte("called_at", windowStart);

    if (error) return null; // fail open
    currentUsage = (data ?? []).reduce(
      (acc: number, row: { questions_count: number | null }) =>
        acc + (row.questions_count ?? 0),
      0
    );
  } else {
    const { count, error } = await supabase
      .from("mindscan_call_log")
      .select("*", { count: "exact", head: true })
      .eq("profile_id", profileId)
      .eq("endpoint", endpoint)
      .gte("called_at", windowStart);

    if (error) return null; // fail open
    currentUsage = count ?? 0;
  }

  if (currentUsage + cost > cfg.limit) {
    return errorMessage(endpoint, cfg.limit, cfg.windowHours);
  }

  // Phase 2: Log this call (best-effort — fail open).
  const row: {
    profile_id: string;
    endpoint: Endpoint;
    questions_count?: number;
  } = { profile_id: profileId, endpoint };
  if (cfg.costMode === "questions") {
    row.questions_count = cost;
  }

  const { error: insertError } = await supabase
    .from("mindscan_call_log")
    .insert(row);

  if (insertError) return null;

  return null;
}
