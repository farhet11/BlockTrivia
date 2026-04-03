import { createServerSupabaseClient } from "@/lib/supabase-server";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { EventList } from "./_components/event-list";

export default async function HostDashboard() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: events } = await supabase
    .from("events")
    .select("id, title, status, join_code, created_at")
    .eq("created_by", user!.id)
    .order("created_at", { ascending: false });

  const displayName = user!.email?.split("@")[0] || user!.user_metadata?.name || "Host";

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-heading text-2xl font-semibold tracking-tight">
            Welcome back, <span className="text-primary">{displayName}</span>
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Create and manage trivia events for your community.
          </p>
        </div>
        <Link href="/host/events/new">
          <Button className="h-11 px-5 bg-primary text-primary-foreground hover:bg-primary-hover font-medium">
            Create Event
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
