"use client";

import { useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase";

type Event = {
  id: string;
  title: string;
  status: string;
  join_code: string;
  created_at: string;
};

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

export function EventList({ events: initialEvents }: { events: Event[] }) {
  const [events, setEvents] = useState(initialEvents);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const supabase = createClient();

  async function handleDelete(id: string) {
    setDeleting(true);
    const { error } = await supabase.from("events").delete().eq("id", id);
    if (!error) {
      setEvents((prev) => prev.filter((e) => e.id !== id));
    }
    setConfirmId(null);
    setDeleting(false);
  }

  const isDeletable = (_status: string) => true;

  const activeStatuses = ["draft", "lobby", "active", "paused"];
  const activeEvents = events.filter((e) => activeStatuses.includes(e.status));
  const endedEvents = events.filter((e) => e.status === "ended");

  function renderCard(event: Event) {
    const isEnded = event.status === "ended";
    const href = isEnded
      ? `/host/game/${event.join_code}/summary`
      : `/host/events/${event.id}/questions`;

    return (
      <div key={event.id} className="border border-border bg-surface">
        {confirmId === event.id ? (
          <div className="p-5 flex items-center justify-between gap-4">
            <p className="text-sm text-muted-foreground">
              Delete <span className="font-medium text-foreground">{event.title}</span>?{event.status === "active" && <span className="text-destructive font-medium"> Game is live.</span>} This cannot be undone.
            </p>
            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={() => setConfirmId(null)}
                disabled={deleting}
                className="text-sm text-muted-foreground hover:text-foreground transition-colors px-3 py-1.5"
              >
                Cancel
              </button>
              <button
                onClick={() => handleDelete(event.id)}
                disabled={deleting}
                className="text-sm text-destructive hover:text-destructive/80 font-medium transition-colors px-3 py-1.5"
              >
                {deleting ? "Deleting..." : "Delete"}
              </button>
            </div>
          </div>
        ) : (
          <Link
            href={href}
            className="block p-5 hover:bg-accent transition-colors"
          >
            <div className="flex items-center justify-between gap-3">
              <div className="space-y-1 min-w-0">
                <h2 className="font-semibold text-foreground truncate">
                  {event.title}
                </h2>
                <p className="text-sm text-muted-foreground flex items-center gap-1.5 flex-wrap">
                  <span>Code: <span className="font-mono font-medium tracking-wider">{event.join_code}</span></span>
                  <span>·</span>
                  <span>{new Date(event.created_at).toLocaleDateString()}</span>
                  <span>·</span>
                  <StatusBadge status={event.status} />
                  {isEnded && (
                    <span className="text-xs text-primary font-medium">View Summary →</span>
                  )}
                </p>
              </div>
              {isDeletable(event.status) && (
                <button
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setConfirmId(event.id);
                  }}
                  className="p-2 text-muted-foreground hover:text-destructive transition-colors shrink-0"
                  aria-label={`Delete ${event.title}`}
                >
                  <svg className="size-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
                  </svg>
                </button>
              )}
            </div>
          </Link>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {activeEvents.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Active</h3>
          {activeEvents.map(renderCard)}
        </div>
      )}
      {endedEvents.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Past Events</h3>
          {endedEvents.map(renderCard)}
        </div>
      )}
    </div>
  );
}
