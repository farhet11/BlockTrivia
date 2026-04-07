"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase";
import { Pencil, Copy, Archive, FileText } from "lucide-react";

type Event = {
  id: string;
  title: string;
  status: string;
  join_code: string;
  created_at: string;
};

function StatusPill({ status }: { status: string }) {
  const styles: Record<string, string> = {
    draft: "bg-stone-500/10 text-stone-500 dark:bg-zinc-400/10 dark:text-zinc-400",
    lobby: "bg-violet-500/10 text-violet-600 dark:text-violet-400",
    active: "bg-green-500/10 text-green-600 dark:text-green-400",
    paused: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
    ended: "bg-stone-400/10 text-stone-400 dark:bg-zinc-500/10 dark:text-zinc-500",
  };

  return (
    <span
      className={`text-xs font-medium px-2 py-0.5 rounded-full ${styles[status] ?? styles.draft}`}
    >
      {status}
    </span>
  );
}

const ACTION_ICON = { size: 16, strokeWidth: 2 } as const;

export function EventList({ events: initialEvents }: { events: Event[] }) {
  const [events, setEvents] = useState(initialEvents);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [archiving, setArchiving] = useState(false);
  const [duplicating, setDuplicating] = useState<string | null>(null);
  const router = useRouter();
  const supabase = createClient();

  async function handleArchive(id: string) {
    setArchiving(true);
    const { error } = await supabase
      .from("events")
      .update({ status: "archived" })
      .eq("id", id);
    if (!error) {
      setEvents((prev) => prev.filter((e) => e.id !== id));
    }
    setConfirmId(null);
    setArchiving(false);
  }

  async function handleDuplicate(event: Event) {
    setDuplicating(event.id);
    router.push(`/host/events/new?from=${event.id}`);
    setDuplicating(null);
  }

  const activeStatuses = ["draft", "lobby", "active", "paused"];
  const visibleEvents = events.filter((e) => e.status !== "archived");
  const activeEvents = visibleEvents.filter((e) => activeStatuses.includes(e.status));
  const endedEvents = visibleEvents.filter((e) => e.status === "ended");

  function renderCard(event: Event) {
    const isEnded = event.status === "ended";
    const editHref = `/host/events/${event.id}/questions`;
    const summaryHref = `/host/game/${event.join_code}/summary`;

    if (confirmId === event.id) {
      return (
        <div key={event.id} className="border border-border bg-surface rounded-lg">
          <div className="p-4 space-y-2">
            <p className="text-sm text-muted-foreground">
              Archive <span className="font-medium text-foreground">{event.title}</span>?
              {event.status === "active" && (
                <span className="text-[#ef4444] font-medium"> Game is live.</span>
              )}
            </p>
            <p className="text-xs text-muted-foreground">It will be hidden from your dashboard.</p>
          </div>
          <div className="border-t border-border px-4 py-2.5 flex items-center justify-end gap-2">
            <button
              onClick={() => setConfirmId(null)}
              disabled={archiving}
              className="text-sm text-stone-500 dark:text-zinc-400 hover:text-foreground transition-colors px-3 py-1.5"
            >
              Cancel
            </button>
            <button
              onClick={() => handleArchive(event.id)}
              disabled={archiving}
              className="text-sm text-[#ef4444] font-medium hover:text-[#dc2626] transition-colors px-3 py-1.5"
            >
              {archiving ? "Archiving..." : "Archive"}
            </button>
          </div>
        </div>
      );
    }

    return (
      <div key={event.id} className="border border-border bg-surface rounded-lg">
        {/* Zone 1: Content */}
        <Link
          href={isEnded ? summaryHref : editHref}
          className="block p-4 hover:bg-[#f5f3ef] dark:hover:bg-[#1f1f23] transition-colors rounded-t-lg"
        >
          <h2 className="font-medium text-foreground text-[16px] leading-snug">
            {event.title}
          </h2>
          <p className="text-[13px] text-stone-500 dark:text-zinc-400 mt-1 flex items-center gap-1.5 flex-wrap">
            <span className="font-mono font-medium tracking-wider text-foreground">{event.join_code}</span>
            <span className="text-stone-300 dark:text-zinc-600">·</span>
            <span>{new Date(event.created_at).toLocaleDateString()}</span>
            <span className="text-stone-300 dark:text-zinc-600">·</span>
            <StatusPill status={event.status} />
          </p>
        </Link>

        {/* Zone 2: Action bar */}
        <div className="border-t border-border bg-[#f5f3ef]/50 dark:bg-[#1a1a1e] px-4 py-2.5 flex items-center justify-between rounded-b-lg">
          {isEnded ? (
            <Link
              href={summaryHref}
              className="flex items-center gap-1.5 text-stone-500 dark:text-zinc-400 hover:text-primary transition-colors px-2 py-1"
            >
              <FileText {...ACTION_ICON} />
              <span className="hidden sm:inline text-xs font-medium">Summary</span>
            </Link>
          ) : (
            <Link
              href={editHref}
              className="flex items-center gap-1.5 text-stone-500 dark:text-zinc-400 hover:text-primary transition-colors px-2 py-1"
            >
              <Pencil {...ACTION_ICON} />
              <span className="hidden sm:inline text-xs font-medium">Edit</span>
            </Link>
          )}

          <button
            onClick={() => handleDuplicate(event)}
            disabled={duplicating === event.id}
            className="flex items-center gap-1.5 text-stone-500 dark:text-zinc-400 hover:text-primary transition-colors px-2 py-1"
          >
            <Copy {...ACTION_ICON} />
            <span className="hidden sm:inline text-xs font-medium">
              {duplicating === event.id ? "..." : "Duplicate"}
            </span>
          </button>

          <button
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setConfirmId(event.id);
            }}
            className="flex items-center gap-1.5 text-stone-500 dark:text-zinc-400 hover:text-[#ef4444] transition-colors px-2 py-1"
          >
            <Archive {...ACTION_ICON} />
            <span className="hidden sm:inline text-xs font-medium">Archive</span>
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {activeEvents.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Active</h3>
          <div className="space-y-3">{activeEvents.map(renderCard)}</div>
        </div>
      )}
      {endedEvents.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Past Events</h3>
          <div className="space-y-3">{endedEvents.map(renderCard)}</div>
        </div>
      )}
    </div>
  );
}
