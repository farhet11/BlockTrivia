"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase";
import { ThemeToggle } from "@/app/_components/theme-toggle";
import { SponsorBar } from "@/app/_components/sponsor-bar";

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

type LeaderboardEntry = {
  player_id: string;
  display_name: string;
  total_score: number;
  rank: number;
};

export function PlayView({
  event,
  player,
  questions,
  initialGameState,
  sponsors,
  roundsInfo,
}: {
  event: { id: string; title: string; joinCode: string };
  player: { id: string; displayName: string };
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
  } | null>(null);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
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
  const optionLabels = isTrueFalse ? ["True", "False"] : ["A", "B", "C", "D"];

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
    } else if (next.phase === "ended") {
      router.push(`/game/${event.joinCode}/final`);
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
    supabase
      .from("leaderboard_entries")
      .select(`player_id, total_score, rank, profiles!leaderboard_entries_player_id_fkey ( display_name )`)
      .eq("event_id", event.id)
      .order("total_score", { ascending: false })
      .limit(10)
      .then(({ data }) => {
        if (data) {
          setLeaderboard(
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            data.map((row: any) => ({
              player_id: row.player_id,
              display_name: row.profiles?.display_name ?? "Player",
              total_score: row.total_score,
              rank: row.rank,
            }))
          );
        }
      });
  }, [gameState.phase, supabase, event.id]);

  async function submitAnswer(answerIndex: number) {
    if (!currentQuestion || hasAnswered || submitLockRef.current || !gameState.question_started_at) return;
    submitLockRef.current = true;

    const startedAt = new Date(gameState.question_started_at).getTime();
    const timeTakenMs = Math.min(Date.now() - startedAt, currentQuestion.time_limit_seconds * 1000);

    setSelectedAnswer(answerIndex);
    setIsSubmitting(true);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { submitLockRef.current = false; setIsSubmitting(false); return; }

      const res = await fetch(
        `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/submit-answer`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            question_id: currentQuestion.id,
            selected_answer: answerIndex,
            time_taken_ms: timeTakenMs,
            wipeout_leverage: isWipeout ? leverage : undefined,
            event_id: event.id,
          }),
        }
      );

      const result = await res.json();

      setAnsweredQuestionId(currentQuestion.id);
      setLastResult({
        isCorrect: result.is_correct,
        pointsAwarded: result.points_awarded,
        selectedAnswer: answerIndex,
        correctAnswer: result.correct_answer,
        explanation: result.explanation ?? null,
      });
    } catch (err) {
      console.error("Failed to submit answer:", err);
      // Release the lock so the player can retry
      submitLockRef.current = false;
      setSelectedAnswer(null);
    } finally {
      setIsSubmitting(false);
    }
  }

  const phase = gameState.phase;

  // ── Interstitial phase ─────────────────────────────────────────────────────
  if (phase === "interstitial") {
    const interstitialRound = roundsInfo.find((r) => r.id === gameState.current_round_id);
    return (
      <div className="min-h-dvh bg-background flex flex-col">
        <header className="border-b border-border px-5 h-14 flex items-center justify-between max-w-lg mx-auto w-full">
          <a href="/join">
            <img src="/logo-light.svg" alt="BlockTrivia" className="h-6 dark:hidden" />
            <img src="/logo-dark.svg" alt="BlockTrivia" className="h-6 hidden dark:block" />
          </a>
          <ThemeToggle />
        </header>
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

  // ── Leaderboard phase ──────────────────────────────────────────────────────
  if (phase === "leaderboard") {
    const myEntry = leaderboard.find((e) => e.player_id === player.id);
    return (
      <div className="min-h-dvh bg-background flex flex-col">
        <header className="border-b border-border px-5 h-14 flex items-center justify-between max-w-lg mx-auto w-full">
          <a href="/join">
            <img src="/logo-light.svg" alt="BlockTrivia" className="h-6 dark:hidden" />
            <img src="/logo-dark.svg" alt="BlockTrivia" className="h-6 hidden dark:block" />
          </a>
          <ThemeToggle />
        </header>
        <div className="flex-1 max-w-lg mx-auto w-full px-5 py-8 space-y-6">
          <div className="text-center space-y-1">
            <p className="text-xs font-bold text-primary uppercase tracking-widest">Standings</p>
            <h2 className="font-heading text-2xl font-bold">Leaderboard</h2>
            {myEntry && (
              <p className="text-sm text-muted-foreground">
                You're ranked <span className="font-bold text-foreground">#{myEntry.rank}</span> with{" "}
                <span className="font-bold text-foreground">{myEntry.total_score}</span> pts
              </p>
            )}
          </div>
          <ul className="space-y-2">
            {leaderboard.map((entry, i) => {
              const isMe = entry.player_id === player.id;
              return (
                <li
                  key={entry.player_id}
                  className={`flex items-center gap-3 p-3 border ${
                    isMe ? "border-primary bg-primary/5" : "border-border"
                  }`}
                >
                  <span className={`w-7 text-center text-sm font-bold tabular-nums ${
                    i === 0 ? "text-yellow-500" : i === 1 ? "text-zinc-400" : i === 2 ? "text-amber-700" : "text-muted-foreground"
                  }`}>
                    #{entry.rank ?? i + 1}
                  </span>
                  <span className={`flex-1 text-sm font-medium ${isMe ? "text-primary" : "text-foreground"}`}>
                    {entry.display_name} {isMe && <span className="text-xs text-muted-foreground">(you)</span>}
                  </span>
                  <span className="text-sm font-bold tabular-nums">{entry.total_score}</span>
                </li>
              );
            })}
          </ul>
          <p className="text-center text-xs text-muted-foreground animate-pulse">
            Waiting for host to continue...
          </p>
        </div>
        <SponsorBar sponsors={sponsors} />
      </div>
    );
  }

  // ── Paused ─────────────────────────────────────────────────────────────────
  if (phase === "lobby" && gameState.started_at) {
    return (
      <div className="min-h-dvh bg-background flex flex-col items-center justify-center px-5 gap-6">
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
      {/* Header */}
      <header className="border-b border-border">
        <div className="px-5 h-14 flex items-center justify-between max-w-lg mx-auto">
          <img src="/logo-light.svg" alt="BlockTrivia" className="h-6 dark:hidden" />
          <img src="/logo-dark.svg" alt="BlockTrivia" className="h-6 hidden dark:block" />
          <div className="flex items-center gap-3">
            {timeLeft !== null && !hasAnswered && (
              <span
                className={`font-heading text-lg font-bold tabular-nums ${
                  timeLeft <= 5 ? "text-wrong" : timeLeft <= 10 ? "text-timer-warn" : "text-foreground"
                }`}
              >
                {timeLeft}s
              </span>
            )}
            <ThemeToggle />
          </div>
        </div>
      </header>

      {/* Progress bar */}
      {currentRoundData && questionsInRound.length > 0 && (
        <div className="border-b border-border px-5 py-2.5 max-w-lg mx-auto w-full">
          <div className="flex items-center justify-between text-xs text-muted-foreground mb-2">
            <span className="font-medium truncate max-w-[60%]">
              {currentRoundData.title}
              <span className="ml-1.5 text-muted-foreground/60">
                ({currentRoundIndex + 1}/{rounds.length})
              </span>
            </span>
            <span className="tabular-nums">
              Q{indexInRound + 1}/{questionsInRound.length}
            </span>
          </div>
          <div className="flex gap-1">
            {questionsInRound.map((q, i) => (
              <div
                key={q.id}
                className={`h-1 flex-1 transition-colors duration-200 ${
                  i < indexInRound ? "bg-primary/40" : i === indexInRound ? "bg-primary" : "bg-border"
                }`}
              />
            ))}
          </div>
        </div>
      )}

      {/* Revealing banner */}
      {phase === "revealing" && lastResult && (
        <div
          className={`px-5 py-3 flex items-center justify-between ${
            lastResult.isCorrect ? "bg-correct/10 border-b border-correct/30" : "bg-wrong/10 border-b border-wrong/30"
          }`}
        >
          <span className={`font-bold text-sm ${lastResult.isCorrect ? "text-correct" : "text-wrong"}`}>
            {lastResult.isCorrect ? "✓ Correct!" : "✗ Wrong"}
          </span>
          <span className="font-bold text-sm tabular-nums">
            {lastResult.pointsAwarded >= 0 ? "+" : ""}{lastResult.pointsAwarded} pts
          </span>
        </div>
      )}

      {phase === "revealing" && !lastResult && (
        <div className="px-5 py-3 bg-muted/30 border-b border-border flex items-center justify-center">
          <span className="text-sm text-muted-foreground">Time&apos;s up — you didn&apos;t answer in time.</span>
        </div>
      )}

      <div className="flex-1 max-w-lg mx-auto w-full px-5 py-6 flex flex-col gap-5">
        {/* Question body */}
        <h1 className="font-heading text-xl font-bold leading-snug">
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

        {/* Answer options */}
        <div className={`grid gap-3 ${isTrueFalse ? "grid-cols-1" : "grid-cols-2"}`}>
          {optionLabels.map((label, i) => {
            const isSelected = selectedAnswer === i;
            const isCorrectOption = lastResult?.correctAnswer === i;
            const isRevealing = phase === "revealing" && lastResult?.correctAnswer !== undefined;

            let cls = "p-4 border text-left transition-colors ";
            if (isRevealing) {
              if (isCorrectOption) cls += "border-correct bg-correct/10 text-correct";
              else if (isSelected) cls += "border-wrong bg-wrong/10 text-wrong";
              else cls += "border-border text-muted-foreground opacity-50";
            } else if (isSelected) {
              cls += "border-primary bg-primary/10 text-primary";
            } else if (hasAnswered) {
              cls += "border-border text-muted-foreground opacity-50";
            } else {
              cls += "border-border text-foreground hover:border-primary hover:bg-primary/5 active:bg-primary/10 cursor-pointer";
            }

            return (
              <button
                key={i}
                disabled={hasAnswered || phase !== "playing" || isSubmitting}
                onClick={() => submitAnswer(i)}
                className={cls}
              >
                <span className="block text-xs font-bold mb-1 opacity-60">{label}</span>
                <span className="text-sm font-medium leading-snug">
                  {isSubmitting && isSelected ? (
                    <span className="inline-flex items-center gap-1.5">
                      <span className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" />
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
            Answer locked in — waiting for host to reveal...
          </p>
        )}
      </div>
      <SponsorBar sponsors={sponsors} />
    </div>
  );
}
