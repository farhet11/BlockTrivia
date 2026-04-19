"use client";

import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import Image from "next/image";
import { createClient } from "@/lib/supabase";
import { useServerClock } from "@/lib/use-server-clock";
import { SponsorBar } from "@/app/_components/sponsor-bar";
import { AppHeader } from "@/app/_components/app-header";
import { BrandedQR } from "@/app/_components/branded-qr";
import { ShareDrawer } from "@/app/_components/share-drawer";
import { PodiumLayout, RankingRow, type LbEntry } from "@/app/_components/lb-podium";
import { proxyImageUrl } from "@/lib/image-proxy";
import { RoundTypeBadge } from "@/app/_components/round-type-badge";
import { resolvePlayerName } from "@/lib/player-name";
import { resolveHostRevealView } from "@/lib/game/round-registry";
import { HostRevealShell } from "@/rounds/_shared/host-reveal-shell";
import { InterstitialCard } from "@/rounds/_shared/interstitial-card";
import { Ban, Eye, ChevronRight, Play, Pause, Flag } from "lucide-react";
import { HostControlBar, type OverflowMenuItem } from "./host-control-bar";

type Question = {
  id: string;
  round_id: string;
  body: string;
  options: string[];
  correct_answer: number;
  correct_answer_numeric?: number | null;
  explanation?: string | null;
  image_url?: string | null;
  /** Pixel Reveal: 'pixelated' (default) or 'tile_reveal'. */
  reveal_mode?: "pixelated" | "tile_reveal" | null;
  sort_order: number;
  round_title: string;
  round_type: string;
  time_limit: number;
  base_points: number;
  round_interstitial_text?: string | null;
  round_config?: Record<string, unknown>;
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
  /** Ephemeral per-question state for complex round types (e.g. Pressure Cooker spotlight). */
  round_state: Record<string, unknown> | null;
  /** Live modifier state — set by host during game. */
  modifier_state: Record<string, unknown> | null;
  /** Pause flag — when true, host and player freeze timer and show pause overlay without navigating. */
  is_paused: boolean;
  /** Question ids voided by the host mid-game (migration 068). */
  voided_question_ids?: string[] | null;
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

type DefaultModifier = {
  modifier_type: string;
  config: Record<string, unknown>;
};

type AvailableModifier = {
  type: string;
  displayName: string;
  description: string;
  compatibleRounds: string[];
};

export function ControlPanel({
  event,
  questions,
  rounds: roundsList,
  initialGameState,
  playerCount: initialPlayerCount,
  sponsors,
  defaultModifiers,
  availableModifiers,
  isHost,
  hostUser,
}: {
  event: EventInfo;
  questions: Question[];
  rounds: RoundInfo[];
  initialGameState: GameState;
  playerCount: number;
  sponsors: Sponsor[];
  defaultModifiers: Record<string, DefaultModifier>;
  availableModifiers: AvailableModifier[];
  isHost: boolean;
  hostUser?: { id: string; displayName: string; email: string; avatarUrl: string | null };
}) {
  const supabase = useMemo(() => createClient(), []);
  const { serverNow } = useServerClock();
  const [gameState, setGameState] = useState<GameState>(initialGameState);
  const [playerCount, setPlayerCount] = useState(initialPlayerCount);
  const [loading, setLoading] = useState(false);
  const [timeLeft, setTimeLeft] = useState<number | null>(null);
  // Interstitial: manual advance only (host taps Start Round). No countdown
  // state — kept only as a timer ref for legacy cleanup paths.
  const [, setInterstitialCountdown] = useState<number | null>(null);
  const interstitialTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // Ref to always have the latest version of startFirstQuestionOfRound
  // (defined later in the component — used by the interstitial countdown interval)
  const startFirstQuestionOfRoundRef = useRef<(() => Promise<void>) | null>(null);
  const [copied, setCopied] = useState(false);
  const [stageView, setStageView] = useState(false);
  const [playerPulse, setPlayerPulse] = useState(false);
  const [lbEntries, setLbEntries] = useState<LeaderboardEntry[]>([]);
  const [lbLoading, setLbLoading] = useState(false);
  const [lbDeltas, setLbDeltas] = useState<Map<string, number | null>>(new Map());
  const prevRanksRef = useRef<Map<string, number>>(new Map());
  const [answeredCount, setAnsweredCount] = useState(0);
  const [revealStats, setRevealStats] = useState<{ correctCount: number; avgTimeSeconds: number | null }>(
    { correctCount: -1, avgTimeSeconds: null }
  );
  const [showShare, setShowShare] = useState(false);
  // Replay mode: read-only view of the immediately-prior question. null = not replaying.
  const [replayQuestionId, setReplayQuestionId] = useState<string | null>(null);
  // Void modal open flag
  const [voidConfirmOpen, setVoidConfirmOpen] = useState(false);
  const [voidLoading, setVoidLoading] = useState(false);
  const joinUrl = typeof window !== "undefined" ? `${window.location.origin}/join/${event.joinCode}` : `/join/${event.joinCode}`;

  // ── Live modifier state ─────────────────────────────────────────────────
  const initModState = initialGameState.modifier_state;
  const [activeModifier, setActiveModifier] = useState<{ type: string; config: Record<string, unknown> } | null>(
    initModState && typeof (initModState as Record<string, unknown>)?.type === "string" && (initModState as Record<string, unknown>).type !== ""
      ? { type: (initModState as Record<string, unknown>).type as string, config: ((initModState as Record<string, unknown>).config as Record<string, unknown>) ?? {} }
      : null
  );

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
    if (!gameState.current_question_id) {
      // No active question — hard reset.
      setAnsweredCount(0);
      return;
    }
    if (gameState.phase !== "playing") {
      // Revealing / leaderboard / etc. — keep the tally from the playing phase
      // so the reveal screen still shows "X/Y answered" rather than "0/Y".
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

    // Coalesce Realtime INSERT bursts: under 200+ concurrent submits, firing one
    // HEAD per INSERT floods the PostgREST connection and queues the host's
    // Reveal PATCH behind hundreds of counting requests. Debounce to one fetch
    // per 500ms window — the "answered" counter doesn't need per-event fidelity.
    let debounceT: ReturnType<typeof setTimeout> | null = null;
    let pendingCount = 0;
    function scheduleFetch() {
      pendingCount += 1;
      if (debounceT) return;
      debounceT = setTimeout(() => {
        debounceT = null;
        // Optimistic tick: bump displayed count immediately for perceived latency,
        // then reconcile with authoritative fetch.
        setAnsweredCount((c) => c + pendingCount);
        pendingCount = 0;
        fetchCount();
      }, 500);
    }

    fetchCount();

    // Realtime: fires via supabase_realtime publication (migration 041).
    // Polling every 10s is the safety net; Realtime is the primary path.
    const poll = setInterval(fetchCount, 10000);

    const channel = supabase
      .channel(`answers:${qId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "responses", filter: `question_id=eq.${qId}` },
        scheduleFetch
      )
      .subscribe();

    return () => {
      clearInterval(poll);
      if (debounceT) clearTimeout(debounceT);
      supabase.removeChannel(channel);
    };
  }, [gameState.current_question_id, gameState.phase, supabase]);

  // Fetch reveal-phase stats (correct count, avg time) for the host reveal
  // screen. Runs only when phase === "revealing" — avoids unnecessary load
  // during the playing phase when the answer shouldn't be visible yet.
  useEffect(() => {
    if (gameState.phase !== "revealing" || !gameState.current_question_id) {
      setRevealStats({ correctCount: -1, avgTimeSeconds: null });
      return;
    }
    const qId = gameState.current_question_id;
    let cancelled = false;

    async function fetchStats() {
      // Column is time_taken_ms (migration 001) — NOT response_time_ms.
      const { data, error } = await supabase
        .from("responses")
        .select("is_correct, time_taken_ms")
        .eq("question_id", qId);
      if (cancelled) return;
      if (error || !data) {
        // Fetch failed — flip to "0 responses" state so the cards render
        // real zeros instead of the "—" fallback (which looks like a bug).
        setRevealStats({ correctCount: 0, avgTimeSeconds: null });
        return;
      }
      const correctCount = data.filter((r) => r.is_correct).length;
      const times = data
        .map((r) => r.time_taken_ms)
        .filter((t): t is number => typeof t === "number" && t > 0);
      const avgTimeSeconds =
        times.length > 0
          ? times.reduce((a, b) => a + b, 0) / times.length / 1000
          : null;
      setRevealStats({ correctCount, avgTimeSeconds });
      setAnsweredCount(data.length); // sync answered count with reveal data
    }

    fetchStats();
    return () => {
      cancelled = true;
    };
  }, [gameState.phase, gameState.current_question_id, supabase]);

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
    // 15s reconciliation; Realtime on event_players (migration 063) is primary.
    const pollInterval = setInterval(fetchPlayerCount, 15000);

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
          fetchPlayerCount(); // authoritative count — avoids drift on burst joins
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

  // Fetch leaderboard when phase is "leaderboard" OR when the game is paused
  // (pause re-uses the leaderboard UI to keep players engaged).
  useEffect(() => {
    if (gameState.phase !== "leaderboard" && !gameState.is_paused) return;
     
    setLbLoading(true);

    // Snapshot current ranks for delta computation
    const snapshot = new Map<string, number>();
    lbEntries.forEach((e) => snapshot.set(e.player_id, e.rank));
    const isFirstLoad = prevRanksRef.current.size === 0 && lbEntries.length === 0;

    // Load ALL entries — the host needs to see every player. The host-side list
    // is scrollable (max-height on the rankings container below), not truncated.
    supabase
      .from("leaderboard_entries")
      .select(`player_id, total_score, correct_count, total_questions, rank, profiles!leaderboard_entries_player_id_fkey ( username, display_name, avatar_url )`)
      .eq("event_id", event.id)
      .order("rank", { ascending: true })

      .then(async ({ data }) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let entries: LeaderboardEntry[] = (data ?? []).map((row: any) => ({
          player_id: row.player_id,
          display_name: resolvePlayerName(null, row.profiles?.username, row.profiles?.display_name),
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

            .select(`player_id, game_alias, profiles ( username, display_name, avatar_url )`)
            .eq("event_id", event.id)
            .limit(20);
          if (players) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            entries = players.map((p: any, i: number) => ({
              player_id: p.player_id,
              display_name: resolvePlayerName(p.game_alias, p.profiles?.username, p.profiles?.display_name),
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
    // `lbEntries` intentionally omitted: it's only read to snapshot previous
    // ranks for delta computation; re-including it would cause the effect to
    // re-fire on every setLbEntries() and create an infinite loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameState.phase, gameState.is_paused, event.id, supabase]);

  // Countdown timer (question) — freezes when paused
  useEffect(() => {
    if (gameState.phase !== "playing" || !gameState.question_started_at || !currentQuestion || gameState.is_paused) {
      if (!gameState.is_paused) setTimeLeft(null);
      return;
    }

    const startedAt = new Date(gameState.question_started_at).getTime();
    const duration = currentQuestion.time_limit * 1000;

    // `let` because `tick` references `interval` and runs before assignment
    // eslint-disable-next-line prefer-const
    let interval: ReturnType<typeof setInterval>;
    const tick = () => {
      const elapsed = Math.max(0, serverNow() - startedAt);
      const remaining = Math.max(0, Math.ceil((duration - elapsed) / 1000));
      setTimeLeft(remaining);
      if (remaining <= 0 && interval) clearInterval(interval);
    };

    tick();
    interval = setInterval(tick, 200);
    return () => clearInterval(interval);
  }, [gameState.phase, gameState.question_started_at, gameState.is_paused, currentQuestion, serverNow]);

  // Interstitial: MANUAL advance. Host must click "Start Round" to proceed —
  // this gives them time to verbally explain the round mechanic (especially
  // important for non-MCQ rounds like Pixel Reveal, WipeOut, Oracle's Dilemma
  // where first-time players won't know what to do).
  // The state + ref are kept for backwards compatibility with the startFirstQuestionOfRound
  // flow, but no timer is scheduled.
  useEffect(() => {
    setInterstitialCountdown(null);
    if (interstitialTimerRef.current) {
      clearInterval(interstitialTimerRef.current);
      interstitialTimerRef.current = null;
    }
  }, [gameState.phase, gameState.current_round_id, gameState.is_paused]);

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

  /**
   * Pick a random active player from event_players for Pressure Cooker spotlight.
   * Returns null if the query fails or there are no players yet.
   */
  async function pickSpotlightPlayer(): Promise<{ id: string; display_name: string } | null> {
    const { data, error } = await supabase
      .from("event_players")
      .select("player_id, game_alias")
      .eq("event_id", event.id)
      .limit(100);
    if (error || !data || data.length === 0) return null;
    const pick = data[Math.floor(Math.random() * data.length)];
    return { id: pick.player_id as string, display_name: pick.game_alias as string };
  }

  /**
   * Build round_state for a question. For Pressure Cooker rounds, picks a random
   * spotlight player. For all other rounds, clears round_state (null).
   */
  async function buildRoundState(roundType: string): Promise<Record<string, unknown> | null> {
    if (roundType === "pressure_cooker") {
      const spotlight = await pickSpotlightPlayer();
      if (!spotlight) return null;
      return {
        spotlight_player_id: spotlight.id,
        spotlight_display_name: spotlight.display_name,
      };
    }
    if (roundType === "oracles_dilemma") {
      // Pick a random player as the Oracle
      const oracle = await pickSpotlightPlayer();
      if (!oracle) return null;
      return {
        oracle_player_id: oracle.id,
        oracle_display_name: oracle.display_name,
        oracle_choice: null,
        oracle_suggested_answer: null,
      };
    }
    return null;
  }

  /**
   * Tally votes for The Narrative rounds. Counts responses per option,
   * determines majority, and writes to round_state for scoring.
   */
  async function tallyNarrativeVotes() {
    if (!gameState.current_question_id) return;

    const { data: responses, error } = await supabase
      .from("responses")
      .select("selected_answer")
      .eq("question_id", gameState.current_question_id);

    if (error || !responses || responses.length === 0) return;

    // Count votes per option (0-3)
    const voteCounts = [0, 0, 0, 0];
    for (const r of responses) {
      const idx = r.selected_answer;
      if (idx >= 0 && idx < 4) voteCounts[idx]++;
    }

    // Determine majority (highest vote count, first in case of tie)
    let majorityOption = 0;
    let maxVotes = 0;
    for (let i = 0; i < voteCounts.length; i++) {
      if (voteCounts[i] > maxVotes) {
        maxVotes = voteCounts[i];
        majorityOption = i;
      }
    }

    // Write to round_state so submit_answer scoring can use it
    await supabase
      .from("game_state")
      .update({
        round_state: {
          majority_option: majorityOption,
          vote_counts: voteCounts,
          total_votes: responses.length,
        },
      })
      .eq("event_id", event.id);
  }

  /**
   * Closest Wins: aggregate player guesses into game_state.round_state so
   * both host reveal and player view can render the distribution chart.
   */
  async function tallyClosestWinsGuesses() {
    if (!gameState.current_question_id) return;

    const { data: responses, error } = await supabase
      .from("responses")
      .select("numeric_answer, points_awarded")
      .eq("question_id", gameState.current_question_id)
      .not("numeric_answer", "is", null);

    if (error || !responses) return;

    const guesses: number[] = [];
    for (const r of responses) {
      const v = (r as { numeric_answer: number | null }).numeric_answer;
      if (typeof v === "number" && Number.isFinite(v)) guesses.push(v);
    }

    await supabase
      .from("game_state")
      .update({
        round_state: {
          guesses,
          total_guesses: guesses.length,
        },
      })
      .eq("event_id", event.id);
  }

  // ── Modifier activation/deactivation ──────────────────────────────────────

  async function activateModifier(modType: string) {
    const mod = availableModifiers.find((m) => m.type === modType);
    if (!mod) return;
    // Default config per modifier type
    const config: Record<string, unknown> = modType === "jackpot" ? { multiplier: 5 } : {};
    const modState = { type: modType, config, activated_at: new Date().toISOString() };
    setActiveModifier({ type: modType, config });
    await supabase
      .from("game_state")
      .update({ modifier_state: modState })
      .eq("event_id", event.id);
  }

  async function deactivateModifier() {
    setActiveModifier(null);
    await supabase
      .from("game_state")
      .update({ modifier_state: {} })
      .eq("event_id", event.id);
  }

  // Start game — route through interstitial so round 1 gets the same mechanic
  // primer as rounds 2+. The host clicks "Start Round →" from the interstitial
  // card to actually begin the first question (via startFirstQuestionOfRound).
  async function startGame() {
    if (questions.length === 0) return;
    const first = questions[0];
    setActiveModifier(null);
    await updateEventStatus("active");
    await updateGameState({
      phase: "interstitial",
      current_round_id: first.round_id,
      current_question_id: null,
      question_started_at: null,
      started_at: new Date().toISOString(),
      round_state: null,
      modifier_state: {},
    } as Partial<GameState>);
  }

  // Start first question of the current_round_id (called from interstitial)
  async function startFirstQuestionOfRound() {
    const roundId = gameState.current_round_id;
    if (!roundId) return;
    const firstQ = questions.find((q) => q.round_id === roundId);
    if (!firstQ) return;
    const roundState = await buildRoundState(firstQ.round_type);
    setActiveModifier(null);
    await updateGameState({
      phase: "playing",
      current_round_id: roundId,
      current_question_id: firstQ.id,
      question_started_at: new Date(Date.now() + 3000).toISOString(),
      round_state: roundState,
      modifier_state: {},
    } as Partial<GameState>);
  }
  // Keep the ref in sync for the interstitial countdown to call the latest version
  useEffect(() => {
    startFirstQuestionOfRoundRef.current = startFirstQuestionOfRound;
  });

  // Next question (or show interstitial at round boundary)
  async function nextQuestion() {
    if (currentIndex < 0) return;

    const nextIdx = currentIndex + 1;
    if (nextIdx >= questions.length) {
      await endGame();
      return;
    }

    const next = questions[nextIdx];

    // At round boundary — show interstitial, clear modifier
    if (isRoundBoundary && nextRound) {
      setActiveModifier(null);
      await updateGameState({
        phase: "interstitial",
        current_round_id: next.round_id,
        current_question_id: null,
        question_started_at: null,
        round_state: null,
        modifier_state: {},
      } as Partial<GameState>);
      return;
    }

    const roundState = await buildRoundState(next.round_type);
    await updateEventStatus("active");
    await updateGameState({
      phase: "playing",
      current_round_id: next.round_id,
      current_question_id: next.id,
      question_started_at: new Date(Date.now() + 3000).toISOString(),
      round_state: roundState,
    });
  }

  // Show reveal (correct answer)
  async function revealAnswer() {
    // Round-type rescoring MUST finish before flipping phase — these rewrite
    // per-response is_correct/points_awarded that the reveal UI reads.
    // The Narrative: tally votes + retroactively rescore all responses (migration 066)
    if (currentQuestion?.round_type === "the_narrative") {
      await tallyNarrativeVotes();
      await supabase.rpc("rescore_the_narrative", {
        p_question_id: currentQuestion.id,
        p_event_id: event.id,
      });
    }
    // Closest Wins: distribute pot-based scores before reveal (migration 064)
    if (currentQuestion?.round_type === "closest_wins") {
      await supabase.rpc("rescore_closest_wins", {
        p_question_id: currentQuestion.id,
        p_event_id: event.id,
      });
      await tallyClosestWinsGuesses();
    }
    // Fire phase flip and leaderboard recompute IN PARALLEL. Phase flip is what
    // players feel — it unblocks the reveal screen. recompute_leaderboard_ranks
    // is heavy (200+ players = ~300-800ms) and only matters when phase="leaderboard"
    // or for the pinned "#N" rank in the reveal banner (which refreshes on next
    // /leaderboard_entries read anyway). Running serial added visible button lag.
    await Promise.all([
      updateGameState({ phase: "revealing" }),
      supabase.rpc("recompute_leaderboard_ranks", { p_event_id: event.id }),
    ]);
  }

  // Pause — shows leaderboard, remembers where we were
  async function pauseGame() {
    // Keep phase intact — just set is_paused so players stay on /play (no route transition).
    await updateEventStatus("paused");
    await updateGameState({ is_paused: true } as Partial<GameState>);
  }

  // Resume — clear pause flag and reset timer to full for the current question
  async function resumeGame() {
    await updateEventStatus("active");
    // Only refresh question_started_at when we're in "playing" — revealing/interstitial
    // don't have an active timer to reset.
    const updates: Partial<GameState> = { is_paused: false };
    if (gameState.phase === "playing") {
      updates.question_started_at = new Date().toISOString();
    }
    await updateGameState(updates);
  }

  // End game
  async function endGame() {
    await supabase.rpc("recompute_leaderboard_ranks", { p_event_id: event.id });
    await updateEventStatus("ended");
    await updateGameState({
      phase: "ended",
      ended_at: new Date().toISOString(),
    });
  }

  // Void the current question: zero all responses + rebuild leaderboard.
  // Server-side guarded by RPC (migration 068).
  async function confirmVoid() {
    if (!currentQuestion) return;
    setVoidLoading(true);
    await supabase.rpc("void_question", {
      p_event_id: event.id,
      p_question_id: currentQuestion.id,
    });
    // Refetch game_state so voided_question_ids is up to date for the pill.
    const { data } = await supabase
      .from("game_state")
      .select()
      .eq("event_id", event.id)
      .single();
    if (data) setGameState(data as GameState);
    setVoidLoading(false);
    setVoidConfirmOpen(false);
  }

  // Reset to lobby — recovers from corrupted game state
  async function resetToLobby() {
    await updateEventStatus("draft");
    await updateGameState({
      phase: "lobby",
      current_round_id: null,
      current_question_id: null,
      question_started_at: null,
      started_at: null,
      ended_at: null,
      round_state: {},
      modifier_state: {},
      is_paused: false,
    } as Partial<GameState>);
    setActiveModifier(null);
  }

  function copyCode() {
    navigator.clipboard.writeText(event.joinCode).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  // Next button label + icon
  const nextLabel = isLastQuestion ? "End Game" : isRoundBoundary ? `Start Round ${(nextRound ? rounds.findIndex((r) => r.id === nextRound.id) + 1 : 2)}` : "Next Question";
  const nextIcon = isLastQuestion ? Flag : isRoundBoundary ? Play : ChevronRight;

  // Voided questions — derived from game_state, used for the VOIDED pill.
  const voidedSet = useMemo(
    () => new Set(gameState.voided_question_ids ?? []),
    [gameState.voided_question_ids]
  );

  // Replay: only 1 question back. Hidden on Q1 of Round 1 (currentIndex === 0).
  const canReplay = currentIndex > 0 && !replayQuestionId;
  const inReplayMode = replayQuestionId !== null;
  const replayQuestion = replayQuestionId
    ? questions.find((q) => q.id === replayQuestionId) ?? null
    : null;
  const replayRoundIndex = replayQuestion
    ? rounds.findIndex((r) => r.id === replayQuestion.round_id)
    : -1;
  const replayQuestionsInRound =
    replayRoundIndex >= 0 ? rounds[replayRoundIndex].questions : [];
  const replayIndexInRound = replayQuestion
    ? replayQuestionsInRound.findIndex((q) => q.id === replayQuestion.id)
    : -1;

  function openPrevious() {
    if (inReplayMode) {
      setReplayQuestionId(null); // "Back to current"
      return;
    }
    if (currentIndex <= 0) return;
    setReplayQuestionId(questions[currentIndex - 1].id);
  }

  // Overflow menu — content varies by phase.
  function overflowFor(phase: "playing" | "revealing"): OverflowMenuItem[] {
    const items: OverflowMenuItem[] = [];
    if (phase === "revealing" && currentQuestion) {
      items.push({
        key: "void",
        label: "Void this question",
        tone: "danger",
        icon: Ban,
        onSelect: () => setVoidConfirmOpen(true),
      });
    }
    return items;
  }

  return (
    <div className="min-h-dvh bg-background flex flex-col">
      <AppHeader
        logoHref="/host"
        user={hostUser ?? null}
        avatarUrl={hostUser?.avatarUrl}
      />

      <div className="flex-1 max-w-lg md:max-w-2xl lg:max-w-3xl mx-auto w-full px-5 pb-20">
        {/* Replay: read-only view of the immediately-prior question. While
            active, the live phase UI is hidden. HostControlBar stays wired to
            the LIVE phase so the host can still advance. */}
        {inReplayMode && replayQuestion && (() => {
          const HostRevealView = resolveHostRevealView(replayQuestion.round_type);
          const revealQuestion = {
            id: replayQuestion.id,
            round_id: replayQuestion.round_id,
            body: replayQuestion.body,
            options: (replayQuestion.options ?? []) as string[],
            correct_answer: replayQuestion.correct_answer,
            correct_answer_numeric: replayQuestion.correct_answer_numeric ?? null,
            explanation: replayQuestion.explanation ?? null,
            sort_order: replayQuestion.sort_order,
            round_title: replayQuestion.round_title,
            round_type: replayQuestion.round_type,
            time_limit_seconds: replayQuestion.time_limit,
            base_points: replayQuestion.base_points,
            time_bonus_enabled: true,
            config: replayQuestion.round_config ?? {},
            image_url: replayQuestion.image_url ?? null,
            reveal_mode: replayQuestion.reveal_mode ?? null,
          };
          const isVoided = voidedSet.has(replayQuestion.id);
          return (
            <div>
              <div className="pt-4 flex items-center justify-center gap-2">
                <span className="inline-flex items-center gap-1.5 px-3 py-1 text-[11px] font-bold uppercase tracking-wider bg-primary/15 text-primary rounded-full">
                  <span className="size-1.5 rounded-full bg-primary" />
                  Reviewing
                </span>
                {isVoided && (
                  <span className="inline-flex items-center px-3 py-1 text-[11px] font-bold uppercase tracking-wider bg-wrong text-white rounded-full">
                    Voided
                  </span>
                )}
              </div>
              <HostRevealShell
                roundType={replayQuestion.round_type}
                roundTitle={replayQuestion.round_title}
                roundIndex={replayRoundIndex}
                roundCount={rounds.length}
                questionIndexInRound={replayIndexInRound}
                questionCountInRound={replayQuestionsInRound.length}
                questionBody={replayQuestion.body}
                answered={0}
                playerCount={playerCount}
                correctCount={0}
                avgTimeSeconds={null}
                answerNode={
                  <HostRevealView
                    question={revealQuestion}
                    roundConfig={replayQuestion.round_config ?? {}}
                    roundState={undefined}
                  />
                }
                explanation={replayQuestion.explanation ?? null}
              />
            </div>
          );
        })()}

        {/* Breadcrumb */}
        {/* Phase: Lobby — waiting to start */}
        {!inReplayMode && gameState.phase === "lobby" && !gameState.started_at && (
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
                  <svg className="size-5 text-correct shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                  </svg>
                ) : (
                  <svg className="size-5 text-muted-foreground group-hover:text-foreground transition-colors shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
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

        {/* Phase: Playing — show current question (hide when paused; leaderboard takes over) */}
        {!inReplayMode && gameState.phase === "playing" && currentQuestion && !gameState.is_paused && (
          <div className="py-8 space-y-6">
            {/* Progress */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span className="inline-flex items-center gap-2">
                  <RoundTypeBadge type={currentQuestion.round_type} size={20} />
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

            {/* Timer bar — 4px shrinking bar with glowing leading-edge dot */}
            {timeLeft !== null && (() => {
              const pct = Math.max(0, (timeLeft / currentQuestion.time_limit) * 100);
              const timerColor = pct > 50 ? 'var(--bt-violet)' : pct > 20 ? 'var(--bt-timer-amber)' : 'var(--bt-timer-critical)';
              const timerGlow = pct > 50 ? 'rgba(124,58,237,0.5)' : pct > 20 ? 'rgba(245,158,11,0.5)' : 'rgba(239,68,68,0.5)';
              return (
                <div className="w-full h-1 bg-[var(--bt-hover)] relative">
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

            {/* Timer row — round type badge + large timer number */}
            <div className="flex items-center justify-between">
              <span className="inline-flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground">
                <RoundTypeBadge type={currentQuestion.round_type} size={20} />
                {currentQuestion.round_type.replace("_", "/")}
              </span>
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
                      className="p-3 border border-border bg-[var(--bt-hover)] text-sm text-muted-foreground break-words"
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

            {/* ── Modifier panel ─────────────────────────────────────────── */}
            <div className="space-y-1.5">
              {activeModifier ? (
                /* Active modifier indicator + deactivate */
                <div className="flex items-center justify-between border border-amber-400/50 bg-amber-400/10 px-3 py-2">
                  <div className="flex items-center gap-2">
                    <span className="relative flex h-2 w-2">
                      <span className="absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75 animate-ping" />
                      <span className="relative inline-flex h-2 w-2 rounded-full bg-amber-400" />
                    </span>
                    <span className="text-sm font-semibold text-amber-300">
                      {availableModifiers.find((m) => m.type === activeModifier.type)?.displayName ?? activeModifier.type}
                    </span>
                    <span className="text-xs text-amber-400/60">active</span>
                  </div>
                  <button
                    onClick={deactivateModifier}
                    disabled={loading}
                    className="text-xs font-medium text-amber-300 hover:text-amber-200 transition-colors px-2 py-1 border border-amber-400/30 hover:border-amber-400/50"
                  >
                    Deactivate
                  </button>
                </div>
              ) : (
                /* Available modifiers — activate buttons */
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground shrink-0">Modifier:</span>
                  {availableModifiers
                    .filter((m) => {
                      if (m.compatibleRounds.length === 0) return true;
                      return m.compatibleRounds.includes(currentQuestion?.round_type ?? "");
                    })
                    .map((mod) => {
                      const isDefault = currentQuestion && defaultModifiers[currentQuestion.round_id]?.modifier_type === mod.type;
                      return (
                        <button
                          key={mod.type}
                          onClick={() => activateModifier(mod.type)}
                          disabled={loading}
                          className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 border border-border hover:border-amber-400/50 hover:bg-amber-400/10 hover:text-amber-300 transition-colors disabled:opacity-50"
                          title={mod.description}
                        >
                          <RoundTypeBadge type={mod.type} size={16} />
                          {mod.displayName}
                          {isDefault && <span className="ml-1 text-muted-foreground/60">(default)</span>}
                        </button>
                      );
                    })}
                  {availableModifiers.length === 0 && (
                    <span className="text-xs text-muted-foreground/60">None available</span>
                  )}
                </div>
              )}
            </div>

            {/* Answered indicator — controls live in HostControlBar at page level. */}
            <div className="flex items-center justify-center">
              <span className="inline-flex items-center justify-center px-4 py-2 bg-[var(--bt-violet-tint)] text-[#5b21b6] dark:text-[#a78bfa] text-sm font-semibold select-none">
                {answeredCount}/{playerCount} answered
              </span>
            </div>
          </div>
        )}

        {/* Phase: Revealing — delegated to per-round HostRevealView via registry.
            Shell owns the chrome (progress, stats, WHY, actions); round module
            owns the answer presentation. Hidden when paused (leaderboard takes over). */}
        {!inReplayMode && gameState.phase === "revealing" && currentQuestion && !gameState.is_paused && (() => {
          const HostRevealView = resolveHostRevealView(currentQuestion.round_type);
          const revealQuestion = {
            id: currentQuestion.id,
            round_id: currentQuestion.round_id,
            body: currentQuestion.body,
            options: (currentQuestion.options ?? []) as string[],
            correct_answer: currentQuestion.correct_answer,
            correct_answer_numeric: currentQuestion.correct_answer_numeric ?? null,
            explanation: currentQuestion.explanation ?? null,
            sort_order: currentQuestion.sort_order,
            round_title: currentQuestion.round_title,
            round_type: currentQuestion.round_type,
            time_limit_seconds: currentQuestion.time_limit,
            base_points: currentQuestion.base_points,
            time_bonus_enabled: true,
            config: currentQuestion.round_config ?? {},
            image_url: currentQuestion.image_url ?? null,
            reveal_mode: currentQuestion.reveal_mode ?? null,
          };
          const isVoided = voidedSet.has(currentQuestion.id);
          return (
            <div>
              {isVoided && (
                <div className="pt-4 flex items-center justify-center">
                  <span className="inline-flex items-center px-3 py-1 text-[11px] font-bold uppercase tracking-wider bg-wrong text-white rounded-full">
                    Voided
                  </span>
                </div>
              )}
              <HostRevealShell
                roundType={currentQuestion.round_type}
                roundTitle={currentQuestion.round_title}
                roundIndex={currentRoundIndex}
                roundCount={rounds.length}
                questionIndexInRound={indexInRound}
                questionCountInRound={questionsInRound.length}
                questionBody={currentQuestion.body}
                answered={answeredCount}
                playerCount={playerCount}
                correctCount={revealStats.correctCount}
                avgTimeSeconds={revealStats.avgTimeSeconds}
                answerNode={
                  <HostRevealView
                    question={revealQuestion}
                    roundConfig={currentQuestion.round_config ?? {}}
                    roundState={gameState.round_state ?? undefined}
                  />
                }
                explanation={currentQuestion.explanation ?? null}
              />
            </div>
          );
        })()}

        {/* Phase: Leaderboard — shown between rounds AND during pause (is_paused) */}
        {!inReplayMode && (gameState.phase === "leaderboard" || gameState.is_paused) && (
          <div className="py-6 pb-36 space-y-5">
            {/* Event title + hosted by + status — matches leaderboard page */}
            <div className="text-center space-y-2" style={{ animation: "lb-fade-up 280ms ease-out both" }}>
              <h2 className="font-heading text-2xl font-bold leading-tight">{event.title}</h2>
              <div className="flex flex-col items-center gap-1">
                <p className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground" style={{ fontFamily: "Inter, sans-serif" }}>
                  Hosted by
                </p>
                {event.logoUrl ? (
                  <Image src={proxyImageUrl(event.logoUrl)} alt={event.organizerName ?? "Organizer"} width={120} height={28} unoptimized className="h-7 w-auto max-w-[120px] object-contain" />
                ) : (
                  <>
                    <Image src="/logo-light.svg" alt="BlockTrivia" width={120} height={28} className="h-7 w-auto max-w-[120px] object-contain dark:hidden" />
                    <Image src="/logo-dark.svg" alt="BlockTrivia" width={120} height={28} className="h-7 w-auto max-w-[120px] object-contain hidden dark:block" />
                  </>
                )}
              </div>
              {gameState.is_paused && (
                <div className="flex justify-center pt-1">
                  <span
                    className="inline-flex items-center gap-1.5 px-3 py-1 text-[11px] font-bold uppercase tracking-wider"
                    style={{ color: "var(--bt-timer-amber)", background: "rgba(245, 158, 11, 0.09)", fontFamily: "var(--font-sans)", letterSpacing: "0.06em" }}
                  >
                    <span className="size-1.5 rounded-full shrink-0 animate-pulse" style={{ background: "var(--bt-timer-amber)" }} />
                    Paused
                  </span>
                </div>
              )}
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

                {/* RANKINGS — 4th+ (scrollable; no entry cap) */}
                {lbEntries.slice(3).length > 0 && (
                  <div className="border-t border-border max-h-[60vh] overflow-y-auto">
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

        {/* Phase: Interstitial — between rounds (hide when paused).
            Manual advance: host reads the rules to the room, then taps Start Round. */}
        {!inReplayMode && gameState.phase === "interstitial" && !gameState.is_paused && (() => {
          // Find the full round data (not just RoundInfo) so we can read round_type/time_limit/base_points
          const fullRound = rounds.find((r) => r.id === gameState.current_round_id) ?? null;
          const firstQuestionInRound = fullRound?.questions?.[0] ?? null;
          return (
            <div className="flex flex-col items-center justify-center py-14 pb-28">
              <InterstitialCard
                roundType={firstQuestionInRound?.round_type ?? "mcq"}
                roundTitle={interstitialRound?.title ?? "Next Round"}
                description={interstitialRound?.interstitial_text ?? null}
                questionCount={fullRound?.questions?.length ?? 0}
                timePerQuestionSeconds={firstQuestionInRound?.time_limit ?? 15}
                basePoints={firstQuestionInRound?.base_points ?? 100}
                mode="host"
                loading={loading}
                onStart={() => {
                  if (interstitialTimerRef.current) clearInterval(interstitialTimerRef.current);
                  startFirstQuestionOfRound();
                }}
              />
            </div>
          );
        })()}

        {/* Phase: Ended */}
        {!inReplayMode && gameState.phase === "ended" && (
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

        {/* Recovery — corrupted state (e.g. "revealing" with no current question) */}
        {!inReplayMode && !(
          (gameState.phase === "lobby" && !gameState.started_at) ||
          (gameState.phase === "playing" && currentQuestion) ||
          (gameState.phase === "revealing" && currentQuestion) ||
          gameState.phase === "leaderboard" ||
          gameState.phase === "interstitial" ||
          gameState.phase === "ended"
        ) && (
          <div className="flex flex-col items-center justify-center py-20 space-y-6">
            <div className="text-center space-y-3">
              <div className="inline-flex items-center justify-center size-16 border-2 border-wrong/30 bg-wrong/5 mb-2">
                <svg className="size-8 text-wrong" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
                </svg>
              </div>
              <h1 className="font-heading text-2xl font-bold">Game state out of sync</h1>
              <p className="text-muted-foreground text-sm max-w-sm mx-auto">
                The game got into an unexpected state
                <span className="font-mono text-xs ml-1">({gameState.phase})</span>.
                Reset to the lobby to start fresh.
              </p>
            </div>
            <div className="flex flex-col sm:flex-row gap-3">
              <button
                onClick={resetToLobby}
                disabled={loading}
                className="h-12 px-8 bg-primary text-primary-foreground font-medium hover:bg-primary-hover transition-colors disabled:opacity-50"
              >
                Reset to Lobby
              </button>
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
                <svg className="size-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 1 0-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H6.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25Z" />
                </svg>
              )}
              {totalQuestions === 0 ? "No Questions Added" : "Start Game"}
            </button>
          </div>
        </div>
      )}


      {/* Sticky Sponsors — interstitial phase. Uses shared SponsorBar so the
          grayscale treatment + sizing stays consistent with player view. */}
      {gameState.phase === "interstitial" && sponsors.length > 0 && (
        <div className="fixed bottom-0 left-0 right-0 z-40 bg-background border-t border-border">
          <SponsorBar sponsors={sponsors} />
        </div>
      )}

      {/* ── Sticky HostControlBar — consistent across all host game phases ── */}
      {gameState.is_paused ? (
        <HostControlBar
          primaryLabel="Resume Game"
          onPrimary={resumeGame}
          primaryDisabled={loading}
          primaryIcon={Play}
          above={
            sponsors.length > 0 ? (
              <div className="py-2 px-4">
                <p className="text-center text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1.5">Sponsored by</p>
                <div className="flex items-center justify-center gap-6 flex-wrap max-w-lg md:max-w-2xl lg:max-w-3xl mx-auto">
                  {sponsors.sort((a, b) => a.sort_order - b.sort_order).map((s) => (
                    <Image key={s.id} src={proxyImageUrl(s.logo_url)} alt={s.name ?? "Sponsor"} width={100} height={24} unoptimized className="h-6 w-auto max-w-[100px] object-contain grayscale opacity-60 dark:invert dark:brightness-200" />
                  ))}
                </div>
              </div>
            ) : undefined
          }
        />
      ) : gameState.phase === "playing" && currentQuestion ? (
        <HostControlBar
          primaryLabel="Reveal Answer"
          onPrimary={revealAnswer}
          primaryDisabled={loading}
          primaryVariant={timeLeft !== null && timeLeft > 0 ? "ghost" : "filled"}
          primaryIcon={Eye}
          secondaryLabel="Pause"
          onSecondary={pauseGame}
          secondaryDisabled={loading}
          secondaryIcon={Pause}
          onPrevious={canReplay || inReplayMode ? openPrevious : undefined}
          inReplayMode={inReplayMode}
          overflowItems={overflowFor("playing")}
        />
      ) : gameState.phase === "revealing" && currentQuestion ? (
        <HostControlBar
          primaryLabel={nextLabel}
          onPrimary={isLastQuestion ? endGame : nextQuestion}
          primaryDisabled={loading}
          primaryIcon={nextIcon}
          secondaryLabel="Pause"
          onSecondary={pauseGame}
          secondaryDisabled={loading}
          secondaryIcon={Pause}
          onPrevious={canReplay || inReplayMode ? openPrevious : undefined}
          inReplayMode={inReplayMode}
          overflowItems={overflowFor("revealing")}
        />
      ) : gameState.phase === "interstitial" ? (
        <HostControlBar
          primaryLabel="Start Round"
          onPrimary={() => {
            if (interstitialTimerRef.current) clearInterval(interstitialTimerRef.current);
            startFirstQuestionOfRound();
          }}
          primaryDisabled={loading}
          primaryIcon={Play}
        />
      ) : gameState.phase === "leaderboard" ? (
        <HostControlBar
          primaryLabel={nextLabel}
          onPrimary={isLastQuestion ? endGame : nextQuestion}
          primaryDisabled={loading}
          primaryIcon={nextIcon}
          secondaryLabel="Pause"
          onSecondary={pauseGame}
          secondaryDisabled={loading}
          secondaryIcon={Pause}
        />
      ) : null}

      {/* Share drawer — triggered by join code card */}
      {showShare && (
        <ShareDrawer joinCode={event.joinCode} onClose={() => setShowShare(false)} />
      )}

      {/* Void confirmation modal */}
      {voidConfirmOpen && currentQuestion && (
        <div
          className="fixed inset-0 z-[60] bg-black/50 flex items-center justify-center px-4"
          onClick={() => !voidLoading && setVoidConfirmOpen(false)}
        >
          <div
            className="w-full max-w-sm bg-surface border border-border p-6 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="space-y-2">
              <h2 className="font-heading text-xl font-bold">Void this question?</h2>
              <p className="text-sm text-muted-foreground leading-relaxed">
                All points from this question will be removed from every player&apos;s score. This cannot be undone.
              </p>
            </div>
            <div className="flex gap-2 pt-2">
              <button
                onClick={() => setVoidConfirmOpen(false)}
                disabled={voidLoading}
                className="flex-1 h-12 bg-surface border border-border font-heading font-medium hover:bg-background transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={confirmVoid}
                disabled={voidLoading}
                className="flex-1 h-12 bg-wrong text-white font-heading font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
              >
                {voidLoading ? "Voiding…" : "Void Question"}
              </button>
            </div>
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
            <svg className="size-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
            </svg>
          </button>

          <Image src="/logo-light.svg" alt="BlockTrivia" width={180} height={40} className="h-10 w-auto mb-6 dark:hidden" />
          <Image src="/logo-dark.svg" alt="BlockTrivia" width={180} height={40} className="h-10 w-auto mb-6 hidden dark:block" />

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
