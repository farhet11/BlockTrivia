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
