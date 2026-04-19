/**
 * BlockTrivia stress test — 300-bot full game simulation.
 *
 * Provisions N bots, signs them in, joins the event, then runs the full
 * game from lobby → all questions → ended. Every round type (MCQ, WipeOut,
 * Closest Wins) gets realistic randomised answers. Ends with a DB-verified
 * pilot-readiness report.
 *
 * Usage:
 *   npx tsx scripts/stress-test.ts --code=ABCDE --players=300
 *
 * Flags:
 *   --code=ABCDE         Event join code (required)
 *   --players=300        Number of bots (default 300)
 *   --concurrency=25     Max parallel sign-ins (default 25)
 *   --answer-delay=3000  Max ms bots wait before answering (default 3000)
 *   --wrong-rate=0.35    Probability of wrong answer for MCQ/WipeOut (default 0.35)
 *   --reuse              Reuse cached users from .stress-users.json
 *   --manual-host        Skip auto-host; drive the game yourself from the control panel
 *                        (you can also join as a real player alongside the bots)
 */

import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

// ── env ──────────────────────────────────────────────────────────────────────
function loadEnv(path: string) {
  if (!existsSync(path)) return;
  for (const raw of readFileSync(path, "utf8").split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const k = line.slice(0, eq).trim();
    let v = line.slice(eq + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'")))
      v = v.slice(1, -1);
    if (!(k in process.env)) process.env[k] = v;
  }
}
function findAndLoadEnv() {
  let dir = process.cwd();
  for (let i = 0; i < 6; i++) {
    const p = resolve(dir, ".env.local");
    if (existsSync(p)) { loadEnv(p); return; }
    const parent = resolve(dir, "..");
    if (parent === dir) break;
    dir = parent;
  }
}
findAndLoadEnv();

// ── config ────────────────────────────────────────────────────────────────────
const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, "").split("=");
    return [k, v ?? "true"];
  })
);

const SUPABASE_URL  = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const ANON_KEY      = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const SERVICE_KEY   = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const EVENT_CODE    = (args.code || "").toUpperCase();
const NUM_PLAYERS   = parseInt(args.players      || "300",  10);
const CONCURRENCY   = parseInt(args.concurrency  || "25",   10);
const ANSWER_DELAY  = parseInt(args["answer-delay"] || "3000", 10);
const WRONG_RATE    = parseFloat(args["wrong-rate"] || "0.35");
const REUSE         = args.reuse === "true";
/**
 * When true, skip the auto-host. Print instructions for the human host to
 * drive the game from the control panel. Bots poll and answer questions
 * automatically as the host advances them.
 */
const MANUAL_HOST   = args["manual-host"] === "true";
const CACHE_FILE    = resolve(process.cwd(), ".stress-users.json");
const EMAIL_DOMAIN  = "blocktrivia-stress.test";
/** Shared password for all stress-test bots — avoids magic-link expiry issues. */
const STRESS_PASSWORD = process.env.STRESS_BOT_PASSWORD ?? "BlockTriviaStress2024!";
const AUTOHOST_MS   = 10_000;
const RPC_MS        = 15_000;

if (!SUPABASE_URL || !ANON_KEY || !SERVICE_KEY) { console.error("Missing env vars"); process.exit(1); }
if (!EVENT_CODE || EVENT_CODE.length !== 5)     { console.error("Usage: --code=ABCDE"); process.exit(1); }

// ── metrics ───────────────────────────────────────────────────────────────────
interface QuestionStat {
  id: string;
  roundType: string;
  roundTitle: string;
  botsAnswered: number;
  botsCorrect: number;
  latencies: number[];
}

interface RunMetrics {
  label: string;
  players: number;
  usersCreated: number;
  usersReused: number;
  signInOk: number;
  signInFail: number;
  joinOk: number;
  joinFail: number;
  questionsAdvanced: number;
  answersOk: number;
  answersFail: number;
  allLatencies: number[];
  questionStats: Map<string, QuestionStat>;
  errors: string[];
  durationMs: number;
  // DB-verified post-game
  dbPlayerCount: number;
  dbNonZeroScores: number;
  dbAvgScore: number;
  dbMaxScore: number;
  dbMinScore: number;
  dbTotalResponses: number;
}

function makeMetrics(label: string, players: number): RunMetrics {
  return {
    label, players,
    usersCreated: 0, usersReused: 0,
    signInOk: 0, signInFail: 0,
    joinOk: 0, joinFail: 0,
    questionsAdvanced: 0,
    answersOk: 0, answersFail: 0,
    allLatencies: [],
    questionStats: new Map(),
    errors: [],
    durationMs: 0,
    dbPlayerCount: 0, dbNonZeroScores: 0, dbAvgScore: 0,
    dbMaxScore: 0, dbMinScore: 0, dbTotalResponses: 0,
  };
}

function pct(arr: number[], p: number) {
  if (!arr.length) return 0;
  const s = [...arr].sort((a, b) => a - b);
  return s[Math.min(Math.floor(s.length * p), s.length - 1)];
}

async function pMap<T, R>(
  items: T[],
  fn: (x: T, i: number) => Promise<R>,
  conc: number
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;
  await Promise.all(
    Array.from({ length: Math.min(conc, items.length) }, async () => {
      while (true) {
        const i = cursor++;
        if (i >= items.length) return;
        try { results[i] = await fn(items[i], i); } catch {}
      }
    })
  );
  return results;
}

function logErr(m: RunMetrics, tag: string, e: unknown) {
  const msg = e instanceof Error ? e.message : String(e);
  m.errors.push(`[${tag}] ${msg}`);
  if (m.errors.length <= 15) console.error(`  [ERR][${tag}] ${msg}`);
}

function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, rej) =>
      setTimeout(() => rej(new Error(`timeout ${ms}ms [${label}]`)), ms)
    ),
  ]);
}

// ── answer generation ─────────────────────────────────────────────────────────
/**
 * For Closest Wins: generate an answer realistically close to target.
 * 65% of bots answer exactly right, rest spread ±20% around target.
 */
function closestWinsAnswer(target: number): number {
  if (Math.random() > WRONG_RATE) return target; // exact correct
  // Spread: ±20% of target (min ±50 to handle small numbers like years)
  const spread = Math.max(50, Math.abs(target) * 0.2);
  const delta = (Math.random() * 2 - 1) * spread;
  return Math.round(target + delta);
}

/** WipeOut leverage: random 0.1–0.9, skewed toward moderate bets. */
function wipeoutLeverage(): number {
  return Math.round((0.1 + Math.random() * 0.8) * 10) / 10;
}

// ── user pool ─────────────────────────────────────────────────────────────────
interface CachedUser {
  id: string;
  email: string;
  accessToken?: string;
  refreshToken?: string;
}

async function ensureUsers(n: number, m: RunMetrics): Promise<CachedUser[]> {
  const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
  let cached: CachedUser[] = [];
  if (REUSE && existsSync(CACHE_FILE)) {
    cached = JSON.parse(readFileSync(CACHE_FILE, "utf8"));
    if (cached.length >= n) { m.usersReused = n; return cached.slice(0, n); }
  }
  const toCreate = n - cached.length;
  if (toCreate > 0) {
    console.log(`  Creating ${toCreate} new bot accounts...`);
    const newUsers: CachedUser[] = [];
    await pMap(
      Array.from({ length: toCreate }, (_, i) => cached.length + i),
      async (idx) => {
        const suffix = `${idx}-${Date.now().toString(36)}`;
        const email = `stressbot-${suffix}@${EMAIL_DOMAIN}`;
        const { data, error } = await admin.auth.admin.createUser({
          email,
          email_confirm: true,
          password: STRESS_PASSWORD,
          user_metadata: { display_name: `Bot-${suffix}` },
        });
        if (error || !data.user) { logErr(m, "createUser", error?.message || "no user"); return; }
        newUsers.push({ id: data.user.id, email });
        m.usersCreated++;
      },
      CONCURRENCY
    );
    // Ensure existing cached bots also have password set
    if (cached.length > 0) {
      await pMap(cached, async (u) => {
        await admin.auth.admin.updateUserById(u.id, { password: STRESS_PASSWORD }).catch(() => {});
      }, CONCURRENCY);
    }
    m.usersReused = cached.length;
    const all = [...cached, ...newUsers];
    writeFileSync(CACHE_FILE, JSON.stringify(all, null, 2));
    return all.slice(0, n);
  }
  // Ensure passwords are set for fully-cached runs too
  console.log(`  Setting/verifying passwords for ${n} cached bots...`);
  await pMap(cached.slice(0, n), async (u) => {
    await admin.auth.admin.updateUserById(u.id, { password: STRESS_PASSWORD }).catch(() => {});
  }, CONCURRENCY);
  m.usersReused = cached.length;
  return cached.slice(0, n);
}

function saveSessionTokens(users: CachedUser[]) {
  if (!existsSync(CACHE_FILE)) return;
  const all: CachedUser[] = JSON.parse(readFileSync(CACHE_FILE, "utf8"));
  const byId = Object.fromEntries(users.map((u) => [u.id, u]));
  for (const u of all) {
    if (byId[u.id]) {
      u.accessToken  = byId[u.id].accessToken;
      u.refreshToken = byId[u.id].refreshToken;
    }
  }
  writeFileSync(CACHE_FILE, JSON.stringify(all, null, 2));
}

// ── auth ───────────────────────────────────────────────────────────────────────
async function adminSignIn(
  email: string
): Promise<{ access_token: string; refresh_token: string } | null> {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const genResp = await fetch(`${SUPABASE_URL}/auth/v1/admin/generate_link`, {
        method: "POST",
        headers: {
          apikey: SERVICE_KEY,
          Authorization: `Bearer ${SERVICE_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ type: "magiclink", email }),
        signal: AbortSignal.timeout(15_000),
      });
      const genData = (await genResp.json()) as {
        email_otp?: string;
        hashed_token?: string;
        properties?: { email_otp?: string; hashed_token?: string };
      };

      const otp = genData.email_otp ?? genData.properties?.email_otp;
      if (otp) {
        const tokenResp = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=otp`, {
          method: "POST",
          headers: { apikey: ANON_KEY, "Content-Type": "application/json" },
          body: JSON.stringify({ email, token: otp, type: "magiclink" }),
          signal: AbortSignal.timeout(15_000),
        });
        const td = (await tokenResp.json()) as { access_token?: string; refresh_token?: string };
        if (td.access_token)
          return { access_token: td.access_token, refresh_token: td.refresh_token ?? "" };
      }

      const hashed = genData.hashed_token ?? genData.properties?.hashed_token;
      if (hashed) {
        const vr = await fetch(
          `${SUPABASE_URL}/auth/v1/verify?token=${hashed}&type=magiclink`,
          { method: "GET", redirect: "manual", signal: AbortSignal.timeout(15_000) }
        );
        const loc = vr.headers.get("location") ?? "";
        const params = new URLSearchParams(loc.split("#")[1] ?? "");
        const at = params.get("access_token");
        if (at)
          return { access_token: at, refresh_token: params.get("refresh_token") ?? "" };
      }
    } catch {}
    await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
  }
  return null;
}

// ── bot ────────────────────────────────────────────────────────────────────────
interface BotCtx {
  user: CachedUser;
  supabase: SupabaseClient;
  eventId?: string;
  answeredQuestionId?: string;
  _active: boolean;
}

async function signInBot(user: CachedUser, m: RunMetrics): Promise<BotCtx | null> {
  const sb = createClient(SUPABASE_URL, ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: true },
  });

  // Primary: password auth — never expires, no magic-link rate limiting
  const { data: pwData, error: pwErr } = await sb.auth.signInWithPassword({
    email: user.email,
    password: STRESS_PASSWORD,
  });
  if (!pwErr && pwData.session) {
    user.accessToken  = pwData.session.access_token;
    user.refreshToken = pwData.session.refresh_token;
    m.signInOk++;
    return { user, supabase: sb, _active: true };
  }

  // Fallback: magic-link (for bots created before password support)
  const tokens = await adminSignIn(user.email);
  if (tokens) {
    const { error } = await sb.auth.setSession(tokens);
    if (!error) {
      user.accessToken  = tokens.access_token;
      user.refreshToken = tokens.refresh_token;
      m.signInOk++;
      return { user, supabase: sb, _active: true };
    }
  }

  m.signInFail++;
  logErr(m, "signIn", pwErr?.message ?? "all methods failed");
  return null;
}

async function joinEvent(ctx: BotCtx, m: RunMetrics): Promise<boolean> {
  const { data: ev, error: evErr } = await ctx.supabase
    .from("events").select("id").eq("join_code", EVENT_CODE).maybeSingle();
  if (evErr || !ev) { m.joinFail++; logErr(m, "eventLookup", evErr?.message || "not found"); return false; }
  ctx.eventId = ev.id;
  const { error } = await ctx.supabase
    .from("event_players")
    .upsert({ event_id: ev.id, player_id: ctx.user.id }, { onConflict: "event_id,player_id" });
  if (error) { m.joinFail++; logErr(m, "join", error.message); return false; }
  m.joinOk++;
  return true;
}

interface QuestionData {
  id: string;
  roundType: string;
  roundTitle: string;
  options: string[] | null;
  correctAnswer: number;
  correctAnswerNumeric: number | null;
  timeLimitSeconds: number;
}

const questionCache = new Map<string, QuestionData>();

async function fetchQuestionData(ctx: BotCtx, questionId: string): Promise<QuestionData | null> {
  if (questionCache.has(questionId)) return questionCache.get(questionId)!;
  const { data, error } = await ctx.supabase
    .from("questions")
    .select("id, options, correct_answer, correct_answer_numeric, rounds(round_type, title, time_limit_seconds)")
    .eq("id", questionId)
    .maybeSingle();
  if (error || !data) return null;
  const r = data.rounds as { round_type: string; title: string; time_limit_seconds: number } | null;
  const q: QuestionData = {
    id: data.id as string,
    roundType: r?.round_type ?? "mcq",
    roundTitle: r?.title ?? "Unknown",
    options: data.options as string[] | null,
    correctAnswer: data.correct_answer as number ?? 0,
    correctAnswerNumeric: data.correct_answer_numeric as number | null,
    timeLimitSeconds: r?.time_limit_seconds ?? 15,
  };
  questionCache.set(questionId, q);
  return q;
}

async function submitAnswer(ctx: BotCtx, questionId: string, m: RunMetrics) {
  if (ctx.answeredQuestionId === questionId) return;
  ctx.answeredQuestionId = questionId;

  const q = await fetchQuestionData(ctx, questionId);
  if (!q) { logErr(m, "fetchQ", `null for ${questionId}`); return; }

  // Ensure question stat entry exists
  if (!m.questionStats.has(questionId)) {
    m.questionStats.set(questionId, {
      id: questionId,
      roundType: q.roundType,
      roundTitle: q.roundTitle,
      botsAnswered: 0,
      botsCorrect: 0,
      latencies: [],
    });
  }

  // Realistic answer delay — at most 80% of time limit
  const maxDelay = Math.min(ANSWER_DELAY, q.timeLimitSeconds * 800);
  const delay = Math.floor(Math.random() * maxDelay);
  await new Promise((r) => setTimeout(r, delay));

  // Build answer based on round type
  const numOptions = Math.max(2, q.options?.length ?? 4);
  const pickWrong = Math.random() < WRONG_RATE;

  let selectedAnswer: number;
  let numericAnswer: number | undefined;
  let leverage: number = 1.0;
  let isLikelyCorrect = false;

  switch (q.roundType) {
    case "closest_wins": {
      // Always send a selected_answer of -1 (sentinel) plus numeric answer
      selectedAnswer = -1;
      const target = q.correctAnswerNumeric ?? q.correctAnswer ?? 0;
      numericAnswer = closestWinsAnswer(target);
      isLikelyCorrect = numericAnswer === target;
      break;
    }
    case "wipeout": {
      leverage = wipeoutLeverage();
      if (pickWrong) {
        const others = Array.from({ length: numOptions }, (_, i) => i).filter(
          (i) => i !== q.correctAnswer
        );
        selectedAnswer = others.length
          ? others[Math.floor(Math.random() * others.length)]
          : q.correctAnswer;
        isLikelyCorrect = false;
      } else {
        selectedAnswer = q.correctAnswer;
        isLikelyCorrect = true;
      }
      break;
    }
    default: {
      // MCQ, true_false, etc.
      if (pickWrong) {
        const others = Array.from({ length: numOptions }, (_, i) => i).filter(
          (i) => i !== q.correctAnswer
        );
        selectedAnswer = others.length
          ? others[Math.floor(Math.random() * others.length)]
          : q.correctAnswer;
        isLikelyCorrect = false;
      } else {
        selectedAnswer = q.correctAnswer;
        isLikelyCorrect = true;
      }
    }
  }

  const rpcParams: Record<string, unknown> = {
    p_event_id:        ctx.eventId!,
    p_question_id:     questionId,
    p_selected_answer: selectedAnswer,
    p_time_taken_ms:   delay,
    p_wipeout_leverage: leverage,
  };
  if (numericAnswer !== undefined) rpcParams.p_numeric_answer = numericAnswer;

  const t0 = Date.now();
  try {
    const { error } = await withTimeout(
      ctx.supabase.rpc("submit_answer", rpcParams),
      RPC_MS,
      "submit"
    );
    const lat = Date.now() - t0;
    const stat = m.questionStats.get(questionId)!;
    if (error) {
      m.answersFail++;
      logErr(m, "submitAnswer", error.message);
    } else {
      m.answersOk++;
      m.allLatencies.push(lat);
      stat.botsAnswered++;
      stat.latencies.push(lat);
      if (isLikelyCorrect) stat.botsCorrect++;
    }
  } catch (e) {
    m.answersFail++;
    logErr(m, "submitAnswer", e);
  }
}

function startBotPolling(ctx: BotCtx, m: RunMetrics) {
  const poll = async () => {
    if (!ctx._active) return;
    try {
      const { data } = await ctx.supabase
        .from("game_state")
        .select("current_question_id, phase, is_paused")
        .eq("event_id", ctx.eventId!)
        .maybeSingle();
      if (data?.phase === "playing" && !data.is_paused && data.current_question_id) {
        void submitAnswer(ctx, data.current_question_id, m);
      }
    } catch {}
    if (ctx._active) {
      setTimeout(poll, 1000 + Math.floor(Math.random() * 1500));
    }
  };
  setTimeout(poll, Math.floor(Math.random() * 1000));
}

// ── auto-host ──────────────────────────────────────────────────────────────────
interface GameQuestion {
  id: string;
  round_id: string;
  round_type: string;
  round_title: string;
  time_limit_seconds: number;
}

async function loadAndResetGame(): Promise<{ eventId: string; questions: GameQuestion[] }> {
  const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

  const { data: ev } = await admin.from("events").select("id").eq("join_code", EVENT_CODE).maybeSingle();
  if (!ev) throw new Error(`Event ${EVENT_CODE} not found`);

  // Full reset: wipe previous run data
  console.log("  Resetting game state for clean run...");
  await admin.from("responses").delete().eq("event_id", ev.id);
  await admin.from("leaderboard_entries").delete().eq("event_id", ev.id);
  await admin.from("event_players").delete().eq("event_id", ev.id);
  await admin.from("game_state").update({
    phase: "lobby",
    current_question_id: null,
    current_round_id: null,
    question_started_at: null,
    is_paused: false,
  }).eq("event_id", ev.id);
  await admin.from("events").update({ status: "active" }).eq("id", ev.id);

  const { data: rounds } = await admin
    .from("rounds")
    .select("id, title, round_type, sort_order, time_limit_seconds")
    .eq("event_id", ev.id)
    .order("sort_order");
  if (!rounds?.length) throw new Error("No rounds found");

  const { data: questions } = await admin
    .from("questions")
    .select("id, round_id, sort_order")
    .in("round_id", rounds.map((r: { id: string }) => r.id))
    .order("sort_order");
  if (!questions?.length) throw new Error("No questions found");

  const roundMap = Object.fromEntries(
    rounds.map((r: { id: string; title: string; round_type: string; time_limit_seconds: number }) => [
      r.id,
      { title: r.title, round_type: r.round_type, time_limit_seconds: r.time_limit_seconds },
    ])
  );
  const roundOrder = Object.fromEntries(
    rounds.map((r: { id: string; sort_order: number }, i: number) => [r.id, i])
  );

  const sorted = [...questions].sort(
    (a: { round_id: string; sort_order: number }, b: { round_id: string; sort_order: number }) => {
      const rDiff = (roundOrder[a.round_id] ?? 0) - (roundOrder[b.round_id] ?? 0);
      return rDiff !== 0 ? rDiff : a.sort_order - b.sort_order;
    }
  );

  return {
    eventId: ev.id,
    questions: sorted.map((q: { id: string; round_id: string }) => ({
      id: q.id,
      round_id: q.round_id,
      round_type: roundMap[q.round_id]?.round_type ?? "mcq",
      round_title: roundMap[q.round_id]?.title ?? "Unknown",
      time_limit_seconds: roundMap[q.round_id]?.time_limit_seconds ?? 15,
    })),
  };
}

function makeAdmin() {
  return createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
}

async function runAutoHost(
  eventId: string,
  questions: GameQuestion[],
  m: RunMetrics
): Promise<void> {
  let admin = makeAdmin();

  console.log(`\n→ Auto-host: serving ${questions.length} questions`);

  // Start game
  await withTimeout(
    admin.from("game_state").update({ phase: "playing", is_paused: false }).eq("event_id", eventId),
    AUTOHOST_MS, "start-game"
  ).catch(() => {});

  for (let qi = 0; qi < questions.length; qi++) {
    const q = questions[qi];
    const startedAt = new Date(Date.now() + 2000).toISOString();

    let advanced = false;
    for (let attempt = 0; attempt < 3 && !advanced; attempt++) {
      try {
        const { error } = await withTimeout(
          admin.from("game_state").update({
            current_question_id: q.id,
            current_round_id: q.round_id,
            question_started_at: startedAt,
            phase: "playing",
            is_paused: false,
          }).eq("event_id", eventId),
          AUTOHOST_MS,
          "advance"
        );
        if (error) {
          logErr(m, "autoHost", error.message);
          admin = makeAdmin();
          await new Promise((r) => setTimeout(r, 1000));
        } else {
          advanced = true;
        }
      } catch (e) {
        logErr(m, "autoHost", e);
        admin = makeAdmin();
        await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
      }
    }
    if (!advanced) {
      console.error(`  [WARN] Skipping Q${qi + 1} after 3 failed attempts`);
      continue;
    }
    m.questionsAdvanced++;

    // Wait full time limit + 3s buffer for all bots to answer
    const wait = (q.time_limit_seconds + 3) * 1000;
    process.stdout.write(
      `\r  Q${qi + 1}/${questions.length} [${q.round_type.padEnd(12)}] waiting ${(wait / 1000).toFixed(0)}s...   `
    );
    await new Promise((r) => setTimeout(r, wait));

    // Recompute after each question
    await withTimeout(
      admin.rpc("recompute_leaderboard_ranks", { p_event_id: eventId }),
      AUTOHOST_MS, "recompute"
    ).catch(() => {});
  }

  // Final recompute + end game
  await withTimeout(
    admin.rpc("recompute_leaderboard_ranks", { p_event_id: eventId }),
    AUTOHOST_MS, "final-recompute"
  ).catch(() => {});
  await withTimeout(
    admin.from("game_state").update({ phase: "ended" }).eq("event_id", eventId),
    AUTOHOST_MS, "end-game"
  ).catch(() => {});
  await withTimeout(
    admin.from("events").update({ status: "ended" }).eq("id", eventId),
    AUTOHOST_MS, "end-event"
  ).catch(() => {});

  console.log(`\n  ✓ All ${questions.length} questions served — game ended.`);
}

// ── DB verification ────────────────────────────────────────────────────────────
async function verifyPostGame(eventId: string, m: RunMetrics) {
  const admin = makeAdmin();

  const { data: lb } = await admin
    .from("leaderboard_entries")
    .select("total_score, rank, accuracy")
    .eq("event_id", eventId)
    .order("rank");

  if (lb && lb.length > 0) {
    const scores = lb.map((e: { total_score: number }) => e.total_score);
    m.dbPlayerCount   = lb.length;
    m.dbNonZeroScores = scores.filter((s) => s > 0).length;
    m.dbAvgScore      = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
    m.dbMaxScore      = Math.max(...scores);
    m.dbMinScore      = Math.min(...scores);
  }

  const { count } = await admin
    .from("responses")
    .select("*", { count: "exact", head: true })
    .eq("event_id", eventId);
  m.dbTotalResponses = count ?? 0;
}

// ── single run ─────────────────────────────────────────────────────────────────
async function runStressTest(numPlayers: number): Promise<RunMetrics> {
  const m = makeMetrics(`${numPlayers}-bot full game`, numPlayers);
  const t0 = Date.now();

  console.log(`\n${"═".repeat(60)}`);
  console.log(`🤖  ${numPlayers}-BOT FULL GAME STRESS TEST`);
  console.log(`${"═".repeat(60)}\n`);

  // Load + reset
  console.log("→ Loading event & resetting game state...");
  const { eventId, questions } = await loadAndResetGame();
  console.log(`  ✓ ${questions.length} questions across ${new Set(questions.map(q => q.round_id)).size} rounds`);
  const roundTypes = [...new Set(questions.map(q => q.round_type))];
  console.log(`  ✓ Round types: ${roundTypes.join(", ")}\n`);

  // Provision users
  console.log("→ Provisioning bot accounts...");
  const users = await ensureUsers(numPlayers, m);
  console.log(`  ✓ ${m.usersCreated} new, ${m.usersReused} reused\n`);

  // Auth + join (serial with 250ms gap to avoid rate limits)
  console.log(`→ Signing in + joining (${numPlayers} bots, ~250ms/bot)...`);
  const bots: BotCtx[] = [];
  let authProgress = 0;
  await pMap(users, async (u) => {
    const ctx = await signInBot(u, m);
    authProgress++;
    if (authProgress % 50 === 0 || authProgress === users.length) {
      process.stdout.write(`\r  auth ${authProgress}/${users.length} ok=${m.signInOk} fail=${m.signInFail}   `);
    }
    if (!ctx) return;
    const ok = await joinEvent(ctx, m);
    if (ok) bots.push(ctx);
    await new Promise((r) => setTimeout(r, 250));
  }, 1);
  console.log(`\n  ✓ signed-in: ${m.signInOk}/${numPlayers}  joined: ${m.joinOk}/${numPlayers}\n`);
  saveSessionTokens(users);

  // Start polling
  console.log("→ Starting bot poll loops...");
  for (const ctx of bots) startBotPolling(ctx, m);
  console.log(`  ✓ ${bots.length} bots active\n`);

  // Live ticker
  const ticker = setInterval(() => {
    const p50 = pct(m.allLatencies, 0.5);
    const p95 = pct(m.allLatencies, 0.95);
    const p99 = pct(m.allLatencies, 0.99);
    process.stdout.write(
      `\r  answers ok=${m.answersOk} fail=${m.answersFail} | lat p50=${p50}ms p95=${p95}ms p99=${p99}ms | errs=${m.errors.length}   `
    );
  }, 2000);

  // Run the game
  if (MANUAL_HOST) {
    console.log("\n" + "─".repeat(60));
    console.log("  🎮  MANUAL HOST MODE");
    console.log("─".repeat(60));
    console.log(`  ${bots.length} bots are polling and ready to answer.`);
    console.log(`  Open your host control panel and start the game:`);
    console.log(`\n    http://localhost:3000/host/game/${EVENT_CODE}/control`);
    console.log(`\n  You can also join as a player at:`);
    console.log(`    http://localhost:3000/join/${EVENT_CODE}`);
    console.log(`\n  Bots will answer questions automatically as you advance.`);
    console.log("─".repeat(60) + "\n");

    // Poll for game ended
    const adminCheck = makeAdmin();
    await new Promise<void>((resolve) => {
      const poll = setInterval(async () => {
        const { data } = await adminCheck
          .from("game_state")
          .select("phase")
          .eq("event_id", eventId)
          .maybeSingle();
        if (data?.phase === "ended") {
          clearInterval(poll);
          console.log("  ✓ Game ended — generating report...");
          resolve();
        }
      }, 3000);
    });
  } else {
    await runAutoHost(eventId, questions, m);
  }

  clearInterval(ticker);

  // Stop bots
  for (const b of bots) b._active = false;

  // DB verification
  console.log("\n→ Verifying post-game DB state...");
  await verifyPostGame(eventId, m);
  console.log(`  ✓ ${m.dbPlayerCount} leaderboard entries, ${m.dbNonZeroScores} non-zero scores`);
  console.log(`  ✓ ${m.dbTotalResponses} total responses in DB`);

  m.durationMs = Date.now() - t0;
  return m;
}

// ── report ─────────────────────────────────────────────────────────────────────
function printReport(m: RunMetrics) {
  const lines: string[] = [];
  const w = (s: string) => { lines.push(s); console.log(s); };

  const p50  = pct(m.allLatencies, 0.50);
  const p95  = pct(m.allLatencies, 0.95);
  const p99  = pct(m.allLatencies, 0.99);
  const pmax = m.allLatencies.length ? Math.max(...m.allLatencies) : 0;
  const totalAttempts = m.answersOk + m.answersFail;
  const errRate = totalAttempts > 0
    ? ((m.answersFail / totalAttempts) * 100).toFixed(2)
    : "0.00";

  const expectedResponses = m.joinOk * m.questionsAdvanced;
  const coverageRate = expectedResponses > 0
    ? ((m.answersOk / expectedResponses) * 100).toFixed(1)
    : "0.0";

  w("\n" + "═".repeat(60));
  w("  📊  BLOCKTRIVIA STRESS TEST — PILOT READINESS REPORT");
  w(`  ${new Date().toISOString()}`);
  w("═".repeat(60));

  w("\n▸ RUN SUMMARY");
  w(`  bots:           ${m.players}`);
  w(`  signed in:      ${m.signInOk}/${m.players} (${m.signInFail} failed)`);
  w(`  joined game:    ${m.joinOk}/${m.players} (${m.joinFail} failed)`);
  w(`  questions:      ${m.questionsAdvanced} served`);
  w(`  duration:       ${(m.durationMs / 1000).toFixed(0)}s`);

  w("\n▸ ANSWER SUBMISSION");
  w(`  total attempts: ${totalAttempts}`);
  w(`  success:        ${m.answersOk} (${errRate}% error rate)`);
  w(`  coverage:       ${coverageRate}% of expected answers received`);
  w(`  RPC latency:    p50=${p50}ms  p95=${p95}ms  p99=${p99}ms  max=${pmax}ms`);

  w("\n▸ LEADERBOARD VERIFICATION (DB)");
  w(`  players ranked: ${m.dbPlayerCount}`);
  w(`  non-zero scores:${m.dbNonZeroScores}/${m.dbPlayerCount} (${m.dbPlayerCount > 0 ? ((m.dbNonZeroScores / m.dbPlayerCount) * 100).toFixed(1) : 0}%)`);
  w(`  score range:    ${m.dbMinScore} – ${m.dbMaxScore}  (avg ${m.dbAvgScore})`);
  w(`  total responses:${m.dbTotalResponses} in DB`);

  w("\n▸ PER-QUESTION BREAKDOWN");
  const qStats = [...m.questionStats.values()];
  const byRoundType = new Map<string, { answered: number; correct: number; total: number }>();
  for (const qs of qStats) {
    const rt = qs.roundType;
    const existing = byRoundType.get(rt) ?? { answered: 0, correct: 0, total: 0 };
    existing.answered += qs.botsAnswered;
    existing.correct  += qs.botsCorrect;
    existing.total++;
    byRoundType.set(rt, existing);
  }

  let qIdx = 0;
  for (const qs of qStats) {
    qIdx++;
    const qLat50 = pct(qs.latencies, 0.5);
    const qLat95 = pct(qs.latencies, 0.95);
    const ansRate = m.joinOk > 0 ? ((qs.botsAnswered / m.joinOk) * 100).toFixed(0) : "0";
    w(
      `  Q${String(qIdx).padStart(2)} [${qs.roundType.padEnd(13)}] ` +
      `answered=${qs.botsAnswered.toString().padStart(3)}/${m.joinOk} (${ansRate.padStart(3)}%) ` +
      `p50=${qLat50}ms p95=${qLat95}ms`
    );
  }

  w("\n▸ PER-ROUND-TYPE SUMMARY");
  for (const [rt, stats] of byRoundType) {
    const avgAnswered = stats.total > 0 ? (stats.answered / stats.total).toFixed(0) : "0";
    w(
      `  ${rt.padEnd(14)} ${stats.total} question(s)  avg ${avgAnswered} bots answered/q`
    );
  }

  w("\n▸ ERRORS");
  if (m.errors.length === 0) {
    w("  ✓ No errors");
  } else {
    const top = new Map<string, number>();
    for (const e of m.errors) {
      const key = e.replace(/[a-f0-9-]{36}/g, "<uuid>").slice(0, 80);
      top.set(key, (top.get(key) ?? 0) + 1);
    }
    [...top.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10).forEach(([k, n]) => {
      w(`  ${n}×  ${k}`);
    });
    w(`  (${m.errors.length} total errors)`);
  }

  // ── VERDICT ──────────────────────────────────────────────────────────────────
  const authOk     = m.signInOk / m.players >= 0.95;
  const joinOk     = m.joinOk   / m.players >= 0.95;
  const coverageOk = parseFloat(coverageRate) >= 90;
  const latencyOk  = p99 < 3000;
  const scoresOk   = m.dbPlayerCount > 0 && (m.dbNonZeroScores / m.dbPlayerCount) >= 0.90;
  const errRateOk  = parseFloat(errRate) < 5;

  const checks = [
    { name: "Auth (≥95% sign-in)",          pass: authOk },
    { name: "Join (≥95% joined)",            pass: joinOk },
    { name: "Answer coverage (≥90%)",        pass: coverageOk },
    { name: "RPC latency p99 < 3s",          pass: latencyOk },
    { name: "Scores non-zero (≥90%)",        pass: scoresOk },
    { name: "Error rate < 5%",               pass: errRateOk },
  ];

  const allPass = checks.every((c) => c.pass);

  w("\n▸ PILOT READINESS CHECKS");
  for (const c of checks) {
    w(`  ${c.pass ? "✅" : "❌"}  ${c.name}`);
  }
  w(`\n  VERDICT: ${allPass ? "✅  READY FOR PILOT" : "❌  NOT READY — fix failures above"}`);
  w("\n" + "═".repeat(60));

  const reportPath = resolve(process.cwd(), "stress-report.txt");
  writeFileSync(reportPath, lines.join("\n"));
  console.log(`\n  Full report saved → ${reportPath}\n`);
}

// ── main ───────────────────────────────────────────────────────────────────────
async function main() {
  console.log("\n🚀  BlockTrivia 300-Bot Stress Test");
  console.log(`    event=${EVENT_CODE}  players=${NUM_PLAYERS}  wrong-rate=${WRONG_RATE}\n`);

  const m = await runStressTest(NUM_PLAYERS);
  printReport(m);
  process.exit(0);
}

main().catch((e) => { console.error("Fatal:", e); process.exit(1); });
