"use client";

import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";

export function SharePanel({
  joinCode,
  eventTitle,
}: {
  joinCode: string;
  eventTitle: string;
}) {
  const [copied, setCopied] = useState(false);
  const qrRef = useRef<HTMLDivElement>(null);

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
    </div>
  );
}
