"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { createClient } from "@/lib/supabase";

type Question = {
  id: string;
  round_id: string;
  body: string;
  options: string[];
  correct_answer: number;
  sort_order: number;
  round_title: string;
  round_type: string;
  time_limit: number;
  base_points: number;
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

type EventInfo = {
  id: string;
  title: string;
  joinCode: string;
  status: string;
};

export function ControlPanel({
  event,
  questions,
  initialGameState,
  playerCount: initialPlayerCount,
}: {
  event: EventInfo;
  questions: Question[];
  initialGameState: GameState;
  playerCount: number;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [gameState, setGameState] = useState<GameState>(initialGameState);
  const [playerCount, setPlayerCount] = useState(initialPlayerCount);
  const [loading, setLoading] = useState(false);
  const [timeLeft, setTimeLeft] = useState<number | null>(null);

  // Find current question index
  const currentIndex = questions.findIndex(
    (q) => q.id === gameState.current_question_id
  );
  const currentQuestion = currentIndex >= 0 ? questions[currentIndex] : null;
  const isLastQuestion = currentIndex === questions.length - 1;
  const totalQuestions = questions.length;

  // Subscribe to player count changes
  useEffect(() => {
    const channel = supabase
      .channel(`control-players:${event.id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "event_players",
          filter: `event_id=eq.${event.id}`,
        },
        () => setPlayerCount((c) => c + 1)
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase, event.id]);

  // Countdown timer
  useEffect(() => {
    if (gameState.phase !== "playing" || !gameState.question_started_at || !currentQuestion) {
      setTimeLeft(null);
      return;
    }

    const startedAt = new Date(gameState.question_started_at).getTime();
    const duration = currentQuestion.time_limit * 1000;

    const tick = () => {
      const remaining = Math.max(
        0,
        Math.ceil((startedAt + duration - Date.now()) / 1000)
      );
      setTimeLeft(remaining);
      if (remaining <= 0) clearInterval(interval);
    };

    tick();
    const interval = setInterval(tick, 200);
    return () => clearInterval(interval);
  }, [gameState.phase, gameState.question_started_at, currentQuestion]);

  const updateGameState = useCallback(
    async (updates: Partial<GameState>) => {
      setLoading(true);
      const { data, error } = await supabase
        .from("game_state")
        .update(updates)
        .eq("event_id", event.id)
        .select()
        .single();

      if (!error && data) setGameState(data as GameState);
      setLoading(false);
      return { data, error };
    },
    [supabase, event.id]
  );

  const updateEventStatus = useCallback(
    async (status: string) => {
      await supabase
        .from("events")
        .update({ status })
        .eq("id", event.id);
    },
    [supabase, event.id]
  );

  // Start game — go to first question
  async function startGame() {
    if (questions.length === 0) return;
    const first = questions[0];
    await updateEventStatus("active");
    await updateGameState({
      phase: "playing",
      current_round_id: first.round_id,
      current_question_id: first.id,
      question_started_at: new Date().toISOString(),
      started_at: new Date().toISOString(),
    });
  }

  // Next question
  async function nextQuestion() {
    if (currentIndex < 0) return;

    const nextIdx = currentIndex + 1;
    if (nextIdx >= questions.length) {
      // No more questions — end game
      await endGame();
      return;
    }

    const next = questions[nextIdx];
    await updateGameState({
      phase: "playing",
      current_round_id: next.round_id,
      current_question_id: next.id,
      question_started_at: new Date().toISOString(),
    });
  }

  // Show reveal (correct answer)
  async function revealAnswer() {
    await updateGameState({ phase: "revealing" });
  }

  // Show leaderboard between rounds
  async function showLeaderboard() {
    await updateGameState({ phase: "leaderboard" });
  }

  // Pause / resume
  async function togglePause() {
    if (gameState.phase === "playing") {
      await updateEventStatus("paused");
      await updateGameState({ phase: "lobby" }); // reuse lobby as paused state visually
    }
  }

  // End game
  async function endGame() {
    await updateEventStatus("ended");
    await updateGameState({
      phase: "ended",
      ended_at: new Date().toISOString(),
    });
  }

  const phase = gameState.phase;

  return (
    <div className="min-h-dvh bg-background flex flex-col">
      {/* Header */}
      <header className="border-b border-border bg-background/80 backdrop-blur-sm">
        <div className="flex items-center justify-between px-5 h-14 max-w-2xl mx-auto">
          <div className="flex items-center gap-3">
            <img src="/logo-light.svg" alt="BlockTrivia" className="h-6 dark:hidden" />
            <img src="/logo-dark.svg" alt="BlockTrivia" className="h-6 hidden dark:block" />
            <span className="text-xs text-muted-foreground">HOST CONTROL</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm font-medium tabular-nums">
              {playerCount} player{playerCount !== 1 ? "s" : ""}
            </span>
            <span className="font-heading font-bold tracking-[0.15em] text-sm text-primary">
              {event.joinCode}
            </span>
          </div>
        </div>
      </header>

      <div className="flex-1 max-w-2xl mx-auto w-full px-5">
        {/* Phase: Lobby — waiting to start */}
        {phase === "lobby" && !gameState.started_at && (
          <div className="flex flex-col items-center justify-center py-20 space-y-8">
            <div className="text-center space-y-3">
              <h1 className="font-heading text-3xl font-bold">{event.title}</h1>
              <p className="text-muted-foreground">
                {playerCount} player{playerCount !== 1 ? "s" : ""} in lobby
                &middot; {totalQuestions} questions ready
              </p>
            </div>

            <button
              onClick={startGame}
              disabled={loading || totalQuestions === 0}
              className="h-14 px-12 bg-primary text-primary-foreground text-lg font-bold hover:bg-primary-hover transition-colors disabled:opacity-50"
            >
              {totalQuestions === 0 ? "No Questions Added" : "Start Game"}
            </button>

            {totalQuestions === 0 && (
              <p className="text-sm text-wrong">
                Add questions before starting the game.
              </p>
            )}
          </div>
        )}

        {/* Phase: Playing — show current question */}
        {phase === "playing" && currentQuestion && (
          <div className="py-8 space-y-6">
            {/* Progress bar */}
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>{currentQuestion.round_title}</span>
              <span>
                Q{currentIndex + 1} / {totalQuestions}
              </span>
            </div>
            <div className="w-full h-1 bg-border">
              <div
                className="h-1 bg-primary transition-all duration-300"
                style={{
                  width: `${((currentIndex + 1) / totalQuestions) * 100}%`,
                }}
              />
            </div>

            {/* Timer */}
            <div className="flex items-center justify-between">
              <span className="text-xs uppercase tracking-wider text-muted-foreground">
                {currentQuestion.round_type.replace("_", "/")}
              </span>
              <span
                className={`font-heading text-4xl font-bold tabular-nums ${
                  timeLeft !== null && timeLeft <= 5
                    ? "text-wrong"
                    : timeLeft !== null && timeLeft <= 10
                    ? "text-timer-warn"
                    : "text-foreground"
                }`}
              >
                {timeLeft !== null ? `${timeLeft}s` : "--"}
              </span>
            </div>

            {/* Question */}
            <div className="border border-border bg-surface p-6 space-y-4">
              <h2 className="font-heading text-xl font-bold leading-snug">
                {currentQuestion.body}
              </h2>

              <div className="grid grid-cols-2 gap-3">
                {(currentQuestion.options as string[]).map(
                  (option: string, i: number) => (
                    <div
                      key={i}
                      className={`p-3 border text-sm font-medium ${
                        i === currentQuestion.correct_answer
                          ? "border-correct bg-correct/10 text-correct"
                          : "border-border text-muted-foreground"
                      }`}
                    >
                      <span className="font-bold mr-2">
                        {String.fromCharCode(65 + i)}.
                      </span>
                      {option}
                    </div>
                  )
                )}
              </div>
            </div>

            {/* Controls */}
            <div className="flex gap-3">
              <button
                onClick={revealAnswer}
                disabled={loading}
                className="flex-1 h-12 bg-primary text-primary-foreground font-semibold hover:bg-primary-hover transition-colors disabled:opacity-50"
              >
                Reveal Answer
              </button>
              <button
                onClick={togglePause}
                disabled={loading}
                className="h-12 px-6 bg-surface border border-border font-medium hover:bg-background transition-colors disabled:opacity-50"
              >
                Pause
              </button>
            </div>
          </div>
        )}

        {/* Phase: Revealing — show correct answer, then advance */}
        {phase === "revealing" && currentQuestion && (
          <div className="py-8 space-y-6">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>{currentQuestion.round_title}</span>
              <span>
                Q{currentIndex + 1} / {totalQuestions}
              </span>
            </div>

            <div className="border border-correct bg-correct/5 p-6 space-y-4">
              <p className="text-xs font-bold text-correct uppercase tracking-wider">
                Correct Answer
              </p>
              <h2 className="font-heading text-xl font-bold">
                {currentQuestion.body}
              </h2>
              <p className="text-lg font-semibold text-correct">
                {String.fromCharCode(65 + currentQuestion.correct_answer)}.{" "}
                {
                  (currentQuestion.options as string[])[
                    currentQuestion.correct_answer
                  ]
                }
              </p>
            </div>

            <div className="flex gap-3">
              <button
                onClick={showLeaderboard}
                disabled={loading}
                className="flex-1 h-12 bg-surface border border-border font-semibold hover:bg-background transition-colors disabled:opacity-50"
              >
                Show Leaderboard
              </button>
              <button
                onClick={isLastQuestion ? endGame : nextQuestion}
                disabled={loading}
                className="flex-1 h-12 bg-primary text-primary-foreground font-semibold hover:bg-primary-hover transition-colors disabled:opacity-50"
              >
                {isLastQuestion ? "End Game" : "Next Question"}
              </button>
            </div>
          </div>
        )}

        {/* Phase: Leaderboard */}
        {phase === "leaderboard" && (
          <div className="py-8 space-y-6">
            <div className="text-center space-y-2">
              <h2 className="font-heading text-2xl font-bold">Leaderboard</h2>
              <p className="text-sm text-muted-foreground">
                Players see the live standings now
              </p>
            </div>

            <div className="flex gap-3">
              <button
                onClick={isLastQuestion ? endGame : nextQuestion}
                disabled={loading}
                className="flex-1 h-12 bg-primary text-primary-foreground font-semibold hover:bg-primary-hover transition-colors disabled:opacity-50"
              >
                {isLastQuestion ? "End Game" : "Next Question"}
              </button>
            </div>
          </div>
        )}

        {/* Phase: Ended */}
        {phase === "ended" && (
          <div className="flex flex-col items-center justify-center py-20 space-y-6">
            <div className="text-center space-y-3">
              <h1 className="font-heading text-3xl font-bold">Game Over</h1>
              <p className="text-muted-foreground">
                {event.title} has ended &middot; {playerCount} players
              </p>
            </div>
            <a
              href={`/host`}
              className="h-12 px-8 bg-primary text-primary-foreground font-semibold flex items-center hover:bg-primary-hover transition-colors"
            >
              Back to Dashboard
            </a>
          </div>
        )}

        {/* Paused state (lobby phase but game already started) */}
        {phase === "lobby" && gameState.started_at && (
          <div className="flex flex-col items-center justify-center py-20 space-y-8">
            <div className="text-center space-y-3">
              <div className="inline-flex items-center gap-2 bg-timer-warn/10 px-4 py-1.5">
                <span className="text-xs font-bold text-timer-warn uppercase tracking-wider">
                  Game Paused
                </span>
              </div>
              <h1 className="font-heading text-2xl font-bold">{event.title}</h1>
              <p className="text-muted-foreground">
                {currentQuestion
                  ? `Paused at Q${currentIndex + 1} / ${totalQuestions}`
                  : "Game is paused"}
              </p>
            </div>

            <button
              onClick={async () => {
                await updateEventStatus("active");
                if (currentQuestion) {
                  await updateGameState({
                    phase: "playing",
                    question_started_at: new Date().toISOString(),
                  });
                }
              }}
              disabled={loading}
              className="h-14 px-12 bg-primary text-primary-foreground text-lg font-bold hover:bg-primary-hover transition-colors disabled:opacity-50"
            >
              Resume Game
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
