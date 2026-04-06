"use client";

import { useState } from "react";
import { Link } from "lucide-react";

export function ShareRow({
  event,
  playerCount,
}: {
  event: {
    title: string;
    joinCode: string;
  };
  playerCount: number;
}) {
  const [copied, setCopied] = useState(false);

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://blocktrivia.com";
  const resultUrl = `${siteUrl}/results/${event.joinCode}`;
  const shareText = `🏆 Results from ${event.title}! ${playerCount} players competed. See the leaderboard: ${resultUrl}`;

  function openTwitter() {
    window.open(
      `https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}`,
      "_blank",
      "noopener,noreferrer"
    );
  }

  function openTelegram() {
    window.open(
      `https://t.me/share/url?url=${encodeURIComponent(resultUrl)}&text=${encodeURIComponent(`🏆 Results from ${event.title}! ${playerCount} players competed. See the leaderboard:`)}`,
      "_blank",
      "noopener,noreferrer"
    );
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(resultUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // ignore
    }
  }

  return (
    <div className="flex items-center justify-between">
      <span className="text-sm font-medium text-muted-foreground">Share results</span>
      <div className="flex items-center gap-1">
        {/* X / Twitter */}
        <button
          onClick={openTwitter}
          aria-label="Share on X"
          className="size-9 flex items-center justify-center rounded-full hover:bg-muted transition-colors"
        >
          <svg className="size-4 dark:fill-white fill-[#09090b]" viewBox="0 0 24 24">
            <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.744l7.73-8.835L1.254 2.25H8.08l4.259 5.632zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
          </svg>
        </button>
        {/* Telegram */}
        <button
          onClick={openTelegram}
          aria-label="Share on Telegram"
          className="size-9 flex items-center justify-center rounded-full hover:bg-muted transition-colors"
        >
          <svg className="size-4 fill-[#229ED9]" viewBox="0 0 24 24">
            <path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.894 8.221-1.97 9.28c-.145.658-.537.818-1.084.508l-3-2.21-1.447 1.394c-.16.16-.295.295-.605.295l.213-3.053 5.56-5.023c.242-.213-.054-.333-.373-.12L7.48 13.17l-2.95-.924c-.64-.203-.654-.64.136-.953l11.57-4.461c.537-.194 1.006.131.658.389z" />
          </svg>
        </button>
        {/* Copy link */}
        <button
          onClick={copyLink}
          aria-label="Copy link"
          className="size-9 flex items-center justify-center rounded-full hover:bg-muted transition-colors"
        >
          <Link className="size-4 text-muted-foreground" />
        </button>
        {copied && (
          <span className="text-xs text-primary font-medium ml-1">Copied!</span>
        )}
      </div>
    </div>
  );
}
