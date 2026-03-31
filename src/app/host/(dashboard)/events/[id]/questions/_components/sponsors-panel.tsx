"use client";

import { useState, useRef, useMemo } from "react";
import { createClient } from "@/lib/supabase";

type Sponsor = {
  id: string;
  name: string | null;
  logo_url: string;
  sort_order: number;
};

export function SponsorsPanel({
  eventId,
  initialSponsors,
}: {
  eventId: string;
  initialSponsors: Sponsor[];
}) {
  const supabase = useMemo(() => createClient(), []);
  const [sponsors, setSponsors] = useState<Sponsor[]>(initialSponsors);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(initialSponsors.length > 0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (sponsors.length >= 4) { setUploadError("Maximum 4 sponsors allowed."); return; }

    const allowed = ["image/png", "image/jpeg", "image/svg+xml", "image/webp"];
    if (!allowed.includes(file.type)) { setUploadError("Only PNG, JPG, SVG, or WebP files allowed."); return; }
    if (file.size > 2 * 1024 * 1024) { setUploadError("File must be under 2 MB."); return; }

    setUploadError(null);
    setUploading(true);

    const ext = file.name.split(".").pop();
    const path = `${eventId}/${Date.now()}.${ext}`;

    const { error: storageErr } = await supabase.storage
      .from("sponsor-logos")
      .upload(path, file, { upsert: false });

    if (storageErr) { setUploadError(storageErr.message); setUploading(false); return; }

    const { data: urlData } = supabase.storage.from("sponsor-logos").getPublicUrl(path);

    const { data, error: dbErr } = await supabase
      .from("event_sponsors")
      .insert({ event_id: eventId, logo_url: urlData.publicUrl, sort_order: sponsors.length })
      .select()
      .single();

    if (dbErr) { setUploadError(dbErr.message); }
    else if (data) { setSponsors([...sponsors, data as Sponsor]); }

    setUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function deleteSponsor(id: string) {
    const sponsor = sponsors.find((s) => s.id === id);
    if (!sponsor) return;
    const url = new URL(sponsor.logo_url);
    const storagePath = url.pathname.split("/sponsor-logos/")[1];
    if (storagePath) await supabase.storage.from("sponsor-logos").remove([storagePath]);
    await supabase.from("event_sponsors").delete().eq("id", id);
    setSponsors(sponsors.filter((s) => s.id !== id));
  }

  async function updateSponsorName(id: string, name: string) {
    await supabase.from("event_sponsors").update({ name: name || null }).eq("id", id);
    setSponsors(sponsors.map((s) => s.id === id ? { ...s, name: name || null } : s));
  }

  return (
    <div className="border border-border bg-surface">
      {/* Header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-background/50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <svg
            className={`size-3.5 text-muted-foreground transition-transform ${expanded ? "rotate-90" : ""}`}
            fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          </svg>
          <span className="text-sm font-medium">Sponsors</span>
          <span className="text-xs text-muted-foreground">{sponsors.length}/4</span>
          {sponsors.length > 0 && (
            <span className="text-xs text-muted-foreground">· shown grayscale on all player screens</span>
          )}
        </div>
        {sponsors.length === 0 && (
          <span className="text-xs text-muted-foreground">Optional</span>
        )}
      </button>

      {expanded && (
        <div className="px-4 pb-4 pt-1 space-y-3 border-t border-border">
          {/* Existing logos */}
          {sponsors.length > 0 && (
            <div className="space-y-2">
              {sponsors.sort((a, b) => a.sort_order - b.sort_order).map((s) => (
                <div key={s.id} className="flex items-center gap-3 border border-border bg-background p-3">
                  <img
                    src={s.logo_url}
                    alt={s.name ?? "Sponsor"}
                    className="h-8 w-16 object-contain grayscale opacity-60 shrink-0"
                  />
                  <input
                    defaultValue={s.name ?? ""}
                    onBlur={(e) => updateSponsorName(s.id, e.target.value)}
                    placeholder="Sponsor name (optional)"
                    className="flex-1 text-sm bg-transparent outline-none text-foreground placeholder:text-muted-foreground/50 min-w-0"
                  />
                  <button
                    onClick={() => deleteSponsor(s.id)}
                    className="text-muted-foreground hover:text-destructive transition-colors shrink-0"
                  >
                    <svg className="size-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Upload slot */}
          {sponsors.length < 4 && (
            <div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/svg+xml,image/webp"
                onChange={handleFileUpload}
                className="hidden"
                id="sponsor-upload"
              />
              <label
                htmlFor="sponsor-upload"
                className={`flex items-center justify-center gap-2 w-full h-10 border border-dashed border-border text-sm text-muted-foreground hover:text-foreground hover:border-primary transition-colors cursor-pointer ${uploading ? "opacity-50 pointer-events-none" : ""}`}
              >
                {uploading ? "Uploading..." : "+ Add Sponsor Logo"}
              </label>
              <p className="text-xs text-muted-foreground mt-1.5">
                PNG, JPG, SVG or WebP · Max 2 MB · Wide/landscape logos work best
              </p>
            </div>
          )}

          {uploadError && <p className="text-xs text-destructive">{uploadError}</p>}
        </div>
      )}
    </div>
  );
}
