"use client";

import { useState, useRef } from "react";
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
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function handleLogoSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    const allowed = ["image/png", "image/jpeg", "image/svg+xml", "image/webp"];
    if (!allowed.includes(file.type)) {
      setError("Logo: only PNG, JPG, SVG, or WebP allowed.");
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      setError("Logo must be under 2 MB.");
      return;
    }

    setError(null);
    setLogoFile(file);
    setLogoPreview(URL.createObjectURL(file));
  }

  function clearLogo() {
    setLogoFile(null);
    if (logoPreview) URL.revokeObjectURL(logoPreview);
    setLogoPreview(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const form = new FormData(e.currentTarget);
    const title = form.get("title") as string;
    const description = form.get("description") as string;
    const prizes = (form.get("prizes") as string)?.trim() || null;
    const organizerName = (form.get("organizer_name") as string)?.trim() || null;

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
        prizes,
        organizer_name: organizerName,
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

    // Upload logo after event creation (need event ID for storage path)
    if (logoFile && data) {
      const ext = logoFile.name.split(".").pop();
      const path = `event-logos/${data.id}/logo.${ext}`;

      const { error: storageErr } = await supabase.storage
        .from("sponsor-logos")
        .upload(path, logoFile, { upsert: true });

      if (!storageErr) {
        const { data: urlData } = supabase.storage.from("sponsor-logos").getPublicUrl(path);
        await supabase
          .from("events")
          .update({ logo_url: urlData.publicUrl })
          .eq("id", data.id);
      }
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
          Organizer Name <span className="text-muted-foreground/50">(optional)</span>
        </label>
        <input
          name="organizer_name"
          maxLength={60}
          className="w-full h-11 bg-surface border border-border px-4 text-foreground placeholder:text-muted-foreground/50 focus:ring-1 focus:ring-primary focus:border-primary outline-none transition-colors"
          placeholder="e.g. Uniswap, Aave, your project name"
        />
        <p className="text-[11px] text-muted-foreground">
          Shown on the public results page. Defaults to your profile name if left blank.
        </p>
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

      <div className="space-y-1.5">
        <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
          Prizes <span className="text-muted-foreground/50">(optional)</span>
        </label>
        <textarea
          name="prizes"
          rows={2}
          maxLength={300}
          className="w-full bg-surface border border-border px-4 py-3 text-foreground placeholder:text-muted-foreground/50 focus:ring-1 focus:ring-primary focus:border-primary outline-none transition-colors resize-none"
          placeholder="e.g. 500 USDC to top 3, merch for top 10%, whitelist spots"
        />
        <p className="text-[11px] text-muted-foreground">
          Shown to players before they join. Sets expectations for rewards.
        </p>
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

      {/* Event logo upload */}
      <div className="space-y-1.5">
        <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
          Event Logo <span className="text-muted-foreground/50">(optional)</span>
        </label>

        {logoPreview ? (
          <div className="flex items-center gap-4 border border-border bg-surface px-4 py-3">
            <div className="border border-border bg-background p-2 flex-shrink-0">
              <img
                src={logoPreview}
                alt="Logo preview"
                className="h-8 max-w-[120px] object-contain"
              />
            </div>
            <span className="text-sm text-muted-foreground truncate flex-1">{logoFile?.name}</span>
            <button
              type="button"
              onClick={clearLogo}
              className="text-xs text-destructive hover:underline flex-shrink-0"
            >
              Remove
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="w-full border-2 border-dashed border-border hover:border-primary/50 transition-colors py-5 flex flex-col items-center gap-1.5 text-muted-foreground hover:text-foreground"
          >
            <svg className="size-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5m-13.5-9L12 3m0 0 4.5 4.5M12 3v13.5" />
            </svg>
            <span className="text-sm font-medium">Upload logo</span>
            <span className="text-[11px]">PNG, JPG, SVG, WebP · max 2 MB</span>
          </button>
        )}

        <input
          ref={fileInputRef}
          type="file"
          accept="image/png,image/jpeg,image/svg+xml,image/webp"
          className="hidden"
          onChange={handleLogoSelect}
        />
        <p className="text-[11px] text-muted-foreground">
          Your project logo — shown to players in the game header.
        </p>
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
