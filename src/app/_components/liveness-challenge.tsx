"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { createClient } from "@/lib/supabase";

const TARGET_SIZE = 72; // px diameter
const TARGET_WINDOW_MS = 3000; // time to tap each target
const NUM_TARGETS = 3;
const RING_R = 34;
const RING_CIRC = 2 * Math.PI * RING_R; // ≈ 213.6

// 6 safe anchor zones within the arena — positions vary so every tap requires looking
const ZONES: React.CSSProperties[] = [
  { top: "8%",  left: "6%" },
  { top: "8%",  right: "6%" },
  { top: "38%", left: "2%" },
  { top: "38%", right: "2%" },
  { bottom: "8%", left: "6%" },
  { bottom: "8%", right: "6%" },
];

function pickPositions(): React.CSSProperties[] {
  return [...ZONES].sort(() => Math.random() - 0.5).slice(0, NUM_TARGETS);
}

export function LivenessChallenge({
  eventId,
  playerId,
  onSuccess,
  onSave,
}: {
  eventId: string;
  playerId: string;
  onSuccess: (reactionTimeMs: number) => void;
  /** Override the default Supabase save. Useful for previews / storybooks. */
  onSave?: (avg: number) => Promise<void>;
}) {
  const supabase = useRef(createClient());

  type Phase = "intro" | "playing" | "missed" | "saving" | "done" | "error";
  const [phase, setPhase] = useState<Phase>("intro");
  const [positions, setPositions] = useState<React.CSSProperties[]>([]);
  const [current, setCurrent] = useState(0);
  const [tapTimes, setTapTimes] = useState<number[]>([]);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const targetStartRef = useRef<number>(0);
  const timerRef = useRef<ReturnType<typeof setTimeout>>();

  function startChallenge() {
    clearTimeout(timerRef.current);
    setPositions(pickPositions());
    setCurrent(0);
    setTapTimes([]);
    setErrorMsg(null);
    targetStartRef.current = Date.now();
    setPhase("playing");
  }

  const handleTap = useCallback(async () => {
    if (phase !== "playing") return;
    clearTimeout(timerRef.current);

    const reactionTime = Date.now() - targetStartRef.current;
    const newTimes = [...tapTimes, reactionTime];

    if (current + 1 < NUM_TARGETS) {
      // Advance to next target
      setTapTimes(newTimes);
      setCurrent((c) => c + 1);
      targetStartRef.current = Date.now();
      // phase stays "playing" — useEffect re-runs because `current` changed
    } else {
      // All 3 tapped — save and proceed
      setTapTimes(newTimes);
      setPhase("saving");

      const avg = Math.round(
        newTimes.reduce((s, t) => s + t, 0) / newTimes.length
      );

      try {
        if (onSave) {
          await onSave(avg);
        } else {
          const { error } = await supabase.current
            .from("event_players")
            .update({
              reaction_time_ms: avg,
              liveness_check_passed: true,
              challenged_at: new Date().toISOString(),
            })
            .eq("event_id", eventId)
            .eq("player_id", playerId);

          if (error) throw error;
        }
        // Only show success AFTER the save confirms — not optimistically
        setPhase("done");
        await new Promise((r) => setTimeout(r, 700));
        onSuccess(avg);
      } catch {
        setErrorMsg("Couldn't save your result. Please try again.");
        setPhase("error");
      }
    }
  }, [phase, tapTimes, current, eventId, playerId, onSuccess]);

  // Per-target expiry timer — resets whenever current target changes
  useEffect(() => {
    if (phase !== "playing") return;
    timerRef.current = setTimeout(() => {
      setPhase("missed");
    }, TARGET_WINDOW_MS);
    return () => clearTimeout(timerRef.current);
  }, [phase, current]);

  // Keyboard support
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.code === "Space" || e.code === "Enter") && phase === "playing") {
        e.preventDefault();
        handleTap();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [phase, handleTap]);

  return (
    <div className="min-h-dvh bg-background flex flex-col items-center justify-center px-5 gap-8">

      {/* ── INTRO ──────────────────────────────────────────── */}
      {phase === "intro" && (
        <>
          <div className="text-center space-y-3 max-w-xs">
            <p className="text-xs font-bold text-primary uppercase tracking-widest">
              Anti-Bot Check
            </p>
            <h2 className="font-heading text-2xl font-bold">
              Whack-a-Bot 🤖
            </h2>
            <p className="text-sm text-muted-foreground leading-relaxed">
              3 bots will try to sneak in. Whack each one before it escapes.
            </p>
          </div>
          <button
            onClick={startChallenge}
            className="h-12 px-8 bg-primary text-primary-foreground font-heading font-medium hover:bg-primary-hover transition-colors"
          >
            Let's go
          </button>
        </>
      )}

      {/* ── PLAYING ────────────────────────────────────────── */}
      {phase === "playing" && (
        <>
          <div className="text-center space-y-1">
            <p className="text-xs font-bold text-primary uppercase tracking-widest">
              Bot {current + 1} of {NUM_TARGETS}
            </p>
            <h2 className="font-heading text-xl font-bold">Whack it!</h2>
          </div>

          {/* Arena */}
          <div
            className="relative w-full max-w-xs"
            style={{ height: 280 }}
          >
            {positions[current] && (
              <button
                key={current}
                onClick={handleTap}
                style={{
                  position: "absolute",
                  width: TARGET_SIZE,
                  height: TARGET_SIZE,
                  ...positions[current],
                }}
                className="rounded-full flex items-center justify-center focus:outline-none group"
                aria-label={`Whack bot ${current + 1}`}
              >
                {/* Draining countdown ring */}
                <svg
                  width={TARGET_SIZE}
                  height={TARGET_SIZE}
                  style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    transform: "rotate(-90deg)",
                  }}
                >
                  <circle
                    cx={TARGET_SIZE / 2}
                    cy={TARGET_SIZE / 2}
                    r={RING_R}
                    fill="none"
                    stroke="var(--color-border)"
                    strokeWidth={4}
                  />
                  <circle
                    cx={TARGET_SIZE / 2}
                    cy={TARGET_SIZE / 2}
                    r={RING_R}
                    fill="none"
                    stroke="#7c3aed"
                    strokeWidth={4}
                    strokeDasharray={RING_CIRC}
                    strokeDashoffset={0}
                    strokeLinecap="round"
                    style={{
                      animation: `liveness-drain ${TARGET_WINDOW_MS}ms linear forwards`,
                    }}
                  />
                </svg>

                {/* Bot emoji */}
                <span
                  className="text-3xl select-none group-hover:scale-110 transition-transform"
                  style={{ animation: "wab-wobble 0.6s ease-in-out infinite" }}
                >
                  🤖
                </span>
              </button>
            )}
          </div>

          {/* Step dots */}
          <div className="flex gap-2.5">
            {Array.from({ length: NUM_TARGETS }).map((_, i) => (
              <span
                key={i}
                className={`w-2.5 h-2.5 rounded-full transition-colors duration-200 ${
                  i < current
                    ? "bg-correct"
                    : i === current
                    ? "bg-primary"
                    : "bg-border"
                }`}
              />
            ))}
          </div>
        </>
      )}

      {/* ── MISSED ─────────────────────────────────────────── */}
      {phase === "missed" && (
        <div className="text-center space-y-6 max-w-xs">
          <span className="text-5xl leading-none">🏃</span>
          <div className="space-y-2">
            <h2 className="font-heading text-xl font-bold">
              Bot {current + 1} escaped!
            </h2>
            <p className="text-sm text-muted-foreground">
              Each bot only sticks around for {TARGET_WINDOW_MS / 1000}s. Be
              quicker next time.
            </p>
          </div>
          <button
            onClick={startChallenge}
            className="w-full h-12 bg-primary text-primary-foreground font-heading font-medium hover:bg-primary-hover transition-colors"
          >
            Try again
          </button>
        </div>
      )}

      {/* ── SAVING ─────────────────────────────────────────── */}
      {phase === "saving" && (
        <div className="text-center space-y-3">
          <span className="text-4xl leading-none">🔍</span>
          <p className="text-sm text-muted-foreground">Checking your humanity…</p>
        </div>
      )}

      {/* ── DONE ───────────────────────────────────────────── */}
      {phase === "done" && (
        <div className="text-center space-y-4">
          <span className="text-5xl leading-none">🎉</span>
          <div className="space-y-1">
            <h2 className="font-heading text-xl font-bold">
              Bots: 0 — You: 3
            </h2>
            <p className="text-sm text-muted-foreground">
              Clearly human. Heading to the lobby…
            </p>
          </div>
        </div>
      )}

      {/* ── ERROR ──────────────────────────────────────────── */}
      {phase === "error" && (
        <div className="text-center space-y-6 max-w-xs">
          <svg
            className="w-12 h-12 text-wrong mx-auto"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
          <div className="space-y-2">
            <h2 className="font-heading text-lg font-bold">
              Verification failed
            </h2>
            <p className="text-sm text-muted-foreground">{errorMsg}</p>
          </div>
          <button
            onClick={startChallenge}
            className="w-full h-12 bg-primary text-primary-foreground font-heading font-medium hover:bg-primary-hover transition-colors"
          >
            Try again
          </button>
        </div>
      )}

      <style>{`
        @keyframes liveness-drain {
          from { stroke-dashoffset: 0; }
          to   { stroke-dashoffset: ${RING_CIRC}; }
        }
        @keyframes wab-wobble {
          0%, 100% { transform: rotate(-8deg) scale(1); }
          50%       { transform: rotate(8deg) scale(1.08); }
        }
      `}</style>
    </div>
  );
}
