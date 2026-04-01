import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // Auth — require a valid JWT
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Service-role client (can read correct_answer — bypasses RLS)
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // User client (respects RLS for the insert)
    const supabaseUser = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    // Verify the user
    const { data: { user }, error: authError } = await supabaseUser.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const { question_id, selected_answer, time_taken_ms, wipeout_leverage, event_id } = body;

    if (
      typeof question_id !== "string" ||
      typeof selected_answer !== "number" ||
      typeof time_taken_ms !== "number" ||
      typeof event_id !== "string"
    ) {
      return new Response(JSON.stringify({ error: "Invalid request body" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Verify player is a member of this event
    const { data: membership } = await supabaseAdmin
      .from("event_players")
      .select("id")
      .eq("event_id", event_id)
      .eq("player_id", user.id)
      .single();

    if (!membership) {
      return new Response(JSON.stringify({ error: "Not a participant in this event" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch question with round info (server-side only — correct_answer never sent to client)
    const { data: question, error: qError } = await supabaseAdmin
      .from("questions")
      .select(`
        id, correct_answer, explanation,
        rounds!inner (
          base_points, time_bonus_enabled, time_limit_seconds,
          round_type, wipeout_min_leverage, wipeout_max_leverage
        )
      `)
      .eq("id", question_id)
      .single();

    if (qError || !question) {
      return new Response(JSON.stringify({ error: "Question not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const round = Array.isArray(question.rounds) ? question.rounds[0] : question.rounds as {
      base_points: number;
      time_bonus_enabled: boolean;
      time_limit_seconds: number;
      round_type: string;
      wipeout_min_leverage: number;
      wipeout_max_leverage: number;
    };

    const isCorrect = selected_answer === question.correct_answer;
    const isWipeout = round.round_type === "wipeout";

    // Clamp time taken to the time limit
    const clampedTime = Math.min(time_taken_ms, round.time_limit_seconds * 1000);

    // Clamp leverage to configured bounds
    const leverage = isWipeout
      ? Math.min(
          Math.max(wipeout_leverage ?? 1.0, round.wipeout_min_leverage),
          round.wipeout_max_leverage
        )
      : 1.0;

    let points = 0;
    if (isCorrect) {
      points = round.base_points;
      if (round.time_bonus_enabled) {
        const ratio = Math.max(0, 1 - clampedTime / (round.time_limit_seconds * 1000));
        points += Math.floor(round.base_points * ratio);
      }
      if (isWipeout) points = Math.floor(points * leverage);
    } else if (isWipeout && leverage > 1) {
      points = -Math.floor(round.base_points * 0.5 * (leverage - 1));
    }

    // Insert response — upsert to handle duplicate submission attempts gracefully
    const { error: insertError } = await supabaseAdmin
      .from("responses")
      .upsert(
        {
          event_id,
          question_id,
          player_id: user.id,
          selected_answer,
          is_correct: isCorrect,
          time_taken_ms: clampedTime,
          points_awarded: points,
          wipeout_leverage: leverage,
        },
        { onConflict: "question_id,player_id", ignoreDuplicates: true }
      );

    if (insertError) {
      console.error("Insert error:", insertError);
      return new Response(JSON.stringify({ error: "Failed to save response" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(
      JSON.stringify({
        is_correct: isCorrect,
        points_awarded: points,
        correct_answer: question.correct_answer,
        explanation: question.explanation ?? null,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("Unexpected error:", err);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
