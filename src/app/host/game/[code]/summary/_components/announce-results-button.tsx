"use client";

import { useEffect, useState } from "react";

export function AnnounceResultsButton({
  event,
  playerCount,
}: {
  event: {
    title: string;
    joinCode: string;
    twitter_handle: string | null;
    hashtags: string[] | null;
  };
  playerCount: number;
}) {
  const [canNativeShare, setCanNativeShare] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setCanNativeShare(typeof navigator !== "undefined" && !!navigator.share);
  }, []);

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://blocktrivia.xyz";
  const resultUrl = `${siteUrl}/results/${event.joinCode}`;
  const btTwitter = process.env.NEXT_PUBLIC_BLOCKTRIVIA_TWITTER;

  const hashtagStr = ["BlockTrivia", ...(event.hashtags ?? [])]
    .map((h) => `#${h}`)
    .join(" ");
  const handleStr = event.twitter_handle ? ` @${event.twitter_handle}` : "";
  const btStr = btTwitter ? ` @${btTwitter}` : "";
  const tweetText = `🏆 Results from ${event.title}! ${playerCount} players competed. See the leaderboard:${handleStr}${btStr} ${hashtagStr}`;

  function openTwitter() {
    window.open(
      `https://twitter.com/intent/tweet?text=${encodeURIComponent(tweetText)}&url=${encodeURIComponent(resultUrl)}`,
      "_blank",
      "noopener,noreferrer"
    );
  }

  function openTelegram() {
    window.open(
      `https://t.me/share/url?url=${encodeURIComponent(resultUrl)}&text=${encodeURIComponent(tweetText)}`,
      "_blank",
      "noopener,noreferrer"
    );
  }

  async function nativeShare() {
    try {
      await navigator.share({
        title: `Results: ${event.title}`,
        text: tweetText,
        url: resultUrl,
      });
    } catch {
      await navigator.clipboard.writeText(`${tweetText} ${resultUrl}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  return (
    <div className="border border-border bg-surface p-4 space-y-3">
      <div className="space-y-0.5">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Announce Results</p>
        <p className="text-xs text-muted-foreground/70 leading-relaxed line-clamp-2">{tweetText}</p>
      </div>
      <div className="flex gap-2">
        {/* Twitter / X */}
        <button
          onClick={openTwitter}
          className="flex items-center gap-1.5 h-9 px-3 bg-[#09090b] text-white text-sm font-medium hover:bg-zinc-800 transition-colors"
        >
          <svg className="size-3.5" viewBox="0 0 24 24" fill="currentColor">
            <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.744l7.73-8.835L1.254 2.25H8.08l4.259 5.632zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
          </svg>
          Post
        </button>
        {/* Telegram */}
        <button
          onClick={openTelegram}
          className="flex items-center gap-1.5 h-9 px-3 bg-[#229ED9] text-white text-sm font-medium hover:bg-[#1a8bbf] transition-colors"
        >
          <svg className="size-3.5" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.894 8.221-1.97 9.28c-.145.658-.537.818-1.084.508l-3-2.21-1.447 1.394c-.16.16-.295.295-.605.295l.213-3.053 5.56-5.023c.242-.213-.054-.333-.373-.12L7.48 13.17l-2.95-.924c-.64-.203-.654-.64.136-.953l11.57-4.461c.537-.194 1.006.131.658.389z" />
          </svg>
          Share
        </button>
        {/* Native share or copy */}
        {canNativeShare ? (
          <button
            onClick={nativeShare}
            className="flex items-center gap-1.5 h-9 px-3 border border-border text-sm font-medium hover:bg-accent transition-colors"
          >
            <svg className="size-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M7.217 10.907a2.25 2.25 0 100 2.186m0-2.186c.18.324.283.696.283 1.093s-.103.77-.283 1.093m0-2.186l9.566-5.314m-9.566 7.5l9.566 5.314m0 0a2.25 2.25 0 103.935 2.186 2.25 2.25 0 00-3.935-2.186zm0-12.814a2.25 2.25 0 103.933-2.185 2.25 2.25 0 00-3.933 2.185z" />
            </svg>
            More
          </button>
        ) : (
          <button
            onClick={async () => {
              await navigator.clipboard.writeText(`${tweetText} ${resultUrl}`);
              setCopied(true);
              setTimeout(() => setCopied(false), 2000);
            }}
            className="flex items-center gap-1.5 h-9 px-3 border border-border text-sm font-medium hover:bg-accent transition-colors"
          >
            {copied ? "✓ Copied" : "Copy"}
          </button>
        )}
      </div>
    </div>
  );
}
