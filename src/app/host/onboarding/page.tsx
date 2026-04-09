import { createServerSupabaseClient } from "@/lib/supabase-server";
import { redirect } from "next/navigation";
import { AppHeader } from "@/app/_components/app-header";
import { OnboardingFlow } from "./_components/onboarding-flow";
import type { OnboardingInitialData } from "./_components/onboarding-flow";
import { coerceFollowupAnswers } from "@/lib/mindscan/types";

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

  const [{ data: existing, error: existingErr }, { data: profile }] = await Promise.all([
    supabase
      .from("host_onboarding")
      .select(
        "completed_at, role, community_channels, event_goal, biggest_misconception, project_website, twitter_handle, content_sources, ai_followup_questions, ai_followup_answers, linked_project_name, linked_rootdata_id, linked_project_logo, updated_at"
      )
      .eq("profile_id", user.id)
      .maybeSingle(),
    supabase
      .from("profiles")
      .select("display_name, email, avatar_url")
      .eq("id", user.id)
      .single(),
  ]);

  // DB error — redirect to /host, the layout gate will surface it.
  if (existingErr) redirect("/host");

  // Fully completed → no reason to be here.
  if (existing?.completed_at) redirect("/host");

  const displayName =
    profile?.display_name ||
    (user.user_metadata?.name as string | undefined) ||
    user.email?.split("@")[0] ||
    "Host";
  const avatarUrl =
    profile?.avatar_url ??
    (user.user_metadata?.avatar_url as string | null | undefined) ??
    null;

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
        // coerceFollowupAnswers handles legacy string[] rows + pads to question length
        ai_followup_answers: coerceFollowupAnswers(
          existing.ai_followup_answers,
          Array.isArray(existing.ai_followup_questions)
            ? (existing.ai_followup_questions as unknown[]).length
            : 0
        ),
        linked_project_name: existing.linked_project_name ?? "",
        linked_rootdata_id: existing.linked_rootdata_id ?? "",
        linked_project_logo: existing.linked_project_logo ?? "",
      }
    : null;

  return (
    <div className="min-h-dvh bg-background flex flex-col">
      <div className="fixed top-0 left-0 right-0 z-50 bg-background">
        <AppHeader
          user={{ id: user.id, displayName, email: user.email ?? "" }}
          avatarUrl={avatarUrl}
          logoHref="/host"
          isHost
          fullWidth
        />
      </div>

      <div className="flex-1 flex items-start justify-center pt-20 pb-12 px-4">
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
    </div>
  );
}
