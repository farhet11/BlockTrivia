"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { createClient } from "@/lib/supabase";

const TARGET_WINDOW_MS = 3000;
const TARGET_WINDOW_REDUCED = 5000; // prefers-reduced-motion
const NUM_BOTS = 3;
const ARENA = 280;
const BOT_SIZE = 64;
const BOT_PAD = 32;

function randomPos() {
  const range = ARENA - BOT_SIZE - BOT_PAD * 2;
  return {
    x: BOT_PAD + Math.floor(Math.random() * range),
    y: BOT_PAD + Math.floor(Math.random() * range),
  };
}

// ── Rogue Block SVG ────────────────────────────────────────────────────────
type BotFace = "active" | "stunned" | "whacked" | "peeking";

function RogueBot({ face, size = 64 }: { face: BotFace; size?: number }) {
  if (face === "whacked") {
    return (
      <svg width={size} height={size} viewBox="0 0 64 64">
        <g transform="translate(32,32) rotate(-22) translate(-32,-32)">
          <rect x="8" y="8" width="48" height="48" rx="4" fill="#7c3aed" />
          <line x1="20" y1="24" x2="28" y2="32" stroke="#f0ecfe" strokeWidth="2.5" strokeLinecap="round" />
          <line x1="28" y1="24" x2="20" y2="32" stroke="#f0ecfe" strokeWidth="2.5" strokeLinecap="round" />
          <line x1="36" y1="24" x2="44" y2="32" stroke="#f0ecfe" strokeWidth="2.5" strokeLinecap="round" />
          <line x1="44" y1="24" x2="36" y2="32" stroke="#f0ecfe" strokeWidth="2.5" strokeLinecap="round" />
          <path d="M24 42 Q32 38 40 42" fill="none" stroke="#f0ecfe" strokeWidth="2.5" strokeLinecap="round" />
        </g>
      </svg>
    );
  }
  if (face === "stunned") {
    return (
      <svg width={size} height={size} viewBox="0 0 64 64">
        <g transform="translate(32,32) rotate(12) translate(-32,-32)">
          <rect x="8" y="8" width="48" height="48" rx="4" fill="#7c3aed" />
          <circle cx="24" cy="28" r="6" fill="#f0ecfe" />
          <circle cx="40" cy="28" r="6" fill="#f0ecfe" />
          <ellipse cx="32" cy="41" rx="5" ry="4" fill="none" stroke="#f0ecfe" strokeWidth="2.5" />
        </g>
      </svg>
    );
  }
  // active + peeking share the same face (peeking animation applied by parent)
  return (
    <svg width={size} height={size} viewBox="0 0 64 64">
      <g transform="translate(32,32) rotate(12) translate(-32,-32)">
        <rect x="8" y="8" width="48" height="48" rx="4" fill="#7c3aed" />
        <circle cx="24" cy="28" r="4" fill="#f0ecfe" />
        <circle cx="40" cy="28" r="4" fill="#f0ecfe" />
        <circle cx="25" cy="27" r="1.5" fill="#1a1917" />
        <circle cx="41" cy="27" r="1.5" fill="#1a1917" />
        <path d="M22 40 Q32 46 42 40" fill="none" stroke="#f0ecfe" strokeWidth="2.5" strokeLinecap="round" />
      </g>
    </svg>
  );
}

// ── Component ───────────────────────────────────────────────────────────────
export function LivenessChallenge({
  eventId,
  playerId,
  onSuccess,
  onSave,
}: {
  eventId: string;
  playerId: string;
  onSuccess: (reactionTimeMs: number) => void;
  /** Override Supabase save — useful for previews. */
  onSave?: (avg: number) => Promise<void>;
}) {
  const supabase = useRef(createClient());
  const reducedMotion = useRef(false);

  type Phase = "intro" | "playing" | "missed" | "saving" | "done" | "error";
  type BotState = "active" | "stunned" | "whacked" | "escaping";

  const [phase, setPhase] = useState<Phase>("intro");
  const [botState, setBotState] = useState<BotState>("active");
  const [botPos, setBotPos] = useState({ x: 0, y: 0 });
  const [current, setCurrent] = useState(0);
  const [tapTimes, setTapTimes] = useState<number[]>([]);
  const [timerKey, setTimerKey] = useState(0);
  const [timerPaused, setTimerPaused] = useState(false);
  const [percentile, setPercentile] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const targetStartRef = useRef<number>(0);
  const escapeTimerRef = useRef<ReturnType<typeof setTimeout>>();
  const transitionTimerRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    reducedMotion.current =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }, []);

  useEffect(() => () => {
    clearTimeout(escapeTimerRef.current);
    clearTimeout(transitionTimerRef.current);
  }, []);

  // Spawn a fresh bot whenever playing phase advances
  useEffect(() => {
    if (phase !== "playing") return;
    setBotPos(randomPos());
    setBotState("active");
    setTimerPaused(false);
    setTimerKey((k) => k + 1);
    targetStartRef.current = Date.now();
  }, [phase, current]);

  // Escape timer — set per-bot, cleared on tap
  useEffect(() => {
    if (phase !== "playing" || botState !== "active") return;
    const window_ms = reducedMotion.current ? TARGET_WINDOW_REDUCED : TARGET_WINDOW_MS;
    escapeTimerRef.current = setTimeout(() => {
      setBotState("escaping");
      transitionTimerRef.current = setTimeout(() => {
        setPhase("missed");
      }, 300);
    }, window_ms);
    return () => clearTimeout(escapeTimerRef.current);
  }, [phase, botState, timerKey]);

  const handleTap = useCallback(async () => {
    if (phase !== "playing" || botState !== "active") return;
    clearTimeout(escapeTimerRef.current);
    setTimerPaused(true);

    const reactionTime = Date.now() - targetStartRef.current;
    const newTimes = [...tapTimes, reactionTime];

    // Stunned (200ms) → Whacked (visible 500ms) → advance
    setBotState("stunned");
    transitionTimerRef.current = setTimeout(() => {
      setBotState("whacked");
      transitionTimerRef.current = setTimeout(async () => {
        if (current + 1 < NUM_BOTS) {
          setTapTimes(newTimes);
          setCurrent((c) => c + 1);
        } else {
          setTapTimes(newTimes);
          setPhase("saving");
          // Save result
          const avg = Math.round(newTimes.reduce((s, t) => s + t, 0) / newTimes.length);
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

              // Optional percentile from global reaction times
              try {
                const [{ count: total }, { count: faster }] = await Promise.all([
                  supabase.current
                    .from("event_players")
                    .select("*", { count: "exact", head: true })
                    .not("reaction_time_ms", "is", null),
                  supabase.current
                    .from("event_players")
                    .select("*", { count: "exact", head: true })
                    .lt("reaction_time_ms", avg)
                    .not("reaction_time_ms", "is", null),
                ]);
                if (total && total > 10 && faster !== null) {
                  const fasterPct = Math.round((faster / total) * 100);
                  if (fasterPct >= 99) setPercentile("You're in the top 1%!");
                  else if (fasterPct >= 90) setPercentile(`Faster than ${fasterPct}% of players`);
                  else if (fasterPct >= 75) setPercentile(`Faster than ${fasterPct}% of players`);
                  else if (fasterPct >= 50) setPercentile("Faster than most players");
                  // below 50% — omit
                }
              } catch { /* percentile is optional */ }
            }
            setPhase("done");
          } catch {
            setErrorMsg("Couldn't save your result. Please try again.");
            setPhase("error");
          }
        }
      }, 500);
    }, 200);
  }, [phase, botState, tapTimes, current, eventId, playerId, onSave]);

  // Keyboard support
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (
        (e.code === "Space" || e.code === "Enter") &&
        phase === "playing" &&
        botState === "active"
      ) {
        e.preventDefault();
        handleTap();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [phase, botState, handleTap]);

  function startChallenge() {
    clearTimeout(escapeTimerRef.current);
    clearTimeout(transitionTimerRef.current);
    setCurrent(0);
    setTapTimes([]);
    setErrorMsg(null);
    setPercentile(null);
    setPhase("playing");
  }

  const avgReaction =
    tapTimes.length > 0
      ? Math.round(tapTimes.reduce((s, t) => s + t, 0) / tapTimes.length)
      : null;

  const windowMs = reducedMotion.current ? TARGET_WINDOW_REDUCED : TARGET_WINDOW_MS;

  return (
    <div className="min-h-dvh bg-background flex flex-col items-center justify-center px-5 gap-8">

      {/* ── INTRO ──────────────────────────────────────────────────── */}
      {phase === "intro" && (
        <>
          <div style={{ animation: reducedMotion.current ? undefined : "wab-wobble 0.7s ease-in-out infinite" }}>
            <RogueBot face="active" size={64} />
          </div>
          <div className="text-center space-y-3 max-w-xs">
            <p className="text-xs font-bold text-primary uppercase tracking-widest">
              Anti-Bot Check
            </p>
            <h2 className="font-heading text-2xl font-bold">Whack-a-Bot</h2>
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

      {/* ── PLAYING ────────────────────────────────────────────────── */}
      {phase === "playing" && (
        <>
          <div className="text-center space-y-1">
            <p className="text-xs font-bold text-primary uppercase tracking-widest">
              Bot {current + 1} of {NUM_BOTS}
            </p>
            <h2 className="font-heading text-xl font-bold">Whack it!</h2>
          </div>

          {/* Arena — bot floats freely, no ring container */}
          <div className="relative" style={{ width: ARENA, height: ARENA }}>
            <button
              key={`${current}-${timerKey}`}
              onClick={handleTap}
              disabled={botState !== "active"}
              style={{
                position: "absolute",
                left: botPos.x,
                top: botPos.y,
                width: BOT_SIZE,
                height: BOT_SIZE,
                opacity: botState === "whacked" ? 0.3 : 1,
                transform:
                  botState === "escaping"
                    ? "translateX(220px)"
                    : botState === "whacked"
                    ? "translateY(8px)"
                    : undefined,
                transition:
                  botState === "escaping"
                    ? "transform 300ms ease-in, opacity 300ms ease-in"
                    : botState === "whacked"
                    ? "transform 400ms ease-out, opacity 400ms ease-out"
                    : undefined,
              }}
              className="flex items-center justify-center focus:outline-none bg-transparent border-0 p-0 cursor-pointer disabled:cursor-default"
              aria-label="Tap the bot to prove you're human"
            >
              <div
                style={{
                  animation:
                    botState === "active" && !reducedMotion.current
                      ? "wab-wobble 0.7s ease-in-out infinite"
                      : undefined,
                }}
              >
                <RogueBot
                  face={
                    botState === "stunned"
                      ? "stunned"
                      : botState === "whacked"
                      ? "whacked"
                      : "active"
                  }
                  size={BOT_SIZE}
                />
              </div>
            </button>
          </div>

          {/* Timer bar + progress dots */}
          <div className="w-full max-w-xs space-y-3">
            <div className="h-1 w-full bg-border overflow-hidden">
              <div
                key={timerKey}
                style={{
                  height: "100%",
                  animationPlayState: timerPaused ? "paused" : "running",
                  animation: `wab-timer ${windowMs}ms linear forwards`,
                }}
              />
            </div>
            <div className="flex gap-2.5 justify-center">
              {Array.from({ length: NUM_BOTS }).map((_, i) => (
                <span
                  key={i}
                  className={`w-2 h-2 rounded-full transition-colors duration-200 ${
                    i < current
                      ? "bg-correct"
                      : i === current
                      ? "bg-primary"
                      : "bg-border"
                  }`}
                />
              ))}
            </div>
          </div>
        </>
      )}

      {/* ── MISSED ─────────────────────────────────────────────────── */}
      {phase === "missed" && (
        <div className="text-center space-y-6 max-w-xs">
          {/* Bot escaped — it's happy and taunting */}
          <div
            className="flex justify-center"
            style={{ animation: "wab-wobble 0.7s ease-in-out infinite" }}
          >
            <RogueBot face="active" size={64} />
          </div>
          <div className="space-y-2">
            <h2 className="font-heading text-xl font-bold text-wrong">
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

      {/* ── SAVING ─────────────────────────────────────────────────── */}
      {phase === "saving" && (
        <p className="text-sm text-muted-foreground">Checking your humanity…</p>
      )}

      {/* ── DONE ───────────────────────────────────────────────────── */}
      {phase === "done" && (
        <>
          <div style={{ opacity: 0.5 }}>
            <RogueBot face="whacked" size={64} />
          </div>
          <div className="text-center space-y-2 max-w-xs">
            <p className="text-xs font-bold text-primary uppercase tracking-widest">
              Challenge Complete
            </p>
            <h2 className="font-heading text-2xl font-bold text-correct">Challenge passed!</h2>
            {avgReaction !== null && (
              <p className="text-sm text-muted-foreground">
                Avg reaction time: {avgReaction}ms
              </p>
            )}
            {percentile && (
              <p className="text-sm font-medium text-primary">{percentile}</p>
            )}
          </div>
          <button
            onClick={() => onSuccess(avgReaction ?? 0)}
            className="h-12 px-8 bg-primary text-primary-foreground font-heading font-medium hover:bg-primary-hover transition-colors"
          >
            Continue to game
          </button>
        </>
      )}

      {/* ── ERROR ──────────────────────────────────────────────────── */}
      {phase === "error" && (
        <div className="text-center space-y-6 max-w-xs">
          <div
            className="flex justify-center"
            style={{ animation: "wab-wobble 0.7s ease-in-out infinite" }}
          >
            <RogueBot face="active" size={64} />
          </div>
          <div className="space-y-2">
            <h2 className="font-heading text-lg font-bold">Verification failed</h2>
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
        @keyframes wab-wobble {
          0%, 100% { transform: rotate(0deg); }
          25%       { transform: rotate(8deg); }
          75%       { transform: rotate(-8deg); }
        }
        @keyframes wab-peek {
          0%, 100% { transform: translateY(0); }
          50%       { transform: translateY(-6px); }
        }
        @keyframes wab-timer {
          0%    { width: 100%; background-color: #7c3aed; }
          49.9% { background-color: #7c3aed; }
          50%   { width: 50%;  background-color: #f59e0b; }
          79.9% { background-color: #f59e0b; }
          80%   { width: 20%;  background-color: #ef4444; }
          100%  { width: 0%;   background-color: #ef4444; }
        }
      `}</style>
    </div>
  );
}
