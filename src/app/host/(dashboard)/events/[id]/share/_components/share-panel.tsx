"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import { createClient } from "@/lib/supabase";
import { Button } from "@/components/ui/button";

type Sponsor = {
  id: string;
  name: string | null;
  logo_url: string;
  sort_order: number;
};

export function SharePanel({
  eventId,
  joinCode,
  eventTitle,
  initialSponsors,
}: {
  eventId: string;
  joinCode: string;
  eventTitle: string;
  initialSponsors: Sponsor[];
}) {
  const supabase = useMemo(() => createClient(), []);
  const [copied, setCopied] = useState(false);
  const [sponsors, setSponsors] = useState<Sponsor[]>(initialSponsors);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const qrRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const joinUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}/join/${joinCode}`
      : `/join/${joinCode}`;

  useEffect(() => {
    const script = document.createElement("script");
    script.src = "https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/qrcode.min.js";
    script.onload = () => {
      // @ts-expect-error - loaded via CDN
      const qr = qrcode(0, "M");
      qr.addData(joinUrl);
      qr.make();
      if (qrRef.current) {
        qrRef.current.innerHTML = qr.createSvgTag({ cellSize: 6, margin: 0 });
        const svg = qrRef.current.querySelector("svg");
        if (svg) { svg.setAttribute("width", "100%"); svg.setAttribute("height", "100%"); }
      }
    };
    document.head.appendChild(script);
    return () => script.remove();
  }, [joinUrl]);

  async function copyLink() {
    await navigator.clipboard.writeText(joinUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function downloadQR() {
    const svg = qrRef.current?.querySelector("svg");
    if (!svg) return;
    const svgData = new XMLSerializer().serializeToString(svg);
    const blob = new Blob([svgData], { type: "image/svg+xml" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `blocktrivia-${joinCode}.svg`;
    a.click();
    URL.revokeObjectURL(url);
  }

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
    <div className="max-w-md space-y-8">
      {/* Join code */}
      <div className="border border-border bg-surface p-8 text-center space-y-3">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Join Code</p>
        <p className="text-5xl font-heading font-bold tracking-[0.3em] text-foreground">{joinCode}</p>
        <p className="text-sm text-muted-foreground">{eventTitle}</p>
      </div>

      {/* QR Code */}
      <div className="border border-border bg-surface p-8">
        <div ref={qrRef} className="w-48 h-48 mx-auto" />
      </div>

      {/* Shareable link */}
      <div className="flex items-center gap-2">
        <input readOnly value={joinUrl} className="flex-1 h-10 bg-background border border-border px-3 text-sm font-mono text-foreground outline-none" />
        <Button variant="outline" onClick={copyLink} className="h-10 px-4 shrink-0">{copied ? "Copied!" : "Copy"}</Button>
      </div>
      <div className="flex gap-3">
        <Button variant="outline" onClick={downloadQR} className="flex-1">Download QR</Button>
        <Button variant="outline" onClick={copyLink} className="flex-1">Copy Link</Button>
      </div>

      {/* ── Sponsors ── */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Sponsors</p>
            <p className="text-xs text-muted-foreground mt-0.5">Up to 4 logos · shown grayscale during the game</p>
          </div>
          <span className="text-xs text-muted-foreground tabular-nums">{sponsors.length}/4</span>
        </div>

        {sponsors.length > 0 && (
          <div className="space-y-2">
            {sponsors.sort((a, b) => a.sort_order - b.sort_order).map((s) => (
              <div key={s.id} className="flex items-center gap-3 border border-border bg-surface p-3">
                <img src={s.logo_url} alt={s.name ?? "Sponsor"} className="h-8 w-16 object-contain grayscale opacity-60 shrink-0" />
                <input
                  defaultValue={s.name ?? ""}
                  onBlur={(e) => updateSponsorName(s.id, e.target.value)}
                  placeholder="Sponsor name (optional)"
                  className="flex-1 text-sm bg-transparent outline-none text-foreground placeholder:text-muted-foreground/50 min-w-0"
                />
                <button onClick={() => deleteSponsor(s.id)} className="text-muted-foreground hover:text-destructive transition-colors shrink-0">
                  <svg className="size-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            ))}
          </div>
        )}

        {sponsors.length < 4 && (
          <div>
            <input ref={fileInputRef} type="file" accept="image/png,image/jpeg,image/svg+xml,image/webp" onChange={handleFileUpload} className="hidden" id="sponsor-upload" />
            <label htmlFor="sponsor-upload" className={`flex items-center justify-center gap-2 w-full h-10 border border-dashed border-border text-sm text-muted-foreground hover:text-foreground hover:border-primary transition-colors cursor-pointer ${uploading ? "opacity-50 pointer-events-none" : ""}`}>
              {uploading ? "Uploading..." : "+ Add Sponsor Logo"}
            </label>
            <p className="text-xs text-muted-foreground mt-1.5">PNG, JPG, SVG or WebP · Max 2 MB · Wide/landscape logos work best</p>
          </div>
        )}

        {uploadError && <p className="text-xs text-destructive">{uploadError}</p>}
      </div>
    </div>
  );
}
