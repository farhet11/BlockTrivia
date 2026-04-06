"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase";
import { AppHeader } from "@/app/_components/app-header";
import { SponsorBar } from "@/app/_components/sponsor-bar";
import { PlayerAvatar } from "@/app/_components/player-avatar";
import { BlockSpinner } from "@/components/ui/block-spinner";
import type { LbEntry } from "@/app/_components/lb-podium";
import { Check, X } from "lucide-react";

function getHeatEdgeStyle(pct: number, isAnswered: boolean): string {
  if (isAnswered || pct > 0.5) return "none";
  if (pct > 0.2) {
    const intensity = 1 - (pct - 0.2) / 0.3;
    const o1 = (0.25 + intensity * 0.25) * 0.9;
    const o2 = (0.25 + intensity * 0.25) * 0.6;
    const o3 = (0.25 + intensity * 0.25) * 0.35;
    const o4 = (0.25 + intensity * 0.25) * 0.15;
    return [
      `inset 0 0 40px 20px rgba(245,158,11,${o1})`,
      `inset 0 0 100px 50px rgba(245,158,11,${o2})`,
      `inset 0 0 200px 80px rgba(245,158,11,${o3})`,
      `inset 0 0 350px 100px rgba(245,158,11,${o4})`,
    ].join(", ");
  }
  const intensity = 1 - pct / 0.2;
  const r = Math.round(239 + intensity * 16);
  const g = Math.round(68 - intensity * 40);
  const b = Math.round(68 - intensity * 40);
  const o1 = (0.45 + intensity * 0.35) * 0.9;
  const o2 = (0.45 + intensity * 0.35) * 0.6;
  const o3 = (0.45 + intensity * 0.35) * 0.35;
  const o4 = (0.45 + intensity * 0.35) * 0.15;
  return [
    `inset 0 0 40px 20px rgba(${r},${g},${b},${o1})`,
    `inset 0 0 100px 50px rgba(${r},${g},${b},${o2})`,
    `inset 0 0 200px 80px rgba(${r},${g},${b},${o3})`,
    `inset 0 0 350px 100px rgba(${r},${g},${b},${o4})`,
  ].join(", ");
}

function getTimerPhase(pct: number): { color: string; glow: string } {
  if (pct > 0.5) return { color: '#7c3aed', glow: 'rgba(124,58,237,0.5)' };
  if (pct > 0.2) return { color: '#f59e0b', glow: 'rgba(245,158,11,0.5)' };
  return { color: '#ef4444', glow: 'rgba(239,68,68,0.5)' };
}

type Sponsor = {
  id: string;
  name: string | null;
  logo_url: string;
  sort_order: number;
};

type RoundInfo = {
  id: string;
  title: string;
  sort_order: number;
  interstitial_text: string | null;
};

type QuestionData = {
  id: string;
  round_id: string;
  body: string;
  options: string[];
  sort_order: number;
  round_title: string;
  round_type: "mcq" | "true_false" | "wipeout";
  time_limit_seconds: number;
  base_points: number;
  time_bonus_enabled: boolean;
  wipeout_min_leverage: number;
  wipeout_max_leverage: number;
};

type GameState = {
  id: string;
  event_id: string;
  phase: string;
  current_round_id: string | null;
  current_question_id: string | null;
  question_started_at: string | null;
  started_at: string | null;
  ended_at: string | null;
};

type LeaderboardEntry = LbEntry;

export function PlayView({
  event,
  player,
  questions,
  initialGameState,
  sponsors,
  roundsInfo,
}: {
  event: { id: string; title: string; joinCode: string; logoUrl: string | null; logoDarkUrl?: string | null; organizerName?: string | null };
  player: { id: string; displayName: string; email?: string; avatarUrl?: string | null };
  questions: QuestionData[];
  initialGameState: GameState;
  sponsors: Sponsor[];
  roundsInfo: RoundInfo[];
}) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [gameState, setGameState] = useState<GameState>(initialGameState);
  const [answeredQuestionId, setAnsweredQuestionId] = useState<string | null>(null);
  const [selectedAnswer, setSelectedAnswer] = useState<number | null>(null);
  const [leverage, setLeverage] = useState(1.0);
  const [timeLeft, setTimeLeft] = useState<number | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [lastResult, setLastResult] = useState<{
    isCorrect: boolean;
    pointsAwarded: number;
    selectedAnswer: number;
    correctAnswer: number | undefined;
    explanation: string | null;
    didNotAnswer?: boolean;
  } | null>(null);

  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [myLbEntry, setMyLbEntry] = useState<LeaderboardEntry | null>(null);
  const [lbDeltas, setLbDeltas] = useState<Map<string, number | null>>(new Map());
  const prevRanksRef = useRef<Map<string, number>>(new Map());
  const [playerCount, setPlayerCount] = useState<number | null>(null);
  const [interstitialCountdown, setInterstitialCountdown] = useState<number | null>(null);
  const submitLockRef = useRef(false);
  // Ref copy of gameState for use inside polling interval without stale closure
  const gameStateRef = useRef<GameState>(initialGameState);

  const currentQuestion = useMemo(
    () => questions.find((q) => q.id === gameState.current_question_id) ?? null,
    [questions, gameState.current_question_id]
  );
  const hasAnswered = answeredQuestionId === gameState.current_question_id;
  const isTrueFalse = currentQuestion?.round_type === "true_false";
  const isWipeout = currentQuestion?.round_type === "wipeout";
  const optionLabels = isTrueFalse ? ["A", "B"] : ["A", "B", "C", "D"];

  // Progress bar data
  const rounds = useMemo(() => {
    const seen = new Set<string>();
    const result: { id: string; title: string; questions: QuestionData[] }[] = [];
    for (const q of questions) {
      if (!seen.has(q.round_id)) {
        seen.add(q.round_id);
        result.push({ id: q.round_id, title: q.round_title, questions: questions.filter((x) => x.round_id === q.round_id) });
      }
    }
    return result;
  }, [questions]);
  const currentRoundIndex = currentQuestion ? rounds.findIndex((r) => r.id === currentQuestion.round_id) : -1;
  const currentRoundData = currentRoundIndex >= 0 ? rounds[currentRoundIndex] : null;
  const questionsInRound = currentRoundData?.questions ?? [];
  const indexInRound = currentQuestion ? questionsInRound.findIndex((q) => q.id === currentQuestion.id) : -1;

  // Keep ref in sync with state (for use in polling interval)
  useEffect(() => { gameStateRef.current = gameState; }, [gameState]);

  // If already in leaderboard or ended phase on mount, go to leaderboard page
  useEffect(() => {
    if (gameState.phase === "leaderboard" || gameState.phase === "ended") {
      router.replace(`/game/${event.joinCode}/leaderboard`);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Shared handler for any game state update (Realtime or polling)
  function applyGameState(next: GameState) {
    const prev = gameStateRef.current;
    setGameState(next);
    if (next.phase === "playing" && next.current_question_id !== prev.current_question_id) {
      // New question — reset answer state
      setAnsweredQuestionId(null);
      setSelectedAnswer(null);
      setLeverage(1.0);
      setLastResult(null);
      submitLockRef.current = false;
    } else if (next.phase === "ended" || next.phase === "leaderboard") {
      router.push(`/game/${event.joinCode}/leaderboard`);
    }
  }

  // Subscribe to game_state changes via Realtime
  useEffect(() => {
    const channel = supabase
      .channel(`play:${event.id}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "game_state", filter: `event_id=eq.${event.id}` },
        (payload) => applyGameState(payload.new as GameState)
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [supabase, event.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Polling fallback — syncs every 2s if Realtime misses an event
  useEffect(() => {
    const interval = setInterval(async () => {
      const { data } = await supabase
        .from("game_state")
        .select("*")
        .eq("event_id", event.id)
        .single();

      if (!data) return;
      const current = gameStateRef.current;
      if (data.phase !== current.phase || data.current_question_id !== current.current_question_id) {
        applyGameState(data as GameState);
      }
    }, 2000);

    return () => clearInterval(interval);
  }, [supabase, event.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Check if player already answered current question (handles page refresh)
  useEffect(() => {
    if (!gameState.current_question_id) return;
    supabase
      .from("responses")
      .select("selected_answer, is_correct, points_awarded")
      .eq("question_id", gameState.current_question_id)
      .eq("player_id", player.id)
      .maybeSingle()
      .then(({ data }) => {
        if (data) {
          setAnsweredQuestionId(gameState.current_question_id);
          setSelectedAnswer(data.selected_answer);
          // correctAnswer / explanation are not cached client-side (server-only);
          // they will be unavailable after a page refresh — option highlight is suppressed.
          setLastResult({
            isCorrect: data.is_correct,
            pointsAwarded: data.points_awarded,
            selectedAnswer: data.selected_answer,
            correctAnswer: undefined,
            explanation: null,
          });
        }
      });
  }, [gameState.current_question_id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Countdown timer
  useEffect(() => {
    if (gameState.phase !== "playing" || !gameState.question_started_at || !currentQuestion || hasAnswered) {
      setTimeLeft(null);
      return;
    }

    const startedAt = new Date(gameState.question_started_at).getTime();
    const duration = currentQuestion.time_limit_seconds * 1000;
    let interval: ReturnType<typeof setInterval>;

    const tick = () => {
      const remaining = Math.max(0, Math.ceil((startedAt + duration - Date.now()) / 1000));
      setTimeLeft(remaining);
      if (remaining <= 0) clearInterval(interval);
    };

    tick();
    interval = setInterval(tick, 200);
    return () => clearInterval(interval);
  }, [gameState.phase, gameState.question_started_at, currentQuestion, hasAnswered]);

  // When host reveals answer, fetch correct answer for players who didn't submit
  useEffect(() => {
    if (gameState.phase !== "revealing" || hasAnswered || !currentQuestion) return;
    supabase.rpc("get_revealed_answer", { p_event_id: event.id }).then(({ data }) => {
      if (data && !data.error) {
        setLastResult({
          isCorrect: false,
          pointsAwarded: 0,
          selectedAnswer: -1,
          correctAnswer: data.correct_answer,
          explanation: data.explanation ?? null,
          didNotAnswer: true,
        });
      }
    });
  }, [gameState.phase]); // eslint-disable-line react-hooks/exhaustive-deps

  // Interstitial countdown display (mirrors host 8s countdown)
  useEffect(() => {
    if (gameState.phase !== "interstitial") {
      setInterstitialCountdown(null);
      return;
    }
    setInterstitialCountdown(8);
    let count = 8;
    const interval = setInterval(() => {
      count -= 1;
      setInterstitialCountdown(Math.max(0, count));
      if (count <= 0) clearInterval(interval);
    }, 1000);
    return () => clearInterval(interval);
  }, [gameState.phase, gameState.current_round_id]);

  // Load leaderboard when phase is "leaderboard"
  useEffect(() => {
    if (gameState.phase !== "leaderboard") return;

    // Snapshot current ranks for delta computation
    const snapshot = new Map<string, number>();
    leaderboard.forEach((e) => snapshot.set(e.player_id, e.rank));
    const isFirstLoad = prevRanksRef.current.size === 0 && leaderboard.length === 0;

    // Fetch top 10 (with fallback to event_players at 0 pts if no scores yet)
    supabase
      .from("leaderboard_entries")
      .select(`player_id, total_score, rank, profiles!leaderboard_entries_player_id_fkey ( display_name )`)
      .eq("event_id", event.id)
      .order("rank", { ascending: true })
      .limit(10)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .then(async ({ data }) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let entries: LeaderboardEntry[] = (data ?? []).map((row: any) => ({
          player_id: row.player_id,
          display_name: row.profiles?.display_name ?? "Player",
          total_score: row.total_score,
          rank: row.rank,
        }));

        // Fallback: no scores yet — show all joined players at 0 pts
        if (entries.length === 0) {
          const { data: players } = await supabase
            .from("event_players")
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            .select(`player_id, profiles ( display_name )`)
            .eq("event_id", event.id)
            .limit(10);
          if (players) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            entries = players.map((p: any, i: number) => ({
              player_id: p.player_id,
              display_name: p.profiles?.display_name ?? "Player",
              total_score: 0,
              rank: i + 1,
            }));
            // Also set the current player's entry from the fallback list
            const myFallback = entries.find((e) => e.player_id === player.id);
            if (myFallback) setMyLbEntry(myFallback);
          }
        }

        const deltas = new Map<string, number | null>();
        entries.forEach((e) => {
          const prev = isFirstLoad ? undefined : (prevRanksRef.current.get(e.player_id) ?? snapshot.get(e.player_id));
          deltas.set(e.player_id, prev != null ? prev - e.rank : null);
        });
        prevRanksRef.current = new Map(entries.map((e) => [e.player_id, e.rank]));
        setLeaderboard(entries);
        setLbDeltas(deltas);
      });

    // Also fetch current player's own entry (for pinned rank when outside top 10)
    supabase
      .from("leaderboard_entries")
      .select(`player_id, total_score, rank, profiles!leaderboard_entries_player_id_fkey ( display_name )`)
      .eq("event_id", event.id)
      .eq("player_id", player.id)
      .maybeSingle()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .then(({ data }) => {
        if (data) {
          setMyLbEntry({
            player_id: data.player_id,
            display_name: (data as any).profiles?.display_name ?? "Player",
            total_score: data.total_score,
            rank: data.rank,
          });
        }
      });

    supabase
      .from("event_players")
      .select("player_id", { count: "exact", head: true })
      .eq("event_id", event.id)
      .then(({ count }) => { if (count !== null) setPlayerCount(count); });
  }, [gameState.phase, supabase, event.id]); // eslint-disable-line react-hooks/exhaustive-deps

  async function submitAnswer(answerIndex: number) {
    if (!currentQuestion || hasAnswered || submitLockRef.current || !gameState.question_started_at) return;

    // Reject if time has expired client-side
    const startedAt = new Date(gameState.question_started_at).getTime();
    const timeTakenMs = Date.now() - startedAt;
    if (timeTakenMs >= currentQuestion.time_limit_seconds * 1000) return;

    submitLockRef.current = true;

    setSelectedAnswer(answerIndex);
    setIsSubmitting(true);

    try {
      const { data: result, error } = await supabase.rpc("submit_answer", {
        p_event_id: event.id,
        p_question_id: currentQuestion.id,
        p_selected_answer: answerIndex,
        p_time_taken_ms: timeTakenMs,
        p_wipeout_leverage: isWipeout ? leverage : 1.0,
      });

      if (error) {
        console.error("submit_answer RPC error:", error);
        submitLockRef.current = false;
        setSelectedAnswer(null);
        return;
      }

      if (result?.error) {
        console.error("submit_answer returned error:", result.error);
        submitLockRef.current = false;
        setSelectedAnswer(null);
        return;
      }

      setAnsweredQuestionId(currentQuestion.id);
      setLastResult({
        isCorrect: result.is_correct,
        pointsAwarded: result.points_awarded,
        selectedAnswer: answerIndex,
        correctAnswer: result.correct_answer,
        explanation: result.explanation ?? null,
      });
    } catch (err) {
      console.error("submit_answer exception:", err);
      submitLockRef.current = false;
      setSelectedAnswer(null);
    } finally {
      setIsSubmitting(false);
    }
  }

  const phase = gameState.phase;

  // Heat Edge aura
  const heatPct = currentQuestion && timeLeft !== null
    ? timeLeft / currentQuestion.time_limit_seconds
    : 1;
  const isTimedOut = timeLeft === 0;
  const heatEdgeBoxShadow = getHeatEdgeStyle(heatPct, hasAnswered || isTimedOut);
  const isHeatPulsing = heatPct <= 0.2 && heatPct > 0 && phase === "playing" && !hasAnswered && !isTimedOut;

  // ── Interstitial phase ─────────────────────────────────────────────────────
  if (phase === "interstitial") {
    const interstitialRound = roundsInfo.find((r) => r.id === gameState.current_round_id);
    return (
      <div className="min-h-dvh bg-background flex flex-col">
        <AppHeader
          user={{ id: player.id, displayName: player.displayName, email: player.email }}
          avatarUrl={player.avatarUrl}
          right={event.logoUrl ? (
            <img src={event.logoUrl} alt="Event logo" className="h-7 max-w-[110px] object-contain" />
          ) : null}
        />
        <div className="flex-1 flex flex-col items-center justify-center px-5 gap-6">
          <div className="text-center space-y-3 max-w-sm">
            <p className="text-xs font-bold text-primary uppercase tracking-widest">
              Next Round
            </p>
            <h2 className="font-heading text-3xl font-bold">
              {interstitialRound?.title ?? "Next Round"}
            </h2>
            {interstitialRound?.interstitial_text && (
              <p className="text-muted-foreground leading-relaxed">
                {interstitialRound.interstitial_text}
              </p>
            )}
            {interstitialCountdown !== null && (
              <p className="text-sm text-muted-foreground">
                Starting in{" "}
                <span className="font-bold text-foreground tabular-nums">
                  {interstitialCountdown}s
                </span>
              </p>
            )}
          </div>

          {sponsors.length > 0 && (
            <div className="w-full max-w-sm pt-4">
              {/* Full color during interstitial */}
              <div className="w-full border-t border-border/50 bg-background/80 py-2 px-4">
                <div className="flex items-center justify-center gap-6 flex-wrap">
                  {[...sponsors].sort((a, b) => a.sort_order - b.sort_order).map((s) => (
                    <img key={s.id} src={s.logo_url} alt={s.name ?? "Sponsor"}
                      className="h-6 max-w-[100px] object-contain" />
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }


  // ── Paused ─────────────────────────────────────────────────────────────────
  if (phase === "lobby" && gameState.started_at) {
    return (
      <div className="min-h-dvh bg-background flex flex-col">
        <div className="flex-1 flex flex-col items-center justify-center px-5 gap-6">
          <a href="/join">
            <img src="/logo-light.svg" alt="BlockTrivia" className="h-8 dark:hidden" />
            <img src="/logo-dark.svg" alt="BlockTrivia" className="h-8 hidden dark:block" />
          </a>
          <div className="text-center space-y-2">
            <div className="inline-flex items-center gap-2 bg-timer-warn/10 px-4 py-1.5 mb-1">
              <span className="w-2 h-2 rounded-full bg-timer-warn" />
              <span className="text-xs font-bold text-timer-warn uppercase tracking-wider">Game Paused</span>
            </div>
            <h1 className="font-heading text-xl font-bold">{event.title}</h1>
            <p className="text-sm text-muted-foreground">Waiting for the host to resume...</p>
          </div>
        </div>
        <SponsorBar sponsors={sponsors} />
      </div>
    );
  }

  // ── Waiting / lobby ────────────────────────────────────────────────────────
  if (!currentQuestion) {
    return (
      <div className="min-h-dvh bg-background flex flex-col items-center justify-center px-5 gap-6">
        <a href="/join">
          <img src="/logo-light.svg" alt="BlockTrivia" className="h-8 dark:hidden" />
          <img src="/logo-dark.svg" alt="BlockTrivia" className="h-8 hidden dark:block" />
        </a>
        <div className="text-center space-y-2">
          <h1 className="font-heading text-xl font-bold">{event.title}</h1>
          <p className="text-sm text-muted-foreground animate-pulse">Waiting for next question...</p>
        </div>
      </div>
    );
  }

  // ── Question screen ────────────────────────────────────────────────────────
  return (
    <div className="min-h-dvh bg-background flex flex-col">
      {/* Heat Edge urgency aura */}
      <style>{`
        @keyframes heat-pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }
        @media (prefers-reduced-motion: reduce) { .heat-edge { display: none !important; } }
      `}</style>
      <div
        className="heat-edge"
        style={{
          position: "fixed",
          top: "3.5rem",
          right: 0,
          bottom: 0,
          left: 0,
          pointerEvents: "none",
          zIndex: 10,
          boxShadow: heatEdgeBoxShadow,
          transition: "box-shadow 500ms ease",
          animation: isHeatPulsing ? "heat-pulse 1.6s ease-in-out infinite" : "none",
        }}
      />

      {/* Header */}
      <AppHeader
        user={{ id: player.id, displayName: player.displayName }}
        avatarUrl={player.avatarUrl}
        right={null}
      />

      {/* Timer bar — 4px shrinking bar with glowing leading-edge dot */}
      {phase === "playing" && timeLeft !== null && currentQuestion && !hasAnswered && (() => {
        const pct = (timeLeft / currentQuestion.time_limit_seconds) * 100;
        const { color: timerColor, glow: timerGlow } = getTimerPhase(pct / 100);
        return (
          <>
            <div className="w-full h-1 bg-[#f5f3ef] dark:bg-[#1f1f23] relative">
              <div
                style={{
                  width: `${pct}%`,
                  height: '100%',
                  backgroundColor: timerColor,
                  transition: 'width 1s linear, background-color 600ms ease',
                }}
              />
              {pct > 0 && (
                <div
                  className="absolute motion-reduce:hidden"
                  style={{
                    top: '50%',
                    left: `${pct}%`,
                    transform: 'translate(-50%, -50%)',
                    width: 10,
                    height: 10,
                    borderRadius: '50%',
                    backgroundColor: timerColor,
                    boxShadow: `0 0 8px 3px ${timerGlow}`,
                    transition: 'left 1s linear, background-color 600ms ease, box-shadow 600ms ease',
                    willChange: 'left',
                  }}
                />
              )}
            </div>
            {/* Timer number — below bar, right-aligned, grouped with bar */}
            <div className="flex justify-end px-4 mt-2">
              <span
                className="font-mono text-sm font-bold tabular-nums"
                style={{ color: timerColor, transition: 'color 600ms ease' }}
              >
                {timeLeft}s
              </span>
            </div>
          </>
        );
      })()}

      {/* Progress bar — multi-round with question tick marks */}
      {currentRoundData && rounds.length > 0 && (
        <div className="border-b border-border px-5 py-2.5 max-w-lg md:max-w-2xl lg:max-w-3xl mx-auto w-full">
          <div className="flex items-center justify-between text-xs text-muted-foreground mb-2">
            <span className="font-medium truncate max-w-[60%]">
              {currentRoundData.title}
              {rounds.length > 1 && (
                <span className="ml-1.5 text-muted-foreground/60">
                  ({currentRoundIndex + 1}/{rounds.length})
                </span>
              )}
            </span>
            <span className="tabular-nums">
              Q{indexInRound + 1}/{questionsInRound.length}
            </span>
          </div>
          <div className="flex gap-3">
            {rounds.map((round, rIdx) => {
              const rQs = round.questions;
              const qCount = rQs.length;
              if (qCount === 0) return null;
              const isCompleted = rIdx < currentRoundIndex;
              const isActive = rIdx === currentRoundIndex;
              const fillPct = isCompleted ? 100 : isActive ? (indexInRound / qCount) * 100 : 0;
              return (
                <div key={round.id} className="flex-1 h-1 relative" style={{ minWidth: 0 }}>
                  {/* Track */}
                  <div className="absolute inset-0 bg-[#f5f3ef] dark:bg-[#1f1f23]" />
                  {/* Fill — completed questions */}
                  {fillPct > 0 && (
                    <div
                      className="absolute top-0 left-0 h-full bg-primary transition-all duration-200"
                      style={{ width: `${fillPct}%` }}
                    />
                  )}
                  {/* Current question slot — half-opacity violet strip */}
                  {isActive && (
                    <div
                      className="absolute top-0 h-full bg-primary/40 transition-all duration-200"
                      style={{
                        left: `${fillPct}%`,
                        width: `${100 / qCount}%`,
                      }}
                    />
                  )}
                  {/* Question tick dividers — skip for single-question rounds */}
                  {qCount > 1 && Array.from({ length: qCount - 1 }).map((_, d) => {
                    // For very long rounds (>15 questions), show only every 5th tick
                    // Always show the current-position tick
                    const isCurrentTick = isActive && d === indexInRound - 1;
                    if (qCount > 15 && (d + 1) % 5 !== 0 && !isCurrentTick) return null;
                    const posPct = ((d + 1) / qCount) * 100;
                    const isOnFill = isCompleted || (isActive && d < indexInRound);
                    const tickBg = isCurrentTick
                      ? '#7c3aed'
                      : isOnFill
                      ? 'rgba(255,255,255,0.45)'
                      : undefined;
                    return (
                      <div
                        key={d}
                        className={`absolute top-0 h-full ${tickBg === undefined ? 'bg-foreground/15' : ''}`}
                        style={{
                          left: `${posPct}%`,
                          width: isCurrentTick ? 2 : 1,
                          transform: 'translateX(-50%)',
                          backgroundColor: tickBg,
                        }}
                      />
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Revealing banner */}
      {phase === "revealing" && lastResult && !lastResult.didNotAnswer && (
        <div
          className={`px-5 py-3 flex items-center justify-between ${
            lastResult.isCorrect ? "bg-[#dcfce7] dark:bg-correct/15 border-b border-correct/30" : "bg-[#fef2f2] dark:bg-wrong/15 border-b border-wrong/30"
          }`}
        >
          <span className={`font-bold text-sm flex items-center gap-1.5 ${lastResult.isCorrect ? "text-correct" : "text-wrong"}`}>
            {lastResult.isCorrect ? <Check size={16} strokeWidth={2.5} /> : <X size={16} strokeWidth={2.5} />}
            {lastResult.isCorrect ? "Correct!" : "Wrong"}
          </span>
          <span className="font-bold text-sm tabular-nums">
            {lastResult.pointsAwarded >= 0 ? "+" : ""}{lastResult.pointsAwarded} pts
          </span>
        </div>
      )}

      {phase === "revealing" && lastResult?.didNotAnswer && (
        <div className="px-5 py-3 bg-muted/30 border-b border-border flex items-center justify-center">
          <span className="text-sm text-muted-foreground">Time&apos;s up — 0 pts</span>
        </div>
      )}

      {phase === "revealing" && !lastResult && (
        <div className="px-5 py-3 bg-muted/30 border-b border-border flex items-center justify-center">
          <span className="text-sm text-muted-foreground">Time&apos;s up — 0 pts</span>
        </div>
      )}

      <div className="flex-1 max-w-lg md:max-w-2xl lg:max-w-3xl mx-auto w-full px-5 py-6 flex flex-col gap-5">
        {/* Question body — scales down for long text */}
        <h1 className={`font-medium leading-snug break-words ${
          currentQuestion.body.length > 120 ? "text-base" : "text-xl"
        }`}>
          {currentQuestion.body}
        </h1>

        {/* WipeOut leverage slider */}
        {isWipeout && !hasAnswered && phase === "playing" && (
          <div className="space-y-1.5 border border-border p-4 bg-surface">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground font-medium">Wager leverage</span>
              <span className="font-bold text-primary">{leverage.toFixed(1)}x</span>
            </div>
            <input
              type="range"
              min={currentQuestion.wipeout_min_leverage}
              max={currentQuestion.wipeout_max_leverage}
              step={0.1}
              value={leverage}
              onChange={(e) => setLeverage(parseFloat(e.target.value))}
              className="w-full accent-primary"
            />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>{currentQuestion.wipeout_min_leverage}x safe</span>
              <span>{currentQuestion.wipeout_max_leverage}x max risk</span>
            </div>
          </div>
        )}

        {/* Time's up — unanswered */}
        {timeLeft === 0 && !hasAnswered && phase === "playing" && (
          <p className="text-center text-sm text-wrong font-medium">
            Time&apos;s up — no answer recorded.
          </p>
        )}

        {/* Answer options */}
        <div className="grid grid-cols-2 gap-3">
          {optionLabels.map((label, i) => {
            const isSelected = selectedAnswer !== null && selectedAnswer >= 0 && selectedAnswer === i;
            const isCorrectOption = lastResult?.correctAnswer === i;
            const isRevealing = phase === "revealing" && lastResult?.correctAnswer !== undefined;
            const isTimedOut = timeLeft === 0 && !hasAnswered;

            let cls = `flex items-center gap-3 p-4 ${isTrueFalse ? "min-h-16" : "min-h-14"} border text-left transition-colors w-full `;
            if (isRevealing) {
              if (isCorrectOption) cls += "border-correct bg-[#dcfce7] dark:bg-correct/15 text-correct";
              else if (isSelected) cls += "border-wrong bg-[#fef2f2] dark:bg-wrong/15 text-wrong";
              else cls += "border-border text-muted-foreground opacity-50";
            } else if (isSelected) {
              cls += "border-primary bg-accent-light text-primary";
            } else if (hasAnswered || isTimedOut) {
              cls += "border-border text-muted-foreground";
            } else {
              cls += "border-border text-foreground hover:border-primary hover:bg-accent-light active:bg-accent-light cursor-pointer";
            }

            const badgeCls = `w-6 h-6 shrink-0 flex items-center justify-center rounded-[4px] text-xs font-semibold ${
              isRevealing && isCorrectOption
                ? "bg-correct/10 text-correct"
                : isRevealing && isSelected && !isCorrectOption
                ? "bg-wrong/10 text-wrong"
                : "bg-[#f5f3ef] dark:bg-[#1f1f23] text-stone-500 dark:text-zinc-400"
            }`;

            return (
              <button
                key={i}
                disabled={hasAnswered || phase !== "playing" || isSubmitting || isTimedOut}
                onClick={() => submitAnswer(i)}
                className={cls}
                aria-label={`Answer ${currentQuestion.options[i]}`}
              >
                <span className={badgeCls}>
                  {isRevealing && isCorrectOption ? (
                    <Check size={14} strokeWidth={2.5} />
                  ) : isRevealing && isSelected && !isCorrectOption ? (
                    <X size={14} strokeWidth={2.5} />
                  ) : (
                    label
                  )}
                </span>
                <span className={`leading-snug break-words ${isTrueFalse ? "text-[18px] font-semibold" : "text-sm font-medium"}`}>
                  {isSubmitting && isSelected ? (
                    <span className="inline-flex items-center gap-1.5">
                      <BlockSpinner variant="wave" size={16} />
                      {currentQuestion.options[i]}
                    </span>
                  ) : (
                    currentQuestion.options[i]
                  )}
                </span>
              </button>
            );
          })}
        </div>

        {/* Explanation (revealed) */}
        {phase === "revealing" && lastResult?.explanation && (
          <div className="border border-border bg-surface p-4 text-sm text-muted-foreground">
            <span className="font-semibold text-foreground block mb-1 text-xs uppercase tracking-wider">Why</span>
            {lastResult.explanation}
          </div>
        )}

        {/* Submitted / waiting */}
        {hasAnswered && phase === "playing" && (
          <p className="text-center text-sm text-muted-foreground animate-pulse">
            Answer locked in - waiting for host to reveal...
          </p>
        )}

      </div>
      <SponsorBar sponsors={sponsors} />
    </div>
  );
}
