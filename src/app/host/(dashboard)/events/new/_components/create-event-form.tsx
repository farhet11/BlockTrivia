"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase";
import { Button } from "@/components/ui/button";

type EventFormat = "irl" | "virtual" | "hybrid";

const FORMAT_OPTIONS: { value: EventFormat; label: string; description: string }[] = [
  {
    value: "irl",
    label: "IRL",
    description: "Everyone in the room",
  },
  {
    value: "virtual",
    label: "Virtual",
    description: "Players on Zoom / X Space",
  },
  {
    value: "hybrid",
    label: "Hybrid",
    description: "Mix of both",
  },
];

export function CreateEventForm() {
  const router = useRouter();
  const supabase = createClient();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [format, setFormat] = useState<EventFormat>("hybrid");

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const form = new FormData(e.currentTarget);
    const title = form.get("title") as string;
    const description = form.get("description") as string;

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setError("Not authenticated");
      setLoading(false);
      return;
    }

    const { data, error: insertError } = await supabase
      .from("events")
      .insert({
        title,
        description: description || null,
        format,
        created_by: user.id,
      })
      .select("id")
      .single();

    if (insertError) {
      setError(insertError.message);
      setLoading(false);
      return;
    }

    router.push(`/host/events/${data.id}/questions`);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="space-y-1.5">
        <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
          Event Name
        </label>
        <input
          name="title"
          required
          maxLength={100}
          className="w-full h-11 bg-surface border border-border px-4 text-foreground placeholder:text-muted-foreground/50 focus:ring-1 focus:ring-primary focus:border-primary outline-none transition-colors"
          placeholder="e.g. ETH Denver 2026 — Main Stage Trivia"
        />
      </div>

      <div className="space-y-1.5">
        <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
          Description <span className="text-muted-foreground/50">(optional)</span>
        </label>
        <textarea
          name="description"
          rows={3}
          maxLength={500}
          className="w-full bg-surface border border-border px-4 py-3 text-foreground placeholder:text-muted-foreground/50 focus:ring-1 focus:ring-primary focus:border-primary outline-none transition-colors resize-none"
          placeholder="Brief description of the event"
        />
      </div>

      {/* Event format selector */}
      <div className="space-y-2">
        <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
          Event Format
        </label>
        <div className="grid grid-cols-3 gap-2">
          {FORMAT_OPTIONS.map((opt) => {
            const selected = format === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => setFormat(opt.value)}
                className={`flex flex-col items-center gap-1 py-3.5 px-2 border text-center transition-colors focus:outline-none focus:ring-1 focus:ring-primary ${
                  selected
                    ? "border-primary bg-primary/5 text-foreground"
                    : "border-border bg-surface text-muted-foreground hover:border-primary/50 hover:text-foreground"
                }`}
              >
                <span className={`font-heading font-bold text-sm ${selected ? "text-primary" : ""}`}>
                  {opt.label}
                </span>
                <span className="text-[11px] leading-tight">{opt.description}</span>
              </button>
            );
          })}
        </div>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="flex gap-3">
        <Button
          type="submit"
          disabled={loading}
          className="h-11 px-6 bg-primary text-primary-foreground hover:bg-primary-hover font-medium"
        >
          {loading ? "Creating..." : "Create Event"}
        </Button>
        <Button
          type="button"
          variant="outline"
          className="h-11 px-6"
          onClick={() => window.history.back()}
        >
          Cancel
        </Button>
      </div>
    </form>
  );
}
