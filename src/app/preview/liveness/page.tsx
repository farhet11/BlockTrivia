"use client";

import { useState } from "react";
import { LivenessChallenge } from "@/app/_components/liveness-challenge";

export default function LivenessPreviewPage() {
  const [done, setDone] = useState(false);
  const [reactionTime, setReactionTime] = useState<number | null>(null);

  if (done) {
    return (
      <div className="min-h-dvh bg-background flex flex-col items-center justify-center gap-4 text-center px-5">
        <p className="text-xs font-bold text-primary uppercase tracking-widest">Preview complete</p>
        <h2 className="font-heading text-2xl font-bold">Challenge passed!</h2>
        <p className="text-sm text-muted-foreground">Avg reaction time: {reactionTime}ms</p>
        <button
          onClick={() => { setDone(false); setReactionTime(null); }}
          className="mt-4 h-11 px-6 bg-primary text-primary-foreground font-heading font-medium hover:bg-primary-hover transition-colors"
        >
          Run again
        </button>
      </div>
    );
  }

  return (
    <LivenessChallenge
      eventId="preview"
      playerId="preview"
      onSave={async () => { /* no-op in preview */ }}
      onSuccess={(ms) => { setReactionTime(ms); setDone(true); }}
    />
  );
}
