"use client";

import Image from "next/image";
import { useState, useRef, useMemo } from "react";
import { createClient } from "@/lib/supabase";

export function EventLogoPanel({
  eventId,
  initialLogoUrl,
}: {
  eventId: string;
  initialLogoUrl: string | null;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [logoUrl, setLogoUrl] = useState<string | null>(initialLogoUrl);
  const [uploading, setUploading] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(!!initialLogoUrl);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    const allowed = ["image/png", "image/jpeg", "image/svg+xml", "image/webp"];
    if (!allowed.includes(file.type)) {
      setError("Only PNG, JPG, SVG, or WebP allowed.");
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      setError("File must be under 2 MB.");
      return;
    }

    setError(null);
    setUploading(true);

    const ext = file.name.split(".").pop();
    const path = `event-logos/${eventId}/logo.${ext}`;

    // Upsert — replaces existing logo file
    const { error: storageErr } = await supabase.storage
      .from("sponsor-logos")
      .upload(path, file, { upsert: true });

    if (storageErr) {
      setError(storageErr.message);
      setUploading(false);
      return;
    }

    const { data: urlData } = supabase.storage.from("sponsor-logos").getPublicUrl(path);
    // Bust cache with a timestamp param so the new image loads immediately
    const publicUrl = `${urlData.publicUrl}?t=${Date.now()}`;

    const { error: dbErr } = await supabase
      .from("events")
      .update({ logo_url: publicUrl })
      .eq("id", eventId);

    if (dbErr) {
      setError(dbErr.message);
    } else {
      setLogoUrl(publicUrl);
    }

    setUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function handleRemove() {
    setRemoving(true);
    await supabase.from("events").update({ logo_url: null }).eq("id", eventId);
    setLogoUrl(null);
    setRemoving(false);
  }

  return (
    <div className="border border-border bg-surface">
      {/* Collapsible header */}
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-accent transition-colors"
      >
        <div className="flex items-center gap-3">
          <span className="font-medium text-sm">Event Logo</span>
          {logoUrl && (
            <span className="text-xs text-correct font-medium">✓ Set</span>
          )}
        </div>
        <svg
          className={`size-4 text-muted-foreground transition-transform ${expanded ? "rotate-180" : ""}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="m19 9-7 7-7-7" />
        </svg>
      </button>

      {expanded && (
        <div className="border-t border-border px-5 py-4 space-y-4">
          <p className="text-xs text-muted-foreground">
            Your project logo — shown to players in the game header alongside the BlockTrivia brand.
          </p>

          {logoUrl ? (
            <div className="flex items-center gap-4">
              <div className="border border-border bg-background p-3 flex-shrink-0">
                <Image
                  src={logoUrl}
                  alt="Event logo"
                  width={160}
                  height={40}
                  unoptimized
                  className="h-10 w-auto max-w-[160px] object-contain"
                />
              </div>
              <div className="flex flex-col gap-2">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                  className="text-xs text-primary hover:underline disabled:opacity-50"
                >
                  {uploading ? "Uploading..." : "Replace"}
                </button>
                <button
                  type="button"
                  onClick={handleRemove}
                  disabled={removing}
                  className="text-xs text-destructive hover:underline disabled:opacity-50"
                >
                  {removing ? "Removing..." : "Remove"}
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="w-full border-2 border-dashed border-border hover:border-primary/50 transition-colors py-6 flex flex-col items-center gap-2 text-muted-foreground hover:text-foreground disabled:opacity-50"
            >
              {uploading ? (
                <span className="text-sm">Uploading...</span>
              ) : (
                <>
                  <svg className="size-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5m-13.5-9L12 3m0 0 4.5 4.5M12 3v13.5" />
                  </svg>
                  <span className="text-sm font-medium">Upload logo</span>
                  <span className="text-xs">PNG, JPG, SVG, WebP · max 2 MB</span>
                </>
              )}
            </button>
          )}

          {error && <p className="text-xs text-destructive">{error}</p>}

          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg,image/svg+xml,image/webp"
            className="hidden"
            onChange={handleUpload}
          />
        </div>
      )}
    </div>
  );
}
