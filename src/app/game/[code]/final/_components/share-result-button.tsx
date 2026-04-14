"use client";

import { useState } from "react";
import { Send, Link2, Check } from "lucide-react";

const ICON_CLASS = "text-stone-500 dark:text-zinc-400";

export function ShareResultButton({
  event,
  myEntry,
  totalPlayers,
}: {
  event: {
    id: string;
    title: string;
    joinCode: string;
    twitter_handle: string | null;
    hashtags: string[] | null;
  };
  myEntry: {
    rank: number;
    total_score: number;
    accuracy: number;
    correct_count: number;
    total_questions: number;
    is_top_10_pct: boolean;
  };
  totalPlayers: number;
}) {
  const [copied, setCopied] = useState(false);

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://blocktrivia.com";
  const resultUrl = `${siteUrl}/results/${event.joinCode}`;
  const btTwitter = process.env.NEXT_PUBLIC_BLOCKTRIVIA_TWITTER;

  const hashtagStr = ["BlockTrivia", ...(event.hashtags ?? [])]
    .map((h) => `#${h}`)
    .join(" ");
  const handleStr = event.twitter_handle ? ` @${event.twitter_handle}` : "";
  const btStr = btTwitter ? ` @${btTwitter}` : "";
  const tweetText = `I ranked #${myEntry.rank} of ${totalPlayers} in ${event.title} 🧠 Score: ${myEntry.total_score}pts | ${Math.round(Number(myEntry.accuracy))}% accuracy${handleStr}${btStr} ${hashtagStr}`;

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

  async function copyLink() {
    await navigator.clipboard.writeText(`${tweetText} ${resultUrl}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div>
      <p className="text-[11px] font-medium uppercase tracking-[0.5px] text-stone-500 dark:text-zinc-400 text-center mb-2">
        Share Your Result
      </p>
      <div className="grid grid-cols-3 gap-3">
        <button
          onClick={openTwitter}
          className="h-12 border border-border text-sm font-heading font-medium flex items-center justify-center gap-2 hover:bg-accent transition-colors duration-150"
        >
          <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" className={ICON_CLASS} aria-hidden="true">
            <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.744l7.737-8.835L1.254 2.25H8.08l4.259 5.63L18.244 2.25zm-1.161 17.52h1.833L7.084 4.126H5.117L17.083 19.77z" />
          </svg>
          X Post
        </button>
        <button
          onClick={openTelegram}
          className="h-12 border border-border text-sm font-heading font-medium flex items-center justify-center gap-2 hover:bg-accent transition-colors duration-150"
        >
          <Send size={16} strokeWidth={2.5} className={ICON_CLASS} />
          Telegram
        </button>
        <button
          onClick={copyLink}
          className="h-12 border border-border text-sm font-heading font-medium text-primary flex items-center justify-center gap-2 hover:bg-primary/5 hover:border-primary transition-colors duration-150"
        >
          {copied ? (
            <>
              <Check size={16} strokeWidth={2.5} />
              Copied
            </>
          ) : (
            <>
              <Link2 size={16} strokeWidth={2.5} className={ICON_CLASS} />
              Copy Link
            </>
          )}
        </button>
      </div>
    </div>
  );
}
