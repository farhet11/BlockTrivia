"use client";

import Image from "next/image";
import { useState, useRef, useMemo } from "react";
import { createClient } from "@/lib/supabase";
import { proxyImageUrl } from "@/lib/image-proxy";

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
  const [previewTheme, setPreviewTheme] = useState<"light" | "dark">("light");
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
            <span className="text-xs text-muted-foreground">· appears grayscale on player screens</span>
          )}
        </div>
        {sponsors.length === 0 && (
          <span className="text-xs text-muted-foreground">Optional</span>
        )}
      </button>

      {expanded && (
        <div className="px-4 pb-4 pt-1 space-y-3 border-t border-border">
          {/* Sample logo card — shown only when no sponsors uploaded yet */}
          {sponsors.length === 0 && (
            <div className="border border-dashed border-border bg-background p-3">
              <div className="flex items-center gap-3">
                <Image
                  src="/logo-light.svg"
                  alt="Sample sponsor logo"
                  width={64}
                  height={32}
                  className="h-8 w-16 object-contain grayscale opacity-50 shrink-0"
                />
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-muted-foreground">
                    Sample — your sponsor&apos;s logo will appear here
                  </p>
                </div>
                <a
                  href="/logo-light.svg"
                  download="sponsor-logo-template.svg"
                  className="text-xs text-primary hover:underline shrink-0 flex items-center gap-1"
                  title="Download as SVG template"
                >
                  <svg className="size-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                  </svg>
                  Download template
                </a>
              </div>
            </div>
          )}

          {/* Existing logos */}
          {sponsors.length > 0 && (
            <div className="space-y-2">
              {sponsors.sort((a, b) => a.sort_order - b.sort_order).map((s) => (
                <div key={s.id} className="flex items-center gap-3 border border-border bg-background p-3">
                  <Image
                    src={proxyImageUrl(s.logo_url)}
                    alt={s.name ?? "Sponsor"}
                    width={64}
                    height={32}
                    unoptimized
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

          {/* Player screen preview — always visible when panel is expanded */}
          <div className="space-y-2">
            {/* Label + Light/Dark toggle */}
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">Player screen preview</span>
              <div className="flex border border-border text-xs">
                <button
                  onClick={() => setPreviewTheme("light")}
                  className={`px-3 py-1 transition-colors ${
                    previewTheme === "light"
                      ? "bg-foreground/[0.08] text-foreground font-medium"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  Light
                </button>
                <button
                  onClick={() => setPreviewTheme("dark")}
                  className={`px-3 py-1 border-l border-border transition-colors ${
                    previewTheme === "dark"
                      ? "bg-foreground/[0.08] text-foreground font-medium"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  Dark
                </button>
              </div>
            </div>

            {/* Preview strip — mirrors SponsorBar exactly */}
            <div
              className="w-full border border-border py-5 px-4"
              style={{ background: previewTheme === "dark" ? "#09090b" : "#faf9f7" }}
            >
              <p
                className="text-center text-xs uppercase tracking-widest mb-3"
                style={{ color: previewTheme === "dark" ? "#71717a" : "#9ca3af" }}
              >
                Today&apos;s sponsors
              </p>
              <div className="flex items-center justify-center gap-6 flex-wrap max-w-lg mx-auto">
                {sponsors.length > 0
                  ? sponsors.sort((a, b) => a.sort_order - b.sort_order).map((s) => (
                      <Image
                        key={s.id}
                        src={proxyImageUrl(s.logo_url)}
                        alt={s.name ?? "Sponsor"}
                        width={120}
                        height={32}
                        unoptimized
                        className={`h-8 w-auto max-w-[120px] object-contain grayscale opacity-60 ${
                          previewTheme === "dark" ? "invert brightness-200" : ""
                        }`}
                      />
                    ))
                  : (
                      <Image
                        src="/logo-light.svg"
                        alt="Sample sponsor logo"
                        width={120}
                        height={32}
                        className={`h-8 w-auto max-w-[120px] object-contain grayscale opacity-60 ${
                          previewTheme === "dark" ? "invert brightness-200" : ""
                        }`}
                      />
                    )
                }
              </div>
            </div>

            <p className="text-xs text-muted-foreground">
              {sponsors.length === 0
                ? "Sample logo shown — replaced automatically when you upload your own."
                : "Logos appear grayscale and muted on player screens. Dark mode inverts the image."}
            </p>
          </div>

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
                PNG, JPG, SVG or WebP · Max 2 MB
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Recommended: 360 × 96 px or larger, 3:1 landscape. SVG is ideal — no sizing limits.
              </p>
            </div>
          )}

          {uploadError && <p className="text-xs text-destructive">{uploadError}</p>}
        </div>
      )}
    </div>
  );
}
