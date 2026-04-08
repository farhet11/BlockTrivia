"use client";

import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { createClient } from "@/lib/supabase";
import { SponsorBar } from "@/app/_components/sponsor-bar";
import { AppHeader } from "@/app/_components/app-header";
import { BrandedQR } from "@/app/_components/branded-qr";
import { ShareDrawer } from "@/app/_components/share-drawer";
import { PodiumLayout, RankingRow, type LbEntry } from "@/app/_components/lb-podium";

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

type LeaderboardEntry = LbEntry & {
  correct_count: number;
  total_questions: number;
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
  logoUrl?: string | null;
  logoDarkUrl?: string | null;
  organizerName?: string | null;
};

export function ControlPanel({
  event,
  questions,
  rounds: roundsList,
  initialGameState,
  playerCount: initialPlayerCount,
  sponsors,
  isHost,
  hostUser,
}: {
  event: EventInfo;
  questions: Question[];
  rounds: RoundInfo[];
  initialGameState: GameState;
  playerCount: number;
  sponsors: Sponsor[];
  isHost: boolean;
  hostUser?: { id: string; displayName: string; email: string; avatarUrl: string | null };
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
  const [lbEntries, setLbEntries] = useState<LeaderboardEntry[]>([]);
  const [lbLoading, setLbLoading] = useState(false);
  const [lbDeltas, setLbDeltas] = useState<Map<string, number | null>>(new Map());
  const prevRanksRef = useRef<Map<string, number>>(new Map());
  const [prePausePhase, setPrePausePhase] = useState<string | null>(null);
  const [answeredCount, setAnsweredCount] = useState(0);
  const [showShare, setShowShare] = useState(false);
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

  // Track how many players have answered the current question
  useEffect(() => {
    if (!gameState.current_question_id || gameState.phase !== "playing") {
      setAnsweredCount(0);
      return;
    }
    const qId = gameState.current_question_id;

    async function fetchCount() {
      const { count } = await supabase
        .from("responses")
        .select("*", { count: "exact", head: true })
        .eq("question_id", qId);
      if (count !== null) setAnsweredCount(count);
    }

    fetchCount();

    // Realtime: fires once responses is in the supabase_realtime publication (migration 041).
    // Polling every 2s is the belt-and-suspenders fallback for any Realtime gap.
    const poll = setInterval(fetchCount, 2000);

    const channel = supabase
      .channel(`answers:${qId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "responses", filter: `question_id=eq.${qId}` },
        fetchCount
      )
      .subscribe();

    return () => {
      clearInterval(poll);
      supabase.removeChannel(channel);
    };
  }, [gameState.current_question_id, gameState.phase, supabase]);

  // Subscribe to player count changes + polling fallback every 3s
  useEffect(() => {
    async function fetchPlayerCount() {
      const { count } = await supabase
        .from("event_players")
        .select("*", { count: "exact", head: true })
        .eq("event_id", event.id);
      if (count !== null) setPlayerCount(count);
    }

    fetchPlayerCount();
    const pollInterval = setInterval(fetchPlayerCount, 3000);

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
      clearInterval(pollInterval);
      supabase.removeChannel(channel);
    };
  }, [supabase, event.id]);

  // Fetch leaderboard when phase is "leaderboard"
  useEffect(() => {
    if (gameState.phase !== "leaderboard") return;
    setLbLoading(true);

    // Snapshot current ranks for delta computation
    const snapshot = new Map<string, number>();
    lbEntries.forEach((e) => snapshot.set(e.player_id, e.rank));
    const isFirstLoad = prevRanksRef.current.size === 0 && lbEntries.length === 0;

    supabase
      .from("leaderboard_entries")
      .select(`player_id, total_score, correct_count, total_questions, rank, profiles!leaderboard_entries_player_id_fkey ( display_name, avatar_url )`)
      .eq("event_id", event.id)
      .order("rank", { ascending: true })
      .limit(20)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .then(async ({ data }) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let entries: LeaderboardEntry[] = (data ?? []).map((row: any) => ({
          player_id: row.player_id,
          display_name: row.profiles?.display_name ?? "Player",
          avatar_url: row.profiles?.avatar_url ?? null,
          total_score: row.total_score,
          rank: row.rank,
          correct_count: row.correct_count,
          total_questions: row.total_questions,
        }));

        // Fallback: no scores yet — show all joined players at 0 pts
        if (entries.length === 0) {
          const { data: players } = await supabase
            .from("event_players")
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            .select(`player_id, profiles ( display_name, avatar_url )`)
            .eq("event_id", event.id)
            .limit(20);
          if (players) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            entries = players.map((p: any, i: number) => ({
              player_id: p.player_id,
              display_name: p.profiles?.display_name ?? "Player",
              avatar_url: p.profiles?.avatar_url ?? null,
              total_score: 0,
              rank: i + 1,
              correct_count: 0,
              total_questions: 0,
            }));
          }
        }

        const deltas = new Map<string, number | null>();
        entries.forEach((e) => {
          const prev = isFirstLoad ? undefined : (prevRanksRef.current.get(e.player_id) ?? snapshot.get(e.player_id));
          deltas.set(e.player_id, prev != null ? prev - e.rank : null);
        });
        prevRanksRef.current = new Map(entries.map((e) => [e.player_id, e.rank]));
        setLbEntries(entries);
        setLbDeltas(deltas);
        setLbLoading(false);
      });
  }, [gameState.phase, event.id, supabase]); // eslint-disable-line react-hooks/exhaustive-deps

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

    await updateEventStatus("active");
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

  // Pause — shows leaderboard, remembers where we were
  async function pauseGame() {
    setPrePausePhase(gameState.phase);
    await updateEventStatus("paused");
    await updateGameState({ phase: "leaderboard" });
  }

  // Resume — goes back to exactly where we paused
  async function resumeGame() {
    const phase = prePausePhase ?? "playing";
    setPrePausePhase(null);
    await updateEventStatus("active");
    if (phase === "revealing") {
      await updateGameState({ phase: "revealing" });
    } else {
      await updateGameState({ phase: "playing", question_started_at: new Date().toISOString() });
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
      <AppHeader
        logoHref="/host"
        user={hostUser ?? null}
        avatarUrl={hostUser?.avatarUrl}
      />

      <div className="flex-1 max-w-lg md:max-w-2xl lg:max-w-3xl mx-auto w-full px-5">
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
                  <span className="ml-1.5 text-muted-foreground/60 uppercase tracking-wider">
                    · {currentQuestion.round_type.replace("_", "/")}
                  </span>
                </span>
                <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 13, fontWeight: 400, color: "#78756e" }}>
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

            {/* Timer bar — 4px shrinking bar with glowing leading-edge dot */}
            {timeLeft !== null && (() => {
              const pct = Math.max(0, (timeLeft / currentQuestion.time_limit) * 100);
              const timerColor = pct > 50 ? '#7c3aed' : pct > 20 ? '#f59e0b' : '#ef4444';
              const timerGlow = pct > 50 ? 'rgba(124,58,237,0.5)' : pct > 20 ? 'rgba(245,158,11,0.5)' : 'rgba(239,68,68,0.5)';
              return (
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
              );
            })()}

            {/* Timer row — large timer number */}
            <div className="flex items-center justify-end">
              <span
                className={`font-mono text-[32px] font-bold tabular-nums ${
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
            <div className="space-y-4">
              <h2 className="font-heading text-base font-medium leading-snug text-foreground">
                {currentQuestion.body}
              </h2>

              <div className="grid grid-cols-2 gap-2">
                {((currentQuestion.options ?? []) as string[]).map(
                  (option: string, i: number) => (
                    <div
                      key={i}
                      className="p-3 border border-border bg-[#f5f3ef] dark:bg-[#1f1f23] text-sm text-muted-foreground break-words"
                    >
                      <span className="font-semibold mr-1.5">
                        {String.fromCharCode(65 + i)}.
                      </span>
                      {option}
                    </div>
                  )
                )}
              </div>
            </div>

            {/* Controls — State 1: waiting on players */}
            {timeLeft !== null && timeLeft > 0 && answeredCount < playerCount ? (
              <div className="flex items-center gap-3">
                <span className="flex-1 inline-flex items-center justify-center px-4 py-2 bg-[#f0ecfe] dark:bg-[rgba(124,58,237,0.12)] text-[#5b21b6] dark:text-[#a78bfa] text-sm font-semibold select-none">
                  {answeredCount}/{playerCount} answered
                </span>
                <button
                  onClick={pauseGame}
                  disabled={loading}
                  className="h-9 px-5 bg-surface border border-border text-sm font-medium hover:bg-background transition-colors disabled:opacity-50"
                >
                  Pause
                </button>
              </div>
            ) : (
              /* State 2: timer expired or all answered — reveal is ready */
              <div className="flex flex-col gap-1.5">
                <p className="text-xs text-center text-muted-foreground">
                  {answeredCount}/{playerCount} answered
                </p>
                <button
                  onClick={revealAnswer}
                  disabled={loading}
                  className="w-full h-12 bg-primary text-primary-foreground font-medium hover:bg-primary-hover transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Reveal Answer
                </button>
              </div>
            )}
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
              <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 13, fontWeight: 400, color: "#78756e" }}>Q{indexInRound + 1}/{questionsInRound.length}</span>
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
                onClick={pauseGame}
                disabled={loading}
                className="h-12 px-6 bg-surface border border-border font-medium hover:bg-background transition-colors disabled:opacity-50"
              >
                Pause
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
          <div className="py-6 pb-36 space-y-5">
            {/* Event title + hosted by + status — matches leaderboard page */}
            <div className="text-center space-y-2" style={{ animation: "lb-fade-up 280ms ease-out both" }}>
              <h2 className="font-heading text-2xl font-bold leading-tight">{event.title}</h2>
              <div className="flex flex-col items-center gap-1">
                <p className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground" style={{ fontFamily: "Inter, sans-serif" }}>
                  Hosted by
                </p>
                {event.logoUrl ? (
                  <img src={event.logoUrl} alt={event.organizerName ?? "Organizer"} className="h-7 max-w-[120px] object-contain" />
                ) : (
                  <>
                    <img src="/logo-light.svg" alt="BlockTrivia" className="h-7 max-w-[120px] object-contain dark:hidden" />
                    <img src="/logo-dark.svg" alt="BlockTrivia" className="h-7 max-w-[120px] object-contain hidden dark:block" />
                  </>
                )}
              </div>
              <div className="flex justify-center pt-1">
                <span
                  className="inline-flex items-center gap-1.5 px-3 py-1 text-[11px] font-bold uppercase tracking-wider"
                  style={{ color: "#f59e0b", background: "#f59e0b18", fontFamily: "Inter, sans-serif", letterSpacing: "0.06em" }}
                >
                  <span className="size-1.5 rounded-full shrink-0" style={{ background: "#f59e0b" }} />
                  Paused
                </span>
              </div>
            </div>

            {/* Stats bar — 3 data cols + clickable join code */}
            <div
              className="grid grid-cols-4 border border-border divide-x divide-border"
              style={{ animation: "lb-fade-up 280ms ease-out 80ms both" }}
            >
              <div className="px-3 py-2.5 text-center">
                <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Players</p>
                <p className="font-heading text-lg font-bold tabular-nums">{playerCount}</p>
              </div>
              <div className="px-3 py-2.5 text-center">
                <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Question</p>
                <p className="font-heading text-lg font-bold tabular-nums">{currentIndex >= 0 ? `${currentIndex + 1}/${totalQuestions}` : "—"}</p>
              </div>
              <div className="px-3 py-2.5 text-center">
                <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Round</p>
                <p className="font-heading text-lg font-bold tabular-nums">{currentRoundIndex >= 0 ? `${currentRoundIndex + 1}/${rounds.length}` : "—"}</p>
              </div>
              <button
                onClick={() => setShowShare(true)}
                className="px-3 py-2.5 text-center hover:bg-accent transition-colors"
              >
                <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Join Code</p>
                <p className="font-heading text-lg font-bold text-primary font-mono tracking-wider">{event.joinCode}</p>
              </button>
            </div>

            {/* PODIUM — top 3 */}
            {lbLoading ? (
              <div className="space-y-2">
                {[...Array(5)].map((_, i) => (
                  <div key={i} className="h-14 bg-surface border border-border animate-pulse" />
                ))}
              </div>
            ) : (
              <>
                <div style={{ animation: "lb-fade-up 350ms ease-out 160ms both" }}>
                  <PodiumLayout entries={lbEntries.slice(0, 3)} />
                </div>

                {/* RANKINGS — 4th+ */}
                {lbEntries.slice(3).length > 0 && (
                  <div className="border-t border-border">
                    {lbEntries.slice(3).map((entry, i) => (
                      <RankingRow
                        key={entry.player_id}
                        entry={entry}
                        firstScore={lbEntries[0]?.total_score ?? 1}
                        delta={lbDeltas.get(entry.player_id) ?? null}
                        isMe={false}
                        animIndex={i + 3}
                      />
                    ))}
                  </div>
                )}
              </>
            )}

          </div>
        )}

        {/* Phase: Interstitial — between rounds */}
        {gameState.phase === "interstitial" && (
          <div className="flex flex-col items-center justify-center py-16 pb-28 space-y-8">
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

      </div>

      {/* Sticky Start Game — lobby pre-start only */}
      {gameState.phase === "lobby" && !gameState.started_at && (
        <div className="fixed bottom-0 left-0 right-0 bg-background/95 backdrop-blur-sm border-t border-border px-5 py-4 z-40">
          <div className="max-w-2xl mx-auto space-y-3">
            {!isHost && (
              <div className="border border-border bg-surface px-4 py-3 flex items-start justify-between gap-4">
                <div className="space-y-0.5">
                  <p className="text-sm font-medium">You need host access to go live</p>
                  <p className="text-xs text-muted-foreground">Your event is saved as a draft - reach out and we&apos;ll activate you.</p>
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


      {/* Sticky Sponsors — interstitial phase */}
      {gameState.phase === "interstitial" && sponsors.length > 0 && (
        <div className="fixed bottom-0 left-0 right-0 z-40 bg-background border-t border-border py-2 px-4">
          <p className="text-center text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1.5">Sponsored by</p>
          <div className="flex items-center justify-center gap-6 flex-wrap max-w-lg md:max-w-2xl lg:max-w-3xl mx-auto">
            {sponsors.sort((a, b) => a.sort_order - b.sort_order).map((s) => (
              <img key={s.id} src={s.logo_url} alt={s.name ?? "Sponsor"} className="h-6 max-w-[100px] object-contain grayscale opacity-60 dark:invert dark:brightness-200" />
            ))}
          </div>
        </div>
      )}

      {/* Sticky Sponsors + Next Question — leaderboard phase */}
      {gameState.phase === "leaderboard" && (
        <div className="fixed bottom-0 left-0 right-0 z-40 bg-background border-t border-border">
          {sponsors.length > 0 && (
            <div className="py-2 px-4">
              <p className="text-center text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1.5">Sponsored by</p>
              <div className="flex items-center justify-center gap-6 flex-wrap max-w-lg md:max-w-2xl lg:max-w-3xl mx-auto">
                {sponsors.sort((a, b) => a.sort_order - b.sort_order).map((s) => (
                  <img key={s.id} src={s.logo_url} alt={s.name ?? "Sponsor"} className="h-6 max-w-[100px] object-contain grayscale opacity-60 dark:invert dark:brightness-200" />
                ))}
              </div>
            </div>
          )}
          <div className="max-w-lg md:max-w-2xl lg:max-w-3xl mx-auto px-5 py-3">
            <button
              onClick={resumeGame}
              disabled={loading}
              className="w-full h-12 bg-primary text-primary-foreground font-heading font-semibold hover:bg-primary-hover transition-colors disabled:opacity-50"
            >
              Resume Game
            </button>
          </div>
        </div>
      )}

      {/* Share drawer — triggered by join code card */}
      {showShare && (
        <ShareDrawer joinCode={event.joinCode} onClose={() => setShowShare(false)} />
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
