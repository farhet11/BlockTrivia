# Changelog

All notable changes to BlockTrivia are documented here.

## [0.6.1.0] - 2026-04-19

### Fixed
- **Leaderboard self-heal on every render** — `/game/{code}/leaderboard` now calls `recompute_leaderboard_ranks` before fetching entries. Migration 073 dropped the per-response trigger, so ranks only update on phase transitions. Without this, a player landing on the page mid-game (or after the host hung on a phase) saw a stale or empty board. Belt-and-braces with the existing recompute on phase change.
- **Play-view leaderboard rank collision** — `maxRank` for "zero-score" players now uses `entries.reduce(max(rank))` instead of `entries.length`. With ties, multiple entries can share rank N, so `entries.length` was less than the true highest rank, causing zero-score players to be inserted with duplicate ranks and overlap the bottom of the scored list.
- **Play-view leaderboard caps removed** — dropped `.limit(10)` on `leaderboard_entries` and `.limit(50)` on `event_players`. With 100+ player events the in-game leaderboard truncated silently. PostgREST default of 1000 is fine for our pilot scale.

### Changed
- **lb-podium expand/collapse** — adds a "Collapse" pill above the full ranking list when expanded, and keeps the blurred top-3 visually hidden behind the full list (instead of layering on top). Cleaner mental model: tapping "View all rankings" replaces the podium, tapping "Collapse" brings it back.

### Chore
- **Vitest excludes `tests/e2e/`** — Playwright specs use `test.describe` from `@playwright/test`, which crashes Vitest's parser. Excluding the directory lets the unit suite run cleanly alongside the (separately-run) Playwright runner.

### Infrastructure
- `vitest.config.ts` — added `tests/e2e/**` to test exclude list
- `src/app/_components/lb-podium.tsx` — Collapse pill + scrollable expanded list (superset of recent main-branch change)
- `src/app/game/[code]/leaderboard/page.tsx` — `recompute_leaderboard_ranks` self-heal call
- `src/app/game/[code]/play/_components/play-view.tsx` — recompute-then-fetch chain, removed row caps, fixed `maxRank` calculation

## [0.6.0.0] - 2026-04-17

### Added
- **Closest Wins distribution chart** — reveal view now shows where every player's guess landed, with the target bucket highlighted green and the player's bucket highlighted violet. Side-by-side Target + You result cards replace the old stacked layout.
- **Closest Wins partial-credit UI tier** — top status bar now shows three states: ✓ Correct (spot-on only), ≈ Close (partial credit), ✗ Wrong (zero points). Previously any within-tolerance guess read as "Correct", which cheapened the signal.
- **Void question host action** (migration 068) — host can remove a question from scoring mid-game from the control panel overflow menu.
- **Host control bar** — new bottom control surface for host during live play, consolidating advance/reveal/pause/modifier controls.

### Changed
- **Closest Wins `is_correct` semantics** (migration 069) — flipped from `closeness > 0` (any within-tolerance guess) to `distance = 0` (spot-on only). Pot-based scoring and partial credit are unchanged — players still earn points for close guesses, they're just no longer flagged correct unless they nailed it. Leaderboard `correct_count` now means spot-on hits, making accuracy % meaningful in CSV export.
- **Wipeout scoring — Option A** (migration 067) — correct answer now awards `base_points + wagerAmt` (previously `wagerAmt` only). Wrong answer and 50pt floor are unchanged.
- **Reveal view layout** across all round types — shared `host-reveal-shell`, `interstitial-card`, and `default-host-reveal-view` components received polish pass for consistent spacing, typography, and color treatment.

### Fixed
- **Closest Wins remount bug** — `lastResult.numericAnswer` now survives component remount during reveal, so the player's guess is always displayed correctly in the You card.

### Infrastructure
- `supabase/migrations/067_wipeout_base_points.sql` — Wipeout Option A
- `supabase/migrations/068_void_question.sql` — `void_question` RPC
- `supabase/migrations/069_closest_wins_spot_on_correct.sql` — redefine `is_correct` for Closest Wins; also rolls forward the Wipeout Option A change so the final `submit_answer` state is correct
- `src/rounds/closest-wins/distribution-chart.tsx` — auto-bucketing answer distribution component
- `src/app/host/game/[code]/control/_components/host-control-bar.tsx` — host control surface
- `src/lib/game/round-registry.ts` — added `numericAnswer` to `AnswerResult` for remount-safe closest-wins reveal

## [0.5.3.0] - 2026-04-11

### Added
- **Hybrid modifier activation (Phase 2b)** — modifiers are now a live drama tool. Host can activate/deactivate modifiers from the control panel during a live game. Live activation overrides any pre-configured default from the question builder. If the host doesn't touch anything, the default fires automatically.
- **Modifier activation overlay** — dramatic full-screen animation when host activates a modifier live: dark backdrop, spring-scaled modifier name, radial burst glow, subtitle fade-in, collapse to banner. Amber/gold palette.
- **Modifier sound effect** — short rising chime plays on live activation (silent failure if autoplay blocked).
- **Modifier panel in control panel** — during playing phase, host sees available modifier buttons (filtered by round compatibility). Active modifier shows amber bar with pulsing dot + Deactivate button.
- **Auto-reset at round boundary** — live modifier clears automatically when advancing to the next round (interstitial, startGame, startFirstQuestionOfRound).

### Changed
- **`submit_answer` RPC** (migration 051) — now checks `game_state.modifier_state` first (live host activation), then falls back to `round_modifiers` (pre-configured default). Zero breaking changes to the RPC signature.
- **Play-view modifier resolution** — uses hybrid logic: `liveModType || preConfiguredDefault`. Animation only fires on live activation, not on pre-configured defaults.

### Infrastructure
- `supabase/migrations/051_submit_answer_hybrid_modifiers.sql` — hybrid modifier lookup in `submit_answer` RPC
- `src/modifiers/shared/modifier-activation-overlay.tsx` — reusable activation animation component
- 5 new CSS keyframe animations for modifier entrance/burst/collapse

## [0.5.2.0] - 2026-04-10

### Added
- **Pressure Cooker round (Phase 4b)** — one player is randomly spotlighted per question. They answer while everyone watches. Scoring is identical to MCQ. Host control panel picks a random active player and writes `{ spotlight_player_id, spotlight_display_name }` into `game_state.round_state` on every question advance.
- **PressureCookerPlayerView** — pulsing "🔥 YOU'RE IN THE HOT SEAT" banner for the spotlighted player; amber "👀 [Name] is in the hot seat" for spectators. Both see the normal 2×2 MCQ grid and answer independently.
- **`roundState` + `currentPlayerId` on `RoundPlayerViewProps`** — new optional props flowing from `game_state.round_state` + the current player profile. Forward-compatible surface for any round that needs per-player personalisation.
- **`round_state` on `GameState` types** — added to both play-view and control-panel type definitions to match the DB column added in migration 047.
- **23 unit tests** — registry, constraints, scoring contract (MCQ ELSE branch), round_state shape contract, hot-seat detection logic.

## [0.5.1.0] - 2026-04-10

### Added
- **Reversal round (Phase 4a)** — new round type: 4 statements shown, 3 are true, 1 is false. Players identify the false one. `correct_answer` = index of the FALSE statement — same MCQ scoring path, zero new DB migrations needed. Registered in the round registry with `mindScanAutoGen: true`.
- **ReversalPlayerView** — distinct component with "🔄 Find the statement that is FALSE" instruction pill, 2×2 option grid, and dedicated reveal UX: false statement gets green border (correct pick) + red "FALSE" badge, avoiding confusion between "correct pick" and "true statement."
- **19 unit tests** — registry registration, governance constraints, scoring contract (mirrors MCQ ELSE branch), and mechanic invariants including PlayerView distinctness from MCQ.

## [0.5.0.0] - 2026-04-10

### Added
- **Modifier system (Phase 2)** — scoring modifiers are now pluggable modules registered in a central registry (`src/lib/game/modifier-registry.ts`). Adding a modifier requires one registry entry and one migration. Max 1 active modifier per round (enforced at DB level).
- **Jackpot Mode** — first modifier to ship. Host toggles per-round in the question builder. Fastest correct answer takes the pot (base_points × 5×, configurable). All others score 0. Implemented as `src/modifiers/jackpot/` with a UI overlay component and full test coverage.
- **Modifier toggle in question builder** — each round card now has a "Scoring modifier" dropdown (None / Jackpot Mode). Active modifier shown as an amber badge in the round header. Backed by the new `round_modifiers` table.
- **Jackpot UI overlay** — "🎰 JACKPOT MODE" banner on the player screen. Pre-answer: shows the pot multiplier. Post-reveal: "you took the pot!" or "Jackpot taken — 0 pts" depending on outcome.

### Changed
- **Round type** in `question-builder.tsx`, `round-card.tsx`, and `question-row.tsx` widened from `"mcq" | "true_false" | "wipeout"` to `string`. Round type selector now populated from `getRegisteredRoundTypes()` — no manual sync required when adding round types.
- **`duplicateEvent`** no longer copies `wipeout_min_leverage`/`wipeout_max_leverage` (already dropped in migration 048). Now copies `config` JSONB.

### Infrastructure
- `supabase/migrations/049_round_modifiers.sql` — `round_modifiers` table (UNIQUE on `round_id`), RLS policies for hosts and players, `modifier_state` JSONB on `game_state` for future Liquidation Mode.
- `supabase/migrations/050_submit_answer_jackpot.sql` — extends `submit_answer` RPC: reads `round_modifiers` at answer time; applies jackpot scoring (first correct wins `base_points × multiplier`; others get 0) without touching non-modifier code paths.

## [0.4.0.0] - 2026-04-10

### Added
- **Luma event import** — hosts can paste a `lu.ma` URL on the Create Event form to auto-populate the event title, description, date/time, location, and organizer logo from the Luma event page. Saves 2–3 minutes of manual entry per event.
- **Organizer logo auto-fetch** — when a project website is linked during onboarding (or entered on Create Event), the host's full brand logo is fetched automatically and pre-filled in the logo upload field. No manual upload needed for projects with a web presence.
- **MindScan onboarding v2** — adaptive diagnostic flow with per-step autosave, edit mode for returning hosts, RootData project enrichment, and AI-generated follow-up questions that drill deeper based on misconception input.
- **Modular round architecture (Phase 1)** — round types are now pluggable modules registered in a central registry. Adding or removing a round type requires zero DB migrations and zero changes to the game engine. Ships with MCQ, True/False, and WipeOut modules.
- **Event import provenance** — events imported from Luma carry `import_source` and `import_id` metadata so duplicate imports are detectable and the origin is always traceable.

### Changed
- **WipeOut config migrated to JSONB** — wager bounds (`minWagerPct`, `maxWagerPct`) now live in `rounds.config` JSONB instead of dedicated columns. The `submit_answer` RPC reads from config; legacy columns dropped.
- **`round_type` column converted from Postgres enum to text** — adding a new round type no longer requires a DB migration. Validation moves to the round registry (Zod check constraint retained as a soft guard).
- **WipeOut lever initialization** — the wager slider now initializes to the midpoint of each round's configured wager range rather than a hardcoded 50%.

### Fixed
- SSRF guard extended to validate redirect destinations — `site-logo.ts` and `luma.ts` now check the final URL after redirects, not just the input URL, closing an open-redirect SSRF vector.
- Onboarding resume now stays at step 3 (misconception) when the AI questions haven't loaded yet, instead of dropping the host onto a blank step 4.
- Duplicate columns in the RootData cache-check Supabase query removed.
- Server-side caps added to the `previous[]` array and string fields in the onboarding follow-up API to prevent prompt inflation.

## [0.3.0.0] - 2026-04-09

### Added
- **RootData project intelligence** — hosts can search the RootData blockchain project database by name during onboarding (Step 3) to auto-populate their project website and Twitter handle. No manual entry required for indexed projects.
- **Project linking on event creation** — event creation form now includes a "Link a project" search widget. Selecting a project sets `events.project_id`, enabling future cross-event analytics scoped to a protocol or community.
- **RootData API client** (`src/lib/rootdata.ts`) — server-only singleton with 7-day credit-protecting cache. `search()` is free/unlimited. `getProject()` costs 2 credits and skips the API call entirely if fresh data exists in the local DB.
- **Disambiguation UI** — RootData search returns up to 8 candidates with logo and one-liner. Host selects the right project. Zero-results state shows a fallback message and keeps manual entry available.
- **Shared SSRF guard** (`src/lib/ssrf-guard.ts`) — extracted URL validation and private-IP blocklist from the MindScan `fetch-url` route into a shared module, ready for reuse by the upcoming Smart Paste endpoint.
- **11 unit tests** — `isCacheStale` (5 paths including boundary), `rootdata.search` (happy path, empty, error), `rootdata.getProject` (full normalization, missing fields, error).

### Infrastructure
- `supabase/migrations/040_projects_rootdata_enrichment.sql` — adds `rootdata_id`, `one_liner`, `logo_url`, `team_members` (jsonb), `investors` (jsonb), `ecosystem_tags` (jsonb), `funding_history` (jsonb), and `rootdata_synced_at` to the `projects` table. Also adds the previously missing INSERT RLS policies on `projects` and `host_projects`.
- `ROOTDATA_API_KEY` environment variable required (server-side only).

## [0.2.0.0] - 2026-04-08

### Added
- **MindScan Layer 1a** — hosts paste any content (whitepaper, blog post, docs) and Claude generates quiz questions targeting understanding, not memorization. "Generate questions ✨" button in the question builder opens a modal with content input, count (5/10/15), difficulty (easy/medium/hard), and a live preview before importing to a round.
- **MindScan Layer 0 onboarding** — structured 4-step intake captures the host's role, community channels, event goal, and their biggest community misconception. Claude generates 2–3 diagnostic MCQs in Step 4 to help hosts pinpoint exactly which aspect is most misunderstood. The host's answers then sharpen AI question generation for their events.
- **Host context injection** — when generating questions, the host's onboarding context (misconception, goal, follow-up answers) is automatically injected into the prompt. Questions skew toward known weak areas while staying grounded in the pasted content.
- **Onboarding reminder banner** — hosts with incomplete onboarding see a circular progress ring on the dashboard (5 binary signals) with "Continue →" back to the re-entry flow.
- **Onboarding re-entry** — hosts who skipped can return and pick up mid-flow. Form pre-populates and jumps to the first unfilled step. Auto-save on blur preserves every field.
- **Dashboard onboarding gate** — `(dashboard)/layout.tsx` redirects hosts with no onboarding row to `/host/onboarding`. Skip inserts a partial row to prevent infinite redirect loops.
- **MindScan security hardening** — XML injection prevention (escapeXmlText escapes `&`, `<`, `>`), host-role enforcement on both AI API routes (host + super_admin only), rate limiting with validation-first ordering, optimistic concurrency control for auto-save, and DB constraints on `host_onboarding` field sizes.
- **44 unit tests** — prompt building, XML escaping, step derivation, completion signals, rate-limit window logic, T/F import validation, and stale-save guard.

### Changed
- **T/F import validation** — importing MCQ questions (4+ options) into a True/False round now shows a clear error instead of silently replacing options with ["True", "False"]. Validation runs before any DB mutations to prevent data loss in replace mode.
- **Rate limit ordering** — both `/api/mindscan/*` routes now validate input before checking rate limits, so malformed requests don't burn hourly quota.
- **PR format rule** — CLAUDE.md documents the tagged emoji format (`## ⚙️ DEV`, `## 🧠 MINDSCAN`, etc.) that feeds the Notion changelog GitHub Action.

### Infrastructure
- `supabase/migrations/034_host_onboarding.sql` — `host_onboarding` table with RLS
- `supabase/migrations/035_mindscan_rate_limit.sql` — `mindscan_call_log` table for per-user rate limiting
- `supabase/migrations/036_hardening.sql` — field-size constraints + `updated_at` trigger on `host_onboarding`

## [0.1.0.1] - 2026-04-08

### Added
- **Onboarding re-entry** — hosts who skipped or partially completed onboarding can return to `/host/onboarding` and pick up where they left off. The form pre-populates all saved fields and jumps directly to the first unfilled step.
- **Auto-save on field blur** — every onboarding field saves automatically 500ms after focus leaves it. A "Saved ✓" indicator confirms the write without interrupting the flow. No answers are lost if the browser is closed mid-step.
- **Dashboard reminder banner** — hosts with an incomplete onboarding row see a compact banner between the welcome header and their event list. A circular progress ring shows completion % (based on 5 key signals: role, community channels, event goal, biggest misconception, and follow-up answers). "Continue →" links back to re-entry.
- **13 new unit tests** — `deriveStartingStep` (6 tests) and `reminderCompletion` (7 tests) covering all branches including boundary cases (e.g., misconception < 15 chars, blank follow-up answers, empty channels array).

### Fixed
- **Hydration mismatch on event list** — `toLocaleDateString()` produced different output on server vs. client (locale-dependent). Replaced with `toLocaleDateString("en-US", { month, day, year })` for stable output across environments.
- **Onboarding page compile error** — `onboarding/page.tsx` imported `OnboardingInitialData` from `onboarding-flow.tsx` before the type was exported, causing a silent compile failure that prevented the page from rendering. Type is now properly exported.

## [0.1.0.0] - 2026-04-08

### Added
- **MindScan Layer 1a** — hosts can now paste content (whitepaper, blog, docs) and generate quiz questions via Claude directly in the question builder. "Generate questions ✨" button opens a two-stage modal: paste content + pick count/difficulty/round, then review question cards with checkboxes before importing. Questions go straight into the existing round via the same insert path as JSON import.
- **MindScan Layer 0** — host onboarding flow at `/host/onboarding`. 4 steps: role/channels/goal dropdowns, biggest-misconception textarea, optional project pointers (website, Twitter, content URLs), and Claude-generated diagnostic follow-up MCQs. Skip button on every step. Captured data is injected as context into Layer 1a question generation automatically.
- **Onboarding gate** — first-time hosts are redirected to `/host/onboarding` before reaching the dashboard. Completing or skipping onboarding writes a row to `host_onboarding`, ending the redirect.
- **Per-user rate limiting** — MindScan API routes are now rate-limited: 20 generate calls/hour and 10 follow-up calls/hour per user, enforced via a sliding window log table.
- **Vitest test suite** — bootstrapped with Vitest v4 + @testing-library/react. Initial 10 tests cover the MindScan prompt builders (non-memorization rules, context injection, XML delimiter enforcement, JSON-only output).

### Changed
- `host_onboarding` context (biggest misconception, event goal, follow-up Q&A) is now automatically loaded and injected into every question generation call, making generated questions sharper for hosts who have completed onboarding.
- MindScan prompts now use XML tag delimiters (`<content>`, `<misconception>`, `<host_context>`) instead of triple-quotes for more injection-resistant user content handling.
