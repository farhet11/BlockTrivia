# Changelog

All notable changes to BlockTrivia are documented here.

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
