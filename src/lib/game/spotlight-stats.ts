import type { SupabaseClient } from "@supabase/supabase-js";

export interface SpotlightCard {
  emoji: string;
  name: string;
  description: string;
  player_id: string;
  display_name: string;
  /** Short formatted value shown next to player name. */
  stat_value: string;
}

/** Compute Phase 1 spotlight stats from leaderboard + responses data. */
export async function computeSpotlightStats(
  supabase: SupabaseClient,
  eventId: string,
  leaderboard: Array<{
    player_id: string;
    display_name: string;
    rank: number;
    accuracy: number;
    avg_speed_ms: number;
    total_questions: number;
  }>,
  minPlayers = 4,
  minQuestions = 3
): Promise<SpotlightCard[]> {
  if (leaderboard.length < minPlayers) return [];
  const totalQuestions = leaderboard[0]?.total_questions ?? 0;
  if (totalQuestions < minQuestions) return [];

  const { data: responses } = await supabase
    .from("responses")
    .select("player_id, question_id, is_correct, time_taken_ms")
    .eq("event_id", eventId);

  if (!responses || responses.length === 0) return [];

  const playerMap = new Map(leaderboard.map((e) => [e.player_id, e]));
  const cards: SpotlightCard[] = [];

  /** Pick winner from candidates, tie-break by rank (lower rank number wins). */
  function pickWinner(
    candidates: Array<{ player_id: string; value: number }>,
    lowerIsBetter: boolean
  ): { player_id: string; value: number } | null {
    if (candidates.length === 0) return null;
    return [...candidates].sort((a, b) => {
      const diff = lowerIsBetter ? a.value - b.value : b.value - a.value;
      if (diff !== 0) return diff;
      const ra = playerMap.get(a.player_id)?.rank ?? 9999;
      const rb = playerMap.get(b.player_id)?.rank ?? 9999;
      return ra - rb;
    })[0];
  }

  // 1. ⚡ Fastest Trigger
  const fastest = pickWinner(
    leaderboard.filter((e) => e.avg_speed_ms > 0).map((e) => ({ player_id: e.player_id, value: e.avg_speed_ms })),
    true
  );
  if (fastest) {
    const p = playerMap.get(fastest.player_id)!;
    cards.push({
      emoji: "⚡",
      name: "Fastest Trigger",
      description: "Lowest average response time",
      player_id: fastest.player_id,
      display_name: p.display_name,
      stat_value: `${(fastest.value / 1000).toFixed(1)}s avg`,
    });
  }

  // 2. 🎯 Sharpshooter (exclude rank 1)
  const sharp = pickWinner(
    leaderboard.filter((e) => e.rank > 1).map((e) => ({ player_id: e.player_id, value: e.accuracy })),
    false
  );
  if (sharp && sharp.value > 0) {
    const p = playerMap.get(sharp.player_id)!;
    cards.push({
      emoji: "🎯",
      name: "Sharpshooter",
      description: "Highest accuracy (outside #1)",
      player_id: sharp.player_id,
      display_name: p.display_name,
      stat_value: `${Math.round(sharp.value)}% accuracy`,
    });
  }

  // 3. 🔮 Oracle — most correct on hard questions (<50% correct rate)
  const questionStats = new Map<string, { correct: number; total: number }>();
  for (const r of responses) {
    const q = questionStats.get(r.question_id) ?? { correct: 0, total: 0 };
    q.total++;
    if (r.is_correct) q.correct++;
    questionStats.set(r.question_id, q);
  }
  const hardQs = new Set<string>();
  questionStats.forEach((stats, qId) => {
    if (stats.total >= 2 && stats.correct / stats.total < 0.5) hardQs.add(qId);
  });
  if (hardQs.size > 0) {
    const oracleCounts = new Map<string, number>();
    for (const r of responses) {
      if (hardQs.has(r.question_id) && r.is_correct && playerMap.has(r.player_id)) {
        oracleCounts.set(r.player_id, (oracleCounts.get(r.player_id) ?? 0) + 1);
      }
    }
    const oracle = pickWinner(
      Array.from(oracleCounts.entries()).map(([player_id, value]) => ({ player_id, value })),
      false
    );
    if (oracle && oracle.value > 0) {
      const p = playerMap.get(oracle.player_id)!;
      cards.push({
        emoji: "🔮",
        name: "Oracle",
        description: "Most correct on the hardest questions",
        player_id: oracle.player_id,
        display_name: p.display_name,
        stat_value: `${oracle.value}/${hardQs.size} hard Q${hardQs.size !== 1 ? "s" : ""}`,
      });
    }
  }

  // 4. 🤡 Committed Early — fastest wrong answer
  const earlyMap = new Map<string, number>();
  for (const r of responses) {
    if (!r.is_correct && playerMap.has(r.player_id)) {
      const existing = earlyMap.get(r.player_id) ?? Infinity;
      if (r.time_taken_ms < existing) earlyMap.set(r.player_id, r.time_taken_ms);
    }
  }
  const early = pickWinner(
    Array.from(earlyMap.entries()).map(([player_id, value]) => ({ player_id, value })),
    true
  );
  if (early) {
    const p = playerMap.get(early.player_id)!;
    cards.push({
      emoji: "🤡",
      name: "Committed Early",
      description: "Fastest wrong answer in the game",
      player_id: early.player_id,
      display_name: p.display_name,
      stat_value: `${(early.value / 1000).toFixed(1)}s (wrong)`,
    });
  }

  return cards;
}
