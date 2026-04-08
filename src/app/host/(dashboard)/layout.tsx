import { createServerSupabaseClient } from "@/lib/supabase-server";
import { redirect } from "next/navigation";
import { DashboardShell } from "../_components/dashboard-shell";

export default async function HostDashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  // MindScan Layer 0 gate — first-time hosts must complete (or skip) onboarding
  // before they can use the dashboard. `/host/onboarding` lives OUTSIDE this
  // route group, so redirecting here never loops back into this layout.
  //
  // We distinguish "no row" from "table missing" so a missing migration
  // surfaces as a clear error instead of a silent infinite redirect.
  const { data: onboardingRow, error: onboardingErr } = await supabase
    .from("host_onboarding")
    .select("profile_id")
    .eq("profile_id", user.id)
    .maybeSingle();

  if (onboardingErr) {
    if (onboardingErr.code === "42P01") {
      throw new Error(
        "host_onboarding table is missing. Apply migration 034_host_onboarding.sql in Supabase before loading the dashboard."
      );
    }
    // Any other DB error (network, RLS timeout, etc.) — throw rather than
    // silently treating it as "no row", which would bounce the user to
    // onboarding even though they already completed it.
    throw new Error(
      `host_onboarding query failed: ${onboardingErr.message} (code: ${onboardingErr.code})`
    );
  }
  if (!onboardingRow) redirect("/host/onboarding");

  // Fetch profile for sidebar display
  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name, email, avatar_url, role")
    .eq("id", user.id)
    .single();

  const displayName =
    profile?.display_name ||
    user.user_metadata?.name ||
    user.email?.split("@")[0] ||
    "Host";

  const email = profile?.email || user.email || "";

  const avatarUrl =
    profile?.avatar_url ?? (user.user_metadata?.avatar_url as string | null) ?? null;

  return (
    <DashboardShell
      user={{
        id: user.id,
        displayName,
        email,
        avatarUrl,
        role: (profile?.role ?? "host") as "super_admin" | "host" | "player",
      }}
    >
      {children}
    </DashboardShell>
  );
}
