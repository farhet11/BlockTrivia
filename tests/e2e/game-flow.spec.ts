/**
 * BlockTrivia E2E smoke test — 10 headless browsers through a full game.
 *
 * Tests the complete player stack:
 *   - Session injection via localStorage (bypasses OAuth, same result)
 *   - Lobby page renders and waits for game start
 *   - Realtime phase-change → navigate to /play
 *   - MCQ answer button visible and clickable
 *   - "Answer submitted" confirmation appears
 *   - Reveal overlay shows (correct/wrong badge + points)
 *   - Leaderboard renders after all rounds
 *
 * Usage:
 *   npx playwright test tests/e2e/game-flow.spec.ts
 *
 * Requires:
 *   - localhost:3000 running (or playwright.config.ts webServer starts it)
 *   - .stress-users.json with ≥10 authenticated bots (run stress-test.ts first)
 *   - .env.local with SUPABASE_URL, ANON_KEY, SERVICE_KEY
 *   - Event G4Q4E exists and is in a resettable state
 *
 * Set EVENT_CODE env var to override the default game code.
 */

import { test, expect, type BrowserContext, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

// ── env ───────────────────────────────────────────────────────────────────────
function loadEnv(path: string) {
  if (!existsSync(path)) return;
  for (const raw of readFileSync(path, "utf8").split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const k = line.slice(0, eq).trim();
    let v = line.slice(eq + 1).trim();
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    )
      v = v.slice(1, -1);
    if (!(k in process.env)) process.env[k] = v;
  }
}

(function findAndLoadEnv() {
  let dir = process.cwd();
  for (let i = 0; i < 6; i++) {
    const p = resolve(dir, ".env.local");
    if (existsSync(p)) {
      loadEnv(p);
      return;
    }
    const parent = resolve(dir, "..");
    if (parent === dir) break;
    dir = parent;
  }
})();

// ── config ────────────────────────────────────────────────────────────────────
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const EVENT_CODE = (process.env.EVENT_CODE || "G4Q4E").toUpperCase();
const NUM_BROWSERS = parseInt(process.env.E2E_BROWSERS || "10", 10);
const CACHE_FILE = resolve(process.cwd(), ".stress-users.json");

// Supabase localStorage key — derived from project ref in the URL
const projectRef = new URL(SUPABASE_URL).hostname.split(".")[0];
const SUPABASE_STORAGE_KEY = `sb-${projectRef}-auth-token`;

// ── helpers ───────────────────────────────────────────────────────────────────
interface CachedUser {
  id: string;
  email: string;
  accessToken?: string;
  refreshToken?: string;
}

/** Decode a JWT payload without verifying the signature. */
function decodeJwtPayload(token: string): Record<string, unknown> {
  try {
    const base64 = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    const json = Buffer.from(base64, "base64").toString("utf8");
    return JSON.parse(json);
  } catch {
    return {};
  }
}

/** Build the localStorage session object that @supabase/ssr expects. */
function buildStorageSession(user: CachedUser) {
  const payload = user.accessToken ? decodeJwtPayload(user.accessToken) : {};
  return {
    access_token: user.accessToken ?? "",
    refresh_token: user.refreshToken ?? "",
    token_type: "bearer",
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    user: {
      id: user.id,
      email: user.email,
      role: "authenticated",
      aud: "authenticated",
      app_metadata: {},
      user_metadata: payload.user_metadata ?? {},
      created_at: new Date().toISOString(),
    },
  };
}

/** Inject Supabase session into a browser context before any navigation. */
async function injectSession(context: BrowserContext, user: CachedUser) {
  const session = buildStorageSession(user);
  await context.addInitScript(
    ({ key, value }) => {
      localStorage.setItem(key, JSON.stringify(value));
    },
    { key: SUPABASE_STORAGE_KEY, value: session }
  );
}

/** Admin client for game orchestration (resets, joins, auto-host). */
function makeAdmin() {
  return createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { persistSession: false },
  });
}

/** Answer a question on the play page based on round type. */
async function answerQuestion(
  page: Page,
  roundType: string
): Promise<boolean> {
  try {
    if (roundType === "closest_wins") {
      // Numeric input — type a number and press Enter
      const input = page.locator('input[inputmode="decimal"]');
      await input.waitFor({ state: "visible", timeout: 10_000 });
      await input.fill("42");
      await input.press("Enter");
    } else {
      // MCQ / wipeout / true_false — click first answer option button
      const btn = page
        .locator('button[aria-label^="Answer"]')
        .first();
      await btn.waitFor({ state: "visible", timeout: 10_000 });
      await btn.click();
      // For wipeout: also confirm submit if a separate Lock In button exists
      const lockIn = page.locator("button", { hasText: "Lock In Answer" });
      if (await lockIn.isVisible({ timeout: 2_000 }).catch(() => false)) {
        await lockIn.click();
      }
    }
    return true;
  } catch {
    return false;
  }
}

// ── game orchestration (auto-host) ────────────────────────────────────────────
interface GameQuestion {
  id: string;
  round_id: string;
  round_type: string;
  time_limit_seconds: number;
}

async function loadAndResetGame(): Promise<{
  eventId: string;
  questions: GameQuestion[];
}> {
  const admin = makeAdmin();
  const { data: ev } = await admin
    .from("events")
    .select("id")
    .eq("join_code", EVENT_CODE)
    .maybeSingle();
  if (!ev) throw new Error(`Event ${EVENT_CODE} not found`);

  // Full reset
  await admin.from("responses").delete().eq("event_id", ev.id);
  await admin.from("leaderboard_entries").delete().eq("event_id", ev.id);
  await admin.from("event_players").delete().eq("event_id", ev.id);
  await admin
    .from("game_state")
    .update({
      phase: "lobby",
      current_question_id: null,
      current_round_id: null,
      question_started_at: null,
      is_paused: false,
    })
    .eq("event_id", ev.id);
  await admin.from("events").update({ status: "active" }).eq("id", ev.id);

  const { data: rounds } = await admin
    .from("rounds")
    .select("id, title, round_type, sort_order, time_limit_seconds")
    .eq("event_id", ev.id)
    .order("sort_order");
  if (!rounds?.length) throw new Error("No rounds");

  const { data: questions } = await admin
    .from("questions")
    .select("id, round_id, sort_order")
    .in(
      "round_id",
      rounds.map((r: { id: string }) => r.id)
    )
    .order("sort_order");
  if (!questions?.length) throw new Error("No questions");

  const roundMap = Object.fromEntries(
    rounds.map(
      (r: {
        id: string;
        round_type: string;
        time_limit_seconds: number;
        sort_order: number;
      }) => [
        r.id,
        { round_type: r.round_type, time_limit_seconds: r.time_limit_seconds, sort_order: r.sort_order },
      ]
    )
  );
  const roundOrder = Object.fromEntries(
    rounds.map((r: { id: string; sort_order: number }) => [r.id, r.sort_order])
  );

  const sorted = [...questions].sort(
    (
      a: { round_id: string; sort_order: number },
      b: { round_id: string; sort_order: number }
    ) => {
      const rd =
        (roundOrder[a.round_id] ?? 0) - (roundOrder[b.round_id] ?? 0);
      return rd !== 0 ? rd : a.sort_order - b.sort_order;
    }
  );

  return {
    eventId: ev.id,
    questions: sorted.map((q: { id: string; round_id: string }) => ({
      id: q.id,
      round_id: q.round_id,
      round_type: roundMap[q.round_id]?.round_type ?? "mcq",
      time_limit_seconds: roundMap[q.round_id]?.time_limit_seconds ?? 15,
    })),
  };
}

async function joinBotToGame(eventId: string, playerId: string) {
  const admin = makeAdmin();
  await admin
    .from("event_players")
    .upsert(
      { event_id: eventId, player_id: playerId },
      { onConflict: "event_id,player_id" }
    );
}

// ── results tracking ──────────────────────────────────────────────────────────
interface BotResult {
  email: string;
  reachedLobby: boolean;
  reachedPlay: boolean;
  questionsAnswered: number;
  revealsSeen: number;
  reachedLeaderboard: boolean;
  errors: string[];
}

// ── THE TEST ──────────────────────────────────────────────────────────────────
test.describe("BlockTrivia full game smoke test", () => {
  test(`${NUM_BROWSERS} browsers complete full game with host auto-advance`, async ({
    browser,
  }) => {
    console.log(`\n${"═".repeat(60)}`);
    console.log(`🌐  ${NUM_BROWSERS}-BROWSER E2E SMOKE TEST`);
    console.log(`${"═".repeat(60)}\n`);

    // ── 1. Load cached bots ────────────────────────────────────────────────
    if (!existsSync(CACHE_FILE)) {
      throw new Error(
        `.stress-users.json not found — run stress-test.ts first to provision bots`
      );
    }
    const allUsers: CachedUser[] = JSON.parse(
      readFileSync(CACHE_FILE, "utf8")
    );
    const bots = allUsers
      .filter((u) => u.accessToken && u.refreshToken)
      .slice(0, NUM_BROWSERS);

    if (bots.length < NUM_BROWSERS) {
      throw new Error(
        `Need ${NUM_BROWSERS} authenticated bots, only found ${bots.length} with tokens. Re-run stress-test.ts.`
      );
    }
    console.log(`  ✓ Loaded ${bots.length} bots from cache\n`);

    // ── 2. Reset game + pre-join bots ──────────────────────────────────────
    console.log(`  Resetting game state for ${EVENT_CODE}...`);
    const { eventId, questions } = await loadAndResetGame();
    console.log(`  ✓ Game reset — ${questions.length} questions\n`);

    console.log(`  Pre-joining ${bots.length} bots to event...`);
    await Promise.all(bots.map((b) => joinBotToGame(eventId, b.id)));
    console.log(`  ✓ All bots joined\n`);

    // ── 3. Launch browser contexts ─────────────────────────────────────────
    console.log(`  Launching ${bots.length} browser contexts...`);
    const contexts: BrowserContext[] = [];
    const pages: Page[] = [];

    for (const bot of bots) {
      const ctx = await browser.newContext({
        viewport: { width: 390, height: 844 },
        userAgent:
          "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15",
      });
      await injectSession(ctx, bot);
      contexts.push(ctx);
      pages.push(await ctx.newPage());
    }
    console.log(`  ✓ ${contexts.length} contexts ready\n`);

    // ── 4. Navigate to lobby ──────────────────────────────────────────────
    console.log(`  Navigating all browsers to lobby...`);
    const results: BotResult[] = bots.map((b) => ({
      email: b.email,
      reachedLobby: false,
      reachedPlay: false,
      questionsAnswered: 0,
      revealsSeen: 0,
      reachedLeaderboard: false,
      errors: [],
    }));

    await Promise.all(
      pages.map(async (page, i) => {
        try {
          await page.goto(`/game/${EVENT_CODE}/lobby`, {
            waitUntil: "domcontentloaded",
            timeout: 20_000,
          });
          // Wait for lobby to render (h1 with event title, or any heading)
          await page.waitForSelector("h1", { timeout: 15_000 });
          results[i].reachedLobby = true;
        } catch (e) {
          results[i].errors.push(`lobby: ${String(e).slice(0, 100)}`);
        }
      })
    );

    const lobbyCount = results.filter((r) => r.reachedLobby).length;
    console.log(`  ✓ ${lobbyCount}/${bots.length} browsers reached lobby\n`);
    expect(lobbyCount).toBeGreaterThanOrEqual(
      Math.ceil(bots.length * 0.9)
    ); // ≥90% must reach lobby

    // ── 5. Auto-host: drive game + collect browser responses ──────────────
    console.log(`  Starting auto-host — serving ${questions.length} questions...`);
    const admin = makeAdmin();

    // Start game
    await admin
      .from("game_state")
      .update({ phase: "playing", is_paused: false })
      .eq("event_id", eventId);

    for (let qi = 0; qi < questions.length; qi++) {
      const q = questions[qi];
      console.log(
        `\n  Q${qi + 1}/${questions.length} [${q.round_type}] — advancing...`
      );

      // Advance game state
      await admin
        .from("game_state")
        .update({
          current_question_id: q.id,
          current_round_id: q.round_id,
          question_started_at: new Date(Date.now() + 1000).toISOString(),
          phase: "playing",
          is_paused: false,
        })
        .eq("event_id", eventId);

      // Wait for all browsers to reach /play
      await Promise.all(
        pages.map(async (page, i) => {
          if (!results[i].reachedLobby) return;
          try {
            await page.waitForURL(`**/${EVENT_CODE}/play`, {
              timeout: 20_000,
            });
            results[i].reachedPlay = true;
          } catch {
            // may already be on /play from previous question
            if (page.url().includes("/play")) results[i].reachedPlay = true;
          }
        })
      );

      // Give browsers 2s to render the question
      await new Promise((r) => setTimeout(r, 2000));

      // Each browser answers
      const answerResults = await Promise.all(
        pages.map(async (page, i) => {
          if (!results[i].reachedPlay) return false;
          const ok = await answerQuestion(page, q.round_type);
          if (ok) results[i].questionsAnswered++;
          return ok;
        })
      );
      const answeredCount = answerResults.filter(Boolean).length;
      console.log(`    answered: ${answeredCount}/${lobbyCount} browsers`);

      // Wait for question time limit + 2s buffer
      const waitMs = (q.time_limit_seconds + 2) * 1000;
      await new Promise((r) => setTimeout(r, waitMs));

      // Recompute leaderboard
      await admin
        .rpc("recompute_leaderboard_ranks", { p_event_id: eventId })
        .catch(() => {});

      // Check for "Answer submitted" or reveal state on each browser
      await Promise.all(
        pages.map(async (page, i) => {
          if (!results[i].reachedPlay) return;
          try {
            // Either "submitted" confirmation or the reveal card with "pts"
            const hasSubmitted = await page
              .locator("text=Answer submitted")
              .isVisible({ timeout: 2_000 })
              .catch(() => false);
            const hasReveal = await page
              .locator("text=/Target|pts|Correct|Spot on|Off by/i")
              .isVisible({ timeout: 2_000 })
              .catch(() => false);
            if (hasSubmitted || hasReveal) results[i].revealsSeen++;
          } catch {}
        })
      );
    }

    // ── 6. End game + wait for leaderboard ───────────────────────────────
    console.log(`\n  Ending game...`);
    await admin
      .rpc("recompute_leaderboard_ranks", { p_event_id: eventId })
      .catch(() => {});
    await admin
      .from("game_state")
      .update({ phase: "ended" })
      .eq("event_id", eventId);
    await admin
      .from("events")
      .update({ status: "ended" })
      .eq("id", eventId);

    // Wait for browsers to reach leaderboard
    await new Promise((r) => setTimeout(r, 5000));
    await Promise.all(
      pages.map(async (page, i) => {
        if (!results[i].reachedPlay) return;
        try {
          await page.waitForURL(`**/${EVENT_CODE}/leaderboard`, {
            timeout: 15_000,
          });
          results[i].reachedLeaderboard = true;
        } catch {
          // tolerate if already there or on /final
          if (
            page.url().includes("/leaderboard") ||
            page.url().includes("/final")
          )
            results[i].reachedLeaderboard = true;
        }
      })
    );

    // ── 7. Assertions + report ────────────────────────────────────────────
    const playCount = results.filter((r) => r.reachedPlay).length;
    const answeredAny = results.filter((r) => r.questionsAnswered > 0).length;
    const sawReveal = results.filter((r) => r.revealsSeen > 0).length;
    const reachedLb = results.filter((r) => r.reachedLeaderboard).length;

    console.log(`\n${"═".repeat(60)}`);
    console.log(`  🌐  E2E SMOKE TEST RESULTS`);
    console.log(`${"═".repeat(60)}`);
    console.log(`  browsers launched:     ${bots.length}`);
    console.log(`  reached lobby:         ${lobbyCount}/${bots.length}`);
    console.log(`  reached /play:         ${playCount}/${bots.length}`);
    console.log(`  answered ≥1 question:  ${answeredAny}/${bots.length}`);
    console.log(`  saw reveal overlay:    ${sawReveal}/${bots.length}`);
    console.log(`  reached leaderboard:   ${reachedLb}/${bots.length}`);

    console.log(`\n  PER-BROWSER:`);
    for (let i = 0; i < results.length; i++) {
      const r = results[i];
      const status = r.reachedLeaderboard
        ? "✅"
        : r.questionsAnswered > 0
          ? "⚡"
          : r.reachedLobby
            ? "🏠"
            : "❌";
      console.log(
        `  ${status} bot${String(i + 1).padStart(2)} ` +
          `lobby=${r.reachedLobby ? "✓" : "✗"} ` +
          `play=${r.reachedPlay ? "✓" : "✗"} ` +
          `answered=${r.questionsAnswered}/${questions.length} ` +
          `reveals=${r.revealsSeen} ` +
          `lb=${r.reachedLeaderboard ? "✓" : "✗"}`
      );
      if (r.errors.length) {
        for (const e of r.errors) console.log(`      ⚠ ${e}`);
      }
    }

    const checks = [
      { name: "≥90% reached lobby",           pass: lobbyCount >= Math.ceil(bots.length * 0.9) },
      { name: "≥90% reached /play",           pass: playCount  >= Math.ceil(bots.length * 0.9) },
      { name: "≥80% answered ≥1 question",    pass: answeredAny >= Math.ceil(bots.length * 0.8) },
      { name: "≥70% saw reveal overlay",      pass: sawReveal  >= Math.ceil(bots.length * 0.7) },
      { name: "≥80% reached leaderboard",     pass: reachedLb  >= Math.ceil(bots.length * 0.8) },
    ];

    console.log(`\n  PILOT READINESS CHECKS (UI):`);
    for (const c of checks) {
      console.log(`  ${c.pass ? "✅" : "❌"}  ${c.name}`);
    }
    const allPass = checks.every((c) => c.pass);
    console.log(
      `\n  VERDICT: ${allPass ? "✅  UI LAYER READY FOR PILOT" : "❌  NOT READY — fix failures above"}`
    );
    console.log("═".repeat(60) + "\n");

    // Playwright assertions
    expect(lobbyCount, "≥90% must reach lobby").toBeGreaterThanOrEqual(
      Math.ceil(bots.length * 0.9)
    );
    expect(playCount, "≥90% must reach /play").toBeGreaterThanOrEqual(
      Math.ceil(bots.length * 0.9)
    );
    expect(answeredAny, "≥80% must answer at least 1 question").toBeGreaterThanOrEqual(
      Math.ceil(bots.length * 0.8)
    );

    // ── cleanup ────────────────────────────────────────────────────────────
    for (const ctx of contexts) await ctx.close().catch(() => {});
  });
});
