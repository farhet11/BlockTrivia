"use client";

import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { createClient } from "@/lib/supabase";
import { SponsorBar } from "@/app/_components/sponsor-bar";
import { ThemeToggle } from "@/app/_components/theme-toggle";
import { BrandedQR } from "@/app/_components/branded-qr";

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
  round_interstitial_text?: string | null;
};

type RoundInfo = {
  id: string;
  title: string;
  round_type: string;
  sort_order: number;
  interstitial_text: string | null;
};

type Sponsor = {
  id: string;
  name: string | null;
  logo_url: string;
  sort_order: number;
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
  description?: string | null;
  joinCode: string;
  status: string;
};

export function ControlPanel({
  event,
  questions,
  rounds: roundsList,
  initialGameState,
  playerCount: initialPlayerCount,
  sponsors,
  isHost,
}: {
  event: EventInfo;
  questions: Question[];
  rounds: RoundInfo[];
  initialGameState: GameState;
  playerCount: number;
  sponsors: Sponsor[];
  isHost: boolean;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [gameState, setGameState] = useState<GameState>(initialGameState);
  const [playerCount, setPlayerCount] = useState(initialPlayerCount);
  const [loading, setLoading] = useState(false);
  const [timeLeft, setTimeLeft] = useState<number | null>(null);
  const [interstitialCountdown, setInterstitialCountdown] = useState<number | null>(null);
  const interstitialTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [copied, setCopied] = useState(false);
  const [stageView, setStageView] = useState(false);
  const [playerPulse, setPlayerPulse] = useState(false);
  const joinUrl = typeof window !== "undefined" ? `${window.location.origin}/join/${event.joinCode}` : `/join/${event.joinCode}`;

  // Derive ordered unique rounds from questions
  const rounds = useMemo(() => {
    const seen = new Set<string>();
    const result: { id: string; title: string; questions: Question[]; interstitial_text: string | null }[] = [];
    for (const q of questions) {
      if (!seen.has(q.round_id)) {
        seen.add(q.round_id);
        const roundInfo = roundsList.find((r) => r.id === q.round_id);
        result.push({
          id: q.round_id,
          title: q.round_title,
          questions: questions.filter((x) => x.round_id === q.round_id),
          interstitial_text: roundInfo?.interstitial_text ?? null,
        });
      }
    }
    return result;
  }, [questions, roundsList]);

  // Find current question index
  const currentIndex = questions.findIndex(
    (q) => q.id === gameState.current_question_id
  );
  const currentQuestion = currentIndex >= 0 ? questions[currentIndex] : null;
  const isLastQuestion = currentIndex === questions.length - 1;
  const totalQuestions = questions.length;

  // Per-round progress
  const currentRoundIndex = currentQuestion
    ? rounds.findIndex((r) => r.id === currentQuestion.round_id)
    : -1;
  const currentRoundData = currentRoundIndex >= 0 ? rounds[currentRoundIndex] : null;
  const questionsInRound = currentRoundData?.questions ?? [];
  const indexInRound = currentQuestion
    ? questionsInRound.findIndex((q) => q.id === currentQuestion.id)
    : -1;

  // Is the next question in a different round?
  // Use ?? null so out-of-bounds array access returns null, not undefined
  const nextQ = currentIndex >= 0 ? (questions[currentIndex + 1] ?? null) : null;
  const isRoundBoundary = nextQ != null && currentQuestion != null && nextQ.round_id !== currentQuestion.round_id;
  const nextRound = isRoundBoundary ? rounds.find((r) => r.id === nextQ.round_id) : null;

  // Interstitial round info (for "interstitial" phase)
  const interstitialRound = gameState.phase === "interstitial"
    ? (roundsList.find((r) => r.id === gameState.current_round_id) ?? null)
    : null;

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
        () => {
          setPlayerCount((c) => c + 1);
          setPlayerPulse(true);
          setTimeout(() => setPlayerPulse(false), 800);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase, event.id]);

  // Countdown timer (question)
  useEffect(() => {
    if (gameState.phase !== "playing" || !gameState.question_started_at || !currentQuestion) {
      setTimeLeft(null);
      return;
    }

    const startedAt = new Date(gameState.question_started_at).getTime();
    const duration = currentQuestion.time_limit * 1000;

    let interval: ReturnType<typeof setInterval>;

    const tick = () => {
      const remaining = Math.max(
        0,
        Math.ceil((startedAt + duration - Date.now()) / 1000)
      );
      setTimeLeft(remaining);
      if (remaining <= 0) clearInterval(interval);
    };

    tick();
    interval = setInterval(tick, 200);
    return () => clearInterval(interval);
  }, [gameState.phase, gameState.question_started_at, currentQuestion]);

  // Interstitial auto-advance countdown (8s)
  useEffect(() => {
    if (gameState.phase !== "interstitial") {
      setInterstitialCountdown(null);
      if (interstitialTimerRef.current) {
        clearInterval(interstitialTimerRef.current);
        interstitialTimerRef.current = null;
      }
      return;
    }

    setInterstitialCountdown(8);
    let count = 8;

    interstitialTimerRef.current = setInterval(() => {
      count -= 1;
      setInterstitialCountdown(count);
      if (count <= 0) {
        if (interstitialTimerRef.current) clearInterval(interstitialTimerRef.current);
        startFirstQuestionOfRound();
      }
    }, 1000);

    return () => {
      if (interstitialTimerRef.current) clearInterval(interstitialTimerRef.current);
    };
  }, [gameState.phase, gameState.current_round_id]); // eslint-disable-line react-hooks/exhaustive-deps

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

  // Start first question of the current_round_id (called from interstitial)
  async function startFirstQuestionOfRound() {
    const roundId = gameState.current_round_id;
    if (!roundId) return;
    const firstQ = questions.find((q) => q.round_id === roundId);
    if (!firstQ) return;
    await updateGameState({
      phase: "playing",
      current_round_id: roundId,
      current_question_id: firstQ.id,
      question_started_at: new Date().toISOString(),
    });
  }

  // Next question (or show interstitial at round boundary)
  async function nextQuestion() {
    if (currentIndex < 0) return;

    const nextIdx = currentIndex + 1;
    if (nextIdx >= questions.length) {
      await endGame();
      return;
    }

    const next = questions[nextIdx];

    // At round boundary — show interstitial
    if (isRoundBoundary && nextRound) {
      await updateGameState({
        phase: "interstitial",
        current_round_id: next.round_id,
        current_question_id: null,
        question_started_at: null,
      });
      return;
    }

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
      await updateGameState({ phase: "lobby" });
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

  function copyCode() {
    navigator.clipboard.writeText(event.joinCode).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  // Next button label
  const nextLabel = isLastQuestion ? "End Game" : isRoundBoundary ? `Start Round ${(nextRound ? rounds.findIndex((r) => r.id === nextRound.id) + 1 : 2)}` : "Next Question";

  return (
    <div className="min-h-dvh bg-background flex flex-col">
      {/* Header */}
      <header className="border-b border-border bg-background/80 backdrop-blur-sm">
        <div className="flex items-center justify-between px-5 h-14 max-w-2xl mx-auto">
          <a href="/host">
            <img src="/logo-light.svg" alt="BlockTrivia" className="h-6 dark:hidden" />
            <img src="/logo-dark.svg" alt="BlockTrivia" className="h-6 hidden dark:block" />
          </a>
          <div className="flex items-center gap-3">
            {gameState.phase === "lobby" && !gameState.started_at && (
              <button
                onClick={() => setStageView(true)}
                className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
              >
                <svg className="size-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3.375 19.5h17.25m-17.25 0a1.125 1.125 0 0 1-1.125-1.125M3.375 19.5h1.5C5.496 19.5 6 18.996 6 18.375m-3.75.125-.375-13.5C2.25 4.254 2.754 3.75 3.375 3.75h17.25c.621 0 1.125.504 1.125 1.125l-.375 13.5M20.625 19.5h-1.5c-.621 0-1.125-.504-1.125-1.125M6 18.375V6.375m12 12V6.375M6 6.375h12" />
                </svg>
                Stage View
              </button>
            )}
            {gameState.phase !== "lobby" && (
              <span className="font-mono font-bold tracking-[0.1em] text-sm text-primary">
                {event.joinCode}
              </span>
            )}
            <ThemeToggle />
          </div>
        </div>
      </header>

      <div className="flex-1 max-w-2xl mx-auto w-full px-5">
        {/* Breadcrumb */}
        {/* Phase: Lobby — waiting to start */}
        {gameState.phase === "lobby" && !gameState.started_at && (
          <div className="pt-8 pb-28 space-y-6">
            {/* Event info */}
            <div className="text-center space-y-2">
              <p className="text-xs text-muted-foreground uppercase tracking-wider">Host Control</p>
              <h1 className="font-heading text-2xl font-bold">{event.title}</h1>
              {event.description && (
                <p className="text-muted-foreground text-sm max-w-sm mx-auto">{event.description}</p>
              )}
            </div>

            {/* Stat cards */}
            <div className="flex items-center justify-center gap-3">
              <div className={`flex flex-col items-center px-5 py-3 border bg-surface min-w-[80px] transition-colors duration-300 ${playerPulse ? "border-correct bg-correct/10" : "border-border"}`}>
                <span className="text-2xl font-bold text-primary tabular-nums">{playerCount}</span>
                <span className="text-xs text-muted-foreground mt-0.5">player{playerCount !== 1 ? "s" : ""}</span>
              </div>
              <div className="flex flex-col items-center px-5 py-3 border border-border bg-surface min-w-[80px]">
                <span className="text-2xl font-bold tabular-nums">{roundsList.length}</span>
                <span className="text-xs text-muted-foreground mt-0.5">round{roundsList.length !== 1 ? "s" : ""}</span>
              </div>
              <div className="flex flex-col items-center px-5 py-3 border border-border bg-surface min-w-[80px]">
                <span className="text-2xl font-bold tabular-nums">{totalQuestions}</span>
                <span className="text-xs text-muted-foreground mt-0.5">question{totalQuestions !== 1 ? "s" : ""}</span>
              </div>
            </div>

            {/* QR code */}
            <div className="flex justify-center">
              <BrandedQR value={joinUrl} size={200} />
            </div>

            {/* Game code — tap to copy */}
            <button
              onClick={copyCode}
              className="w-full text-center group space-y-1"
              aria-label="Copy join code"
            >
              <div className="flex items-center justify-center gap-2">
                <span className="font-mono text-4xl font-bold tracking-[0.2em] text-primary">
                  {event.joinCode}
                </span>
                {copied ? (
                  <svg className="size-5 text-correct shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                  </svg>
                ) : (
                  <svg className="size-5 text-muted-foreground group-hover:text-foreground transition-colors shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15.666 3.888A2.25 2.25 0 0 0 13.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 0 1-.75.75H9a.75.75 0 0 1-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 0 1-2.25 2.25H6.75A2.25 2.25 0 0 1 4.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 0 1 1.927-.184" />
                  </svg>
                )}
              </div>
              <p className="text-xs text-muted-foreground/60">
                {copied ? "✓ Copied!" : "tap anywhere to copy"}
              </p>
            </button>

            {totalQuestions === 0 && (
              <p className="text-sm text-wrong text-center">
                Add questions before starting the game.
              </p>
            )}

            <a
              href={`/host/events/${event.id}/questions`}
              className="block text-center text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              ← Back to questions
            </a>

            {sponsors.length > 0 && (
              <div className="w-full pt-4">
                <SponsorBar sponsors={sponsors} />
              </div>
            )}
          </div>
        )}

        {/* Phase: Playing — show current question */}
        {gameState.phase === "playing" && currentQuestion && (
          <div className="py-8 space-y-6">
            {/* Progress */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>
                  {currentQuestion.round_title}
                  {rounds.length > 1 && (
                    <span className="ml-1.5 text-muted-foreground/60">
                      · Round {currentRoundIndex + 1}/{rounds.length}
                    </span>
                  )}
                </span>
                <span>
                  Q{indexInRound + 1}/{questionsInRound.length}
                </span>
              </div>
              <div className="flex gap-1.5">
                {questionsInRound.map((q, i) => (
                  <div
                    key={q.id}
                    className={`h-1.5 flex-1 transition-colors duration-200 ${
                      i < indexInRound
                        ? "bg-primary/50"
                        : i === indexInRound
                        ? "bg-primary"
                        : "bg-border"
                    }`}
                  />
                ))}
              </div>
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

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {((currentQuestion.options ?? []) as string[]).map(
                  (option: string, i: number) => (
                    <div
                      key={i}
                      className="p-3 border border-border text-sm font-medium text-muted-foreground break-words"
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
            <div className="flex flex-col sm:flex-row gap-3">
              <button
                onClick={revealAnswer}
                disabled={loading}
                className="flex-1 h-12 bg-primary text-primary-foreground font-medium hover:bg-primary-hover transition-colors disabled:opacity-50"
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
        {gameState.phase === "revealing" && currentQuestion && (
          <div className="py-8 space-y-6">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>
                {currentQuestion.round_title}
                {rounds.length > 1 && (
                  <span className="ml-1.5 text-muted-foreground/60">
                    · Round {currentRoundIndex + 1}/{rounds.length}
                  </span>
                )}
              </span>
              <span>Q{indexInRound + 1}/{questionsInRound.length}</span>
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
                {((currentQuestion.options ?? []) as string[])[currentQuestion.correct_answer]}
              </p>
            </div>

            <div className="flex flex-col sm:flex-row gap-3">
              <button
                onClick={showLeaderboard}
                disabled={loading}
                className="flex-1 h-12 bg-surface border border-border font-medium hover:bg-background transition-colors disabled:opacity-50"
              >
                Show Leaderboard
              </button>
              <button
                onClick={isLastQuestion ? endGame : nextQuestion}
                disabled={loading}
                className="flex-1 h-12 bg-primary text-primary-foreground font-medium hover:bg-primary-hover transition-colors disabled:opacity-50"
              >
                {nextLabel}
              </button>
            </div>
          </div>
        )}

        {/* Phase: Leaderboard */}
        {gameState.phase === "leaderboard" && (
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
                className="flex-1 h-12 bg-primary text-primary-foreground font-medium hover:bg-primary-hover transition-colors disabled:opacity-50"
              >
                {nextLabel}
              </button>
            </div>
          </div>
        )}

        {/* Phase: Interstitial — between rounds */}
        {gameState.phase === "interstitial" && (
          <div className="flex flex-col items-center justify-center py-16 space-y-8">
            <div className="text-center space-y-3">
              <p className="text-xs font-bold text-primary uppercase tracking-widest">
                Next Up
              </p>
              <h2 className="font-heading text-3xl font-bold">
                {interstitialRound?.title ?? "Next Round"}
              </h2>
              {interstitialRound?.interstitial_text && (
                <p className="text-muted-foreground max-w-sm mx-auto">
                  {interstitialRound.interstitial_text}
                </p>
              )}
              {interstitialCountdown !== null && (
                <p className="text-sm text-muted-foreground">
                  Auto-starting in{" "}
                  <span className="font-bold text-foreground tabular-nums">
                    {interstitialCountdown}s
                  </span>
                </p>
              )}
            </div>

            <button
              onClick={() => {
                if (interstitialTimerRef.current) clearInterval(interstitialTimerRef.current);
                startFirstQuestionOfRound();
              }}
              disabled={loading}
              className="h-12 px-10 bg-primary text-primary-foreground font-medium hover:bg-primary-hover transition-colors disabled:opacity-50"
            >
              Start Round →
            </button>

            {sponsors.length > 0 && (
              <div className="w-full pt-4">
                <SponsorBar sponsors={sponsors} />
              </div>
            )}
          </div>
        )}

        {/* Phase: Ended */}
        {gameState.phase === "ended" && (
          <div className="flex flex-col items-center justify-center py-20 space-y-6">
            <div className="text-center space-y-3">
              <h1 className="font-heading text-3xl font-bold">Game Over</h1>
              <p className="text-muted-foreground">
                {event.title} has ended &middot; {playerCount} players
              </p>
            </div>
            <div className="flex flex-col sm:flex-row gap-3">
              <a
                href={`/host/game/${event.joinCode}/summary`}
                className="h-12 px-8 bg-primary text-primary-foreground font-medium flex items-center justify-center hover:bg-primary-hover transition-colors"
              >
                View Summary →
              </a>
              <a
                href="/host"
                className="h-12 px-8 bg-surface border border-border font-medium flex items-center justify-center hover:bg-background transition-colors"
              >
                Dashboard
              </a>
            </div>
          </div>
        )}

        {/* Paused state (lobby phase but game already started) */}
        {gameState.phase === "lobby" && gameState.started_at && (
          <div className="pt-8 pb-28 space-y-6">
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

            {/* QR + game code — players can still join while paused */}
            <div className="flex justify-center">
              <BrandedQR value={joinUrl} size={200} />
            </div>

            <button
              onClick={copyCode}
              className="w-full text-center group space-y-1"
              aria-label="Copy join code"
            >
              <div className="flex items-center justify-center gap-2">
                <span className="font-mono text-4xl font-bold tracking-[0.2em] text-primary">
                  {event.joinCode}
                </span>
                {copied ? (
                  <svg className="size-5 text-correct shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                  </svg>
                ) : (
                  <svg className="size-5 text-muted-foreground group-hover:text-foreground transition-colors shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15.666 3.888A2.25 2.25 0 0 0 13.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 0 1-.75.75H9a.75.75 0 0 1-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 0 1-2.25 2.25H6.75A2.25 2.25 0 0 1 4.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 0 1 1.927-.184" />
                  </svg>
                )}
              </div>
              <p className="text-xs text-muted-foreground/60">
                {copied ? "✓ Copied!" : "tap anywhere to copy"}
              </p>
            </button>

            {sponsors.length > 0 && (
              <div className="w-full pt-4">
                <SponsorBar sponsors={sponsors} />
              </div>
            )}
          </div>
        )}
      </div>

      {/* Sticky Resume Game — paused state */}
      {gameState.phase === "lobby" && gameState.started_at && (
        <div className="fixed bottom-0 left-0 right-0 bg-background/95 backdrop-blur-sm border-t border-border px-5 py-4 z-40">
          <div className="max-w-2xl mx-auto">
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
              className="w-full h-14 bg-primary text-primary-foreground text-lg font-bold hover:bg-primary-hover transition-colors disabled:opacity-50"
            >
              Resume Game
            </button>
          </div>
        </div>
      )}

      {/* Sticky Start Game — lobby pre-start only */}
      {gameState.phase === "lobby" && !gameState.started_at && (
        <div className="fixed bottom-0 left-0 right-0 bg-background/95 backdrop-blur-sm border-t border-border px-5 py-4 z-40">
          <div className="max-w-2xl mx-auto space-y-3">
            {!isHost && (
              <div className="border border-border bg-surface px-4 py-3 flex items-start justify-between gap-4">
                <div className="space-y-0.5">
                  <p className="text-sm font-medium">You need host access to go live</p>
                  <p className="text-xs text-muted-foreground">Your event is saved as a draft — reach out and we&apos;ll activate you.</p>
                </div>
                <a
                  href="https://t.me/AdamElfarouq"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="shrink-0 h-9 px-4 bg-primary text-primary-foreground text-xs font-medium hover:bg-primary-hover transition-colors inline-flex items-center"
                >
                  Request Access →
                </a>
              </div>
            )}
            <button
              onClick={isHost ? startGame : undefined}
              disabled={!isHost || loading || totalQuestions === 0}
              className="w-full h-14 bg-primary text-primary-foreground text-lg font-bold hover:bg-primary-hover transition-colors disabled:opacity-40 flex items-center justify-center gap-2"
            >
              {!isHost && (
                <svg className="size-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 1 0-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H6.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25Z" />
                </svg>
              )}
              {totalQuestions === 0 ? "No Questions Added" : "Start Game"}
            </button>
          </div>
        </div>
      )}

      {/* Stage View overlay — full-screen projector layout */}
      {stageView && (
        <div className="fixed inset-0 z-50 bg-background flex flex-col items-center justify-center px-8 py-12">
          <button
            onClick={() => setStageView(false)}
            className="absolute top-4 right-4 p-2 text-muted-foreground hover:text-foreground transition-colors"
            aria-label="Exit stage view"
          >
            <svg className="size-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
            </svg>
          </button>

          <img src="/logo-light.svg" alt="BlockTrivia" className="h-10 mb-6 dark:hidden" />
          <img src="/logo-dark.svg" alt="BlockTrivia" className="h-10 mb-6 hidden dark:block" />

          <h1 className="font-heading text-2xl font-bold text-center mb-8">{event.title}</h1>

          <div className="mb-6">
            <BrandedQR value={joinUrl} size={280} />
          </div>

          <p className="text-sm text-muted-foreground mb-2">blocktrivia.com/join</p>

          <p className="font-mono text-[64px] font-bold tracking-[0.2em] text-primary leading-none mb-8">
            {event.joinCode}
          </p>

          <div className="flex items-center gap-2.5">
            <span className={`w-3 h-3 rounded-full bg-correct ${playerPulse ? "animate-ping" : "animate-pulse"}`} />
            <span className="text-3xl font-bold tabular-nums">{playerCount}</span>
            <span className="text-lg text-muted-foreground">player{playerCount !== 1 ? "s" : ""} joined</span>
          </div>

          {sponsors.length > 0 && (
            <div className="absolute bottom-0 left-0 right-0">
              <SponsorBar sponsors={sponsors} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
