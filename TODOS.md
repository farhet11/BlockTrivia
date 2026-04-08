# TODOS

## MindScan

**Title:** Apply migration 035 to production Supabase
**Priority:** P0
**Why:** `mindscan_call_log` table powers the rate limiting added in v0.1.0.0. Rate limits fail open (don't block calls) until this migration is applied, but the table must exist for counting to work.
**Action:** Run `supabase migration up` or apply `035_mindscan_rate_limit.sql` via the Supabase dashboard SQL editor.

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
**Priority:** P2
**Why:** Hosts who skipped onboarding have no way to go back and complete it. The layout gate stops redirecting once any row exists (including skipped rows). A link in /host/settings would let them complete it later.
**Action:** Add "Complete your MindScan profile" link in `/host/settings` that renders the onboarding flow or links to a reset endpoint.

---

**Title:** MindScan Layer 1b — URL content scrape
**Priority:** P2
**Why:** Hosts want to point at a URL and generate questions without copy-pasting. Planned in MindScan architecture.
**Action:** New API route `/api/mindscan/fetch-content` that scrapes and returns plain text. Wire into the generate modal as a URL input option.

## Completed

*(none yet)*
