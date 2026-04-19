"use client";

import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import Image from "next/image";
import Link from "next/link";
import confetti from "canvas-confetti";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase";
import { useServerClock } from "@/lib/use-server-clock";
import { resolvePlayerName } from "@/lib/player-name";
import { AppHeader } from "@/app/_components/app-header";
import { SponsorBar } from "@/app/_components/sponsor-bar";
import { PodiumLayout, RankingRow, PinnedRankSection, type LbEntry } from "@/app/_components/lb-podium";
import { Check, X } from "lucide-react";
import { resolvePlayerView } from "@/lib/game/round-registry";
import { InterstitialCard } from "@/rounds/_shared/interstitial-card";
import { resolveModifierOverlay, modifierRegistry } from "@/lib/game/modifier-registry";
import { ModifierActivationOverlay } from "@/modifiers/shared/modifier-activation-overlay";
import { proxyImageUrl } from "@/lib/image-proxy";
import { RoundTypeBadge } from "@/app/_components/round-type-badge";
import { ShareDrawer } from "@/app/_components/share-drawer";

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
  if (pct > 0.5) return { color: 'var(--bt-violet)', glow: 'rgba(124,58,237,0.5)' };
  if (pct > 0.2) return { color: 'var(--bt-timer-amber)', glow: 'rgba(245,158,11,0.5)' };
  return { color: 'var(--bt-timer-critical)', glow: 'rgba(239,68,68,0.5)' };
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
  round_type: string; // text field — validated by round registry, not a TS union
  time_limit_seconds: number;
  base_points: number;
  time_bonus_enabled: boolean;
  /** Round-specific config from rounds.config JSONB (migration 047). */
  config: Record<string, unknown>;
  /** Active modifier type on this round, or null. */
  modifier_type: string | null;
  /** Modifier config JSONB — multiplier, etc. */
  modifier_config: Record<string, unknown>;
  /** Pixel Reveal: image URL for the question. */
  image_url?: string | null;
  /** Pixel Reveal: 'pixelated' (default) or 'tile_reveal'. */
  reveal_mode?: "pixelated" | "tile_reveal" | null;
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
  /** Ephemeral per-question state written by the host control panel for complex round types. */
  round_state: Record<string, unknown> | null;
  /** Live modifier state — set by host during game. */
  modifier_state: Record<string, unknown> | null;
  /** Pause flag — when true, freeze timer and show pause overlay without navigating. */
  is_paused: boolean;
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
  const { serverNow } = useServerClock();
  const [gameState, setGameState] = useState<GameState>(initialGameState);
  const [answeredQuestionId, setAnsweredQuestionId] = useState<string | null>(null);
  const [selectedAnswer, setSelectedAnswer] = useState<number | null>(null);
  const [leverage, setLeverage] = useState(0.5);
  const [timeLeft, setTimeLeft] = useState<number | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [lastResult, setLastResult] = useState<{
    isCorrect: boolean;
    pointsAwarded: number;
    selectedAnswer: number;
    correctAnswer: number | undefined;
    explanation: string | null;
    didNotAnswer?: boolean;
    wagerAmt?: number;
    jackpotWinner?: boolean;
    /**
     * Modifier that was actually resolved by the RPC at scoring time.
     * Use THIS (not live game_state.modifier_state) to drive reveal-phase
     * copy — the host can activate a modifier between submit and reveal,
     * which would otherwise bleed misleading banners onto a question
     * scored under the standard branch.
     */
    modifierApplied?: string | null;
  } | null>(null);

  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [myLbEntry, setMyLbEntry] = useState<LeaderboardEntry | null>(null);
  const [_lbDeltas, setLbDeltas] = useState<Map<string, number | null>>(new Map());
  const prevRanksRef = useRef<Map<string, number>>(new Map());
  const [playerCount, setPlayerCount] = useState<number | null>(null);
  const [showShare, setShowShare] = useState(false);
  // Interstitial is now host-manual — player only sees a waiting indicator.
  // Setter retained to reset any legacy residual countdown on phase change.
  const [, setInterstitialCountdown] = useState<number | null>(null);
  const submitLockRef = useRef(false);
  // 3-2-1 "Get Ready" transition overlay shown when a new question starts
  const [transitionCountdown, setTransitionCountdown] = useState<number | null>(null);
  const transitionTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // Ref copy of gameState for use inside polling interval without stale closure
  const gameStateRef = useRef<GameState>(initialGameState);
  // Track Realtime subscription health — only poll when disconnected
  const realtimeHealthy = useRef(true);

  const currentQuestion = useMemo(
    () => questions.find((q) => q.id === gameState.current_question_id) ?? null,
    [questions, gameState.current_question_id]
  );
  const hasAnswered = answeredQuestionId === gameState.current_question_id;

  // Defensive reset: applyGameState's per-question reset (line ~285) clears
  // submitLockRef on question change, but only fires when a gameState UPDATE
  // arrives. During the stress test we observed 16× CHANNEL_ERROR mid-game;
  // if polling also hiccups, the lock can stay stuck from the previous
  // question and silently block the next submit. Key an independent effect
  // on currentQuestion?.id so the lock always clears between questions,
  // regardless of how (or if) the gameState update arrived.
  //
  // Intentionally narrow — only reset the submit-path locks. Leave
  // answeredQuestionId / selectedAnswer / lastResult alone so the
  // answered-for-previous-question UI doesn't flicker during the transition.
  useEffect(() => {
    if (!currentQuestion?.id) return;
    submitLockRef.current = false;
    setIsSubmitting(false);
  }, [currentQuestion?.id]);


  const isWipeout = currentQuestion?.round_type === "wipeout";
  // Resolve the correct PlayerView component from the round registry
  const RoundPlayerView = currentQuestion
    ? resolvePlayerView(currentQuestion.round_type)
    : null;
  // ── Hybrid modifier resolution: live override > pre-configured default ──
  const liveModType = typeof (gameState.modifier_state as Record<string, unknown>)?.type === "string"
    && (gameState.modifier_state as Record<string, unknown>).type !== ""
    ? (gameState.modifier_state as Record<string, unknown>).type as string
    : null;
  const effectiveModType = liveModType || currentQuestion?.modifier_type || null;
  const effectiveModConfig = liveModType
    ? (((gameState.modifier_state as Record<string, unknown>)?.config as Record<string, unknown>) ?? {})
    : (currentQuestion?.modifier_config ?? {});
  const ModifierOverlay = effectiveModType
    ? resolveModifierOverlay(effectiveModType)
    : null;

  // ── Live modifier activation detection (animation trigger) ────────────────
  const prevModifierTypeRef = useRef<string | null>(null);
  const [modifierJustActivated, setModifierJustActivated] = useState(false);
  const activationTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const prev = prevModifierTypeRef.current;
    prevModifierTypeRef.current = effectiveModType;

    // Trigger animation only when modifier goes from null → non-null
    // AND the source is a live activation (not pre-configured default)
    if (prev === null && effectiveModType !== null && liveModType !== null) {
      setModifierJustActivated(true);

      // Play sound effect
      try {
        const audio = new Audio("/sounds/modifier-activate.wav");
        audio.volume = 0.6;
        audio.play().catch(() => {});
      } catch {}

      if (activationTimerRef.current) clearTimeout(activationTimerRef.current);
      activationTimerRef.current = setTimeout(() => {
        setModifierJustActivated(false);
      }, 2500);
    }

    // When modifier is deactivated, clear animation state
    if (effectiveModType === null) {
      setModifierJustActivated(false);
    }

    return () => {
      if (activationTimerRef.current) clearTimeout(activationTimerRef.current);
    };
  }, [effectiveModType, liveModType]);

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

  // If already in leaderboard or ended phase on mount, go to leaderboard page.
  // Intentionally only runs on mount: later phase transitions are handled by
  // applyGameState via Realtime + polling (adding gameState.phase here would
  // cause double navigation with those handlers).
  const mountRedirectRef = useRef(false);
  useEffect(() => {
    if (mountRedirectRef.current) return;
    mountRedirectRef.current = true;
    // Only redirect on "ended" — mid-game leaderboard renders inline in /play
    // (avoids a full route transition on round boundaries).
    if (gameState.phase === "ended") {
      router.replace(`/game/${event.joinCode}/leaderboard`);
    }
  }, [gameState.phase, router, event.joinCode]);

  // Shared handler for any game state update (Realtime or polling)
  const applyGameState = useCallback(
    (next: GameState) => {
      const prev = gameStateRef.current;
      setGameState(next);
      if (next.phase === "playing" && next.current_question_id !== prev.current_question_id) {
        // New question — reset answer state + modifier activation tracking
        setAnsweredQuestionId(null);
        setSelectedAnswer(null);
        setIsSubmitting(false);
        setModifierJustActivated(false);
        // Initialize leverage to the midpoint of this question's wager range so
        // the preview math matches what the slider will actually allow.
        const newQ = questions.find((q) => q.id === next.current_question_id);
        // Reset ref so pre-configured defaults on the new question don't trigger animation
        prevModifierTypeRef.current = newQ?.modifier_type ?? null;
        const minW = (newQ?.config?.minWagerPct as number) ?? 0.10;
        const maxW = (newQ?.config?.maxWagerPct as number) ?? 1.00;
        setLeverage(Math.round(((minW + maxW) / 2) * 20) / 20); // round to nearest 0.05
        setLastResult(null);
        submitLockRef.current = false;

        // "Get Ready" overlay — driven by question_started_at so it's server-synced.
        // The host sets question_started_at = now + 3s, so we show the overlay
        // while that timestamp is still in the future. Timer only starts counting
        // once question_started_at is reached — no stolen seconds.
        if (transitionTimerRef.current) clearInterval(transitionTimerRef.current);
        const startedAt = next.question_started_at ? new Date(next.question_started_at).getTime() : null;
        if (startedAt && serverNow() < startedAt) {
          const getCount = () => Math.max(1, Math.ceil((startedAt - serverNow()) / 1000));
          setTransitionCountdown(getCount());
          transitionTimerRef.current = setInterval(() => {
            if (serverNow() >= startedAt) {
              clearInterval(transitionTimerRef.current!);
              transitionTimerRef.current = null;
              setTransitionCountdown(null);
            } else {
              setTransitionCountdown(getCount());
            }
          }, 200);
        } else {
          setTransitionCountdown(null);
        }
      } else if (next.phase === "ended") {
        // Final leaderboard lives on its own route. Mid-game leaderboard renders inline.
        router.push(`/game/${event.joinCode}/leaderboard`);
      }
    },
    [questions, router, event.joinCode, serverNow]
  );

  // Subscribe to game_state changes via Realtime
  useEffect(() => {
    const channel = supabase
      .channel(`play:${event.id}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "game_state", filter: `event_id=eq.${event.id}` },
        (payload) => applyGameState(payload.new as GameState)
      )
      .subscribe((status) => {
        realtimeHealthy.current = status === "SUBSCRIBED";
      });

    return () => { supabase.removeChannel(channel); };
  }, [supabase, event.id, applyGameState]);

  // Polling fallback — every 10s as a safety net. Realtime (via migration 063) is the
  // primary path; this only catches rare Realtime gaps. Bumped from 2s after the Apr 2026
  // pilot: responses/game_state/event_players were not in supabase_realtime publication,
  // so the 2s poll was carrying the entire app and showing up as ~2s delay on Next Q.
  useEffect(() => {
    const interval = setInterval(async () => {
      const { data } = await supabase
        .from("game_state")
        .select("id, event_id, phase, current_round_id, current_question_id, question_started_at, started_at, ended_at, modifier_state, round_state, is_paused")
        .eq("event_id", event.id)
        .single();

      if (!data) return;
      const current = gameStateRef.current;
      // Also sync question_started_at changes — host "resume" updates it without changing phase/question
      if (
        data.phase !== current.phase ||
        data.current_question_id !== current.current_question_id ||
        data.question_started_at !== current.question_started_at ||
        data.is_paused !== current.is_paused
      ) {
        applyGameState(data as GameState);
      }
    }, 10000);

    return () => clearInterval(interval);
  }, [supabase, event.id, applyGameState]);

  // Check if player already answered current question (handles page refresh)
  useEffect(() => {
    if (!gameState.current_question_id) return;
    supabase
      .from("responses")
      .select("selected_answer, is_correct, points_awarded")
      .eq("question_id", gameState.current_question_id)
      .eq("player_id", player.id)
      .maybeSingle()
      .then(({ data, error }) => {
        if (error) { console.error("[play] failed to check existing answer:", error.message); return; }
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
  }, [gameState.current_question_id, supabase, player.id]);

  // Countdown timer — freezes when paused (keeps last value on display)
  useEffect(() => {
    if (gameState.phase !== "playing" || !gameState.question_started_at || !currentQuestion || hasAnswered || gameState.is_paused) {
      if (!gameState.is_paused) setTimeLeft(null);
      return;
    }

    const startedAt = new Date(gameState.question_started_at).getTime();
    const duration = currentQuestion.time_limit_seconds * 1000;

    // `let` because `tick` references `interval` and `tick` runs before the
    // assignment below (both inside tick() and in the initial tick() call).
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
  }, [gameState.phase, gameState.question_started_at, gameState.is_paused, currentQuestion, hasAnswered, serverNow]);

  // When host reveals answer, fetch correct answer for players who didn't submit
  useEffect(() => {
    if (gameState.phase !== "revealing" || hasAnswered || !currentQuestion) return;
    supabase.rpc("get_revealed_answer", { p_event_id: event.id }).then(({ data, error }) => {
      if (error) { console.error("[play] failed to fetch revealed answer:", error.message); return; }
      if (data && !data.error) {
        // Closest Wins answers live in correct_answer_numeric (the MCQ `correct_answer`
        // field is 0 for numeric rounds). Pick the right field so non-submitters see the
        // actual target instead of "0".
        const isNumericRound = currentQuestion.round_type === "closest_wins";
        const revealed = isNumericRound
          ? data.correct_answer_numeric ?? data.correct_answer
          : data.correct_answer;
        setLastResult({
          isCorrect: false,
          pointsAwarded: 0,
          selectedAnswer: -1,
          correctAnswer: revealed,
          explanation: data.explanation ?? null,
          didNotAnswer: true,
        });
      }
    });
  }, [gameState.phase, hasAnswered, currentQuestion, supabase, event.id]);

  // Interstitial: host now advances manually (so they can verbally explain
  // the rules). No client-side countdown — the player just sees a waiting
  // indicator until the host taps "Start Round" and the phase flips to "playing".
  useEffect(() => {
    setInterstitialCountdown(null);
  }, [gameState.phase, gameState.current_round_id]);

  // Refresh own leaderboard entry whenever a WipeOut question loads so
  // bankedScore reflects the player's real score, not the 50pt floor default.
  useEffect(() => {
    if (!currentQuestion || currentQuestion.round_type !== "wipeout") return;
    supabase
      .from("leaderboard_entries")
      .select("player_id, total_score, rank")
      .eq("event_id", event.id)
      .eq("player_id", player.id)
      .maybeSingle()
      .then(({ data }) => {
        if (data) setMyLbEntry((prev) => ({ ...prev!, player_id: data.player_id, total_score: data.total_score, rank: data.rank }));
      });
  }, [currentQuestion, supabase, event.id, player.id]);

  // Load leaderboard when phase is "leaderboard" or when game is paused
  // (so the pause overlay can show the player's current rank/score)
  useEffect(() => {
    if (gameState.phase !== "leaderboard" && !gameState.is_paused) return;

    // Snapshot current ranks for delta computation
    const snapshot = new Map<string, number>();
    leaderboard.forEach((e) => snapshot.set(e.player_id, e.rank));
    const isFirstLoad = prevRanksRef.current.size === 0 && leaderboard.length === 0;

    // Load the full, authoritative leaderboard. We recompute first so DB-side
    // ranks are canonical (per-response trigger was dropped in migration 073 —
    // leaderboard_entries is only populated via recompute_leaderboard_ranks).
    // Then fetch ALL entries — no cap — and merge in any event_players who
    // haven't answered yet at the tail with zero scores.
    supabase
      .rpc("recompute_leaderboard_ranks", { p_event_id: event.id })
      .then(() =>
        supabase
          .from("leaderboard_entries")
          .select(`player_id, total_score, rank, profiles!leaderboard_entries_player_id_fkey ( username, display_name, avatar_url )`)
          .eq("event_id", event.id)
          .order("rank", { ascending: true })
      )
      .then(async ({ data }) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let entries: LeaderboardEntry[] = (data ?? []).map((row: any) => ({
          player_id: row.player_id,
          display_name: resolvePlayerName(null, row.profiles?.username, row.profiles?.display_name),
          avatar_url: row.profiles?.avatar_url ?? null,
          total_score: row.total_score,
          rank: row.rank,
        }));

        // Safety net: pull every event_player so we can append anyone who
        // hasn't answered a single question yet at 0 pts. No cap — the list
        // reflects the real roster.
        const { data: allPlayers } = await supabase
          .from("event_players")
          .select(`player_id, game_alias, profiles ( username, display_name, avatar_url )`)
          .eq("event_id", event.id);

        if (entries.length === 0 && allPlayers) {
          // No scores yet — show everyone at 0 pts
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          entries = allPlayers.map((p: any, i: number) => ({
            player_id: p.player_id,
            display_name: resolvePlayerName(p.game_alias, p.profiles?.username, p.profiles?.display_name),
            avatar_url: p.profiles?.avatar_url ?? null,
            total_score: 0,
            rank: i + 1,
          }));
        } else if (allPlayers) {
          // Some players scored — append anyone missing from leaderboard_entries at the bottom.
          // Ranks continue past the real max so we never collide with a scored player's rank
          // (which is why the pinned "you" row used to duplicate an existing number).
          const scoredIds = new Set(entries.map((e) => e.player_id));
          const maxRank = entries.reduce((m, e) => Math.max(m, e.rank), 0);
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const zeroPlayers = allPlayers.filter((p: any) => !scoredIds.has(p.player_id));
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          entries = entries.concat(zeroPlayers.map((p: any, i: number) => ({
            player_id: p.player_id,
            display_name: resolvePlayerName(p.game_alias, p.profiles?.username, p.profiles?.display_name),
            avatar_url: p.profiles?.avatar_url ?? null,
            total_score: 0,
            rank: maxRank + i + 1,
          })));
        }
        // Sync current player's entry from the merged list (covers 0-score players too)
        const myMerged = entries.find((e) => e.player_id === player.id);
        if (myMerged) setMyLbEntry(myMerged);

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
      .select(`player_id, total_score, rank, profiles!leaderboard_entries_player_id_fkey ( username, display_name, avatar_url )`)
      .eq("event_id", event.id)
      .eq("player_id", player.id)
      .maybeSingle()

      .then(({ data, error }) => {
        if (error) { console.error("[play] failed to fetch own lb entry:", error.message); return; }
        if (data) {
          const profile = (data as { profiles?: { username?: string; display_name?: string; avatar_url?: string | null } }).profiles;
          setMyLbEntry({
            player_id: data.player_id,
            display_name: resolvePlayerName(null, profile?.username, profile?.display_name),
            avatar_url: profile?.avatar_url ?? null,
            total_score: data.total_score,
            rank: data.rank,
          });
        }
        // data is null when player never answered — myLbEntry is already set via the
        // merged leaderboard list above (0 pts, last rank). Nothing more to do.
      });

    supabase
      .from("event_players")
      .select("player_id", { count: "exact", head: true })
      .eq("event_id", event.id)
      .then(({ count, error }) => { if (!error && count !== null) setPlayerCount(count); });
    // `leaderboard` and `player.id` intentionally omitted: `leaderboard` is
    // only read to snapshot prior ranks for delta computation and re-including
    // it would cause the effect to re-fire on every setLeaderboard(), creating
    // an infinite loop. `player.id` is stable for the lifetime of this view.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameState.phase, gameState.is_paused, supabase, event.id]);

  async function submitAnswer(answerIndex: number, metadata?: Record<string, unknown>) {
    // Diagnostic logging — every silent-return guard emits a console.debug tag
    // so we can tell which condition swallowed a click during repro. Cheap and
    // only fires once per attempted submit; safe to keep in prod.
    if (!currentQuestion) {
      console.debug("[submitAnswer] blocked: no currentQuestion");
      return;
    }
    if (hasAnswered) {
      console.debug("[submitAnswer] blocked: hasAnswered=true", { qid: currentQuestion.id, answeredQuestionId });
      return;
    }
    if (submitLockRef.current) {
      console.debug("[submitAnswer] blocked: submitLockRef stuck true", { qid: currentQuestion.id });
      return;
    }
    if (!gameState.question_started_at) {
      console.debug("[submitAnswer] blocked: question_started_at=null", { qid: currentQuestion.id });
      return;
    }
    // Block submission while paused — host must resume first
    if (gameState.is_paused) {
      console.debug("[submitAnswer] blocked: game paused", { qid: currentQuestion.id });
      return;
    }

    // Reject if time has expired — use serverNow() so the check matches the host's timer
    const startedAt = new Date(gameState.question_started_at).getTime();
    const timeTakenMs = serverNow() - startedAt;
    if (timeTakenMs >= currentQuestion.time_limit_seconds * 1000) {
      console.debug("[submitAnswer] blocked: time expired", { qid: currentQuestion.id, timeTakenMs, limitMs: currentQuestion.time_limit_seconds * 1000 });
      return;
    }

    submitLockRef.current = true;

    setSelectedAnswer(answerIndex);
    setIsSubmitting(true);

    // PILOT-CRITICAL: set answeredQuestionId OPTIMISTICALLY *before* any network
    // round-trip, so the UI flips to "answered" immediately and the timer-expired
    // "Time's up — no answer recorded" screen never renders for someone who
    // actually clicked. Under 200-player load the jitter + RPC round-trip can
    // exceed the remaining question time — the server still accepts the answer
    // (submit_answer validates against question_started_at, not client clock),
    // but without an optimistic flip the player sees a false "timed out" error.
    // Rollback below on RPC error.
    const optimisticQuestionId = currentQuestion.id;
    setAnsweredQuestionId(optimisticQuestionId);

    // Spread burst writes: UI confirms selection immediately, DB write lands 0–800ms later.
    // Eliminates connection pool saturation when many players answer at the same moment.
    await new Promise(r => setTimeout(r, Math.random() * 800));

    try {
      const rpcParams: Record<string, unknown> = {
        p_event_id: event.id,
        p_question_id: currentQuestion.id,
        p_selected_answer: answerIndex,
        p_time_taken_ms: timeTakenMs,
        // WipeOut passes wager via metadata; all other rounds default to 1.0
        p_wipeout_leverage: typeof metadata?.wager === "number" ? metadata.wager : (isWipeout ? leverage : 1.0),
      };
      // Closest Wins: pass numeric answer
      if (typeof metadata?.numeric_answer === "number") {
        rpcParams.p_numeric_answer = metadata.numeric_answer;
      }
      // Oracle's Dilemma: pass oracle choice
      if (typeof metadata?.oracle_choice === "string") {
        rpcParams.p_oracle_choice = metadata.oracle_choice;
      }
      const { data: result, error } = await supabase.rpc("submit_answer", rpcParams);

      if (error) {
        console.error("submit_answer RPC error:", error);
        submitLockRef.current = false;
        setSelectedAnswer(null);
        setAnsweredQuestionId((curr) => (curr === optimisticQuestionId ? null : curr));
        return;
      }

      if (result?.error) {
        console.error("submit_answer returned error:", result.error);
        submitLockRef.current = false;
        setSelectedAnswer(null);
        setAnsweredQuestionId((curr) => (curr === optimisticQuestionId ? null : curr));
        return;
      }

      // Already set optimistically above — this re-affirms in case of race.
      setAnsweredQuestionId(optimisticQuestionId);
      setLastResult({
        isCorrect: result.is_correct,
        pointsAwarded: result.points_awarded,
        selectedAnswer: answerIndex,
        correctAnswer: currentQuestion.round_type === "closest_wins"
          ? (result.correct_answer_numeric ?? result.correct_answer)
          : result.correct_answer,
        explanation: result.explanation ?? null,
        wagerAmt: result.wager_amt ?? 0,
        jackpotWinner: result.jackpot_winner ?? false,
        modifierApplied: result.modifier_applied ?? null,
      });

      // Refresh rank immediately — leaderboard trigger fires synchronously on response INSERT.
      // maybeSingle() because a fresh player who hasn't scored yet has no row,
      // and .single() would throw a 406 error in the browser console.
      supabase
        .from("leaderboard_entries")
        .select("rank, total_score, correct_count, total_questions, accuracy, avg_speed_ms, is_top_10_pct")
        .eq("event_id", event.id)
        .eq("player_id", player.id)
        .maybeSingle()
        .then(({ data, error }) => { if (!error && data) setMyLbEntry((prev) => prev ? { ...prev, ...data } : data as unknown as LeaderboardEntry); });
    } catch (err) {
      console.error("submit_answer exception:", err);
      submitLockRef.current = false;
      setSelectedAnswer(null);
    } finally {
      setIsSubmitting(false);
    }
  }

  const phase = gameState.phase;

  // ── Confetti ───────────────────────────────────────────────────────────────
  const fireConfetti = useCallback(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const brandColors = [
      "#7c3aed", "#7c3aed", // double-weighted violet
      "#1a1917",            // ink
      "#a78bfa", "#c4b5fd", // light violet
      "#22c55e", "#86efac", // correct green
      "#faf9f7",            // warm cream
    ];
    const square = confetti.shapeFromPath({ path: "M0 0 L1 0 L1 1 L0 1 Z" });
    const shapes: confetti.Shape[] = ["square", square, "circle"];

    // Burst 1 — center cannon
    confetti({ particleCount: 80, spread: 70, origin: { x: 0.5, y: 0.8 }, colors: brandColors, shapes, ticks: 180, gravity: 0.9, scalar: 1.2, startVelocity: 45, disableForReducedMotion: true });
    // Burst 2 — left spray
    setTimeout(() => confetti({ particleCount: 40, spread: 55, angle: 60, origin: { x: 0.2, y: 0.85 }, colors: brandColors, shapes, ticks: 160, gravity: 1.0, scalar: 1.0, startVelocity: 40, disableForReducedMotion: true }), 100);
    // Burst 3 — right spray
    setTimeout(() => confetti({ particleCount: 40, spread: 55, angle: 120, origin: { x: 0.8, y: 0.85 }, colors: brandColors, shapes, ticks: 160, gravity: 1.0, scalar: 1.0, startVelocity: 40, disableForReducedMotion: true }), 200);
    // Burst 4 — center shower, bigger particles
    setTimeout(() => confetti({ particleCount: 30, spread: 120, origin: { x: 0.5, y: 0.7 }, colors: ["#7c3aed", "#1a1917", "#a78bfa", "#faf9f7"], shapes, ticks: 200, gravity: 0.7, scalar: 1.5, startVelocity: 30, disableForReducedMotion: true }), 350);
    // Burst 5 — final sparkle
    setTimeout(() => confetti({ particleCount: 25, spread: 160, origin: { x: 0.5, y: 0.75 }, colors: ["#22c55e", "#86efac", "#faf9f7"], ticks: 120, gravity: 1.4, scalar: 0.6, startVelocity: 50, disableForReducedMotion: true }), 500);
  }, []);

  useEffect(() => {
    if (phase !== "revealing" || !lastResult?.isCorrect) return;
    const timer = setTimeout(() => {
      fireConfetti();
      navigator.vibrate?.(50);
    }, 200);
    return () => clearTimeout(timer);
  }, [phase, lastResult?.isCorrect, fireConfetti]);

  // Heat Edge aura
  const heatPct = currentQuestion && timeLeft !== null
    ? timeLeft / currentQuestion.time_limit_seconds
    : 1;
  const isTimedOut = timeLeft === 0;
  const heatEdgeBoxShadow = getHeatEdgeStyle(heatPct, hasAnswered || isTimedOut);
  const isHeatPulsing = heatPct <= 0.2 && heatPct > 0 && phase === "playing" && !hasAnswered && !isTimedOut;

  // ── Paused — mirrors host control-panel paused layout ─────────────────────
  // Title + Hosted by + logo + Paused badge + info cards + blurred leaderboard.
  // Kept on /play so resume is instant (no route transition).
  if (gameState.is_paused) {
    const podiumEntries = leaderboard.slice(0, 3);
    const rankingEntries = leaderboard.slice(3);
    const firstScore = leaderboard[0]?.total_score ?? 1;
    const inTop3 = myLbEntry ? podiumEntries.some((e) => e.player_id === myLbEntry.player_id) : false;
    const currentQIdx = gameState.current_question_id
      ? questions.findIndex((q) => q.id === gameState.current_question_id)
      : -1;
    const currentRIdx = gameState.current_round_id
      ? roundsInfo.findIndex((r) => r.id === gameState.current_round_id)
      : -1;
    return (
      <div className="min-h-dvh bg-background flex flex-col">
        <AppHeader
          user={{ id: player.id, displayName: player.displayName, email: player.email }}
          avatarUrl={player.avatarUrl}
          right={event.logoUrl ? (
            <Image src={proxyImageUrl(event.logoUrl)} alt="Event logo" width={110} height={28} unoptimized className="h-7 w-auto max-w-[110px] object-contain" />
          ) : null}
        />
        <div className="flex-1 max-w-lg md:max-w-2xl lg:max-w-3xl mx-auto w-full flex flex-col px-5">
          <div className="py-6 space-y-5">
            {/* Title + hosted by + paused badge — matches host */}
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
              <div className="flex justify-center pt-1">
                <span
                  className="inline-flex items-center gap-1.5 px-3 py-1 text-[11px] font-bold uppercase tracking-wider"
                  style={{ color: "var(--bt-timer-amber)", background: "rgba(245, 158, 11, 0.09)", fontFamily: "var(--font-sans)", letterSpacing: "0.06em" }}
                >
                  <span className="size-1.5 rounded-full shrink-0 animate-pulse" style={{ background: "var(--bt-timer-amber)" }} />
                  Paused
                </span>
              </div>
            </div>

            {/* Stats bar — mirrors host's info cards */}
            <div
              className="grid grid-cols-4 border border-border divide-x divide-border"
              style={{ animation: "lb-fade-up 280ms ease-out 80ms both" }}
            >
              <div className="px-3 py-2.5 text-center">
                <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Players</p>
                <p className="font-heading text-lg font-bold tabular-nums">{playerCount ?? "—"}</p>
              </div>
              <div className="px-3 py-2.5 text-center">
                <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Question</p>
                <p className="font-heading text-lg font-bold tabular-nums">{currentQIdx >= 0 ? `${currentQIdx + 1}/${questions.length}` : "—"}</p>
              </div>
              <div className="px-3 py-2.5 text-center">
                <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Round</p>
                <p className="font-heading text-lg font-bold tabular-nums">{currentRIdx >= 0 ? `${currentRIdx + 1}/${roundsInfo.length}` : "—"}</p>
              </div>
              <button
                onClick={() => setShowShare(true)}
                className="px-3 py-2.5 text-center hover:bg-accent transition-colors"
              >
                <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Join Code</p>
                <p className="font-heading text-lg font-bold text-primary font-mono tracking-wider">{event.joinCode}</p>
              </button>
            </div>

            {/* Leaderboard — blur context + pinned personal rank */}
            {leaderboard.length === 0 ? (
              <div className="space-y-2">
                {[...Array(3)].map((_, i) => (
                  <div key={i} className="h-14 bg-surface border border-border animate-pulse" />
                ))}
              </div>
            ) : myLbEntry && !inTop3 ? (
              <div style={{ animation: "lb-fade-up 350ms ease-out 160ms both" }}>
                <PinnedRankSection
                  entry={myLbEntry as LbEntry}
                  firstScore={firstScore}
                  topEntries={podiumEntries}
                  allEntries={leaderboard}
                />
              </div>
            ) : (
              <div className="space-y-4" style={{ animation: "lb-fade-up 350ms ease-out 160ms both" }}>
                <PodiumLayout entries={podiumEntries} myPlayerId={player.id} deltas={lbDeltas} />
                {rankingEntries.length > 0 && (
                  <div className="border-t border-border pt-2 max-h-[55vh] overflow-y-auto">
                    {rankingEntries.map((e, i) => (
                      <RankingRow key={e.player_id} entry={e} firstScore={firstScore} delta={lbDeltas.get(e.player_id) ?? null} isMe={e.player_id === player.id} animIndex={i} />
                    ))}
                  </div>
                )}
              </div>
            )}

            <p className="text-center text-xs text-muted-foreground">Waiting for the host to resume…</p>
          </div>
        </div>
        <SponsorBar sponsors={sponsors} />
        {showShare && <ShareDrawer joinCode={event.joinCode} onClose={() => setShowShare(false)} />}
      </div>
    );
  }

  // ── Mid-game leaderboard (between rounds) ──────────────────────────────────
  // Rendered inline so the player never leaves /play during round boundaries —
  // host's "Next Round" then shows the next question instantly (no route transition).
  if (phase === "leaderboard") {
    const podiumEntries = leaderboard.slice(0, 3);
    const rankingEntries = leaderboard.slice(3);
    const firstScore = leaderboard[0]?.total_score ?? 1;
    const inTop3 = myLbEntry ? podiumEntries.some((e) => e.player_id === myLbEntry.player_id) : false;
    return (
      <div className="min-h-dvh bg-background flex flex-col">
        <AppHeader
          user={{ id: player.id, displayName: player.displayName, email: player.email }}
          avatarUrl={player.avatarUrl}
          right={event.logoUrl ? (
            <Image src={event.logoUrl} alt="Event logo" width={110} height={28} unoptimized className="h-7 w-auto max-w-[110px] object-contain" />
          ) : null}
        />
        <div className="flex-1 max-w-lg md:max-w-2xl lg:max-w-3xl mx-auto w-full flex flex-col">
          <div className="text-center px-5 pt-5 pb-2 space-y-2">
            <h1 className="font-heading text-2xl font-bold leading-tight">{event.title}</h1>
            <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground" style={{ fontFamily: "Inter, sans-serif" }}>
              Round standings
            </p>
          </div>
          {leaderboard.length > 0 ? (
            <div className="px-5 py-4 space-y-4">
              <PodiumLayout entries={podiumEntries} myPlayerId={player.id} deltas={lbDeltas} />
              {rankingEntries.length > 0 && (
                <div className="border-t border-border pt-2 max-h-[55vh] overflow-y-auto">
                  {rankingEntries.map((e, i) => (
                    <RankingRow key={e.player_id} entry={e} firstScore={firstScore} delta={lbDeltas.get(e.player_id) ?? null} isMe={e.player_id === player.id} animIndex={i} />
                  ))}
                </div>
              )}
              {myLbEntry && !inTop3 && (
                <PinnedRankSection entry={myLbEntry as LbEntry} firstScore={firstScore} />
              )}
            </div>
          ) : (
            <div className="flex-1 flex items-center justify-center">
              <p className="text-sm text-muted-foreground animate-pulse">Loading standings…</p>
            </div>
          )}
          <div className="text-center pb-4">
            <p className="text-xs text-muted-foreground">Waiting for host to start the next round…</p>
          </div>
        </div>
        <SponsorBar sponsors={sponsors} />
      </div>
    );
  }

  // ── Mid-game leaderboard ───────────────────────────────────────────────────
  // Rendered inline so the player never leaves /play during a round boundary —
  // host's "Next Round" then shows the next question instantly (no route transition).
  if (phase === "leaderboard") {
    const podiumEntries = leaderboard.slice(0, 3);
    const rankingEntries = leaderboard.slice(3);
    const firstScore = leaderboard[0]?.total_score ?? 1;
    const inTop3 = myLbEntry ? podiumEntries.some((e) => e.player_id === myLbEntry.player_id) : false;
    return (
      <div className="min-h-dvh bg-background flex flex-col">
        <AppHeader
          user={{ id: player.id, displayName: player.displayName, email: player.email }}
          avatarUrl={player.avatarUrl}
          right={event.logoUrl ? (
            <Image src={event.logoUrl} alt="Event logo" width={110} height={28} unoptimized className="h-7 w-auto max-w-[110px] object-contain" />
          ) : null}
        />
        <div className="flex-1 max-w-lg md:max-w-2xl lg:max-w-3xl mx-auto w-full flex flex-col">
          <div className="text-center px-5 pt-5 pb-2 space-y-2">
            <h1 className="font-heading text-2xl font-bold leading-tight">{event.title}</h1>
            <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground" style={{ fontFamily: "Inter, sans-serif" }}>
              Round standings
            </p>
          </div>
          {leaderboard.length > 0 ? (
            <div className="px-5 py-4 space-y-4">
              <PodiumLayout entries={podiumEntries} myPlayerId={player.id} deltas={lbDeltas} />
              {rankingEntries.length > 0 && (
                <div className="border-t border-border pt-2 max-h-[55vh] overflow-y-auto">
                  {rankingEntries.map((e, i) => (
                    <RankingRow key={e.player_id} entry={e} firstScore={firstScore} delta={lbDeltas.get(e.player_id) ?? null} isMe={e.player_id === player.id} animIndex={i} />
                  ))}
                </div>
              )}
              {myLbEntry && !inTop3 && (
                <PinnedRankSection entry={myLbEntry as LbEntry} firstScore={firstScore} />
              )}
            </div>
          ) : (
            <div className="flex-1 flex items-center justify-center">
              <p className="text-sm text-muted-foreground animate-pulse">Loading standings…</p>
            </div>
          )}
          <div className="text-center pb-4">
            <p className="text-xs text-muted-foreground">Waiting for host to start the next round…</p>
          </div>
        </div>
        <SponsorBar sponsors={sponsors} />
      </div>
    );
  }

  // ── Interstitial phase ─────────────────────────────────────────────────────
  if (phase === "interstitial") {
    const interstitialRound = roundsInfo.find((r) => r.id === gameState.current_round_id);
    // Pull round metadata from the first question in this round (round_type
    // and config live on questions because the client never loads rounds directly).
    const questionsInThisRound = questions.filter(
      (q) => q.round_id === gameState.current_round_id
    );
    const firstQ = questionsInThisRound[0];
    return (
      <div className="min-h-dvh bg-background flex flex-col">
        <AppHeader
          user={{ id: player.id, displayName: player.displayName, email: player.email }}
          avatarUrl={player.avatarUrl}
          right={event.logoUrl ? (
            <Image src={proxyImageUrl(event.logoUrl)} alt="Event logo" width={110} height={28} unoptimized className="h-7 w-auto max-w-[110px] object-contain" />
          ) : null}
        />
        {/* pb-32 so the centered content isn't hidden by the fixed sponsor footer */}
        <div className="flex-1 flex flex-col items-center justify-center px-5 gap-6 pb-32">
          <InterstitialCard
            roundType={firstQ?.round_type ?? "mcq"}
            roundTitle={interstitialRound?.title ?? "Next Round"}
            description={interstitialRound?.interstitial_text ?? null}
            questionCount={questionsInThisRound.length}
            timePerQuestionSeconds={firstQ?.time_limit_seconds ?? 15}
            basePoints={firstQ?.base_points ?? 100}
            mode="player"
          />
        </div>

        {/* Sticky grayscale sponsor footer — mirrors host. */}
        {sponsors.length > 0 && (
          <div className="fixed bottom-0 left-0 right-0 z-40 bg-background border-t border-border">
            <SponsorBar sponsors={sponsors} />
          </div>
        )}
      </div>
    );
  }


  // ── Paused ─────────────────────────────────────────────────────────────────
  if (phase === "lobby" && gameState.started_at) {
    return (
      <div className="min-h-dvh bg-background flex flex-col">
        <div className="flex-1 flex flex-col items-center justify-center px-5 gap-6">
          <Link href="/join">
            <Image src="/logo-light.svg" alt="BlockTrivia" width={140} height={32} className="h-8 w-auto dark:hidden" />
            <Image src="/logo-dark.svg" alt="BlockTrivia" width={140} height={32} className="h-8 w-auto hidden dark:block" />
          </Link>
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
        <Link href="/join">
          <Image src="/logo-light.svg" alt="BlockTrivia" width={140} height={32} className="h-8 w-auto dark:hidden" />
          <Image src="/logo-dark.svg" alt="BlockTrivia" width={140} height={32} className="h-8 w-auto hidden dark:block" />
        </Link>
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
            <span className="inline-flex items-center gap-2 font-medium truncate max-w-[60%]">
              {currentQuestion && (
                <RoundTypeBadge type={currentQuestion.round_type} size={20} />
              )}
              <span className="truncate">{currentRoundData.title}</span>
              {rounds.length > 1 && (
                <span className="ml-1 text-muted-foreground/60 shrink-0">
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
                  <div className="absolute inset-0 bg-[var(--bt-hover)]" />
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
                      ? 'var(--bt-violet)'
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

      {/* 3-2-1 "Get Ready" overlay — shown when a new question arrives (BUG-004) */}
      {transitionCountdown !== null && (
        <div className="fixed inset-0 z-50 bg-background flex flex-col items-center justify-center gap-6">
          <p className="text-[11px] font-bold text-primary uppercase tracking-widest">
            Get Ready
          </p>
          <div
            key={transitionCountdown}
            className="font-heading text-8xl font-bold tabular-nums"
            style={{ animation: "countdown-pop 400ms cubic-bezier(0.34,1.56,0.64,1)" }}
          >
            {transitionCountdown}
          </div>
          {currentQuestion && (
            <p className="text-sm text-muted-foreground font-medium">
              {currentQuestion.round_title} · Question {indexInRound + 1} of {questionsInRound.length}
            </p>
          )}
        </div>
      )}

      {/* Modifier activation animation — full-screen overlay on live activation */}
      {modifierJustActivated && effectiveModType && (
        <ModifierActivationOverlay
          modifierName={modifierRegistry.get(effectiveModType)?.displayName ?? effectiveModType}
          subtitle={effectiveModType === "jackpot"
            ? `First correct answer wins ${(effectiveModConfig?.multiplier as number) ?? 5}× points`
            : undefined}
          modifierType={effectiveModType}
          onComplete={() => setModifierJustActivated(false)}
        />
      )}

      {/* Modifier overlay.
          - Playing phase: gated on live game_state (effectiveModType) so the
            banner reflects real-time pot status as the host activates it.
          - Revealing phase: gated on what the RPC actually applied at scoring
            time (lastResult.modifierApplied). The host can activate a modifier
            between submit and reveal — without this gate, modifier_state would
            bleed jackpot copy onto a question scored under the standard branch
            (see migration 077). */}
      {(() => {
        if (!currentQuestion || modifierJustActivated) return null;
        if (phase === "playing" && ModifierOverlay) {
          return (
            <ModifierOverlay
              config={effectiveModConfig}
              isRevealing={false}
              jackpotWinner={false}
            />
          );
        }
        if (phase === "revealing" && lastResult) {
          // Prefer per-response modifier (PR #142, migration 077). Fall back to
          // jackpot_winner=true — RPC only sets that flag inside the jackpot
          // branch, so it's unambiguous proof jackpot was active at scoring
          // time even if migration 077 isn't live yet.
          const modAtScoring =
            lastResult.modifierApplied ??
            (lastResult.jackpotWinner ? "jackpot" : null);
          if (!modAtScoring) return null;
          const RevealOverlay = resolveModifierOverlay(modAtScoring);
          if (!RevealOverlay) return null;
          return (
            <RevealOverlay
              config={effectiveModConfig}
              isRevealing={true}
              jackpotWinner={lastResult?.jackpotWinner ?? false}
            />
          );
        }
        return null;
      })()}

      {/* Revealing banner — carries the full post-answer summary so the separate
          result card below can stay removed (keeps the Why explanation un-crowded) */}
      {phase === "revealing" && lastResult && !lastResult.didNotAnswer && (() => {
        // Three tiers so Closest Wins partial credit ("off by N") doesn't read as "Wrong":
        //   correct  → ✓ spot on / right choice
        //   partial  → ≈ got some points but not fully right
        //   wrong    → ✗ zero points
        const tier: "correct" | "partial" | "wrong" = lastResult.isCorrect
          ? "correct"
          : lastResult.pointsAwarded > 0
            ? "partial"
            : "wrong";
        // Jackpot winner: correct + first → multiplied points. Call it out proudly.
        // jackpotWinner=true is canonical — RPC only sets it inside the jackpot
        // branch, so we don't also need modifierApplied==="jackpot" (which would
        // hide the win when migration 077 isn't live).
        const jackpotWinner =
          lastResult.isCorrect &&
          !!lastResult.jackpotWinner;
        const jackpotMult =
          (effectiveModConfig?.multiplier as number | undefined) ?? 5;
        const descriptor =
          tier === "correct"
            ? jackpotWinner
              ? `Jackpot! ${jackpotMult}× points`
              : lastResult.wagerAmt
                ? `Wagered ${lastResult.wagerAmt} pts`
                : currentQuestion?.time_bonus_enabled
                  ? "Base + speed bonus"
                  : "Correct answer"
            : tier === "partial"
              ? "Almost — partial credit"
              : lastResult.wagerAmt
                ? `Lost ${Math.min(lastResult.wagerAmt, myLbEntry?.total_score ?? 0)} pts wagered`
                : "Better luck next time";
        const label = tier === "correct" ? "Correct!" : tier === "partial" ? "Close" : "Wrong";
        const bgCls = {
          correct: "bg-[var(--bt-correct-tint)] border-b border-correct/30",
          partial: "bg-primary/10 border-b border-primary/30",
          wrong: "bg-[var(--bt-wrong-tint)] border-b border-wrong/30",
        }[tier];
        const textCls = {
          correct: "text-correct",
          partial: "text-primary",
          wrong: "text-wrong",
        }[tier];
        const icon =
          tier === "correct" ? (
            <Check size={16} strokeWidth={2.5} />
          ) : tier === "partial" ? (
            <span className="text-base font-bold leading-none" aria-hidden="true">≈</span>
          ) : (
            <X size={16} strokeWidth={2.5} />
          );
        return (
          <div
            className={`reveal-anim px-5 py-3 flex items-center justify-between gap-3 ${bgCls}`}
            style={{
              animation:
                tier === "correct"
                  ? "reveal-banner 300ms cubic-bezier(0.34,1.56,0.64,1)"
                  : "reveal-banner 260ms ease-out",
            }}
          >
            <span className={`flex items-center gap-1.5 text-sm min-w-0 ${textCls}`}>
              {icon}
              <span className="font-bold">{label}</span>
              <span className="opacity-40 shrink-0">·</span>
              <span className="font-normal opacity-80 truncate">{descriptor}</span>
            </span>
            <span className="flex items-center gap-2 font-bold text-sm tabular-nums shrink-0">
              <span>{lastResult.pointsAwarded >= 0 ? "+" : ""}{lastResult.pointsAwarded} pts</span>
              {myLbEntry?.rank != null && (
                <>
                  <span className="opacity-40">·</span>
                  <span>#{myLbEntry.rank}</span>
                </>
              )}
            </span>
          </div>
        );
      })()}

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

        {/* Round PlayerView — resolved from round registry. Zero engine coupling. */}
        {/* key=currentQuestion.id forces remount on question change, resetting local state (e.g. numericValue in ClosestWins) */}
        {RoundPlayerView && (
          <RoundPlayerView
            key={currentQuestion.id}
            question={currentQuestion}
            phase={phase as import("@/lib/game/round-registry").GamePhase}
            timeLeft={timeLeft}
            hasAnswered={hasAnswered}
            isSubmitting={isSubmitting}
            selectedAnswer={selectedAnswer}
            lastResult={lastResult}
            bankedScore={myLbEntry?.total_score ?? 0}
            leverage={leverage}
            onLeverageChange={setLeverage}
            onSubmit={submitAnswer}
            roundState={gameState.round_state ?? undefined}
            currentPlayerId={player.id}
          />
        )}

        {/* Time's up — unanswered */}
        {timeLeft === 0 && !hasAnswered && phase === "playing" && (
          <p className="text-center text-sm text-wrong font-medium">
            Time&apos;s up — no answer recorded.
          </p>
        )}

        {/* Explanation (revealed) */}
        {phase === "revealing" && lastResult?.explanation && (
          <div className="border-l-4 border-primary bg-primary/5 dark:bg-primary/10 p-4 space-y-1.5">
            <p className="text-[10px] font-bold text-primary uppercase tracking-widest">Why</p>
            <p className="text-sm font-normal leading-relaxed">{lastResult.explanation}</p>
          </div>
        )}

        {/* NOTE: the standalone result card was removed — the reveal banner at
            the top of the screen now carries points, descriptor, and rank, which
            avoids crowding the Why explanation. */}

        {/* Submitted / waiting — hide for round types that render their own waiting UI */}
        {hasAnswered && phase === "playing" && currentQuestion?.round_type !== "closest_wins" && (
          <p className="text-center text-sm text-muted-foreground animate-pulse">
            Answer locked in - waiting for host to reveal...
          </p>
        )}

      </div>
      <SponsorBar sponsors={sponsors} />
    </div>
  );
}
