import { createServerSupabaseClient } from "@/lib/supabase-server";
import Link from "next/link";
import { Button } from "@/components/ui/button";

type Event = {
  id: string;
  title: string;
  status: string;
  join_code: string;
  created_at: string;
};

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

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-heading text-2xl font-semibold tracking-tight">
            Your Events
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Create and manage trivia events for your community.
          </p>
        </div>
        <Link href="/host/events/new">
          <Button className="h-10 px-5 bg-primary text-primary-foreground hover:bg-primary-hover font-semibold">
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
        <div className="space-y-3">
          {events.map((event: Event) => (
            <Link
              key={event.id}
              href={`/host/events/${event.id}/questions`}
              className="block border border-border bg-surface p-5 hover:bg-accent transition-colors"
            >
              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <h2 className="font-semibold text-foreground">
                    {event.title}
                  </h2>
                  <p className="text-sm text-muted-foreground">
                    Code: <span className="font-mono font-medium tracking-wider">{event.join_code}</span>
                    <span className="mx-2">·</span>
                    {new Date(event.created_at).toLocaleDateString()}
                  </p>
                </div>
                <StatusBadge status={event.status} />
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    draft: "bg-muted text-muted-foreground",
    lobby: "bg-accent-light text-accent-text",
    active: "bg-correct/10 text-correct",
    paused: "bg-timer-warn/10 text-timer-warn",
    ended: "bg-muted text-muted-foreground",
  };

  return (
    <span
      className={`text-xs font-medium px-2.5 py-1 ${styles[status] ?? styles.draft}`}
    >
      {status}
    </span>
  );
}
