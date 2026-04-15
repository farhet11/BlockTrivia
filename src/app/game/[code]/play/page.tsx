import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { PlayView } from "./_components/play-view";

export default async function PlayPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  const supabase = await createServerSupabaseClient();

  // Phase 1: auth + event in parallel (event lookup is keyed by join_code only)
  const [authResult, eventResult] = await Promise.all([
    supabase.auth.getUser(),
    supabase
      .from("events")
      .select("id, title, join_code, status, logo_url, logo_dark_url, organizer_name")
      .eq("join_code", code.toUpperCase())
      .single(),
  ]);

  const user = authResult.data.user;
  const event = eventResult.data;
  if (!user) redirect(`/join/${code}`);
  if (!event) redirect("/join");

  // Phase 2: everything that needs event.id (and profile which needs user.id)
  // runs in parallel. These 5 queries were previously sequential — biggest win here.
  const [
    playerEntryResult,
    gameStateResult,
    roundsResult,
    sponsorsResult,
    profileResult,
  ] = await Promise.all([
    supabase
      .from("event_players")
      .select("id")
      .eq("event_id", event.id)
      .eq("player_id", user.id)
      .single(),
    supabase
      .from("game_state")
      .select("id, event_id, phase, current_round_id, current_question_id, question_started_at, started_at, ended_at, modifier_state, round_state, is_paused")
      .eq("event_id", event.id)
      .single(),
    supabase
      .from("rounds")
      .select("id, title, round_type, sort_order, time_limit_seconds, base_points, time_bonus_enabled, config, interstitial_text, round_modifiers(modifier_type, config)")
      .eq("event_id", event.id)
      .order("sort_order"),
    supabase
      .from("event_sponsors")
      .select("id, name, logo_url, sort_order")
      .eq("event_id", event.id)
      .order("sort_order"),
    supabase
      .from("profiles")
      .select("display_name, avatar_url")
      .eq("id", user.id)
      .single(),
  ]);

  const playerEntry = playerEntryResult.data;
  const gameState = gameStateResult.data;
  const rawRounds = roundsResult.data;
  const sponsors = sponsorsResult.data;
  const profile = profileResult.data;

  if (!playerEntry) redirect(`/join/${code}`);
  if (!gameState || gameState.phase === "lobby") {
    redirect(`/game/${code}/lobby`);
  }
  if (gameState.phase === "ended") {
    redirect(`/game/${code}/final`);
  }

  // Flatten modifier (max 1 per round by UNIQUE constraint)
  type RawMod = { modifier_type: string; config: Record<string, unknown> };
  const rounds = (rawRounds ?? []).map((r) => {
    const mods = r.round_modifiers as RawMod[] | null;
    const mod = Array.isArray(mods) && mods.length > 0 ? mods[0] : null;
    return {
      ...r,
      modifier_type: mod?.modifier_type ?? null,
      modifier_config: mod?.config ?? {},
      round_modifiers: undefined,
    };
  });

  // Phase 3: questions (sequential — needs round IDs from phase 2)
  const roundIds = rounds.map((r) => r.id);
  const { data: questions } = roundIds.length
    ? await supabase
        .from("questions")
        .select("id, round_id, body, options, sort_order, image_url, reveal_mode")
        .in("round_id", roundIds)
        .order("sort_order")
    : { data: [] };

  // Group questions by round so the flat list matches the host's ordering
  // (round.sort_order → question.sort_order). A global order("sort_order")
  // interleaves rounds whenever their sort_orders overlap, which makes the
  // player's "Question X/Y" disagree with the host's.
  const roundMap = Object.fromEntries(rounds.map((r) => [r.id, r]));
  const questionsByRound = new Map<string, typeof questions>();
  for (const q of questions ?? []) {
    const arr = questionsByRound.get(q.round_id) ?? [];
    arr.push(q);
    questionsByRound.set(q.round_id, arr);
  }
  const orderedQuestions = rounds.flatMap((r) =>
    (questionsByRound.get(r.id) ?? [])
      .slice()
      .sort((a, b) => a.sort_order - b.sort_order)
  );
  const questionList = orderedQuestions.map((q) => ({
    ...q,
    options: q.options as string[],
    round_title: roundMap[q.round_id]?.title ?? "Round",
    round_type: roundMap[q.round_id]?.round_type ?? "mcq",
    time_limit_seconds: roundMap[q.round_id]?.time_limit_seconds ?? 15,
    base_points: roundMap[q.round_id]?.base_points ?? 100,
    time_bonus_enabled: roundMap[q.round_id]?.time_bonus_enabled ?? true,
    config: (roundMap[q.round_id]?.config as Record<string, unknown>) ?? {},
    modifier_type: roundMap[q.round_id]?.modifier_type ?? null,
    modifier_config: (roundMap[q.round_id]?.modifier_config as Record<string, unknown>) ?? {},
  }));

  // Build rounds info for interstitial lookups
  const roundsInfo = rounds.map((r) => ({
    id: r.id,
    title: r.title ?? `Round ${r.sort_order + 1}`,
    sort_order: r.sort_order,
    interstitial_text: (r.interstitial_text as string | null) ?? null,
  }));

  return (
    <PlayView
      event={{ id: event.id, title: event.title, joinCode: event.join_code, logoUrl: event.logo_url ?? null, logoDarkUrl: event.logo_dark_url ?? null, organizerName: event.organizer_name ?? null }}
      player={{ id: user.id, displayName: profile?.display_name ?? "Player", email: user.email ?? undefined, avatarUrl: profile?.avatar_url ?? (user.user_metadata?.avatar_url as string | null) ?? null }}
      questions={questionList}
      initialGameState={gameState}
      sponsors={sponsors ?? []}
      roundsInfo={roundsInfo}
    />
  );
}
