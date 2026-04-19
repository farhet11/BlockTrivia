/**
 * Playwright smoke test — 25 bots against PROD (blocktrivia.com) + game WY5WT.
 *
 * Strategy:
 *  1. Sign each bot in via @supabase/ssr's createServerClient with a cookie-
 *     capturing setAll handler → captures the EXACT cookie format the app
 *     expects (base64-chunked sb-<ref>-auth-token).
 *  2. Pre-upsert each bot into event_players (admin client) so they land in
 *     lobby without going through the /join flow.
 *  3. Launch 25 headless Chromium contexts in parallel, inject cookies,
 *     navigate to /game/WY5WT/lobby.
 *  4. Watch console errors, pageerrors, failed network requests, URL changes.
 *  5. Screenshot each bot on first error and at game end.
 *  6. Report per-bot summary.
 *
 * Run: npx tsx scripts/playwright-smoke.ts
 */

import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { config as loadDotenv } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { chromium, type BrowserContext, type Page } from "@playwright/test";

// ---------------------------------------------------------------- config
loadDotenv({ path: ".env.local" });

const PROD_URL = "https://blocktrivia.com";
const JOIN_CODE = "WY5WT";
const BOT_COUNT = 25;
const STRESS_PASSWORD = "BlockTriviaStress2024!";
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const PROJECT_REF = new URL(SUPABASE_URL).host.split(".")[0]; // dhmtcaeciaifyfjeqeuy

if (!SUPABASE_URL || !SUPABASE_ANON || !SERVICE_ROLE) {
  console.error("Missing Supabase env vars");
  process.exit(1);
}

const OUT_DIR = resolve(process.cwd(), ".playwright-smoke");
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

type BotMetrics = {
  email: string;
  botIdx: number;
  reachedLobby: boolean;
  urlsVisited: string[];
  consoleErrors: string[];
  pageErrors: string[];
  failedRequests: string[];
  realtimeEvents: string[];
  finalUrl?: string;
};

// --------------------------------------------------------------- helpers
const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { persistSession: false },
});

/**
 * Sign in a bot using @supabase/ssr's createServerClient with a cookie-
 * capturing setAll. Returns the exact cookies the app would set in a browser.
 */
async function signInCaptureCookies(email: string): Promise<CapturedCookie[]> {
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

  const { error } = await client.auth.signInWithPassword({
    email,
    password: STRESS_PASSWORD,
  });
  if (error) throw new Error(`signIn ${email}: ${error.message}`);

  // Convert to Playwright cookie format.
  // We strip ssr's default path/sameSite and apply what the real app uses.
  const now = Math.floor(Date.now() / 1000);
  return captured.map((c) => ({
    name: c.name,
    value: c.value,
    domain: "blocktrivia.com", // set on apex; also covers www via domain match
    path: "/",
    expires: now + 60 * 60 * 24, // 1 day — plenty for a smoke test
    httpOnly: false, // app reads via document.cookie
    secure: true,
    sameSite: "Lax" as const,
  }));
}

async function preJoinBot(eventId: string, botId: string) {
  const { error } = await admin
    .from("event_players")
    .upsert({ event_id: eventId, player_id: botId }, { onConflict: "event_id,player_id" });
  if (error) throw new Error(`event_players upsert ${botId}: ${error.message}`);
}

async function setupBot(
  page: Page,
  email: string,
  botIdx: number,
  metrics: BotMetrics,
) {
  page.on("console", (msg) => {
    if (msg.type() === "error") {
      const text = msg.text().slice(0, 300);
      metrics.consoleErrors.push(text);
    }
  });
  page.on("pageerror", (err) => {
    metrics.pageErrors.push(err.message.slice(0, 300));
  });
  page.on("requestfailed", (req) => {
    const url = req.url();
    // ignore noisy third-party stuff
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

// --------------------------------------------------------------- main
async function main() {
  console.log(`\n▸ PLAYWRIGHT SMOKE TEST`);
  console.log(`  target: ${PROD_URL}`);
  console.log(`  game:   ${JOIN_CODE}`);
  console.log(`  bots:   ${BOT_COUNT}`);
  console.log(`  project:${PROJECT_REF}\n`);

  // 1. load bots
  const allBots: Bot[] = JSON.parse(
    readFileSync(resolve(process.cwd(), ".stress-users.json"), "utf-8"),
  );
  const bots = allBots.slice(0, BOT_COUNT);
  console.log(`✓ loaded ${bots.length} bots`);

  // 2. find event
  const { data: event, error: evErr } = await admin
    .from("events")
    .select("id, status, title")
    .eq("join_code", JOIN_CODE)
    .single();
  if (evErr || !event) throw new Error(`event lookup: ${evErr?.message}`);
  console.log(`✓ event ${event.id} (${event.title}, status=${event.status})`);

  // 3. sign bots in + capture cookies + pre-join
  console.log(`\n▸ signing in + pre-joining ${bots.length} bots...`);
  const cookieMap = new Map<number, CapturedCookie[]>();
  let signInOk = 0;
  let signInFail = 0;
  await Promise.all(
    bots.map(async (bot, idx) => {
      try {
        const cookies = await signInCaptureCookies(bot.email);
        cookieMap.set(idx, cookies);
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

  for (let i = 0; i < bots.length; i++) {
    const cookies = cookieMap.get(i);
    if (!cookies) {
      metrics.push({
        email: bots[i].email,
        botIdx: i,
        reachedLobby: false,
        urlsVisited: [],
        consoleErrors: ["(signin failed)"],
        pageErrors: [],
        failedRequests: [],
        realtimeEvents: [],
      });
      continue;
    }
    const ctx = await browser.newContext({
      userAgent: `Mozilla/5.0 BlockTriviaSmokeBot/${i}`,
      viewport: { width: 390, height: 844 }, // mobile-ish
    });
    await ctx.addCookies(cookies);
    const page = await ctx.newPage();
    const m: BotMetrics = {
      email: bots[i].email,
      botIdx: i,
      reachedLobby: false,
      urlsVisited: [],
      consoleErrors: [],
      pageErrors: [],
      failedRequests: [],
      realtimeEvents: [],
    };
    await setupBot(page, bots[i].email, i, m);
    contexts.push(ctx);
    pages.push(page);
    metrics.push(m);
  }
  console.log(`  ✓ ${pages.length} contexts created`);

  // 5. navigate all to lobby in parallel
  console.log(`\n▸ navigating to /game/${JOIN_CODE}/lobby...`);
  const navStart = Date.now();
  await Promise.all(
    pages.map(async (page, i) => {
      try {
        await page.goto(`${PROD_URL}/game/${JOIN_CODE}/lobby`, {
          waitUntil: "domcontentloaded",
          timeout: 30_000,
        });
        // Wait for lobby to render — look for a player list signal.
        // Fallback: wait for any text that indicates lobby loaded.
        await page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => {});
        // sanity: URL should still be /lobby
        if (page.url().includes("/lobby")) {
          metrics[i].reachedLobby = true;
        }
      } catch (err) {
        metrics[i].consoleErrors.push(`nav: ${(err as Error).message}`);
      }
    }),
  );
  const navMs = Date.now() - navStart;
  const inLobby = metrics.filter((m) => m.reachedLobby).length;
  console.log(`  ✓ ${inLobby}/${pages.length} in lobby (${navMs}ms)`);

  // 6. screenshot everyone in lobby
  console.log(`\n▸ lobby screenshots...`);
  await Promise.all(
    pages.map((page, i) =>
      page
        .screenshot({ path: `${OUT_DIR}/bot-${i}-lobby.png`, fullPage: false })
        .catch(() => {}),
    ),
  );
  console.log(`  ✓ saved to ${OUT_DIR}/bot-*-lobby.png`);

  // 7. READY — wait for human to hit Start Game
  console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`  READY — ${inLobby} bots in lobby on ${PROD_URL}/game/${JOIN_CODE}/lobby`);
  console.log(`  Go to the host control panel and hit Start Game.`);
  console.log(`  Bots will follow along, record errors, and take screenshots.`);
  console.log(`  Ctrl+C to abort. Otherwise I'll run until game reaches /final or 15min.`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);

  // 8. poll for phase via admin client; take screenshots at phase transitions
  const deadline = Date.now() + 15 * 60_000;
  let lastPhase: string | null = null;
  let lastQuestionId: string | null = null;
  const phaseScreenshots = new Set<string>();

  while (Date.now() < deadline) {
    const { data: gs } = await admin
      .from("game_state")
      .select("phase, current_question_id, is_paused, current_round_index, current_question_index")
      .eq("event_id", event.id)
      .single();

    if (!gs) {
      await new Promise((r) => setTimeout(r, 1500));
      continue;
    }

    const phaseKey = `${gs.phase}-${gs.current_question_id ?? "none"}`;
    if (phaseKey !== `${lastPhase}-${lastQuestionId}`) {
      const elapsed = Math.floor((Date.now() - navStart) / 1000);
      console.log(
        `[+${elapsed}s] phase=${gs.phase} round=${gs.current_round_index} q=${gs.current_question_index} paused=${gs.is_paused}`,
      );
      lastPhase = gs.phase;
      lastQuestionId = gs.current_question_id;

      // Screenshot everyone at this phase transition (once per phase+question)
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
        console.log(`  ✓ screenshotted ${pages.length} bots @ ${tag}`);
      }
    }

    if (gs.phase === "ended") {
      console.log(`\n✓ game ended — capturing final URLs + screenshots`);
      await new Promise((r) => setTimeout(r, 5000)); // let UI settle
      break;
    }

    await new Promise((r) => setTimeout(r, 1500));
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
  const finalUrlCounts = new Map<string, number>();
  for (const m of metrics) {
    const key = m.finalUrl ? new URL(m.finalUrl).pathname : "(none)";
    finalUrlCounts.set(key, (finalUrlCounts.get(key) ?? 0) + 1);
  }

  console.log(`  bots:                 ${metrics.length}`);
  console.log(`  reached lobby:        ${metrics.filter((m) => m.reachedLobby).length}`);
  console.log(`  total console errors: ${totalConsole}`);
  console.log(`  total page errors:    ${totalPageErr}`);
  console.log(`  total network fails:  ${totalNetFail}`);
  console.log(`  final URL breakdown:`);
  for (const [u, c] of finalUrlCounts.entries()) console.log(`    ${c}x  ${u}`);

  // Top 5 error samples
  const allConsole = metrics.flatMap((m) => m.consoleErrors);
  const allPageErr = metrics.flatMap((m) => m.pageErrors);
  const allNet = metrics.flatMap((m) => m.failedRequests);
  const top = (arr: string[]) => {
    const c = new Map<string, number>();
    for (const x of arr) c.set(x, (c.get(x) ?? 0) + 1);
    return [...c.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
  };
  if (allConsole.length) {
    console.log(`\n  TOP CONSOLE ERRORS:`);
    for (const [msg, n] of top(allConsole)) console.log(`    ${n}x  ${msg.slice(0, 150)}`);
  }
  if (allPageErr.length) {
    console.log(`\n  TOP PAGE ERRORS:`);
    for (const [msg, n] of top(allPageErr)) console.log(`    ${n}x  ${msg.slice(0, 150)}`);
  }
  if (allNet.length) {
    console.log(`\n  TOP NETWORK FAILURES:`);
    for (const [msg, n] of top(allNet)) console.log(`    ${n}x  ${msg.slice(0, 180)}`);
  }

  // write full report
  const reportPath = `${OUT_DIR}/report.json`;
  writeFileSync(reportPath, JSON.stringify({ event, metrics }, null, 2));
  console.log(`\n  full report: ${reportPath}`);
  console.log(`  screenshots: ${OUT_DIR}/`);

  // 11. cleanup
  for (const ctx of contexts) await ctx.close().catch(() => {});
  await browser.close();
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
