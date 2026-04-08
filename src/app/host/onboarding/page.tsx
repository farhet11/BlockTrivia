import { createServerSupabaseClient } from "@/lib/supabase-server";
import { redirect } from "next/navigation";
import { OnboardingFlow } from "./_components/onboarding-flow";

/**
 * MindScan Layer 0 — host onboarding.
 *
 * Lives OUTSIDE the `(dashboard)` route group so it doesn't inherit the
 * dashboard layout's onboarding redirect — otherwise we'd infinite-loop.
 * Auth still comes from the parent `src/app/host/layout.tsx`.
 */
export default async function HostOnboardingPage() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Parent host/layout.tsx already redirects to /login on missing user,
  // but double-check here so we never render to an anonymous visitor.
  if (!user) redirect("/login");

  // Already onboarded? Send to the dashboard.
  const { data: existing, error: existingErr } = await supabase
    .from("host_onboarding")
    .select("id")
    .eq("profile_id", user.id)
    .maybeSingle();

  // If DB is flaky (error but not "no row"), redirect to /host.
  // The dashboard layout's onboarding gate will surface the DB error properly
  // rather than letting the user see the form (which could stomp their data on submit).
  if (existingErr || existing) redirect("/host");

  return (
    <div className="min-h-[calc(100dvh-4rem)] flex items-start justify-center py-12 px-4">
      <div className="w-full max-w-2xl">
        <div className="mb-8 text-center">
          <h1 className="font-heading text-3xl font-semibold tracking-tight">
            Let&rsquo;s tune BlockTrivia to your community
          </h1>
          <p className="text-sm text-muted-foreground mt-2">
            Takes about 2 minutes. You can skip any step.
          </p>
        </div>
        <OnboardingFlow />
      </div>
    </div>
  );
}
