"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import type { OnboardingFollowupQuestion } from "@/lib/mindscan/types";
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

type OnboardingData = {
  role: string;
  community_channels: string[];
  event_goal: string;
  biggest_misconception: string;
  project_website: string;
  twitter_handle: string;
  content_sources: string; // newline-separated, split at save time
  ai_followup_questions: OnboardingFollowupQuestion[];
  ai_followup_answers: string[];
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
  if (d.biggest_misconception.trim().length >= 15) return 4;
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
}: {
  initialData: OnboardingInitialData | null;
  initialUpdatedAt: string | null;
}) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  const [data, setData] = useState<OnboardingData>(initialData ?? EMPTY);
  const [step, setStep] = useState<1 | 2 | 3 | 4>(() =>
    initialData ? deriveStartingStep(initialData) : 1
  );
  const [loadingFollowups, setLoadingFollowups] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");

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

  function toggleChannel(ch: string) {
    setData((d) => ({
      ...d,
      community_channels: d.community_channels.includes(ch)
        ? d.community_channels.filter((c) => c !== ch)
        : [...d.community_channels, ch],
    }));
  }

  /**
   * Persists the current data snapshot. Pass `completed = true` only when the
   * host explicitly clicks "Finish".
   *
   * Uses optimistic concurrency control: if the row's updated_at has changed
   * since we last saw it, we reject the save to prevent overwriting concurrent edits
   * (e.g., from another tab or device).
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
          completed_at: completed ? new Date().toISOString() : null,
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
    const ok = await saveRow(false);
    if (ok) router.push("/host");
  }

  async function goToStep4() {
    if (data.biggest_misconception.trim().length < 15) {
      setError("Tell us a bit more — at least 15 characters.");
      return;
    }
    setError(null);
    setLoadingFollowups(true);
    try {
      const res = await fetch("/api/mindscan/onboarding-followup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          misconception: data.biggest_misconception.trim(),
        }),
      });
      const resBody = await res.json();
      if (!res.ok) {
        setError(resBody.error ?? "Couldn't generate follow-ups.");
        return;
      }
      const questions = (resBody.questions ??
        []) as OnboardingFollowupQuestion[];
      if (questions.length === 0) {
        setError("No follow-ups came back. You can skip this step.");
        return;
      }
      const updatedData = {
        ...data,
        ai_followup_questions: questions,
        ai_followup_answers: questions.map(() => ""),
      };
      setData(updatedData);
      setStep(4);
    } catch {
      setError("Network error. Check your connection and try again.");
    } finally {
      setLoadingFollowups(false);
    }
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
              submitting={submitting}
              nextLabel="Next"
              saveStatus={saveStatus}
            />
          </>
        )}

        {step === 4 && (
          <>
            <h2 className="font-heading text-xl font-semibold">
              Diagnostic check
            </h2>
            <p className="text-sm text-muted-foreground">
              We generated a few questions based on the misconception you
              described. Pick what you believe is correct — we&rsquo;ll use
              these answers to target quizzes more precisely.
            </p>

            <div className="space-y-4">
              {data.ai_followup_questions.map((q, i) => (
                <div
                  key={i}
                  className="border border-border p-4 space-y-2 bg-background"
                >
                  <p className="text-sm font-medium">
                    {i + 1}. {q.question}
                  </p>
                  <div className="space-y-1.5">
                    {q.options.map((opt) => {
                      const chosen = data.ai_followup_answers[i] === opt;
                      return (
                        <button
                          key={opt}
                          type="button"
                          onClick={() => {
                            const next = [...data.ai_followup_answers];
                            next[i] = opt;
                            const snap = { ...data, ai_followup_answers: next };
                            setData(snap);
                            scheduleAutoSave(snap);
                          }}
                          className={`w-full text-left px-3 py-2 text-sm border transition-colors ${
                            chosen
                              ? "border-primary bg-primary/10 text-foreground"
                              : "border-border hover:bg-accent"
                          }`}
                        >
                          {opt}
                        </button>
                      );
                    })}
                  </div>
                  {q.purpose && (
                    <p className="text-xs text-muted-foreground italic">
                      Why we ask: {q.purpose}
                    </p>
                  )}
                </div>
              ))}
            </div>

            {error && <p className="text-sm text-destructive">{error}</p>}

            <NavRow
              onBack={() => setStep(3)}
              onNext={handleFinish}
              onSkip={handleSkip}
              submitting={submitting}
              nextLabel={submitting ? "Saving…" : "Finish"}
              saveStatus={saveStatus}
            />
          </>
        )}
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
}: {
  onBack: (() => void) | null;
  onNext: () => void;
  onSkip: () => void;
  submitting: boolean;
  nextLabel: string;
  nextDisabled?: boolean;
  saveStatus: SaveStatus;
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
          Skip for now
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
