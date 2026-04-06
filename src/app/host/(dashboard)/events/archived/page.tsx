import { createServerSupabaseClient } from "@/lib/supabase-server";
import { redirect } from "next/navigation";
import { ArchivedEventList } from "./_components/archived-event-list";

export default async function ArchivedEventsPage() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: events }, { data: profile }] = await Promise.all([
    supabase
      .from("events")
      .select("id, title, status, join_code, created_at")
      .eq("status", "archived")
      .order("created_at", { ascending: false }),
    supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single(),
  ]);

  const isSuperAdmin = profile?.role === "super_admin";

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="font-heading text-2xl font-semibold tracking-tight">Archive</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Archived events are hidden from your dashboard but preserved in the database.
          {isSuperAdmin && " As super admin you can permanently delete them."}
        </p>
      </div>

      <ArchivedEventList events={events ?? []} isSuperAdmin={isSuperAdmin} />
    </div>
  );
}
