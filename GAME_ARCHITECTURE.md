# BlockTrivia — Game Architecture

> Version 1.0 — April 2026
> Status: Living document. Update when a new round type, modifier, or lifeline ships.
> Canonical source: this file. Notion is for product specs; this file is for engineering contracts.

---

## 0. Why This Document Exists

The game engine currently has round-type logic scattered across three places:

1. **`play-view.tsx`** — `isTrueFalse` / `isWipeout` booleans controlling UI branches
2. **`submit_answer` RPC** — `IF v_round_type = 'wipeout' THEN … ELSE …` scoring branches
3. **Postgres `round_type` enum** — requires a DB migration to add each new type

Every new round type today means touching the engine core. That doesn't scale past 3 round types.

**This document defines a modular architecture where rounds are pluggable components that live inside the engine — not baked into it.** Adding a new round type should require zero changes to the engine core.

---

## 1. Principles

1. **The engine is round-agnostic.** It manages phases (lobby → playing → revealing → leaderboard → ended) and dispatches to round handlers. It does not contain round logic.
2. **Rounds are self-contained.** Each round owns its UI, its scorer, and its config schema.
3. **Modifiers wrap scorers, not rounds.** A modifier transforms points after the round scorer runs — it never reaches into round internals.
4. **Lifelines are player-controlled consumables.** They activate mid-question, server-side, and have no round-type knowledge.
5. **Server-authoritative scoring, always.** No scoring happens on the client. Period.
6. **Solo-founder pragmatism.** Phase 1 is the minimum viable extraction. The full registry pattern pays off at round type 4+. Don't over-engineer Phase 1.

---

## 2. The Three Mechanic Types

```
┌─────────────────────────────────────────────────────────┐
│                      GAME ENGINE                        │
│   (phase lifecycle, realtime, host control, scoring)    │
│                                                         │
│  ┌──────────────┐  ┌───────────────┐  ┌─────────────┐  │
│  │    ROUNDS    │  │   MODIFIERS   │  │  LIFELINES  │  │
│  │              │  │               │  │             │  │
│  │ MCQ          │  │ Jackpot Mode  │  │ ZK Hint     │  │
│  │ True/False   │  │ Liquidation   │  │ (future…)   │  │
│  │ WipeOut      │  │ (future…)     │  │             │  │
│  │ (future…)    │  │               │  │             │  │
│  └──────────────┘  └───────────────┘  └─────────────┘  │
└─────────────────────────────────────────────────────────┘
```

| Type | What it is | Lifecycle | Owns scoring? |
|------|------------|-----------|---------------|
| **Round** | A question format with its own UI and scorer | Per-question | Yes (base points) |
| **Modifier** | A scoring/UI overlay the host toggles per-round | Per-N-questions | Wraps round scorer |
| **Lifeline** | A player-activated consumable, mid-question | Per-activation | Optional penalty |

---

## 3. Game Engine Lifecycle (Unchanged)

The phase state machine is already round-agnostic. **Do not change it.**

```
lobby
  └─► interstitial   (between rounds)
        └─► playing  (timer running, answers accepted)
              └─► revealing  (correct answer shown)
                    └─► leaderboard  (rank update shown)
                          └─► interstitial | ended
```

**Host control panel** (`control-panel.tsx`) is already clean — zero round-type branching. It calls generic RPCs: `startGame`, `nextQuestion`, `revealAnswer`, `showLeaderboard`, `endGame`.

**Player data flow:**
```
play/page.tsx (server)
  └─► loads round config + questions from DB
        └─► PlayView (client)
              └─► [RoundRegistry] resolves correct PlayerView component
                    └─► player submits answer
                          └─► submit_answer RPC (Supabase)
                                └─► [ScoreDispatch] calls round scorer function
                                      └─► modifier wrapper applied (if active)
                                            └─► leaderboard trigger fires
```

---

## 4. Round Interface Contract

### 4.1 Base Interface

Every round type must implement this contract. Defined in `src/lib/game/round-registry.ts`.

```typescript
// The config stored in the JSONB `config` column on the `rounds` table
interface RoundConfig {
  type: string                // matches round_type text field e.g. "mcq", "wipeout"
  displayName: string         // shown in host UI e.g. "Multiple Choice"
  minPlayers: number          // enforced before game start
  eventTypes: ('irl' | 'virtual' | 'hybrid')[]
  teamBased: boolean
  // round-specific fields go in a typed subinterface (see 4.2)
  [key: string]: unknown
}

// The React component the player sees during `playing` phase
interface RoundPlayerViewProps {
  question: Question          // body, options, sort_order
  config: RoundConfig         // round-specific config (e.g. wipeout wager range)
  timeLeft: number            // ms remaining
  totalTime: number           // total timer ms
  hasAnswered: boolean
  phase: GamePhase
  onSubmit: (answer: number, metadata?: Record<string, unknown>) => void
}

// The React component the host sees on the control panel (optional preview)
interface RoundHostViewProps {
  question: Question
  config: RoundConfig
  answeredCount: number
  totalPlayers: number
}

// The scoring function — called server-side in SQL, mirrored here for documentation
interface RoundScorer {
  (params: {
    isCorrect: boolean
    correctAnswer: number
    playerAnswer: number
    timerMs: number
    responseMs: number
    config: RoundConfig
    metadata: Record<string, unknown>  // e.g. { wager: 2.5 }
  }): number  // points (can be negative)
}
```

### 4.2 Round Registry

Defined at `src/lib/game/round-registry.ts`. PlayView resolves the correct component here — no more `if/else` branches.

```typescript
import { MCQPlayerView } from '@/rounds/mcq/player-view'
import { WipeOutPlayerView } from '@/rounds/wipeout/player-view'
// future: import { PixelRevealPlayerView } from '@/rounds/pixel-reveal/player-view'

export const roundRegistry: Record<string, {
  PlayerView: React.ComponentType<RoundPlayerViewProps>
  HostView?: React.ComponentType<RoundHostViewProps>
  configSchema: ZodSchema        // validates the JSONB config column
  defaultConfig: Partial<RoundConfig>
}> = {
  mcq:        { PlayerView: MCQPlayerView,        configSchema: mcqConfigSchema        },
  true_false: { PlayerView: MCQPlayerView,        configSchema: trueFalseConfigSchema  },  // reuses MCQ view, 2-option config
  wipeout:    { PlayerView: WipeOutPlayerView,    configSchema: wipeoutConfigSchema    },
  // plug in new rounds here — zero engine changes
}
```

**PlayView usage (replaces all boolean flags):**
```typescript
// Before (coupled):
const isTrueFalse = round.round_type === 'true_false'
const isWipeout = round.round_type === 'wipeout'

// After (modular):
const { PlayerView } = roundRegistry[round.round_type]
return <PlayerView question={question} config={round.config} ... />
```

### 4.3 Round Directory Structure

Each round is a self-contained directory:

```
src/rounds/
  mcq/
    player-view.tsx      // renders 2×2 or stacked MCQ options
    host-view.tsx        // optional host panel preview
    config-schema.ts     // Zod schema for config JSONB
    scorer.ts            // pure function, mirrors SQL scorer
    index.ts             // re-exports for registry
  true_false/
    player-view.tsx      // renders two full-width buttons
    config-schema.ts
    scorer.ts
  wipeout/
    player-view.tsx      // MCQ view + wager slider
    config-schema.ts     // wipeout-specific: min/max leverage
    scorer.ts
  // future rounds slot in here
```

### 4.4 How Existing Rounds Map

**MCQ** — Base case. No special config.
```typescript
// config JSONB
{ type: 'mcq', displayName: 'Multiple Choice', minPlayers: 1, eventTypes: ['irl','virtual','hybrid'], teamBased: false }
// scorer
score = isCorrect ? 100 + Math.floor((remaining / total) * 50) : 0   // max 150
```

**True/False** — Reuses MCQ player view with `options` capped at 2.
```typescript
// config JSONB
{ type: 'true_false', displayName: 'True / False', minPlayers: 1, eventTypes: ['irl','virtual','hybrid'], teamBased: false }
// scorer: identical to MCQ
```

**WipeOut** — MCQ view + wager slider + custom scorer.

> **Note:** The shipped implementation (migration 030) uses **% of banked score** (Option A),
> not a points multiplier. The Notion WipeOut page documents an older design. This is canonical.

```typescript
// config JSONB
{
  type: 'wipeout',
  displayName: 'WipeOut',
  minPlayers: 2,
  eventTypes: ['irl','virtual','hybrid'],
  teamBased: false,
  minWagerPct: 0.10,  // replaces wipeout_min_leverage column — 10% of banked score
  maxWagerPct: 1.00,  // replaces wipeout_max_leverage column — 100% of banked score
}
// scorer (mirrors migration 030 submit_answer RPC)
wagerAmt = floor(max(50, bankedScore) * wagerPct)   // 50pt floor = comeback mechanic
score = isCorrect
  ? +wagerAmt
  : -min(wagerAmt, bankedScore)                      // can't go below 0
```

---

## 5. Database Schema Evolution

### 5.1 Phase 1 Migration — Round Config JSONB

```sql
-- Add generic config column
ALTER TABLE rounds ADD COLUMN config jsonb NOT NULL DEFAULT '{}';

-- Migrate existing WipeOut data
UPDATE rounds
SET config = jsonb_build_object(
  'type',         round_type::text,
  'minLeverage',  COALESCE(wipeout_min_leverage, 1.0),
  'maxLeverage',  COALESCE(wipeout_max_leverage, 3.0)
)
WHERE round_type = 'wipeout';

-- Migrate MCQ / True/False (minimal config)
UPDATE rounds
SET config = jsonb_build_object('type', round_type::text)
WHERE round_type IN ('mcq', 'true_false');

-- Drop legacy columns (after verifying no code references)
-- ALTER TABLE rounds DROP COLUMN wipeout_min_leverage;
-- ALTER TABLE rounds DROP COLUMN wipeout_max_leverage;
```

### 5.2 Phase 1 Migration — round_type enum → text

The Postgres `round_type` enum requires a migration per new type. Switching to `text` removes that bottleneck. Validation moves to the app layer (Zod + round registry).

```sql
-- Convert enum to text (requires recreating the column — do in a transaction)
ALTER TABLE rounds ALTER COLUMN round_type TYPE text;
ALTER TABLE questions ALTER COLUMN round_type TYPE text;  -- if applicable

-- Drop the enum (after all references removed)
DROP TYPE round_type;

-- Add a check constraint for currently-valid types (opt-in safety net)
-- Remove this constraint when adding new round types rather than running migrations
ALTER TABLE rounds ADD CONSTRAINT valid_round_type
  CHECK (round_type IN ('mcq', 'true_false', 'wipeout'));
  -- Drop this constraint when adding new types: ALTER TABLE rounds DROP CONSTRAINT valid_round_type
```

### 5.3 Phase 1 Migration — Scoring Dispatch

The `submit_answer` RPC currently branches inline. After Phase 1, it dispatches to dedicated scorer functions:

```sql
-- Round scorer functions (one per round type)
CREATE OR REPLACE FUNCTION score_mcq(
  p_is_correct boolean,
  p_timer_ms integer,
  p_response_ms integer
) RETURNS integer AS $$
  SELECT CASE WHEN p_is_correct
    THEN 100 + FLOOR(((p_timer_ms - p_response_ms)::float / p_timer_ms) * 50)::integer
    ELSE 0
  END;
$$ LANGUAGE sql IMMUTABLE;

CREATE OR REPLACE FUNCTION score_wipeout(
  p_is_correct boolean,
  p_timer_ms integer,
  p_response_ms integer,
  p_wager float,
  p_config jsonb
) RETURNS integer AS $$
DECLARE
  v_speed_bonus integer;
BEGIN
  v_speed_bonus := FLOOR(((p_timer_ms - p_response_ms)::float / p_timer_ms) * 50)::integer;
  IF p_is_correct THEN
    RETURN FLOOR((100 + v_speed_bonus) * p_wager);
  ELSE
    RETURN FLOOR(-100 * p_wager);
  END IF;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- submit_answer RPC dispatches via CASE
v_points := CASE v_round_type
  WHEN 'mcq'        THEN score_mcq(v_is_correct, v_timer_ms, v_response_ms)
  WHEN 'true_false' THEN score_mcq(v_is_correct, v_timer_ms, v_response_ms)
  WHEN 'wipeout'    THEN score_wipeout(v_is_correct, v_timer_ms, v_response_ms, v_wager, v_config)
  -- new rounds: add one WHEN here, implement the scorer function above
  ELSE score_mcq(v_is_correct, v_timer_ms, v_response_ms)  -- safe fallback
END;
```

### 5.4 Phase 2 Migration — Modifiers

```sql
CREATE TABLE round_modifiers (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  round_id    uuid NOT NULL REFERENCES rounds(id) ON DELETE CASCADE,
  modifier    text NOT NULL,  -- 'jackpot' | 'liquidation' | …
  config      jsonb NOT NULL DEFAULT '{}',
  created_at  timestamptz DEFAULT now()
);

-- Modifier state (ephemeral, for Liquidation Mode's N-question countdown)
ALTER TABLE game_state ADD COLUMN modifier_state jsonb DEFAULT '{}';
```

### 5.5 Phase 3 Migration — Lifelines

```sql
CREATE TABLE player_lifelines (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id        uuid NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  player_id       uuid NOT NULL REFERENCES profiles(id),
  lifeline_type   text NOT NULL,  -- 'zk_hint' | …
  uses_remaining  integer NOT NULL DEFAULT 2,
  created_at      timestamptz DEFAULT now(),
  UNIQUE(event_id, player_id, lifeline_type)
);
```

### 5.6 Complex Round State

Some pipeline rounds need per-question ephemeral state (Oracle's Dilemma needs role assignment, Pressure Cooker needs spotlight player). The `round_state` column on `game_state` is their container:

```sql
ALTER TABLE game_state ADD COLUMN round_state jsonb DEFAULT '{}';
-- e.g. for Oracle's Dilemma: { "oracle_player_id": "uuid", "oracle_chose": "deception" }
-- e.g. for Pressure Cooker:  { "spotlight_player_id": "uuid" }
```

---

## 6. Modifier System

### 6.1 Interface

Modifiers wrap the scorer output — they never touch question logic or rendering.

```typescript
interface ModifierConfig {
  type: string           // 'jackpot' | 'liquidation' | …
  displayName: string
  roundsActive: number   // how many questions the modifier stays on (e.g. 3 for Liquidation)
  compatibleRounds: string[]  // round types this modifier can wrap
}

interface ModifierScoringWrapper {
  (basePoints: number, context: {
    isCorrect: boolean
    roundType: string
    roundConfig: RoundConfig
    playerRank: number
    totalPlayers: number
    modifierConfig: ModifierConfig
  }): number
}

interface ModifierUIOverlay {
  // Optional React component overlaid on the player screen
  // e.g. "JACKPOT" banner, red border for Liquidation Mode
  component?: React.ComponentType<{ modifierConfig: ModifierConfig }>
}
```

### 6.2 Jackpot Mode

- **Type:** Modifier
- **Mechanic:** Winner takes amplified pot. Per round type:
  - MCQ / T-F: Fastest correct answer takes the pot. All others score 0.
  - WipeOut: Wager ceiling raised (canonical: 3× → 6×; exact multiplier TBD by host)
- **Lifecycle:** Single round. Host toggles per-question in the builder.
- **UI:** "🎰 JACKPOT" banner on player screen. Score display shows pot size.

### 6.3 Liquidation Mode

- **Type:** Modifier
- **Mechanic:** For 3 questions, bottom 25% of players by speed (wrong OR slowest correct) are "liquidated" — frozen for the next question.
- **Compatible rounds:** WipeOut (primary), MCQ, T-F
- **Lifecycle:** Host activates mid-game. `modifier_state` tracks questions remaining and liquidated player IDs.
- **UI:** Screen border turns red. Player cards show liquidation threshold line. Liquidated players see a frozen overlay.

### 6.4 Compatibility Matrix

| Modifier | MCQ | True/False | WipeOut | Pressure Cooker | Others |
|----------|-----|------------|---------|-----------------|--------|
| Jackpot Mode | ✅ | ✅ | ✅ (raised ceiling) | ✅ (default) | ✅ |
| Liquidation Mode | ✅ | ✅ | ✅ (recommended) | ❌ (conflict with spotlight) | TBD |

**Hard rule:** Max 1 active modifier per round. Max 2 modifier activations per game.

---

## 7. Lifeline System

### 7.1 Interface

```typescript
interface LifelineDefinition {
  type: string               // 'zk_hint'
  displayName: string
  usesPerGame: number        // 2 for ZK Hint
  activatableDuring: GamePhase[]  // ['playing'] — not during revealing
  disabledOnRounds: string[] // ['wipeout'] — disabled during high-stakes rounds
}

interface LifelineEffect {
  // What the server returns after activation
  // e.g. { optionsToRemove: [1, 3] } for ZK Hint
  [key: string]: unknown
}
```

### 7.2 Zero-Knowledge Hint (First Lifeline)

- **Mechanic:** Spend a hint → server removes 2 wrong options from the current question.
- **Supply:** 2 per player per game. Provisioned at game start via `player_lifelines` insert.
- **Server flow:**
  1. Player taps "Use Hint" → calls `activate_lifeline` RPC
  2. RPC validates `uses_remaining > 0`, decrements, returns `{ optionsToRemove: [i, j] }`
  3. Client greys out removed options
- **Disabled on:** WipeOut rounds (too powerful with the wager mechanic)
- **Scoring:** No point penalty for MVP. Optional future: -20 pts per use.

---

## 8. Constraint & Governance Rules

These rules are enforced in two places: the question builder UI (soft warnings) and the game engine at runtime (hard blocks).

### 8.1 Round Sequencing

| Rule | Hard/Soft | Reason |
|------|-----------|--------|
| First round must be MCQ or T-F | Soft warning | Warm-up; players learn the interface |
| Max 1 WipeOut per 5 rounds | Soft warning | Preserves drama; overuse dilutes tension |
| WipeOut cannot be the first round | Hard | Players need a score before wagering |
| Connector Round: IRL events only | Hard | QR handshake requires physical presence |
| Connector Round: min 10 players | Hard | Below threshold, clue distribution breaks |
| Stack Builder: min 6 players | Hard | Teams of 3 require at least 2 teams |
| The Narrative: max 2 per game | Soft warning | Majority-vote mechanic loses novelty fast |
| Oracle's Dilemma: max 1 per game | Hard | One Oracle moment per game; more = fatigue |

### 8.2 Modifier Limits

| Rule | Hard/Soft |
|------|-----------|
| Max 1 active modifier per round | Hard |
| Max 2 modifier activations per game | Soft warning |
| Jackpot + Liquidation cannot activate on the same round | Hard |

### 8.3 Lifeline Limits

| Rule | Hard/Soft |
|------|-----------|
| ZK Hint disabled on WipeOut rounds | Hard |
| 2 ZK Hints per player per game | Hard (server-enforced) |
| Lifelines disabled during `revealing` phase | Hard |

### 8.4 Player Count Requirements

| Round | Min Players |
|-------|-------------|
| MCQ, T-F, WipeOut, Pixel Reveal, Reversal, Closest Wins | 1 |
| Pressure Cooker | 3 (needs an audience) |
| The Narrative, Consensus Round | 5 (need meaningful vote distribution) |
| Oracle's Dilemma | 4 (Oracle + audience makes sense at 4+) |
| Connector Round | 10 |
| Stack Builder | 6 (2 teams × 3 players) |

---

## 9. Build Order

### Phase 1 — Extract & Modularize (Foundation)
*Goal: make the engine round-agnostic. No new features ship, but the foundation is clean.*

1. Create `src/lib/game/round-registry.ts` — define interfaces
2. Create `src/rounds/mcq/`, `src/rounds/true_false/`, `src/rounds/wipeout/` — extract existing logic into the directory structure
3. Refactor `play-view.tsx` — replace boolean flags with `roundRegistry.get(type)` dispatch
4. Add `config jsonb` column to `rounds` — migrate `wipeout_*` columns into it
5. Convert `round_type` from enum to text — drop DB migration bottleneck
6. Refactor `submit_answer` RPC — replace inline `IF/ELSE` with `CASE` dispatcher + scorer functions
7. Regression test all 3 existing rounds

### Phase 2 — Modifier System
*Goal: host can toggle scoring modifiers per round.*

1. Define `ModifierConfig` + modifier registry in `src/lib/game/modifier-registry.ts`
2. Add `round_modifiers` table + `modifier_state` on `game_state`
3. Implement Jackpot Mode (Effort 1)
4. Implement Liquidation Mode (Effort 1)
5. Add modifier toggle to question builder UI
6. Add modifier UI overlays to PlayView (passed through registry)

### Phase 3 — Lifeline System
*Goal: players can use consumable lifelines mid-question.*

1. Define `LifelineDefinition` interface
2. Add `player_lifelines` table
3. Add `activate_lifeline` RPC
4. Implement Zero-Knowledge Hint (Effort 2)
5. Add hint UI to PlayView (button visible when uses_remaining > 0)

### Phase 4+ — New Round Types
*Ordered by effort, architectural dependencies, and MindScan auto-gen potential.*

| Priority | Round | Effort | Notes |
|----------|-------|--------|-------|
| 4a | Reversal | 2 | Same layout as MCQ, inverted instructions. MindScan auto-gen ready. |
| 4b | Pressure Cooker | 2 | MCQ + spotlight wrapper. Needs `round_state` for spotlight player. |
| 4c | Pixel Reveal | 2 | Needs image upload + progressive blur component. MindScan auto-gen v2. |
| 4d | Closest Wins v2 | 3 | New input type (numeric). Distance-based scorer. MindScan auto-gen ready. |
| 4e | The Narrative | 3 | Majority-vote scorer. Real-time vote distribution UI. |
| 4f | Oracle's Dilemma | 5 | Role assignment in `round_state`. Truth/deception paths. Complex UX. |
| 4g | Stack Builder | 6 | Requires team system (separate design doc). |
| 4h | Connector Round | 7 | Requires QR handshake infra (separate design doc). IRL-only. |

---

## 10. Appendix — Full Pipeline Catalog

| # | Name | Type | Status | RICE | Effort | MindScan | Notes |
|---|------|------|--------|------|--------|----------|-------|
| 1 | 🔵 MCQ | Round | **Shipped** | — | — | No | Base case |
| 2 | ❌ True/False | Round | **Shipped** | — | — | No | Reuses MCQ view |
| 3 | 💥 WipeOut | Round | **Shipped** | — | — | No | 1×–3× wager |
| 4 | 🎰 Jackpot Mode | Modifier | Brainstorm | 18 | 1 | No | Highest RICE; first modifier to build |
| 5 | ⚡ Liquidation Mode | Modifier | Brainstorm | 16 | 1 | No | WipeOut-compatible; screen turns red |
| 6 | 🔐 Zero-Knowledge Hint | Lifeline | Brainstorm | 5 | 2 | No | Consumable, 2/game |
| 7 | 🎨 Pixel Reveal | Round | Brainstorm | 9 | 2 | Yes (v2) | Progressive image blur |
| 8 | 🔄 Reversal | Round | Brainstorm | 6 | 2 | Yes | Find the fake; MCQ layout |
| 9 | 🧊 Pressure Cooker | Round | Brainstorm | 9 | 2 | No | Hot seat spotlight |
| 10 | 📍 Closest Wins v2 | Round | Brainstorm | 4 | 3 | Yes | Numeric input, distance scorer |
| 11 | 📢 The Narrative | Round | Brainstorm | 4 | 3 | No | Majority = correct |
| 12 | 🔮 Oracle's Dilemma | Round | Brainstorm | 3 | 5 | No | Social deception, role assignment |
| 13 | 🏗️ Stack Builder | Round | Brainstorm | 3 | 6 | No | Team system prerequisite |
| 14 | 🗳️ Consensus Round | Round | **Parked** | 4 | 3 | No | Vote reveal + second chance |
| 15 | 🤝 Connector Round | Round | Brainstorm | 2 | 7 | No | IRL-only, QR handshake |

---

*Last updated: April 2026*
*Owner: @farhet11*
*Related docs: DESIGN.md, CLAUDE.md, Notion → Game Mechanics Bible*
