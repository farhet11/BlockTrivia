# Changelog

All notable changes to BlockTrivia are documented here.

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
