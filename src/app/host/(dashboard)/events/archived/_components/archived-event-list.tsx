"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase";
import { ArchiveRestore, Trash2 } from "lucide-react";

type Event = {
  id: string;
  title: string;
  status: string;
  join_code: string;
  created_at: string;
};

export function ArchivedEventList({
  events: initialEvents,
  isSuperAdmin,
}: {
  events: Event[];
  isSuperAdmin: boolean;
}) {
  const [events, setEvents] = useState(initialEvents);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [loading, setLoading] = useState<string | null>(null);
  const router = useRouter();
  const supabase = createClient();

  async function handleUnarchive(id: string) {
    setLoading(id);
    const { error } = await supabase
      .from("events")
      .update({ status: "draft" })
      .eq("id", id);
    if (!error) {
      setEvents((prev) => prev.filter((e) => e.id !== id));
      router.refresh();
    }
    setLoading(null);
  }

  async function handleDelete(id: string) {
    setLoading(id);
    const { error } = await supabase
      .from("events")
      .delete()
      .eq("id", id);
    if (!error) {
      setEvents((prev) => prev.filter((e) => e.id !== id));
    }
    setConfirmDeleteId(null);
    setLoading(null);
  }

  if (events.length === 0) {
    return (
      <div className="border border-border bg-surface rounded-lg p-10 text-center space-y-2">
        <p className="text-sm font-medium text-foreground">No archived events</p>
        <p className="text-xs text-muted-foreground">
          Events you archive from your dashboard will appear here.
        </p>
      </div>
    );
  }

  return (
    <div className="border border-border rounded-lg divide-y divide-border overflow-hidden">
      {events.map((event) => {
        const isDeleting = confirmDeleteId === event.id;
        const busy = loading === event.id;
        const date = new Date(event.created_at).toLocaleDateString("en-GB", {
          day: "numeric", month: "short", year: "numeric",
        });

        if (isDeleting) {
          return (
            <div key={event.id} className="bg-destructive/5 border-l-4 border-destructive p-4 flex items-center justify-between gap-4">
              <div className="min-w-0">
                <p className="text-sm font-medium text-foreground truncate">{event.title}</p>
                <p className="text-xs text-destructive mt-0.5 font-medium">
                  This will permanently delete all rounds, questions, responses, and leaderboard data. Cannot be undone.
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={() => setConfirmDeleteId(null)}
                  className="h-8 px-3 text-xs font-medium border border-border rounded text-foreground hover:bg-muted transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={() => handleDelete(event.id)}
                  disabled={busy}
                  className="h-8 px-3 text-xs font-medium bg-destructive text-white rounded hover:bg-destructive/90 transition-colors disabled:opacity-50"
                >
                  {busy ? "Deleting…" : "Yes, delete"}
                </button>
              </div>
            </div>
          );
        }

        return (
          <div key={event.id} className="bg-surface px-4 py-3 flex items-center justify-between gap-4">
            <div className="min-w-0">
              <p className="text-sm font-medium text-foreground truncate">{event.title}</p>
              <p className="text-xs text-muted-foreground mt-0.5">Archived · Created {date}</p>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <button
                onClick={() => handleUnarchive(event.id)}
                disabled={busy}
                className="flex items-center gap-1.5 h-8 px-3 text-xs font-medium border border-border rounded text-foreground hover:bg-muted transition-colors disabled:opacity-50"
                title="Restore to drafts"
              >
                <ArchiveRestore size={13} strokeWidth={2.5} />
                Restore
              </button>
              {isSuperAdmin && (
                <button
                  onClick={() => setConfirmDeleteId(event.id)}
                  disabled={busy}
                  className="flex items-center gap-1.5 h-8 px-3 text-xs font-medium border border-destructive/30 rounded text-destructive hover:bg-destructive/5 transition-colors disabled:opacity-50"
                  title="Permanently delete"
                >
                  <Trash2 size={13} strokeWidth={2.5} />
                  Delete
                </button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
