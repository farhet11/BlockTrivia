/**
 * Playwright smoke test v2 — 25 bots against PROD, real browsers + auto-answer.
 *
 * Differences from v1:
 *  - NO hardcoded deadline. Polls until game_state.phase === 'ended'.
 *  - Auto-answer: when the admin poller detects a new question_id, each bot
 *    submits an answer via the submit_answer RPC using its own access token.
 *    80% correct, deterministic round-type handling (matches stress-test.ts).
 *  - Tracks per-bot participation: how many questions each bot answered.
 *  - Report includes per-bot answer counts, overall participation %, RPC
 *    success/fail rates, per-question bots-answered rate.
 *
 * Why a real browser + RPC hybrid (vs. pure RPC from stress-test.ts):
 *  - Real browsers = real Realtime subscribers, real Next.js client bundles,
 *    real cookies/auth, real Supabase client in the tab. Proves the stack
 *    end-to-end under 25 concurrent real connections.
 *  - RPC-side answering = reliable participation test without needing
 *    data-testid selectors on the play UI (which don't exist yet).
 *
 * Run: npx tsx scripts/playwright-smoke-v2.ts
 */

import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { config as loadDotenv } from "dotenv";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { chromium, type BrowserContext, type Page } from "@playwright/test";

// ---------------------------------------------------------------- config
loadDotenv({ path: ".env.local" });

const PROD_URL = "https://blocktrivia.com";
const JOIN_CODE = process.env.SMOKE_JOIN_CODE ?? "WY5WT";
const BOT_COUNT = Number(process.env.SMOKE_BOT_COUNT ?? 25);
const STRESS_PASSWORD = "BlockTriviaStress2024!";
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY!;
// Answer-correctness rate (matches stress-test.ts semantics). 0.2 = 80% correct.
const WRONG_RATE = 0.2;
// Max RPC wait for submit_answer before we count it as failed.
const RPC_MS = 30_000;
// Upper bound on answer delay (ms) for "realistic" feel; capped to 80% of
// question time limit inside submitAnswer.
const ANSWER_DELAY_MAX_MS = 6_000;
// How often the admin poller checks game_state for transitions.
const POLL_INTERVAL_MS = 1_500;

if (!SUPABASE_URL || !SUPABASE_ANON || !SERVICE_ROLE) {
  console.error("Missing Supabase env vars");
  process.exit(1);
}

const OUT_DIR = resolve(process.cwd(), ".playwright-smoke-v2");
mkdirSync(OUT_DIR, { recursive: true });

// --------------------------------------------------------------- types
type Bot = { id: string; email: string };
type CapturedCookie = {
  name: string;
  value: string;
  domain: string;
  path: string;
  expires: number;
  httpOnly: boolean;
  secure: boolean;
  sameSite: "Lax" | "Strict" | "None";
};

type BotSession = {
  cookies: CapturedCookie[];
  accessToken: string;
  refreshToken: string;
};

type BotMetrics = {
  email: string;
  botIdx: number;
  reachedLobby: boolean;
  urlsVisited: string[];
  consoleErrors: string[];
  pageErrors: string[];
  failedRequests: string[];
  finalUrl?: string;
  // auto-answer metrics
  answersOk: number;
  answersFail: number;
  answersSkipped: number; // no question data, etc.
  answerLatencies: number[];
};

type QuestionData = {
  id: string;
  roundType: string;
  roundTitle: string;
  options: string[] | null;
  correctAnswer: number;
  correctAnswerNumeric: number | null;
  timeLimitSeconds: number;
};

// --------------------------------------------------------------- helpers
const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { persistSession: false },
});

/**
 * Sign in a bot using @supabase/ssr's createServerClient with a cookie-
 * capturing setAll. Returns browser-ready cookies AND the raw access token
 * so the Node side can call RPCs on the bot's behalf.
 */
async function signInBot(email: string): Promise<BotSession> {
  const captured: Array<{ name: string; value: string; options?: CookieOptions }> = [];

  const client = createServerClient(SUPABASE_URL, SUPABASE_ANON, {
    cookies: {
      getAll() {
        return [];
      },
      setAll(cookies) {
        for (const c of cookies) captured.push(c);
      },
    },
  });

  const { data, error } = await client.auth.signInWithPassword({
    email,
    password: STRESS_PASSWORD,
  });
  if (error) throw new Error(`signIn ${email}: ${error.message}`);
  if (!data.session) throw new Error(`signIn ${email}: no session`);

  const now = Math.floor(Date.now() / 1000);
  const cookies = captured.map<CapturedCookie>((c) => ({
    name: c.name,
    value: c.value,
    domain: "blocktrivia.com",
    path: "/",
    expires: now + 60 * 60 * 24,
    httpOnly: false,
    secure: true,
    sameSite: "Lax" as const,
  }));

  return {
    cookies,
    accessToken: data.session.access_token,
    refreshToken: data.session.refresh_token,
  };
}

async function preJoinBot(eventId: string, botId: string) {
  const { error } = await admin
    .from("event_players")
    .upsert({ event_id: eventId, player_id: botId }, { onConflict: "event_id,player_id" });
  if (error) throw new Error(`event_players upsert ${botId}: ${error.message}`);
}

function makeBotClient(accessToken: string): SupabaseClient {
  return createClient(SUPABASE_URL, SUPABASE_ANON, {
    auth: { persistSession: false },
    global: {
      headers: { Authorization: `Bearer ${accessToken}` },
    },
  });
}

async function setupBotPage(page: Page, metrics: BotMetrics) {
  page.on("console", (msg) => {
    if (msg.type() === "error") {
      metrics.consoleErrors.push(msg.text().slice(0, 300));
    }
  });
  page.on("pageerror", (err) => {
    metrics.pageErrors.push(err.message.slice(0, 300));
  });
  page.on("requestfailed", (req) => {
    const url = req.url();
    if (url.includes("blocktrivia.com") || url.includes("supabase.co")) {
      metrics.failedRequests.push(`${req.failure()?.errorText ?? "?"} ${url}`);
    }
  });
  page.on("framenavigated", (frame) => {
    if (frame === page.mainFrame()) {
      metrics.urlsVisited.push(frame.url());
    }
  });
}

// ── answer generation (inlined from stress-test.ts per convention) ───────────
function closestWinsAnswer(target: number): number {
  if (Math.random() > WRONG_RATE) return target;
  const spread = Math.max(50, Math.abs(target) * 0.2);
  const delta = (Math.random() * 2 - 1) * spread;
  return Math.round(target + delta);
}

function wipeoutLeverage(): number {
  return Math.round((0.1 + Math.random() * 0.8) * 10) / 10;
}

function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, rej) =>
      setTimeout(() => rej(new Error(`timeout ${ms}ms [${label}]`)), ms),
    ),
  ]);
}

// Per-question cache so we don't re-fetch 25x per question.
const questionCache = new Map<string, QuestionData>();

async function fetchQuestionData(questionId: string): Promise<QuestionData | null> {
  if (questionCache.has(questionId)) return questionCache.get(questionId)!;
  const { data, error } = await admin
    .from("questions")
    .select(
      "id, options, correct_answer, correct_answer_numeric, rounds(round_type, title, time_limit_seconds)",
    )
    .eq("id", questionId)
    .maybeSingle();
  if (error || !data) return null;
  const r = data.rounds as
    | { round_type: string; title: string; time_limit_seconds: number }
    | null;
  const q: QuestionData = {
    id: data.id as string,
    roundType: r?.round_type ?? "mcq",
    roundTitle: r?.title ?? "Unknown",
    options: (data.options as string[] | null) ?? null,
    correctAnswer: (data.correct_answer as number) ?? 0,
    correctAnswerNumeric: (data.correct_answer_numeric as number) ?? null,
    timeLimitSeconds: r?.time_limit_seconds ?? 15,
  };
  questionCache.set(questionId, q);
  return q;
}

type BotCtx = {
  idx: number;
  email: string;
  client: SupabaseClient;
  eventId: string;
  metrics: BotMetrics;
  // question ids we've already answered (one answer per question per bot)
  answered: Set<string>;
};

async function submitAnswerForBot(ctx: BotCtx, questionId: string) {
  if (ctx.answered.has(questionId)) return;
  ctx.answered.add(questionId);

  const q = await fetchQuestionData(questionId);
  if (!q) {
    ctx.metrics.answersSkipped++;
    return;
  }

  // Realistic delay — uniform 0..min(ANSWER_DELAY_MAX_MS, 80% of time limit).
  const maxDelay = Math.min(ANSWER_DELAY_MAX_MS, q.timeLimitSeconds * 800);
  const delay = Math.floor(Math.random() * maxDelay);
  await new Promise((r) => setTimeout(r, delay));

  const numOptions = Math.max(2, q.options?.length ?? 4);
  const pickWrong = Math.random() < WRONG_RATE;

  let selectedAnswer: number;
  let numericAnswer: number | undefined;
  let leverage = 1.0;

  switch (q.roundType) {
    case "closest_wins": {
      selectedAnswer = -1;
      const target = q.correctAnswerNumeric ?? q.correctAnswer ?? 0;
      numericAnswer = closestWinsAnswer(target);
      break;
    }
    case "wipeout": {
      leverage = wipeoutLeverage();
      if (pickWrong) {
        const others = Array.from({ length: numOptions }, (_, i) => i).filter(
          (i) => i !== q.correctAnswer,
        );
        selectedAnswer = others.length
          ? others[Math.floor(Math.random() * others.length)]
          : q.correctAnswer;
      } else {
        selectedAnswer = q.correctAnswer;
      }
      break;
    }
    default: {
      // mcq, true_false, pixel_reveal, reversal, the_narrative (answers as MCQ index)
      if (pickWrong) {
        const others = Array.from({ length: numOptions }, (_, i) => i).filter(
          (i) => i !== q.correctAnswer,
        );
        selectedAnswer = others.length
          ? others[Math.floor(Math.random() * others.length)]
          : q.correctAnswer;
      } else {
        selectedAnswer = q.correctAnswer;
      }
    }
  }

  const rpcParams: Record<string, unknown> = {
    p_event_id: ctx.eventId,
    p_question_id: questionId,
    p_selected_answer: selectedAnswer,
    p_time_taken_ms: delay,
    p_wipeout_leverage: leverage,
  };
  if (numericAnswer !== undefined) rpcParams.p_numeric_answer = numericAnswer;

  const t0 = Date.now();
  try {
    const { error } = await withTimeout(
      ctx.client.rpc("submit_answer", rpcParams),
      RPC_MS,
      "submit_answer",
    );
    const lat = Date.now() - t0;
    if (error) {
      ctx.metrics.answersFail++;
      ctx.metrics.consoleErrors.push(
        `submit_answer q=${questionId.slice(0, 8)}: ${error.message}`.slice(0, 300),
      );
    } else {
      ctx.metrics.answersOk++;
      ctx.metrics.answerLatencies.push(lat);
    }
  } catch (err) {
    ctx.metrics.answersFail++;
    ctx.metrics.consoleErrors.push(
      `submit_answer throw q=${questionId.slice(0, 8)}: ${(err as Error).message}`.slice(0, 300),
    );
  }
}

function pct(arr: number[], p: number): number {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
  return sorted[idx];
}

// --------------------------------------------------------------- main
async function main() {
  console.log(`\n▸ PLAYWRIGHT SMOKE TEST v2 (auto-answer)`);
  console.log(`  target: ${PROD_URL}`);
  console.log(`  game:   ${JOIN_CODE}`);
  console.log(`  bots:   ${BOT_COUNT}`);
  console.log(`  wrong%: ${Math.round(WRONG_RATE * 100)}%\n`);

  // 1. bots
  const allBots: Bot[] = JSON.parse(
    readFileSync(resolve(process.cwd(), ".stress-users.json"), "utf-8"),
  );
  const bots = allBots.slice(0, BOT_COUNT);
  console.log(`✓ loaded ${bots.length} bots`);

  // 2. event
  const { data: event, error: evErr } = await admin
    .from("events")
    .select("id, status, title")
    .eq("join_code", JOIN_CODE)
    .single();
  if (evErr || !event) throw new Error(`event lookup: ${evErr?.message}`);
  console.log(`✓ event ${event.id} (${event.title}, status=${event.status})`);

  // 3. sign in + pre-join
  console.log(`\n▸ signing in + pre-joining ${bots.length} bots...`);
  const sessionMap = new Map<number, BotSession>();
  let signInOk = 0;
  let signInFail = 0;
  await Promise.all(
    bots.map(async (bot, idx) => {
      try {
        const session = await signInBot(bot.email);
        sessionMap.set(idx, session);
        await preJoinBot(event.id, bot.id);
        signInOk++;
      } catch (err) {
        signInFail++;
        console.error(`  ✗ bot ${idx} ${bot.email}: ${(err as Error).message}`);
      }
    }),
  );
  console.log(`  ✓ ${signInOk} signed in, ✗ ${signInFail} failed`);
  if (signInOk === 0) {
    console.error("no bots signed in — aborting");
    process.exit(1);
  }

  // 4. launch browser
  console.log(`\n▸ launching Chromium (headless)...`);
  const browser = await chromium.launch({ headless: true });
  const contexts: BrowserContext[] = [];
  const pages: Page[] = [];
  const metrics: BotMetrics[] = [];
  const botCtxs: BotCtx[] = [];

  for (let i = 0; i < bots.length; i++) {
    const session = sessionMap.get(i);
    if (!session) {
      metrics.push({
        email: bots[i].email,
        botIdx: i,
        reachedLobby: false,
        urlsVisited: [],
        consoleErrors: ["(signin failed)"],
        pageErrors: [],
        failedRequests: [],
        answersOk: 0,
        answersFail: 0,
        answersSkipped: 0,
        answerLatencies: [],
      });
      continue;
    }
    const ctx = await browser.newContext({
      userAgent: `Mozilla/5.0 BlockTriviaSmokeBotV2/${i}`,
      viewport: { width: 390, height: 844 },
    });
    await ctx.addCookies(session.cookies);
    const page = await ctx.newPage();
    const m: BotMetrics = {
      email: bots[i].email,
      botIdx: i,
      reachedLobby: false,
      urlsVisited: [],
      consoleErrors: [],
      pageErrors: [],
      failedRequests: [],
      answersOk: 0,
      answersFail: 0,
      answersSkipped: 0,
      answerLatencies: [],
    };
    await setupBotPage(page, m);
    contexts.push(ctx);
    pages.push(page);
    metrics.push(m);
    botCtxs.push({
      idx: i,
      email: bots[i].email,
      client: makeBotClient(session.accessToken),
      eventId: event.id,
      metrics: m,
      answered: new Set<string>(),
    });
  }
  console.log(`  ✓ ${pages.length} contexts created`);

  // 5. nav to lobby
  console.log(`\n▸ navigating to /game/${JOIN_CODE}/lobby...`);
  const navStart = Date.now();
  await Promise.all(
    pages.map(async (page, i) => {
      try {
        await page.goto(`${PROD_URL}/game/${JOIN_CODE}/lobby`, {
          waitUntil: "domcontentloaded",
          timeout: 30_000,
        });
        await page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => {});
        if (page.url().includes("/lobby")) metrics[i].reachedLobby = true;
      } catch (err) {
        metrics[i].consoleErrors.push(`nav: ${(err as Error).message}`);
      }
    }),
  );
  const navMs = Date.now() - navStart;
  const inLobby = metrics.filter((m) => m.reachedLobby).length;
  console.log(`  ✓ ${inLobby}/${pages.length} in lobby (${navMs}ms)`);

  // 6. lobby screenshots
  await Promise.all(
    pages.map((page, i) =>
      page
        .screenshot({ path: `${OUT_DIR}/bot-${i}-lobby.png`, fullPage: false })
        .catch(() => {}),
    ),
  );

  // 7. READY
  console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`  READY — ${inLobby} bots in lobby.`);
  console.log(`  Host: go to control panel and hit Start Game.`);
  console.log(`  Bots will auto-answer every question (80% correct).`);
  console.log(`  Script exits when game_state.phase === 'ended'.`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);

  // 8. main loop — poll game_state; on new question_id, fire submit_answer
  //    for every bot in parallel. No deadline — runs until phase='ended'.
  let lastPhase: string | null = null;
  let lastQuestionId: string | null = null;
  const phaseScreenshots = new Set<string>();
  let perQuestionAnswered = new Map<string, number>(); // questionId → bot count

  const startTime = Date.now();
  // loop until phase === 'ended'
  while (true) {
    const { data: gs, error: gsErr } = await admin
      .from("game_state")
      .select(
        "phase, current_question_id, is_paused, current_round_index, current_question_index",
      )
      .eq("event_id", event.id)
      .single();

    if (gsErr || !gs) {
      await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
      continue;
    }

    const phaseKey = `${gs.phase}-${gs.current_question_id ?? "none"}`;
    const prevKey = `${lastPhase}-${lastQuestionId}`;

    if (phaseKey !== prevKey) {
      const elapsed = Math.floor((Date.now() - startTime) / 1000);
      console.log(
        `[+${elapsed}s] phase=${gs.phase} round=${gs.current_round_index} q=${gs.current_question_index} paused=${gs.is_paused}`,
      );
      lastPhase = gs.phase;
      lastQuestionId = gs.current_question_id;

      // New question during active play → fire submit_answer for every bot.
      if (
        gs.phase === "playing" &&
        !gs.is_paused &&
        gs.current_question_id &&
        !perQuestionAnswered.has(gs.current_question_id)
      ) {
        const qid = gs.current_question_id;
        perQuestionAnswered.set(qid, 0);
        console.log(
          `  ▸ auto-answering q=${qid.slice(0, 8)} across ${botCtxs.length} bots`,
        );
        // fire-and-forget per bot (delays + RPC happen inside)
        for (const ctx of botCtxs) {
          submitAnswerForBot(ctx, qid)
            .then(() => {
              perQuestionAnswered.set(qid, (perQuestionAnswered.get(qid) ?? 0) + 1);
            })
            .catch(() => {
              /* already counted as failure inside submitAnswerForBot */
            });
        }
      }

      // Phase screenshot (once per phase+question).
      if (!phaseScreenshots.has(phaseKey)) {
        phaseScreenshots.add(phaseKey);
        const tag = `${gs.phase}-r${gs.current_round_index}-q${gs.current_question_index}`;
        await Promise.all(
          pages.map((page, i) =>
            page
              .screenshot({ path: `${OUT_DIR}/bot-${i}-${tag}.png` })
              .catch(() => {}),
          ),
        );
      }
    }

    if (gs.phase === "ended") {
      console.log(`\n✓ game ended`);
      // Let outstanding RPCs drain (answers may still be in-flight with delays)
      await new Promise((r) => setTimeout(r, 5_000));
      break;
    }

    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }

  // 9. final snapshot
  for (let i = 0; i < pages.length; i++) {
    metrics[i].finalUrl = pages[i].url();
  }
  await Promise.all(
    pages.map((page, i) =>
      page
        .screenshot({ path: `${OUT_DIR}/bot-${i}-final.png`, fullPage: false })
        .catch(() => {}),
    ),
  );

  // 10. report
  console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`  REPORT`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);

  const totalConsole = metrics.reduce((s, m) => s + m.consoleErrors.length, 0);
  const totalPageErr = metrics.reduce((s, m) => s + m.pageErrors.length, 0);
  const totalNetFail = metrics.reduce((s, m) => s + m.failedRequests.length, 0);
  const totalOk = metrics.reduce((s, m) => s + m.answersOk, 0);
  const totalFail = metrics.reduce((s, m) => s + m.answersFail, 0);
  const totalSkipped = metrics.reduce((s, m) => s + m.answersSkipped, 0);
  const allLatencies = metrics.flatMap((m) => m.answerLatencies);

  const finalUrlCounts = new Map<string, number>();
  for (const m of metrics) {
    const key = m.finalUrl ? new URL(m.finalUrl).pathname : "(none)";
    finalUrlCounts.set(key, (finalUrlCounts.get(key) ?? 0) + 1);
  }

  console.log(`  bots:                 ${metrics.length}`);
  console.log(`  reached lobby:        ${metrics.filter((m) => m.reachedLobby).length}`);
  console.log(`\n  AUTO-ANSWER`);
  console.log(`  total ok:             ${totalOk}`);
  console.log(`  total fail:           ${totalFail}`);
  console.log(`  total skipped:        ${totalSkipped}`);
  if (allLatencies.length > 0) {
    console.log(
      `  RPC latency:          p50=${pct(allLatencies, 50)}ms  p95=${pct(allLatencies, 95)}ms  p99=${pct(allLatencies, 99)}ms`,
    );
  }
  console.log(`\n  PER-QUESTION PARTICIPATION (bots answered / ${botCtxs.length})`);
  for (const [qid, n] of perQuestionAnswered.entries()) {
    const q = questionCache.get(qid);
    console.log(
      `    ${n}/${botCtxs.length}  ${qid.slice(0, 8)}  (${q?.roundType ?? "?"} / ${q?.roundTitle ?? "?"})`,
    );
  }
  console.log(`\n  PER-BOT ANSWER COUNT`);
  for (const m of metrics) {
    console.log(
      `    bot ${m.botIdx.toString().padStart(2, " ")} ${m.email.padEnd(40, " ")}  ok=${m.answersOk}  fail=${m.answersFail}  skip=${m.answersSkipped}`,
    );
  }
  console.log(`\n  BROWSER HEALTH`);
  console.log(`  console errors:       ${totalConsole}`);
  console.log(`  page errors:          ${totalPageErr}`);
  console.log(`  network failures:     ${totalNetFail}`);
  console.log(`  final URL breakdown:`);
  for (const [u, c] of finalUrlCounts.entries()) console.log(`    ${c}x  ${u}`);

  const top = (arr: string[]) => {
    const c = new Map<string, number>();
    for (const x of arr) c.set(x, (c.get(x) ?? 0) + 1);
    return [...c.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
  };
  const allConsole = metrics.flatMap((m) => m.consoleErrors);
  const allPageErr = metrics.flatMap((m) => m.pageErrors);
  const allNet = metrics.flatMap((m) => m.failedRequests);
  if (allConsole.length) {
    console.log(`\n  TOP CONSOLE/RPC ERRORS:`);
    for (const [msg, n] of top(allConsole))
      console.log(`    ${n}x  ${msg.slice(0, 150)}`);
  }
  if (allPageErr.length) {
    console.log(`\n  TOP PAGE ERRORS:`);
    for (const [msg, n] of top(allPageErr))
      console.log(`    ${n}x  ${msg.slice(0, 150)}`);
  }
  if (allNet.length) {
    console.log(`\n  TOP NETWORK FAILURES:`);
    for (const [msg, n] of top(allNet)) console.log(`    ${n}x  ${msg.slice(0, 180)}`);
  }

  const reportPath = `${OUT_DIR}/report.json`;
  writeFileSync(
    reportPath,
    JSON.stringify(
      {
        event,
        metrics,
        perQuestionAnswered: Object.fromEntries(perQuestionAnswered),
        totalOk,
        totalFail,
        totalSkipped,
        latencies: {
          p50: pct(allLatencies, 50),
          p95: pct(allLatencies, 95),
          p99: pct(allLatencies, 99),
          n: allLatencies.length,
        },
      },
      null,
      2,
    ),
  );
  console.log(`\n  full report: ${reportPath}`);
  console.log(`  screenshots: ${OUT_DIR}/`);

  for (const ctx of contexts) await ctx.close().catch(() => {});
  await browser.close();
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
