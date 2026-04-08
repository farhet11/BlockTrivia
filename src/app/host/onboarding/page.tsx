import { createServerSupabaseClient } from "@/lib/supabase-server";
import { redirect } from "next/navigation";
import { OnboardingFlow } from "./_components/onboarding-flow";
import type { OnboardingInitialData } from "./_components/onboarding-flow";

/**
 * MindScan Layer 0 — host onboarding.
 *
 * Lives OUTSIDE the `(dashboard)` route group so it doesn't inherit the
 * dashboard layout's onboarding redirect — otherwise we'd infinite-loop.
 * Auth still comes from the parent `src/app/host/layout.tsx`.
 *
 * Re-entry: hosts who skipped can return here and continue where they left
 * off. Only hosts who fully completed (`completed_at` is set) are bounced
 * back to the dashboard.
 */
export default async function HostOnboardingPage() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: existing, error: existingErr } = await supabase
    .from("host_onboarding")
    .select(
      "completed_at, role, community_channels, event_goal, biggest_misconception, project_website, twitter_handle, content_sources, ai_followup_questions, ai_followup_answers, updated_at"
    )
    .eq("profile_id", user.id)
    .maybeSingle();

  // DB error — redirect to /host, the layout gate will surface it.
  if (existingErr) redirect("/host");

  // Fully completed → no reason to be here.
  if (existing?.completed_at) redirect("/host");

  // Build initialData from existing row (if re-entering after a skip).
  const initialData: OnboardingInitialData | null = existing
    ? {
        role: existing.role ?? "",
        community_channels: Array.isArray(existing.community_channels)
          ? (existing.community_channels as string[])
          : [],
        event_goal: existing.event_goal ?? "",
        biggest_misconception: existing.biggest_misconception ?? "",
        project_website: existing.project_website ?? "",
        twitter_handle: existing.twitter_handle ?? "",
        content_sources: Array.isArray(existing.content_sources)
          ? (existing.content_sources as string[]).join("\n")
          : "",
        ai_followup_questions: Array.isArray(existing.ai_followup_questions)
          ? (existing.ai_followup_questions as OnboardingInitialData["ai_followup_questions"])
          : [],
        ai_followup_answers: Array.isArray(existing.ai_followup_answers)
          ? (existing.ai_followup_answers as string[])
          : [],
      }
    : null;

  return (
    <div className="min-h-[calc(100dvh-4rem)] flex items-start justify-center py-12 px-4">
      <div className="w-full max-w-2xl">
        <div className="mb-8 text-center">
          <h1 className="font-heading text-3xl font-semibold tracking-tight">
            {existing ? (
              "Pick up where you left off"
            ) : (
              <>
                Let&rsquo;s tune{" "}
                <span className="text-primary">BlockTrivia</span> to{" "}
                <span className="text-primary">your community</span>
              </>
            )}
          </h1>
          <p className="text-sm text-muted-foreground mt-2">
            Takes about 2 minutes. You can skip any step.
          </p>
        </div>
        <OnboardingFlow
          initialData={initialData}
          initialUpdatedAt={existing?.updated_at ?? null}
        />
      </div>
    </div>
  );
}
