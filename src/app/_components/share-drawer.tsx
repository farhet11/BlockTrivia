"use client";

import { useState } from "react";
import { BrandedQR } from "@/app/_components/branded-qr";

export function ShareDrawer({
  joinCode,
  onClose,
}: {
  joinCode: string;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const joinUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}/join/${joinCode}`
      : `/join/${joinCode}`;

  async function copyLink() {
    await navigator.clipboard.writeText(joinUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function nativeShare() {
    if (navigator.share) {
      await navigator.share({
        title: "Join my BlockTrivia game!",
        text: `Use code ${joinCode} to join the game`,
        url: joinUrl,
      });
    } else {
      copyLink();
    }
  }

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-50 bg-foreground/50 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Drawer */}
      <div className="fixed bottom-0 left-0 right-0 z-50 bg-background border-t border-border animate-in slide-in-from-bottom duration-300">
        <div className="max-w-lg mx-auto px-5 pt-6 pb-8 space-y-6">
          {/* Handle */}
          <div className="flex justify-center">
            <div className="w-10 h-1 bg-border rounded-full" />
          </div>

          <h2 className="font-heading text-xl font-bold text-center">
            Invite Players
          </h2>

          {/* QR Code */}
          <div className="flex justify-center">
            <BrandedQR value={joinUrl} size={200} />
          </div>

          {/* Join code */}
          <div className="text-center">
            <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">
              Game Code
            </p>
            <p className="font-mono text-2xl font-bold tracking-[0.2em] text-foreground">
              {joinCode}
            </p>
          </div>

          {/* Action buttons */}
          <div className="flex gap-3">
            <button
              onClick={nativeShare}
              className="flex-1 h-11 bg-primary text-primary-foreground font-medium text-sm hover:bg-primary-hover transition-colors"
            >
              Share Link
            </button>
            <button
              onClick={copyLink}
              className="flex-1 h-11 bg-surface border border-border text-foreground font-medium text-sm hover:bg-background transition-colors"
            >
              {copied ? "Copied!" : "Copy Link"}
            </button>
          </div>

          <button
            onClick={onClose}
            className="w-full text-center text-sm text-muted-foreground hover:text-foreground transition-colors py-1"
          >
            Done
          </button>
        </div>
      </div>
    </>
  );
}
