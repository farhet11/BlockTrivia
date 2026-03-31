"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import { createClient } from "@/lib/supabase";
import { ThemeToggle } from "@/app/_components/theme-toggle";

type QuestionData = {
  id: string;
  round_id: string;
  body: string;
  options: string[];
  correct_answer: number;
  sort_order: number;
  explanation: string | null;
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
}: {
  event: { id: string; title: string; joinCode: string };
  player: { id: string; displayName: string };
  questions: QuestionData[];
  initialGameState: GameState;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [gameState, setGameState] = useState<GameState>(initialGameState);
  const [answeredQuestionId, setAnsweredQuestionId] = useState<string | null>(null);
  const [selectedAnswer, setSelectedAnswer] = useState<number | null>(null);
  const [leverage, setLeverage] = useState(1.0);
  const [timeLeft, setTimeLeft] = useState<number | null>(null);
  const [lastResult, setLastResult] = useState<{
    isCorrect: boolean;
    pointsAwarded: number;
    selectedAnswer: number;
    correctAnswer: number;
    explanation: string | null;
  } | null>(null);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const submitLockRef = useRef(false);

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

  // Subscribe to game_state changes
  useEffect(() => {
    const channel = supabase
      .channel(`play:${event.id}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "game_state", filter: `event_id=eq.${event.id}` },
        (payload) => {
          const next = payload.new as GameState;
          setGameState(next);

          if (next.phase === "playing") {
            // New question — reset answer state
            setAnsweredQuestionId(null);
            setSelectedAnswer(null);
            setLeverage(1.0);
            setLastResult(null);
            submitLockRef.current = false;
          } else if (next.phase === "ended") {
            window.location.href = `/game/${event.joinCode}/final`;
          }
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [supabase, event.id, event.joinCode]);

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
          if (currentQuestion) {
            setLastResult({
              isCorrect: data.is_correct,
              pointsAwarded: data.points_awarded,
              selectedAnswer: data.selected_answer,
              correctAnswer: currentQuestion.correct_answer,
              explanation: currentQuestion.explanation,
            });
          }
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
    const isCorrect = answerIndex === currentQuestion.correct_answer;

    let points = 0;
    if (isCorrect) {
      points = currentQuestion.base_points;
      if (currentQuestion.time_bonus_enabled) {
        const ratio = Math.max(0, 1 - timeTakenMs / (currentQuestion.time_limit_seconds * 1000));
        points += Math.floor(currentQuestion.base_points * ratio);
      }
      if (isWipeout) points = Math.floor(points * leverage);
    } else if (isWipeout && leverage > 1) {
      // WipeOut wrong = small penalty proportional to over-leverage
      points = -Math.floor(currentQuestion.base_points * 0.5 * (leverage - 1));
    }

    setSelectedAnswer(answerIndex);
    setAnsweredQuestionId(currentQuestion.id);
    setLastResult({
      isCorrect,
      pointsAwarded: points,
      selectedAnswer: answerIndex,
      correctAnswer: currentQuestion.correct_answer,
      explanation: currentQuestion.explanation,
    });

    await supabase.from("responses").insert({
      event_id: event.id,
      question_id: currentQuestion.id,
      player_id: player.id,
      selected_answer: answerIndex,
      is_correct: isCorrect,
      time_taken_ms: timeTakenMs,
      points_awarded: points,
      wipeout_leverage: isWipeout ? leverage : 1.0,
    });
  }

  const phase = gameState.phase;

  // ── Leaderboard phase ──────────────────────────────────────────────────────
  if (phase === "leaderboard") {
    const myEntry = leaderboard.find((e) => e.player_id === player.id);
    return (
      <div className="min-h-dvh bg-background flex flex-col">
        <header className="border-b border-border px-5 h-14 flex items-center justify-between max-w-lg mx-auto w-full">
          <img src="/logo-light.svg" alt="BlockTrivia" className="h-6 dark:hidden" />
          <img src="/logo-dark.svg" alt="BlockTrivia" className="h-6 hidden dark:block" />
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
      </div>
    );
  }

  // ── Waiting / lobby ────────────────────────────────────────────────────────
  if (!currentQuestion) {
    return (
      <div className="min-h-dvh bg-background flex flex-col items-center justify-center px-5 gap-6">
        <img src="/logo-light.svg" alt="BlockTrivia" className="h-8 dark:hidden" />
        <img src="/logo-dark.svg" alt="BlockTrivia" className="h-8 hidden dark:block" />
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
            const isCorrectOption = currentQuestion.correct_answer === i;
            const isRevealing = phase === "revealing";

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
                disabled={hasAnswered || phase !== "playing"}
                onClick={() => submitAnswer(i)}
                className={cls}
              >
                <span className="block text-xs font-bold mb-1 opacity-60">{label}</span>
                <span className="text-sm font-medium leading-snug">
                  {currentQuestion.options[i]}
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
    </div>
  );
}
