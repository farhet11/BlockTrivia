"use client";

import { useState, useRef } from "react";
import { usePathname } from "next/navigation";
import { createClient } from "@/lib/supabase";

type FeedbackCategory = "bug" | "feature" | "general" | "question";

const CATEGORIES: { value: FeedbackCategory; label: string; emoji: string }[] = [
  { value: "bug", label: "Bug", emoji: "🐛" },
  { value: "feature", label: "Feature request", emoji: "✨" },
  { value: "question", label: "Question", emoji: "❓" },
  { value: "general", label: "General", emoji: "💬" },
];

export function FeedbackButton() {
  const pathname = usePathname();
  // Hide on host control pages — the HostControlBar occupies the bottom
  // and the feedback button overlaps the Previous slot on mobile.
  const hidden = pathname?.startsWith("/host/game/") ?? false;
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState<FeedbackCategory | null>(null);
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const supabase = useRef(createClient()).current;

  function resetForm() {
    setCategory(null);
    setMessage("");
    setDone(false);
    setSubmitting(false);
    setSubmitError(null);
  }

  async function handleSubmit() {
    if (!message.trim() || !category) return;
    setSubmitting(true);

    let screenshotUrl: string | null = null;

    // Screenshot is best-effort — 5s timeout so it never blocks the submit
    try {
      const html2canvas = (await import("html2canvas")).default;
      const canvas = await Promise.race([
        html2canvas(document.body, { scale: 0.5, useCORS: true, logging: false }),
        new Promise<never>((_, rej) => setTimeout(() => rej(new Error("timeout")), 5000)),
      ]);
      const blob: Blob | null = await new Promise((res) =>
        (canvas as HTMLCanvasElement).toBlob((b) => res(b), "image/jpeg", 0.7)
      );

      if (blob) {
        const filename = `feedback/${Date.now()}.jpg`;
        const { data: uploadData } = await supabase.storage
          .from("feedback-screenshots")
          .upload(filename, blob, { contentType: "image/jpeg" });

        if (uploadData) {
          const { data: { publicUrl } } = supabase.storage
            .from("feedback-screenshots")
            .getPublicUrl(filename);
          screenshotUrl = publicUrl;
        }
      }
    } catch (err) {
      console.warn("Feedback screenshot capture failed:", err);
    }

    const { data: { user } } = await supabase.auth.getUser();

    const { error } = await supabase.from("feedback").insert({
      feedback_category: category,
      message: message.trim(),
      page_url: window.location.href,
      screenshot_url: screenshotUrl,
      player_id: user?.id ?? null,
    });

    setSubmitting(false);
    if (error) {
      console.error("Feedback insert failed:", error);
      setSubmitError(error.message);
    } else {
      setDone(true);
    }
  }

  if (hidden) return null;

  return (
    <>
      {/* Trigger button — bottom-left */}
      <button
        onClick={() => { setOpen(true); resetForm(); }}
        className="fixed bottom-4 left-4 z-50 h-11 w-11 rounded-full bg-surface border border-border flex items-center justify-center text-muted-foreground hover:text-foreground hover:border-primary transition-colors"
        aria-label="Send feedback"
        title="Send feedback"
      >
        <svg className="size-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.129.166 2.27.293 3.423.379.35.026.67.21.865.501L12 21l2.755-4.133a1.14 1.14 0 01.865-.501 48.172 48.172 0 003.423-.379c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0012 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018z" />
        </svg>
      </button>

      {/* Modal overlay */}
      {open && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-background/60 backdrop-blur-sm"
            onClick={() => setOpen(false)}
          />

          {/* Panel */}
          <div className="relative bg-background border border-border w-full max-w-sm mx-4 mb-4 sm:mb-0">
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
              <p className="text-sm font-semibold">Send feedback</p>
              <button
                onClick={() => setOpen(false)}
                className="text-muted-foreground hover:text-foreground transition-colors"
              >
                <svg className="size-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {done ? (
              <div className="px-4 py-8 text-center space-y-3">
                <p className="text-2xl">✓</p>
                <p className="font-semibold">Thanks for the feedback!</p>
                <p className="text-sm text-muted-foreground">We read every submission.</p>
                <button
                  onClick={() => setOpen(false)}
                  className="mt-2 h-11 px-6 bg-primary text-primary-foreground text-sm font-medium hover:bg-primary-hover transition-colors"
                >
                  Done
                </button>
              </div>
            ) : (
              <div className="px-4 py-4 space-y-4">
                {/* Category chips */}
                <div className="flex flex-wrap gap-2">
                  {CATEGORIES.map((c) => (
                    <button
                      key={c.value}
                      onClick={() => setCategory(c.value)}
                      className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border transition-colors ${
                        category === c.value
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-border text-muted-foreground hover:border-foreground"
                      }`}
                    >
                      <span>{c.emoji}</span>
                      {c.label}
                    </button>
                  ))}
                </div>

                {/* Message textarea */}
                <textarea
                  rows={4}
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="What's on your mind?"
                  className="w-full text-sm bg-background border border-border px-3 py-2 text-foreground placeholder:text-muted-foreground/50 outline-none focus:ring-1 focus:ring-primary resize-none"
                />

                {submitError && (
                  <p className="text-xs text-destructive">Failed to send: {submitError}</p>
                )}
                <div className="flex items-center justify-between">
                  <p className="text-xs text-muted-foreground">
                    A screenshot will be attached automatically.
                  </p>
                  <button
                    onClick={handleSubmit}
                    disabled={submitting || !message.trim() || !category}
                    className="h-11 px-5 bg-primary text-primary-foreground text-sm font-medium hover:bg-primary-hover transition-colors disabled:opacity-50"
                  >
                    {submitting ? "Sending..." : "Send"}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
