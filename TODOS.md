# TODOS

## MindScan

**Title:** Apply migrations 034, 035, 036 to production Supabase
**Priority:** P0
**Why:** `host_onboarding` and `mindscan_call_log` tables are needed for the onboarding flow and rate limiting. Migration 036 adds field-size constraints and `updated_at` tracking. Without these, the app will error on first use of any MindScan feature.
**Action:** Run `supabase migration up` or apply `034_host_onboarding.sql`, `035_mindscan_rate_limit.sql`, `036_hardening.sql` via the Supabase dashboard SQL editor in order.

---

**Title:** End-to-end test gate — scan generated questions for date/version/ticker questions
**Priority:** P1
**Why:** The plan specifies: paste 3 real Web3 documents, generate 10 questions each, verify zero questions ask about dates / version numbers / founding years. This is the moat validation test.
**Action:** Manual test with real content (whitepaper, blog, FAQ). If any fail, iterate on the prompt in `src/lib/mindscan/prompts.ts`.

---

**Title:** Context injection verification
**Priority:** P1
**Why:** Generate 10 questions for the same content blob before and after completing onboarding with a specific misconception. Post-onboarding output should clearly skew toward that topic.
**Action:** Manual test after migration 035 is applied.

---

**Title:** Onboarding re-entry from Settings
**Priority:** P3
**Why:** Hosts can already return via the dashboard reminder banner (shipped v0.1.0.1). A settings link would be a secondary entry point for discoverability.
**Action:** Add "Complete your MindScan profile" link in `/host/settings` pointing to `/host/onboarding`.
**Completed:** v0.1.0.1 partial — dashboard reminder banner ships as the primary re-entry surface.

---

**Title:** MindScan Layer 1b — URL content scrape
**Priority:** P2
**Why:** Hosts want to point at a URL and generate questions without copy-pasting. Planned in MindScan architecture.
**Action:** New API route `/api/mindscan/fetch-content` that scrapes and returns plain text. Wire into the generate modal as a URL input option.

**Title:** Apply true server-side OCC for onboarding auto-save
**Priority:** P3
**Why:** The current stale-save guard is client-side only. Two tabs editing simultaneously can still overwrite each other. True OCC requires a conditional UPDATE with `WHERE updated_at = $lastKnown` server-side.
**Action:** Create a Supabase RPC `upsert_onboarding_if_unchanged(row, expected_updated_at)` that rejects writes if `updated_at` has changed since the client last read.

---

## Completed

**Title:** MindScan Layer 1a + Layer 0 — complete implementation
**Completed:** v0.2.0.0 (2026-04-08)
- Layer 1a: content → AI questions modal in question builder
- Layer 0: 4-step onboarding with Claude follow-up MCQs
- Host context injection into generation
- Onboarding gate, re-entry, auto-save, dashboard reminder banner
- Security hardening (auth, XML escaping, rate limiting, DB constraints)
