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
}: {
  eventId: string;
  playerId: string;
  onSuccess: (reactionTimeMs: number) => void;
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
              Quick check
            </p>
            <h2 className="font-heading text-2xl font-bold">
              Tap 3 targets
            </h2>
            <p className="text-sm text-muted-foreground leading-relaxed">
              They'll appear one at a time in different spots. Tap each one
              before the ring runs out.
            </p>
          </div>
          <button
            onClick={startChallenge}
            className="h-12 px-8 bg-primary text-primary-foreground font-heading font-medium hover:bg-primary-hover transition-colors"
          >
            I'm ready
          </button>
        </>
      )}

      {/* ── PLAYING ────────────────────────────────────────── */}
      {phase === "playing" && (
        <>
          <div className="text-center space-y-1">
            <p className="text-xs font-bold text-primary uppercase tracking-widest">
              Target {current + 1} of {NUM_TARGETS}
            </p>
            <h2 className="font-heading text-xl font-bold">Tap it!</h2>
          </div>

          {/* Arena — fixed-height container, targets positioned within */}
          <div
            className="relative w-full max-w-xs"
            style={{ height: 280 }}
          >
            {positions[current] && (
              <button
                // key remounts the element when current changes, restarting the CSS animation
                key={current}
                onClick={handleTap}
                style={{
                  position: "absolute",
                  width: TARGET_SIZE,
                  height: TARGET_SIZE,
                  ...positions[current],
                }}
                className="rounded-full flex items-center justify-center focus:outline-none group"
                aria-label={`Tap target ${current + 1}`}
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
                  {/* Track */}
                  <circle
                    cx={TARGET_SIZE / 2}
                    cy={TARGET_SIZE / 2}
                    r={RING_R}
                    fill="none"
                    stroke="var(--color-border)"
                    strokeWidth={4}
                  />
                  {/* Timer arc */}
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

                {/* Tap dot */}
                <div className="w-11 h-11 rounded-full bg-primary group-hover:scale-110 transition-transform" />
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
          <span className="text-5xl leading-none">⏱</span>
          <div className="space-y-2">
            <h2 className="font-heading text-xl font-bold">
              Too slow on target {current + 1}
            </h2>
            <p className="text-sm text-muted-foreground">
              You have {TARGET_WINDOW_MS / 1000}s to tap each target. Give it
              another go.
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

      {/* ── SAVING / DONE ──────────────────────────────────── */}
      {(phase === "saving" || phase === "done") && (
        <div className="text-center space-y-4">
          <svg
            className="w-16 h-16 text-correct mx-auto"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M5 13l4 4L19 7"
            />
          </svg>
          <div className="space-y-1">
            <h2 className="font-heading text-xl font-bold">You're in!</h2>
            <p className="text-sm text-muted-foreground">
              Heading to the lobby…
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

      {/* Ring drain animation */}
      <style>{`
        @keyframes liveness-drain {
          from { stroke-dashoffset: 0; }
          to   { stroke-dashoffset: ${RING_CIRC}; }
        }
      `}</style>
    </div>
  );
}
