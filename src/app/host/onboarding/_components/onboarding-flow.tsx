"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import {
  isFollowupAnswered,
  type FollowupAnswer,
  type OnboardingFollowupQuestion,
} from "@/lib/mindscan/types";
import type { RootDataSearchResult } from "@/lib/rootdata";

/**
 * Layer 0 hybrid onboarding flow.
 *
 * 4 steps:
 *   1. Structured dropdowns (role, community channels, event goal)
 *   2. Open text — "What's the biggest misconception your community has?"
 *   3. Optional project pointers (website, twitter, content URLs)
 *   4. Claude-generated follow-up MCQs (2–3)
 *
 * Every step has a "Skip for now" button that writes whatever has been filled
 * so far (with completed_at = null) so the layout gate stops redirecting.
 *
 * Auto-save fires ~500 ms after any field loses focus (debounced). It never
 * sets completed_at — that only happens on explicit "Finish".
 */

const ROLES = [
  "Founder",
  "CMO / Head of Marketing",
  "Business Development",
  "Community Manager",
  "Developer Advocate",
  "Other",
] as const;

const CHANNELS = [
  "Discord",
  "Telegram",
  "Twitter / X",
  "IRL Events",
  "Farcaster",
] as const;

const EVENT_GOALS = [
  "Educate community",
  "Identify talent",
  "Generate leads",
  "Sponsor activation",
] as const;

/** Maximum diagnostic follow-ups generated per onboarding session. */
const MAX_FOLLOWUPS = 3;

/**
 * How many times the host can wipe the diagnostic check and regenerate from
 * Q1. Per-session (in-memory) counter; resets on page reload. Keeps the
 * Claude credit exposure bounded without a migration.
 */
const MAX_REGENERATIONS = 2;

type OnboardingData = {
  role: string;
  community_channels: string[];
  event_goal: string;
  biggest_misconception: string;
  project_website: string;
  twitter_handle: string;
  content_sources: string; // newline-separated, split at save time
  ai_followup_questions: OnboardingFollowupQuestion[];
  ai_followup_answers: FollowupAnswer[];
  linked_project_name: string;
  linked_rootdata_id: string;
  linked_project_logo: string;
};

/** Exported so onboarding/page.tsx can type the initialData it passes in. */
export type OnboardingInitialData = OnboardingData;

const EMPTY: OnboardingData = {
  role: "",
  community_channels: [],
  event_goal: "",
  biggest_misconception: "",
  project_website: "",
  twitter_handle: "",
  content_sources: "",
  ai_followup_questions: [],
  ai_followup_answers: [],
  linked_project_name: "",
  linked_rootdata_id: "",
  linked_project_logo: "",
};

/**
 * Returns the first step the host hasn't meaningfully completed.
 *
 * Order after the v0.4 swap:
 *   1 = role / channels / goal
 *   2 = project info (RootData)        — was step 3
 *   3 = biggest misconception          — was step 2
 *   4 = AI diagnostic follow-ups
 *
 * Step 2 (project) is optional, so we advance past it if ANY project field
 * is filled OR if step 3 (misconception) has been started.
 */
function deriveStartingStep(d: OnboardingData): 1 | 2 | 3 | 4 {
  if (d.ai_followup_questions.length > 0) return 4;
  // Misconception filled but no questions yet — stay at step 3 so the
  // "Next" CTA triggers the AI fetch on first advance.
  if (d.biggest_misconception.trim().length >= 15) return 3;
  const projectStarted =
    !!d.linked_project_name ||
    d.project_website.trim().length > 0 ||
    d.twitter_handle.trim().length > 0 ||
    d.content_sources.trim().length > 0;
  if (projectStarted) return 3;
  if (d.role || d.community_channels.length > 0 || d.event_goal) return 2;
  return 1;
}

type SaveStatus = "idle" | "saving" | "saved" | "error";

export function OnboardingFlow({
  initialData,
  initialUpdatedAt,
  isEditMode = false,
}: {
  initialData: OnboardingInitialData | null;
  initialUpdatedAt: string | null;
  /**
   * True when the host has already completed onboarding and is re-entering
   * the flow to edit their diagnostic profile. Changes a few things:
   *   - Initial step is 1 (top of form) instead of derived from progress
   *   - "Finish" button reads "Save changes" and returns to dashboard
   *   - "Skip for now" is hidden — already completed, no skip semantics
   */
  isEditMode?: boolean;
}) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  const [data, setData] = useState<OnboardingData>(initialData ?? EMPTY);
  const [step, setStep] = useState<1 | 2 | 3 | 4>(() => {
    // In edit mode, always start at step 1 so the host reviews from the top
    // rather than being dropped at step 4 (the last step they touched).
    if (isEditMode) return 1;
    return initialData ? deriveStartingStep(initialData) : 1;
  });
  const [loadingFollowups, setLoadingFollowups] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");

  // Step 4: Adaptive follow-up diagnostic. Questions are generated one at a
  // time based on the host's previous answers — initial index is the last
  // loaded question so hosts resume where they left off after a refresh.
  const [followupIndex, setFollowupIndex] = useState<number>(() => {
    const loaded = initialData?.ai_followup_questions?.length ?? 0;
    return loaded > 0 ? loaded - 1 : 0;
  });

  // In-session regeneration counter. Not persisted — refreshing the page
  // resets it. Keeps Claude credit use bounded without a DB migration.
  const [regenerationsUsed, setRegenerationsUsed] = useState(0);

  // Snapshot the misconception text at the moment we generated the first
  // follow-up. If the host later edits their misconception on Step 3, we
  // can detect the drift and prompt them to regenerate so the diagnostic
  // matches the new input.
  const [generatedFromMisconception, setGeneratedFromMisconception] = useState<string>(
    () => initialData?.biggest_misconception ?? ""
  );

  // RootData project search state (Step 3)
  const [rdQuery, setRdQuery] = useState(initialData?.linked_project_name ?? "");
  const [rdResults, setRdResults] = useState<RootDataSearchResult[]>([]);
  const [rdSearching, setRdSearching] = useState(false);
  const [rdSelectedId, setRdSelectedId] = useState<string | null>(initialData?.linked_rootdata_id || null);
  const [rdLoading, setRdLoading] = useState(false);
  const rdDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Track the last known updated_at timestamp from the server to prevent stale saves
  // (optimistic concurrency control — if another tab/device modified the row, reject the save)
  const lastUpdatedAt = useRef<string | null>(initialUpdatedAt);

  // Debounce timer for auto-save
  const autoSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function update<K extends keyof OnboardingData>(
    key: K,
    value: OnboardingData[K]
  ) {
    setData((d) => ({ ...d, [key]: value }));
  }

  /**
   * Persists the current data snapshot. Pass `completed = true` only when
   * the host explicitly clicks "Finish" on first-time onboarding.
   *
   * Auto-saves (completed = false) NEVER touch completed_at — previously we
   * wrote `completed_at: null` which would demote an already-completed host
   * back to in-progress on every blur during edit mode. Now we simply omit
   * the column from the upsert row when `completed === false`.
   */
  const saveRow = useCallback(
    async (completed: boolean, snapshot?: OnboardingData): Promise<boolean> => {
      setError(null);
      setSubmitting(completed); // only show global "Saving…" for explicit saves
      if (!completed) setSaveStatus("saving");
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) {
          setError("You're signed out. Refresh and try again.");
          if (!completed) setSaveStatus("error");
          return false;
        }

        const current = snapshot ?? data;
        const content_sources = current.content_sources
          .split("\n")
          .map((s) => s.trim())
          .filter(Boolean);

        const row = {
          profile_id: user.id,
          role: current.role || null,
          community_channels:
            current.community_channels.length > 0
              ? current.community_channels
              : null,
          event_goal: current.event_goal || null,
          biggest_misconception: current.biggest_misconception.trim() || null,
          project_website: current.project_website.trim() || null,
          twitter_handle: current.twitter_handle.trim() || null,
          content_sources: content_sources.length > 0 ? content_sources : null,
          ai_followup_questions:
            current.ai_followup_questions.length > 0
              ? current.ai_followup_questions
              : null,
          ai_followup_answers:
            current.ai_followup_answers.length > 0
              ? current.ai_followup_answers
              : null,
          // Only set completed_at on an explicit Finish — auto-saves leave
          // the existing value alone (see JSDoc on saveRow above).
          ...(completed ? { completed_at: new Date().toISOString() } : {}),
          linked_project_name: current.linked_project_name || null,
          linked_rootdata_id: current.linked_rootdata_id || null,
          linked_project_logo: current.linked_project_logo || null,
        };

        // Client-side stale-save guard: after a successful save, update our
        // local updated_at ref so that any pending debounced auto-saves scheduled
        // BEFORE this save will cancel themselves (see scheduleAutoSave).
        // Note: this is NOT server-side OCC — the upsert unconditionally overwrites.
        const { data: upsertedRow, error: upsertError } = await supabase
          .from("host_onboarding")
          .upsert(row, { onConflict: "profile_id" })
          .select("updated_at")
          .single();

        if (upsertError) {
          setError(`Couldn't save: ${upsertError.message}`);
          if (!completed) setSaveStatus("error");
          return false;
        }

        // Update our tracked timestamp to the new one from the server
        // This ensures that future saves use the fresh timestamp
        if (upsertedRow?.updated_at) {
          lastUpdatedAt.current = upsertedRow.updated_at;
        }

        if (!completed) {
          setSaveStatus("saved");
          // Reset back to idle after 3 s
          setTimeout(() => setSaveStatus((s) => (s === "saved" ? "idle" : s)), 3000);
        }
        return true;
      } finally {
        if (completed) setSubmitting(false);
      }
    },
    // `supabase` is stable (created once via useMemo). `data` is intentionally
    // excluded — saveRow always receives a `snapshot` argument at call sites.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [supabase]
  );

  /**
   * Schedules a debounced auto-save. Called from onBlur handlers on every
   * field. The 500 ms debounce collapses rapid tab-throughs into a single save.
   *
   * CRITICAL: When an auto-save is scheduled, we capture the current timestamp.
   * If another save (e.g., handleFinish) completes before this auto-save fires,
   * the auto-save will detect the stale timestamp and cancel itself.
   */
  function scheduleAutoSave(snapshot: OnboardingData) {
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    const scheduledAt = lastUpdatedAt.current;
    autoSaveTimer.current = setTimeout(() => {
      // Check if timestamp has changed since we scheduled this save
      // If it has, another save already happened (e.g., handleFinish), so skip this stale save
      if (scheduledAt !== lastUpdatedAt.current && lastUpdatedAt.current !== null) {
        // Silently cancel — a newer save already succeeded
        return;
      }
      saveRow(false, snapshot);
    }, 500);
  }

  function handleBlur(snapshot?: OnboardingData) {
    scheduleAutoSave(snapshot ?? data);
  }

  function handleRdQueryChange(q: string) {
    setRdQuery(q);
    setRdResults([]);
    if (rdDebounceRef.current) clearTimeout(rdDebounceRef.current);
    if (!q.trim()) return;
    rdDebounceRef.current = setTimeout(async () => {
      setRdSearching(true);
      try {
        const res = await fetch("/api/rootdata/search", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query: q.trim() }),
        });
        const body = await res.json();
        setRdResults(res.ok ? (body.results ?? []) : []);
      } catch {
        setRdResults([]);
      } finally {
        setRdSearching(false);
      }
    }, 400);
  }

  async function handleRdSelect(result: RootDataSearchResult) {
    setRdSelectedId(String(result.project_id));
    setRdResults([]);
    setRdQuery(result.name);
    setRdLoading(true);
    try {
      const res = await fetch("/api/rootdata/project", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rootdata_id: String(result.project_id) }),
      });
      const body = await res.json();
      if (res.ok && body.project) {
        const p = body.project;
        // Auto-populate project_website, twitter_handle, and gitbook from RootData
        const existingUrls = data.content_sources.trim();
        const gitbook = p.gitbook ?? null;
        const mergedUrls = gitbook
          ? existingUrls
            ? `${existingUrls}\n${gitbook}`
            : gitbook
          : existingUrls;
        const snap = {
          ...data,
          project_website: p.website ?? data.project_website,
          twitter_handle: p.twitter ?? data.twitter_handle,
          content_sources: mergedUrls,
          linked_project_name: result.name,
          linked_rootdata_id: String(result.project_id),
          linked_project_logo: p.logo_url ?? result.logo ?? "",
        };
        setData(snap);
        // Save immediately — don't debounce. Linking a project is an explicit
        // action and the new columns (linked_project_name, etc.) must not be
        // dropped by a stale auto-save cancel or a PostgREST schema cache race.
        if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
        saveRow(false, snap);
      }
    } catch {
      // Non-fatal — host can fill in manually below
    } finally {
      setRdLoading(false);
    }
  }

  async function handleSkip() {
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    // saveRow(false) no longer touches completed_at, so this is safe in
    // both first-run ("skip for now") and edit-mode ("exit to dashboard")
    // flows.
    const ok = await saveRow(false);
    if (ok) router.push("/host");
  }

  /**
   * Calls the adaptive follow-up endpoint to generate the question at `index`.
   * Builds the `previous` array from everything the host has answered so far,
   * so Claude can drill deeper on each turn instead of repeating itself.
   *
   * Returns true on success (state updated) or false on failure (error set).
   */
  async function fetchFollowupAt(
    index: number,
    current: OnboardingData
  ): Promise<boolean> {
    // Build previous Q&A array from entries [0..index-1] that have any signal.
    const previous = current.ai_followup_questions
      .slice(0, index)
      .map((q, i) => {
        const a = current.ai_followup_answers[i] ?? { choices: [], extra: "" };
        return {
          question: q.question,
          answers: a.choices,
          extra: a.extra ?? "",
        };
      })
      .filter((p) => p.answers.length > 0 || p.extra.trim().length > 0);

    const res = await fetch("/api/mindscan/onboarding-followup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        misconception: current.biggest_misconception.trim(),
        previous: previous.length > 0 ? previous : undefined,
      }),
    });
    const resBody = await res.json();
    if (!res.ok || !resBody?.question) {
      setError(resBody?.error ?? "Couldn't generate the next question.");
      return false;
    }

    const question = resBody.question as OnboardingFollowupQuestion;

    // Insert/replace the question at `index`, padding the answers array
    // so indices stay aligned. This supports both "append next" (index ===
    // questions.length) and defensive overwrite (index < questions.length).
    const nextQuestions = [...current.ai_followup_questions];
    const nextAnswers: FollowupAnswer[] = [...current.ai_followup_answers];
    while (nextQuestions.length <= index) {
      nextQuestions.push({ question: "", options: [], purpose: undefined });
      nextAnswers.push({ choices: [], extra: "" });
    }
    nextQuestions[index] = question;
    // Only reset the answer slot if we're generating a brand-new question,
    // not re-fetching an existing one (preserve user input on retry).
    if (!nextAnswers[index] || !isFollowupAnswered(nextAnswers[index])) {
      nextAnswers[index] = { choices: [], extra: "" };
    }

    const updated = {
      ...current,
      ai_followup_questions: nextQuestions,
      ai_followup_answers: nextAnswers,
    };
    setData(updated);
    scheduleAutoSave(updated);
    return true;
  }

  /**
   * Step 3 → Step 4 transition. Validates the misconception, fetches the
   * FIRST adaptive follow-up question, and advances to step 4.
   */
  async function goToStep4() {
    if (data.biggest_misconception.trim().length < 15) {
      setError("Tell us a bit more — at least 15 characters.");
      return;
    }
    setError(null);

    // If the host already has follow-ups loaded (re-entering the step after
    // a Back navigation), skip the fetch and jump straight in.
    if (data.ai_followup_questions.length > 0) {
      setFollowupIndex(Math.min(data.ai_followup_questions.length - 1, MAX_FOLLOWUPS - 1));
      setStep(4);
      return;
    }

    setLoadingFollowups(true);
    try {
      const ok = await fetchFollowupAt(0, data);
      if (!ok) return;
      setFollowupIndex(0);
      setGeneratedFromMisconception(data.biggest_misconception.trim());
      setStep(4);
    } catch {
      setError("Network error. Check your connection and try again.");
    } finally {
      setLoadingFollowups(false);
    }
  }

  /**
   * Wipes the diagnostic questions and starts over from Q1. Used when:
   *   - Host manually clicks "Regenerate" on Step 4
   *   - Host edited their misconception and wants the diagnostic to match
   *
   * Bounded by MAX_REGENERATIONS per session.
   */
  async function handleRegenerateFollowups() {
    if (regenerationsUsed >= MAX_REGENERATIONS) {
      setError("You've used all regenerations for this session.");
      return;
    }
    if (data.biggest_misconception.trim().length < 15) {
      setError("Your misconception needs at least 15 characters.");
      return;
    }
    setError(null);

    // Reset state BEFORE fetching so the UI shows the loading card, not
    // the stale Q1.
    const cleared: OnboardingData = {
      ...data,
      ai_followup_questions: [],
      ai_followup_answers: [],
    };
    setData(cleared);
    setFollowupIndex(0);
    setLoadingFollowups(true);

    try {
      const ok = await fetchFollowupAt(0, cleared);
      if (!ok) return;
      setRegenerationsUsed((n) => n + 1);
      setGeneratedFromMisconception(cleared.biggest_misconception.trim());
    } catch {
      setError("Network error. Check your connection and try again.");
    } finally {
      setLoadingFollowups(false);
    }
  }

  /**
   * Step 4 "Next" handler. Persists the current answer, then either fetches
   * the next adaptive question or calls handleFinish when on the last turn.
   */
  async function handleFollowupNext() {
    setError(null);

    // If we're on the last allowed question, finish.
    if (followupIndex >= MAX_FOLLOWUPS - 1) {
      await handleFinish();
      return;
    }

    const nextIndex = followupIndex + 1;

    // If the next question is already loaded (host went Back then Next),
    // just advance — don't re-fetch.
    if (data.ai_followup_questions[nextIndex]) {
      setFollowupIndex(nextIndex);
      return;
    }

    setLoadingFollowups(true);
    try {
      const ok = await fetchFollowupAt(nextIndex, data);
      if (!ok) return;
      setFollowupIndex(nextIndex);
    } catch {
      setError("Network error. Check your connection and try again.");
    } finally {
      setLoadingFollowups(false);
    }
  }

  /**
   * Step 4 "Back" handler. Either moves to the previous loaded question
   * or returns to Step 3 if the host is on the first follow-up.
   */
  function handleFollowupBack() {
    setError(null);
    if (followupIndex === 0) {
      setStep(3);
      return;
    }
    setFollowupIndex(followupIndex - 1);
  }

  async function handleFinish() {
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    const ok = await saveRow(true);
    if (ok) router.push("/host");
  }

  return (
    <div className="border border-border bg-surface">
      {/* Progress */}
      <div className="flex border-b border-border">
        {[1, 2, 3, 4].map((n) => (
          <div
            key={n}
            className={`flex-1 text-center py-3 text-xs font-medium uppercase tracking-wider ${
              n === step
                ? "text-primary border-b-2 border-primary -mb-px"
                : n < step
                ? "text-muted-foreground"
                : "text-muted-foreground/50"
            }`}
          >
            Step {n}
          </div>
        ))}
      </div>

      <div className="p-6 space-y-5">
        {step === 1 && (
          <>
            <h2 className="font-heading text-xl font-semibold">About you</h2>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Your role
              </label>
              <select
                value={data.role}
                onChange={(e) => update("role", e.target.value)}
                onBlur={(e) => {
                  const snap = { ...data, role: e.target.value };
                  handleBlur(snap);
                }}
                className="w-full h-10 bg-background border border-border px-3 text-sm outline-none focus:ring-1 focus:ring-primary"
              >
                <option value="">Select a role…</option>
                {ROLES.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Where does your community live? (pick any)
              </label>
              <div className="flex flex-wrap gap-2">
                {CHANNELS.map((ch) => {
                  const active = data.community_channels.includes(ch);
                  return (
                    <button
                      key={ch}
                      type="button"
                      onClick={() => {
                        const next = data.community_channels.includes(ch)
                          ? data.community_channels.filter((c) => c !== ch)
                          : [...data.community_channels, ch];
                        const snap = { ...data, community_channels: next };
                        setData(snap);
                        scheduleAutoSave(snap);
                      }}
                      className={`px-3 py-1.5 text-sm border transition-colors ${
                        active
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-border hover:bg-accent"
                      }`}
                    >
                      {ch}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                What do you want out of your first event?
              </label>
              <select
                value={data.event_goal}
                onChange={(e) => update("event_goal", e.target.value)}
                onBlur={(e) => {
                  const snap = { ...data, event_goal: e.target.value };
                  handleBlur(snap);
                }}
                className="w-full h-10 bg-background border border-border px-3 text-sm outline-none focus:ring-1 focus:ring-primary"
              >
                <option value="">Select a goal…</option>
                {EVENT_GOALS.map((g) => (
                  <option key={g} value={g}>
                    {g}
                  </option>
                ))}
              </select>
            </div>

            {error && <p className="text-sm text-destructive">{error}</p>}

            <NavRow
              onBack={null}
              onNext={() => setStep(2)}
              onSkip={handleSkip}
              skipLabel={isEditMode ? "Exit" : "Skip for now"}
              submitting={submitting}
              nextLabel="Next"
              saveStatus={saveStatus}
            />
          </>
        )}

        {step === 3 && (
          <>
            <h2 className="font-heading text-xl font-semibold">
              The one question that matters
            </h2>
            <p className="text-sm text-muted-foreground">
              {data.linked_project_name ? (
                <>
                  What&rsquo;s the biggest misconception your community has
                  about <span className="text-foreground font-medium">{data.linked_project_name}</span>?
                  Be specific — this is the context we use to target every
                  quiz we generate for you.
                </>
              ) : (
                <>
                  What&rsquo;s the biggest misconception your community has
                  about your project? Be specific — this is the context we
                  use to target every quiz we generate for you.
                </>
              )}
            </p>

            <textarea
              value={data.biggest_misconception}
              onChange={(e) => {
                update("biggest_misconception", e.target.value);
                setError(null);
              }}
              onBlur={(e) => {
                const snap = { ...data, biggest_misconception: e.target.value };
                handleBlur(snap);
              }}
              rows={5}
              placeholder="e.g. Most people think our staking rewards come from inflation, but they actually come from protocol fees…"
              className="w-full bg-background border border-border px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-primary resize-none"
            />

            {error && <p className="text-sm text-destructive">{error}</p>}

            <NavRow
              onBack={() => setStep(2)}
              onNext={goToStep4}
              onSkip={handleSkip}
              skipLabel={isEditMode ? "Exit" : "Skip for now"}
              submitting={submitting || loadingFollowups}
              nextLabel={loadingFollowups ? "Generating…" : "Next"}
              nextDisabled={data.biggest_misconception.trim().length < 15}
              saveStatus={saveStatus}
            />
          </>
        )}

        {step === 2 && (
          <>
            <h2 className="font-heading text-xl font-semibold">
              Point us at your project (optional)
            </h2>
            <p className="text-sm text-muted-foreground">
              Search RootData to auto-fill your profile, or enter details manually below.
            </p>

            {/* RootData project search */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Find your project on RootData
              </label>
              <div className="relative">
                {rdSelectedId && data.linked_project_logo && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={data.linked_project_logo}
                    alt={data.linked_project_name || "Project logo"}
                    className="absolute left-2 top-1/2 -translate-y-1/2 w-6 h-6 rounded object-contain pointer-events-none"
                  />
                )}
                <input
                  type="text"
                  value={rdQuery}
                  onChange={(e) => handleRdQueryChange(e.target.value)}
                  placeholder="Search by project name…"
                  className={`w-full h-10 bg-background border border-border text-sm outline-none focus:ring-1 focus:ring-primary pr-20 ${
                    rdSelectedId && data.linked_project_logo ? "pl-10" : "px-3"
                  }`}
                />
                {rdSearching && (
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                    Searching…
                  </span>
                )}
                {rdLoading && (
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                    Loading…
                  </span>
                )}
              </div>

              {/* Search results dropdown */}
              {rdResults.length > 0 && (
                <div className="border border-border bg-background divide-y divide-border max-h-56 overflow-y-auto">
                  {rdResults.slice(0, 8).map((result) => (
                    <button
                      key={result.project_id}
                      type="button"
                      onClick={() => handleRdSelect(result)}
                      className="w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-accent transition-colors"
                    >
                      {result.logo && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={result.logo}
                          alt=""
                          className="w-7 h-7 rounded object-contain flex-shrink-0"
                        />
                      )}
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{result.name}</p>
                        {result.one_liner && (
                          <p className="text-xs text-muted-foreground truncate">{result.one_liner}</p>
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              )}

              {/* No results feedback */}
              {!rdSearching && rdQuery.trim().length > 1 && rdResults.length === 0 && !rdSelectedId && (
                <p className="text-xs text-muted-foreground">
                  Not found on RootData — fill in the details below manually.
                </p>
              )}

              {/* Confirmed selection */}
              {rdSelectedId && !rdLoading && (
                <p className="text-xs text-primary">
                  Project linked — website and Twitter auto-filled where available.
                </p>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Project website / docs
                </label>
                <input
                  type="url"
                  value={data.project_website}
                  onChange={(e) => update("project_website", e.target.value)}
                  onBlur={(e) => {
                    const snap = { ...data, project_website: e.target.value };
                    handleBlur(snap);
                  }}
                  placeholder="https://…"
                  className="w-full h-10 bg-background border border-border px-3 text-sm outline-none focus:ring-1 focus:ring-primary"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Twitter / X handle
                </label>
                <input
                  type="text"
                  value={data.twitter_handle}
                  onChange={(e) => update("twitter_handle", e.target.value)}
                  onBlur={(e) => {
                    const snap = { ...data, twitter_handle: e.target.value };
                    handleBlur(snap);
                  }}
                  placeholder="@yourproject"
                  className="w-full h-10 bg-background border border-border px-3 text-sm outline-none focus:ring-1 focus:ring-primary"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Any specific content URLs? (one per line)
              </label>
              <textarea
                value={data.content_sources}
                onChange={(e) => update("content_sources", e.target.value)}
                onBlur={(e) => {
                  const snap = { ...data, content_sources: e.target.value };
                  handleBlur(snap);
                }}
                rows={3}
                placeholder="https://docs.yourproject.xyz/whitepaper&#10;https://blog.yourproject.xyz/why-we-built-this"
                className="w-full bg-background border border-border px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-primary resize-none font-mono"
              />
            </div>

            {error && <p className="text-sm text-destructive">{error}</p>}

            <NavRow
              onBack={() => setStep(1)}
              onNext={() => setStep(3)}
              onSkip={handleSkip}
              skipLabel={isEditMode ? "Exit" : "Skip for now"}
              submitting={submitting}
              nextLabel="Next"
              saveStatus={saveStatus}
            />
          </>
        )}

        {step === 4 && (() => {
          const currentQuestion = data.ai_followup_questions[followupIndex];
          const currentAnswer: FollowupAnswer =
            data.ai_followup_answers[followupIndex] ?? { choices: [], extra: "" };
          const isLast = followupIndex >= MAX_FOLLOWUPS - 1;
          const isFetchingCurrent = loadingFollowups && !currentQuestion;
          const regenerationsLeft = MAX_REGENERATIONS - regenerationsUsed;
          const misconceptionEdited =
            generatedFromMisconception.trim().length > 0 &&
            data.biggest_misconception.trim() !== generatedFromMisconception.trim();

          return (
            <>
              <div className="flex items-baseline justify-between gap-4">
                <h2 className="font-heading text-xl font-semibold">
                  Diagnostic check
                </h2>
                <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider shrink-0">
                  Question {followupIndex + 1} of {MAX_FOLLOWUPS}
                </span>
              </div>

              <p className="text-sm text-muted-foreground">
                Each question adapts based on your last answer — select any
                that apply, or add your own context below. We use this to
                target every quiz we generate for you.
              </p>

              {misconceptionEdited && regenerationsLeft > 0 && (
                <div className="border border-amber-500/40 bg-amber-500/5 px-3 py-2 text-xs text-foreground flex items-start gap-2">
                  <span className="text-amber-500 font-semibold shrink-0">⚠</span>
                  <div className="min-w-0 flex-1">
                    You edited your misconception — the current questions
                    were generated from the earlier version.{" "}
                    <button
                      type="button"
                      onClick={handleRegenerateFollowups}
                      disabled={loadingFollowups}
                      className="font-medium text-primary hover:underline underline-offset-2 disabled:opacity-50"
                    >
                      Regenerate the diagnostic
                    </button>{" "}
                    to match the new input.
                  </div>
                </div>
              )}

              {/* Progress bar */}
              <div className="flex gap-1.5">
                {Array.from({ length: MAX_FOLLOWUPS }).map((_, i) => (
                  <div
                    key={i}
                    className={`h-1 flex-1 transition-colors ${
                      i < followupIndex
                        ? "bg-primary"
                        : i === followupIndex
                          ? "bg-primary/60"
                          : "bg-border"
                    }`}
                  />
                ))}
              </div>

              {isFetchingCurrent && (
                <div className="border border-border p-6 bg-background flex items-center justify-center">
                  <p className="text-sm text-muted-foreground">
                    Generating question {followupIndex + 1}…
                  </p>
                </div>
              )}

              {currentQuestion && (
                <div className="border border-border p-4 space-y-3 bg-background">
                  <p className="text-sm font-medium">
                    {currentQuestion.question}
                  </p>
                  <div className="space-y-1.5">
                    {currentQuestion.options.map((opt) => {
                      const checked = currentAnswer.choices.includes(opt);
                      return (
                        <button
                          key={opt}
                          type="button"
                          onClick={() => {
                            const nextChoices = checked
                              ? currentAnswer.choices.filter((c) => c !== opt)
                              : [...currentAnswer.choices, opt];
                            const nextAnswers = [...data.ai_followup_answers];
                            nextAnswers[followupIndex] = {
                              ...currentAnswer,
                              choices: nextChoices,
                            };
                            const snap = {
                              ...data,
                              ai_followup_answers: nextAnswers,
                            };
                            setData(snap);
                            scheduleAutoSave(snap);
                          }}
                          className={`w-full text-left px-3 py-2 text-sm border transition-colors flex items-start gap-2 ${
                            checked
                              ? "border-primary bg-primary/10 text-foreground"
                              : "border-border hover:bg-accent"
                          }`}
                        >
                          <span
                            aria-hidden
                            className={`mt-0.5 flex-shrink-0 w-4 h-4 border flex items-center justify-center transition-colors ${
                              checked
                                ? "border-primary bg-primary text-primary-foreground"
                                : "border-border bg-background"
                            }`}
                          >
                            {checked && (
                              <svg
                                viewBox="0 0 16 16"
                                fill="none"
                                className="w-3 h-3"
                                xmlns="http://www.w3.org/2000/svg"
                              >
                                <path
                                  d="M3 8l3.5 3.5L13 5"
                                  stroke="currentColor"
                                  strokeWidth="2"
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                />
                              </svg>
                            )}
                          </span>
                          <span className="min-w-0">{opt}</span>
                        </button>
                      );
                    })}
                  </div>

                  <div className="space-y-1">
                    <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                      Anything else? (optional)
                    </label>
                    <textarea
                      value={currentAnswer.extra ?? ""}
                      onChange={(e) => {
                        const nextAnswers = [...data.ai_followup_answers];
                        nextAnswers[followupIndex] = {
                          ...currentAnswer,
                          extra: e.target.value,
                        };
                        setData((d) => ({
                          ...d,
                          ai_followup_answers: nextAnswers,
                        }));
                      }}
                      onBlur={() => {
                        scheduleAutoSave(data);
                      }}
                      rows={2}
                      placeholder="Add context the options don't capture…"
                      className="w-full bg-background border border-border px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-primary resize-none"
                    />
                  </div>

                  {currentQuestion.purpose && (
                    <p className="text-xs text-muted-foreground italic">
                      Why we ask: {currentQuestion.purpose}
                    </p>
                  )}
                </div>
              )}

              {error && <p className="text-sm text-destructive">{error}</p>}

              <NavRow
                onBack={handleFollowupBack}
                onNext={handleFollowupNext}
                onSkip={handleSkip}
                skipLabel={isEditMode ? "Exit" : "Skip for now"}
                submitting={submitting || loadingFollowups}
                nextLabel={
                  submitting
                    ? "Saving…"
                    : loadingFollowups
                      ? "Generating…"
                      : isLast
                        ? isEditMode
                          ? "Save changes"
                          : "Finish"
                        : "Next question"
                }
                nextDisabled={!currentQuestion}
                saveStatus={saveStatus}
              />

              {data.ai_followup_questions.length > 0 && (
                <div className="pt-2 text-center">
                  <button
                    type="button"
                    onClick={handleRegenerateFollowups}
                    disabled={loadingFollowups || regenerationsLeft === 0}
                    className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2 disabled:opacity-50 disabled:no-underline disabled:cursor-not-allowed"
                  >
                    {regenerationsLeft > 0
                      ? `Regenerate all questions (${regenerationsLeft} left)`
                      : "Regeneration limit reached for this session"}
                  </button>
                </div>
              )}
            </>
          );
        })()}
      </div>
    </div>
  );
}

function NavRow({
  onBack,
  onNext,
  onSkip,
  submitting,
  nextLabel,
  nextDisabled,
  saveStatus,
  skipLabel = "Skip for now",
}: {
  onBack: (() => void) | null;
  onNext: () => void;
  onSkip: () => void;
  submitting: boolean;
  nextLabel: string;
  nextDisabled?: boolean;
  saveStatus: SaveStatus;
  skipLabel?: string;
}) {
  return (
    <div className="flex items-center justify-between pt-2">
      <div className="flex items-center gap-4">
        <button
          type="button"
          onClick={onSkip}
          disabled={submitting}
          className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2"
        >
          {skipLabel}
        </button>
        {saveStatus === "saving" && (
          <span className="text-xs text-muted-foreground">Saving…</span>
        )}
        {saveStatus === "saved" && (
          <span className="text-xs text-muted-foreground">Saved ✓</span>
        )}
        {saveStatus === "error" && (
          <span className="text-xs text-destructive">Save failed</span>
        )}
      </div>
      <div className="flex gap-2">
        {onBack && (
          <Button variant="outline" onClick={onBack} disabled={submitting}>
            Back
          </Button>
        )}
        <Button
          onClick={onNext}
          disabled={submitting || nextDisabled}
          className="bg-primary text-primary-foreground hover:bg-primary-hover font-medium"
        >
          {nextLabel}
        </Button>
      </div>
    </div>
  );
}
