"use client";

import { useState, useMemo } from "react";
import { createClient } from "@/lib/supabase";

export function SocialPanel({
  eventId,
  eventTitle,
  initialTwitterHandle,
  initialHashtags,
}: {
  eventId: string;
  eventTitle: string;
  initialTwitterHandle: string | null;
  initialHashtags: string[] | null;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [expanded, setExpanded] = useState(!!initialTwitterHandle);
  const [handle, setHandle] = useState(initialTwitterHandle ?? "");
  const [hashtagInput, setHashtagInput] = useState((initialHashtags ?? []).join(", "));
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved">("idle");

  async function save() {
    setSaveStatus("saving");
    const cleanHandle = handle.replace(/^@/, "").trim() || null;
    const parsedHashtags = hashtagInput
      .split(",")
      .map((t) => t.replace(/^#/, "").trim())
      .filter(Boolean);
    await supabase
      .from("events")
      .update({ twitter_handle: cleanHandle, hashtags: parsedHashtags.length ? parsedHashtags : null })
      .eq("id", eventId);
    setSaveStatus("saved");
    setTimeout(() => setSaveStatus("idle"), 2000);
  }

  const previewHandle = handle.replace(/^@/, "").trim();
  const previewHashtags = hashtagInput
    .split(",")
    .map((t) => t.replace(/^#/, "").trim())
    .filter(Boolean);
  const btTwitter = process.env.NEXT_PUBLIC_BLOCKTRIVIA_TWITTER;
  const tweetPreview = [
    `I ranked #3 of 47 in ${eventTitle} 🧠 Score: 891pts | 82% accuracy`,
    previewHandle ? `@${previewHandle}` : "",
    btTwitter ? `@${btTwitter}` : "",
    ["BlockTrivia", ...previewHashtags].map((h) => `#${h}`).join(" "),
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className="border border-border bg-surface">
      <button
        onClick={() => setExpanded((e) => !e)}
        className="w-full flex items-center justify-between p-4 text-left hover:bg-accent transition-colors"
      >
        <div className="flex items-center gap-2">
          <svg className="size-4 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-3l-4 4z" />
          </svg>
          <span className="text-sm font-medium">Social Sharing</span>
          {initialTwitterHandle && (
            <span className="text-xs text-muted-foreground font-mono">@{initialTwitterHandle}</span>
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
        <div className="px-4 pb-4 space-y-4 border-t border-border pt-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Project Twitter / X handle
              </label>
              <div className="flex items-center gap-1.5 border border-border bg-background px-3 h-10">
                <span className="text-muted-foreground">@</span>
                <input
                  type="text"
                  value={handle.replace(/^@/, "")}
                  onChange={(e) => setHandle(e.target.value)}
                  onBlur={save}
                  placeholder="YourProject"
                  className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground/50"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Hashtags (comma-separated)
              </label>
              <input
                type="text"
                value={hashtagInput}
                onChange={(e) => setHashtagInput(e.target.value)}
                onBlur={save}
                placeholder="Ethereum, DeFi, Web3"
                className="w-full border border-border bg-background px-3 h-10 text-sm outline-none placeholder:text-muted-foreground/50 focus:border-primary transition-colors"
              />
            </div>
          </div>

          {/* Tweet preview */}
          <div className="space-y-1.5">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Tweet preview</p>
            <div className="border border-border bg-background/50 p-3 text-sm text-muted-foreground leading-relaxed">
              {tweetPreview || <span className="italic">Fill in the fields above to preview…</span>}
            </div>
            <p className="text-xs text-muted-foreground/60">Rank and score are placeholders — actual values are used when players share.</p>
          </div>

          {saveStatus !== "idle" && (
            <p className="text-xs text-muted-foreground">
              {saveStatus === "saving" ? "Saving…" : "✓ Saved"}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
