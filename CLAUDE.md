@AGENTS.md

# BlockTrivia

Real-time Web3 trivia platform. Projects use it to find who actually understands their protocol vs. airdrop farmers. The leaderboard IS the product.

## Tech Stack

- **Framework:** Next.js 16 + React 19 (src/app directory)
- **Database & Auth:** Supabase (Postgres + Realtime + Auth + Edge Functions)
- **Styling:** Tailwind CSS v4 + shadcn/ui
- **Fonts:** Outfit (headings/brand), Inter (body/UI)
- **Hosting:** Vercel
- **AI:** External Custom ChatGPT for question generation -> JSON export (no in-app AI for MVP)
- **Source:** GitHub (farhet11/BlockTrivia)

## Design System

- **Theme:** "The Scholarly Ledger" — warm, editorial, premium. NOT typical crypto/neon aesthetic.
- **Background:** Warm off-white `#faf9f7` (light), `#09090b` (dark)
- **Accent:** Electric violet `#7c3aed` (primary), `#6d28d9` (hover)
- **Fonts:** `font-heading` = Outfit (geometric sans-serif), `font-sans` = Inter
- **Dark mode:** via `next-themes`, toggle with class strategy
- **Logo:** 2x2 block grid icon + "Block" (bold) + "Trivia" (light violet). SVGs at `public/logo-light.svg` and `public/logo-dark.svg`
- **Game feedback colors:** correct=green-500, wrong=red-500, timer=amber->red

## What's Been Built

### 1. Database Schema (DONE)
Full Supabase Postgres schema in `supabase/migrations/001_initial_schema.sql`:
- 9 tables: profiles, events, event_hosts, rounds, questions, game_state, event_players, responses, leaderboard_entries
- Enum types: user_role, event_status, round_type, game_phase
- RLS policies on all tables
- Auto-create profile on signup trigger
- Auto-generate 5-char join codes for events
- Updated_at triggers

### 2. Auth (DONE)
- Google OAuth + Email/Password configured in Supabase
- Auth callback route: `src/app/auth/callback/route.ts`
- Auth middleware: `src/app/proxy.ts` (Next.js 16 uses `proxy.ts` not `middleware.ts`)
- Protects `/host` routes, redirects to `/login`
- Login page: `src/app/login/page.tsx` (Google OAuth button + email/password form)
- Supabase clients: `src/lib/supabase.ts` (browser), `src/lib/supabase-server.ts` (server)

### 3. Design System & Landing Page (DONE)
- `src/app/globals.css` — full color tokens (light + dark), font variables, game feedback colors
- `src/app/layout.tsx` — Outfit + Inter fonts, ThemeProvider
- `src/app/page.tsx` — logo + "Community Intelligence, gamified." tagline + CTAs
- `public/logo-light.svg`, `public/logo-dark.svg` — brand logos

### 4. Host Dashboard (DONE)
- `src/app/host/layout.tsx` — server-side auth check + nav bar
- `src/app/host/_components/host-nav.tsx` — navbar with logo + sign out
- `src/app/host/page.tsx` — H1: event list with status badges + "Create Event" CTA
- `src/app/host/events/new/page.tsx` — H2: create event form (title + description)

### 5. Question Builder (DONE)
- `src/app/host/events/[id]/questions/page.tsx` — H3: server page loads rounds + questions
- `_components/question-builder.tsx` — main client component, manages rounds + questions state
- `_components/round-card.tsx` — collapsible round with type/timer config, delete
- `_components/question-row.tsx` — question CRUD, option editing, correct answer toggle, up/down reorder
- `_components/json-import-modal.tsx` — paste JSON array, select target round, bulk import

### 6. Share & QR (DONE)
- `src/app/host/events/[id]/share/page.tsx` — H4: server page
- `_components/share-panel.tsx` — large join code display, QR code (client-generated SVG), copy link, download QR

### 7. Player Join Flow (DONE)
- `src/app/join/page.tsx` — renders JoinFlow without initial code
- `src/app/join/[code]/page.tsx` — server component, passes code to JoinFlow
- `_components/join-flow.tsx` — two-panel slide transition (P1 → P2)
- `_components/find-game.tsx` — P1: 5-char code input boxes, QR scanner, "Find Game" CTA
- `_components/identity-panel.tsx` — P2: Google OAuth first, email/password secondary, display name pre-filled from auth, "Join Game" inserts into event_players
- `_components/qr-scanner.tsx` — fullscreen camera with native BarcodeDetector API

### 8. Player Lobby (DONE)
- `src/app/game/[code]/lobby/page.tsx` — server page, verifies auth + event membership
- `_components/lobby-view.tsx` — Supabase Realtime subscription on event_players, live player list with avatars/initials, "(you)" tag, player count
- `_components/share-drawer.tsx` — bottom drawer with QR code + join code + native Web Share API for player-to-player sharing

### 9. Host Control Panel (DONE)
- `src/app/host/game/[code]/control/page.tsx` — server page, auth + ownership check, loads rounds/questions/game_state
- `_components/control-panel.tsx` — full game control: Start Game, Next Question, Reveal Answer, Show Leaderboard, Pause/Resume, End Game
- Countdown timer with color transitions (green → amber → red)
- Progress bar showing question position
- Live player count via Realtime subscription

## What Needs to Be Built (MVP Scope)

### Step 5: Real-time Game Engine (PARTIAL — host control done, player screens TODO)
- P4: Question screen (`/game/{code}/play`) — timer, question, answer options (2x2 grid)
- P5: Answer result (overlay) — correct/wrong, points earned, speed bonus, current rank
- Server-authoritative scoring via Edge Functions — answers validated server-side

### Step 6: Leaderboard
- P7: Round leaderboard — top 5 + personal rank, shown between rounds
- P8: Final leaderboard (`/game/{code}/final`) — podium, personal stats (rank, score, accuracy %)

### Step 7: CSV Export
- One-click download from post-event summary
- Fields: name, email, score, rank, accuracy, avg speed
- Top 10% auto-flagged

### Step 8: Polish
- Basic transitions (fade/slide between game phases)
- Mobile-first responsive design
- Host logo upload (basic branding)

## MVP Game Mechanics

- **3 round types:** MCQ, True/False, WipeOut (MCQ + wager slider for leverage)
- **Scoring:** +100 base + time bonus (faster = more points) + WipeOut leverage multiplier
- **Timer:** Configurable per round (10s / 15s / 20s / 30s)
- **Late joiners:** Spectate current question read-only, become full participant at next question
- **Pause:** Host can freeze game at any time (timer stops, players see overlay)

## What's Explicitly NOT in MVP

- No AI question generation in-app (use external GPT -> JSON import)
- No sponsored interstitials (v1.1)
- No token/crypto rewards or on-chain anything
- No mobile app (mobile web only)
- No analytics dashboard beyond CSV export
- No cross-event player profiles
- No Telegram/Apple/Wallet auth (Google + email only)
- No drag-and-drop question reorder (up/down arrows only)

## Route Map

### Player
| Screen | Route | Type | Status |
|--------|-------|------|--------|
| P1: Find game | `/join` or `/join/{code}` | Full page | DONE |
| P2: Identity | (slide within P1) | Slide panel | DONE |
| P3: Lobby | `/game/{code}/lobby` | Full page | DONE |
| P4: Question | `/game/{code}/play` | Full page | TODO |
| P5: Answer result | (overlay on P4) | Overlay | TODO |
| P7: Round leaderboard | `/game/{code}/results` | Full page | TODO |
| P8: Final leaderboard | `/game/{code}/final` | Full page | TODO |

### Host
| Screen | Route | Type | Status |
|--------|-------|------|--------|
| H1: Dashboard | `/host` | Full page | DONE |
| H2: Create event | `/host/events/new` | Full page | DONE |
| H3: Build questions | `/host/events/{id}/questions` | Full page | DONE |
| H4: Share code/QR | `/host/events/{id}/share` | Full page | DONE |
| H5: Live control | `/host/game/{code}/control` | Full page | DONE |
| H6: End game | (modal in H5) | Modal | DONE (inline) |
| H7: Post-event | `/host/game/{code}/summary` | Full page | TODO |

## Dev Commands

```bash
npm run dev     # Start dev server
npm run build   # Production build
npm run lint    # ESLint
```

## Key Conventions

- All Supabase client usage: browser client from `src/lib/supabase.ts`, server client from `src/lib/supabase-server.ts`
- Auth middleware is `src/app/proxy.ts` (Next.js 16 convention, NOT `middleware.ts`)
- `params` is async in Next.js 16: always `const { id } = await params`
- Read `node_modules/next/dist/docs/` before writing any Next.js code — this is Next.js 16 with breaking changes
- Design tokens are CSS variables in `globals.css`, mapped via `@theme inline` for Tailwind
- Logo: use `logo-light.svg` (light mode) and `logo-dark.svg` (dark mode) with `dark:hidden` / `hidden dark:block` pattern
