"use client";

import { useState, useEffect, useRef } from "react";
import { createClient } from "@/lib/supabase";

export function LivenessChallenge({
  eventId,
  playerId,
  onSuccess,
}: {
  eventId: string;
  playerId: string;
  onSuccess: (reactionTimeMs: number) => void;
}) {
  const supabase = useRef(createClient());
  const [stage, setStage] = useState<"ready" | "waiting" | "complete" | "error">("ready");
  const [reactionTime, setReactionTime] = useState<number | null>(null);
  const [showTarget, setShowTarget] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const startTimeRef = useRef<number | null>(null);

  // Start challenge: show "Get ready" then animate target after 500ms
  useEffect(() => {
    const delayTimeout = setTimeout(() => {
      setStage("waiting");
      setShowTarget(true);
      startTimeRef.current = Date.now();
    }, 500);

    return () => clearTimeout(delayTimeout);
  }, []);

  async function handleTap() {
    if (!startTimeRef.current || stage !== "waiting") return;

    const time = Date.now() - startTimeRef.current;
    setReactionTime(time);
    setShowTarget(false);
    setStage("complete");
    setIsSaving(true);

    try {
      const { error: updateError } = await supabase.current
        .from("event_players")
        .update({
          reaction_time_ms: time,
          liveness_check_passed: true,
          challenged_at: new Date().toISOString(),
        })
        .eq("event_id", eventId)
        .eq("player_id", playerId);

      if (updateError) {
        setError("Failed to save reaction time. Please try again.");
        setIsSaving(false);
        setStage("error");
        return;
      }

      // Delay before proceeding to show success feedback
      await new Promise((resolve) => setTimeout(resolve, 800));
      onSuccess(time);
    } catch (err) {
      setError("Network error. Please try again.");
      setIsSaving(false);
      setStage("error");
    }
  }

  // Keyboard support: Space or Enter to tap
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.code === "Space" || e.code === "Enter") && stage === "waiting") {
        e.preventDefault();
        handleTap();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [stage]);

  return (
    <div className="min-h-dvh bg-background flex flex-col items-center justify-center px-5 gap-6">
      {/* Ready stage */}
      {stage === "ready" && (
        <div className="text-center space-y-3">
          <p className="text-xs font-bold text-primary uppercase tracking-widest">Verification</p>
          <h2 className="font-heading text-2xl font-bold">Get ready...</h2>
          <p className="text-sm text-muted-foreground">We'll test your reaction speed to verify you're human.</p>
        </div>
      )}

      {/* Waiting stage */}
      {stage === "waiting" && (
        <div className="flex flex-col items-center gap-8">
          <div className="text-center space-y-2">
            <h2 className="font-heading text-xl font-bold">Tap the target!</h2>
            <p className="text-sm text-muted-foreground">Click or tap as fast as you can</p>
          </div>

          {/* Pulsing target */}
          {showTarget && (
            <button
              onClick={handleTap}
              className="w-20 h-20 rounded-full bg-primary/20 border-2 border-primary flex items-center justify-center cursor-pointer hover:bg-primary/30 transition-colors focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 focus:ring-offset-background"
              style={{
                animation: "pulse 1s cubic-bezier(0.4, 0, 0.6, 1) infinite",
              }}
              aria-label="Tap to complete liveness check"
            >
              <div className="w-10 h-10 bg-primary rounded-full" />
            </button>
          )}
        </div>
      )}

      {/* Complete stage */}
      {stage === "complete" && (
        <div className="text-center space-y-4">
          <div className="flex justify-center">
            <svg className="w-16 h-16 text-correct" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <div className="space-y-1">
            <h2 className="font-heading text-xl font-bold">Great!</h2>
            <p className="text-sm text-muted-foreground">
              Reaction time: <span className="font-semibold text-foreground">{reactionTime}ms</span>
            </p>
            {isSaving && <p className="text-xs text-muted-foreground">Verifying...</p>}
          </div>
        </div>
      )}

      {/* Error stage */}
      {stage === "error" && (
        <div className="text-center space-y-4 max-w-sm">
          <svg className="w-12 h-12 text-wrong mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
          <div className="space-y-2">
            <h2 className="font-heading text-lg font-bold">Verification Failed</h2>
            <p className="text-sm text-muted-foreground">{error}</p>
          </div>
          <button
            onClick={() => {
              setStage("ready");
              setReactionTime(null);
              setShowTarget(false);
              setError(null);
              startTimeRef.current = null;
            }}
            className="mt-4 px-4 py-2 bg-primary text-primary-foreground font-heading font-medium text-sm rounded-none hover:bg-primary-hover transition-colors"
          >
            Try Again
          </button>
        </div>
      )}

      {/* Pulse animation */}
      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 0.6; transform: scale(1); }
          50% { opacity: 1; transform: scale(1.1); }
        }
      `}</style>
    </div>
  );
}
