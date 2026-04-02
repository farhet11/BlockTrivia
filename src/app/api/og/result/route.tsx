export const runtime = "edge";

import { ImageResponse } from "next/og";
import { createClient } from "@supabase/supabase-js";

// 2×2 block logo — satori supports flex only, no CSS grid
function LogoBlock() {
  return (
    <div style={{ display: "flex", flexDirection: "column", width: "32px", height: "32px", gap: "4px", backgroundColor: "#7c3aed", padding: "4px" }}>
      <div style={{ display: "flex", flex: 1, gap: "4px" }}>
        <div style={{ flex: 1, backgroundColor: "#fff" }} />
        <div style={{ flex: 1, backgroundColor: "#a78bfa" }} />
      </div>
      <div style={{ display: "flex", flex: 1, gap: "4px" }}>
        <div style={{ flex: 1, backgroundColor: "#a78bfa" }} />
        <div style={{ flex: 1, backgroundColor: "#fff" }} />
      </div>
    </div>
  );
}

function Wordmark() {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
      <LogoBlock />
      <span style={{ color: "#fff", fontSize: "22px", fontWeight: 700, letterSpacing: "-0.5px" }}>
        Block
        <span style={{ color: "#a78bfa", fontWeight: 300 }}>Trivia</span>
      </span>
    </div>
  );
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const eventId = searchParams.get("event_id");
  const playerId = searchParams.get("player_id");

  if (!eventId) {
    return new Response("Missing event_id", { status: 400 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  const { data: event } = await supabase
    .from("events")
    .select("id, title, join_code")
    .eq("id", eventId)
    .single();

  if (!event) {
    return new Response("Event not found", { status: 404 });
  }

  // Player-specific card
  if (playerId) {
    const [{ data: entry }, { count: totalPlayers }] = await Promise.all([
      supabase
        .from("leaderboard_entries")
        .select("rank, total_score, accuracy, is_top_10_pct")
        .eq("event_id", eventId)
        .eq("player_id", playerId)
        .single(),
      supabase
        .from("leaderboard_entries")
        .select("*", { count: "exact", head: true })
        .eq("event_id", eventId),
    ]);

    return new ImageResponse(
      (
        <div
          style={{
            width: "1200px",
            height: "630px",
            backgroundColor: "#09090b",
            display: "flex",
            flexDirection: "column",
            padding: "60px",
            fontFamily: "sans-serif",
          }}
        >
          <div style={{ display: "flex", marginBottom: "auto" }}>
            <Wordmark />
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginBottom: "32px" }}>
            <span style={{ color: "#7c3aed", fontSize: "100px", fontWeight: 900, lineHeight: 1, letterSpacing: "-4px" }}>
              #{entry?.rank ?? "—"}
            </span>
            <span style={{ color: "#71717a", fontSize: "28px" }}>
              of {totalPlayers ?? "?"} players
            </span>
          </div>

          <div style={{ display: "flex", gap: "40px", marginBottom: "40px" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
              <span style={{ color: "#71717a", fontSize: "14px", textTransform: "uppercase", letterSpacing: "2px" }}>Score</span>
              <span style={{ color: "#fff", fontSize: "42px", fontWeight: 700 }}>{entry?.total_score ?? 0}</span>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
              <span style={{ color: "#71717a", fontSize: "14px", textTransform: "uppercase", letterSpacing: "2px" }}>Accuracy</span>
              <span style={{ color: "#fff", fontSize: "42px", fontWeight: 700 }}>{Math.round(Number(entry?.accuracy ?? 0))}%</span>
            </div>
            {entry?.is_top_10_pct && (
              <div style={{ display: "flex", alignItems: "flex-end", paddingBottom: "8px" }}>
                <span style={{ backgroundColor: "#7c3aed", color: "#fff", fontSize: "14px", fontWeight: 700, padding: "6px 14px", textTransform: "uppercase", letterSpacing: "1px" }}>
                  ★ Top 10%
                </span>
              </div>
            )}
          </div>

          <div style={{ display: "flex", borderTop: "1px solid #27272a", paddingTop: "24px" }}>
            <span style={{ color: "#52525b", fontSize: "18px" }}>{event.title}</span>
          </div>
        </div>
      ),
      { width: 1200, height: 630 }
    );
  }

  // Event leaderboard card
  const [{ data: entries }, { count: totalPlayers }] = await Promise.all([
    supabase
      .from("leaderboard_entries")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .select(`rank, total_score, profiles!leaderboard_entries_player_id_fkey ( display_name )` as any)
      .eq("event_id", eventId)
      .order("rank", { ascending: true })
      .limit(3),
    supabase
      .from("leaderboard_entries")
      .select("*", { count: "exact", head: true })
      .eq("event_id", eventId),
  ]);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const top3 = (entries ?? []).map((e: any) => ({
    name: e.profiles?.display_name ?? "Player",
    score: e.total_score,
    rank: e.rank,
  }));

  const medals = ["🥇", "🥈", "🥉"];

  return new ImageResponse(
    (
      <div
        style={{
          width: "1200px",
          height: "630px",
          backgroundColor: "#09090b",
          display: "flex",
          flexDirection: "column",
          padding: "60px",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", marginBottom: "48px" }}>
          <Wordmark />
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginBottom: "48px" }}>
          <span style={{ color: "#7c3aed", fontSize: "16px", textTransform: "uppercase", letterSpacing: "3px" }}>Final Results</span>
          <span style={{ color: "#fff", fontSize: "52px", fontWeight: 800, letterSpacing: "-2px", lineHeight: 1.1 }}>{event.title}</span>
          <span style={{ color: "#52525b", fontSize: "20px" }}>{totalPlayers ?? 0} players competed</span>
        </div>

        <div style={{ display: "flex", gap: "32px" }}>
          {top3.map((player, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: "12px" }}>
              <span style={{ fontSize: "36px" }}>{medals[i]}</span>
              <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                <span style={{ color: "#fff", fontSize: "20px", fontWeight: 600 }}>{player.name}</span>
                <span style={{ color: "#71717a", fontSize: "16px" }}>{player.score} pts</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    ),
    { width: 1200, height: 630 }
  );
}
