"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import type { OnboardingFollowupQuestion } from "@/lib/mindscan/types";

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
};

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
};

export function OnboardingFlow() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [data, setData] = useState<OnboardingData>(EMPTY);
  const [loadingFollowups, setLoadingFollowups] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  async function saveRow(completed: boolean): Promise<boolean> {
    setError(null);
    setSubmitting(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        setError("You're signed out. Refresh and try again.");
        return false;
      }

      const content_sources = data.content_sources
        .split("\n")
        .map((s) => s.trim())
        .filter(Boolean);

      const row = {
        profile_id: user.id,
        role: data.role || null,
        community_channels:
          data.community_channels.length > 0 ? data.community_channels : null,
        event_goal: data.event_goal || null,
        biggest_misconception: data.biggest_misconception.trim() || null,
        project_website: data.project_website.trim() || null,
        twitter_handle: data.twitter_handle.trim() || null,
        content_sources: content_sources.length > 0 ? content_sources : null,
        ai_followup_questions:
          data.ai_followup_questions.length > 0
            ? data.ai_followup_questions
            : null,
        ai_followup_answers:
          data.ai_followup_answers.length > 0
            ? data.ai_followup_answers
            : null,
        completed_at: completed ? new Date().toISOString() : null,
      };

      const { error: upsertError } = await supabase
        .from("host_onboarding")
        .upsert(row, { onConflict: "profile_id" });

      if (upsertError) {
        setError(`Couldn't save: ${upsertError.message}`);
        return false;
      }
      return true;
    } finally {
      setSubmitting(false);
    }
  }

  async function handleSkip() {
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
      update("ai_followup_questions", questions);
      update("ai_followup_answers", questions.map(() => ""));
      setStep(4);
    } catch {
      setError("Network error. Check your connection and try again.");
    } finally {
      setLoadingFollowups(false);
    }
  }

  async function handleFinish() {
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
                      onClick={() => toggleChannel(ch)}
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
            />
          </>
        )}

        {step === 2 && (
          <>
            <h2 className="font-heading text-xl font-semibold">
              The one question that matters
            </h2>
            <p className="text-sm text-muted-foreground">
              What&rsquo;s the biggest misconception your community has about
              your project? Be specific — this is the context we use to target
              every quiz we generate for you.
            </p>

            <textarea
              value={data.biggest_misconception}
              onChange={(e) => {
                update("biggest_misconception", e.target.value);
                setError(null);
              }}
              rows={5}
              placeholder="e.g. Most people think our staking rewards come from inflation, but they actually come from protocol fees…"
              className="w-full bg-background border border-border px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-primary resize-none"
            />

            {error && <p className="text-sm text-destructive">{error}</p>}

            <NavRow
              onBack={() => setStep(1)}
              onNext={() => setStep(3)}
              onSkip={handleSkip}
              submitting={submitting}
              nextLabel="Next"
              nextDisabled={data.biggest_misconception.trim().length < 15}
            />
          </>
        )}

        {step === 3 && (
          <>
            <h2 className="font-heading text-xl font-semibold">
              Point us at your content (optional)
            </h2>
            <p className="text-sm text-muted-foreground">
              Stored as pointers only — nothing is crawled yet. You&rsquo;ll
              paste content directly when you generate questions.
            </p>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Project website / docs
              </label>
              <input
                type="url"
                value={data.project_website}
                onChange={(e) => update("project_website", e.target.value)}
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
                placeholder="@yourproject"
                className="w-full h-10 bg-background border border-border px-3 text-sm outline-none focus:ring-1 focus:ring-primary"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Any specific content URLs? (one per line)
              </label>
              <textarea
                value={data.content_sources}
                onChange={(e) => update("content_sources", e.target.value)}
                rows={3}
                placeholder="https://docs.yourproject.xyz/whitepaper&#10;https://blog.yourproject.xyz/why-we-built-this"
                className="w-full bg-background border border-border px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-primary resize-none font-mono"
              />
            </div>

            {error && <p className="text-sm text-destructive">{error}</p>}

            <NavRow
              onBack={() => setStep(2)}
              onNext={goToStep4}
              onSkip={handleSkip}
              submitting={submitting || loadingFollowups}
              nextLabel={loadingFollowups ? "Generating…" : "Next"}
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
                            update("ai_followup_answers", next);
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
}: {
  onBack: (() => void) | null;
  onNext: () => void;
  onSkip: () => void;
  submitting: boolean;
  nextLabel: string;
  nextDisabled?: boolean;
}) {
  return (
    <div className="flex items-center justify-between pt-2">
      <button
        type="button"
        onClick={onSkip}
        disabled={submitting}
        className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2"
      >
        Skip for now
      </button>
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
