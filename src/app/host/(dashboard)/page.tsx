import { createServerSupabaseClient } from "@/lib/supabase-server";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { EventList } from "./_components/event-list";

export default async function HostDashboard() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [{ data: events }, { data: profile }] = await Promise.all([
    supabase
      .from("events")
      .select("id, title, status, join_code, created_at")
      .eq("created_by", user!.id)
      .order("created_at", { ascending: false }),
    supabase
      .from("profiles")
      .select("display_name")
      .eq("id", user!.id)
      .single(),
  ]);

  // Resolve best display name — never show raw tg_ email prefixes
  const rawName = profile?.display_name ?? "";
  const isTgPrefix = rawName.startsWith("tg_") && !rawName.includes(" ");
  const metaName: string =
    user!.user_metadata?.full_name ||
    user!.user_metadata?.name ||
    (user!.user_metadata?.telegram_username
      ? `@${user!.user_metadata.telegram_username}`
      : "");
  const displayName = isTgPrefix
    ? metaName.split(" ")[0] || "Host"
    : rawName.split(" ")[0] || metaName.split(" ")[0] || "Host";

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="font-heading text-2xl font-semibold tracking-tight">
              Welcome back, <span className="text-primary">{displayName}</span>
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Create and manage trivia events for your community.
            </p>
          </div>
          {/* Desktop: inline button */}
          <Link href="/host/events/new" className="hidden md:block">
            <Button className="h-11 px-5 bg-primary text-primary-foreground hover:bg-primary-hover font-medium">
              Create Event
            </Button>
          </Link>
        </div>
        {/* Mobile: full-width CTA below welcome text */}
        <Link href="/host/events/new" className="md:hidden block mt-4">
          <Button className="w-full h-11 bg-primary text-primary-foreground hover:bg-primary-hover font-medium">
            + Create Event
          </Button>
        </Link>
      </div>

      {/* Event list */}
      {!events || events.length === 0 ? (
        <div className="border border-border bg-surface py-16 text-center space-y-3">
          <p className="text-muted-foreground text-lg">No events yet</p>
          <p className="text-muted-foreground text-sm">
            Create your first trivia event to get started.
          </p>
        </div>
      ) : (
        <EventList events={events} />
      )}
    </div>
  );
}
