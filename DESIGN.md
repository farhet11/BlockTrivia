# Design System: BlockTrivia

> Version 3.1 — April 14, 2026
> Format: awesome-design-md 9-section standard
> For: Google Stitch, Claude Code, Cursor, v0, and any AI coding agent
> **Pre-flight:** see [`DESIGN-CHECKLIST.md`](./DESIGN-CHECKLIST.md) — every PR must pass.

---

## 1. Visual Theme & Atmosphere

BlockTrivia is a knowledge arena dressed in editorial warmth — a product that takes community intelligence seriously while making the act of proving it feel electric. The interface lives on a canvas called Warm Canvas (`#faf9f7`), a cream-toned off-white that deliberately evokes the calm of a premium publication rather than the sterile glow of a tech dashboard. Where most Web3 products reach for neon and darkness, BlockTrivia reaches for paper and precision. The result is a space that feels trustworthy enough for a knowledge brand, but charged enough for a live competition.

The accent system is built on a single chromatic color: Electric Violet (`#7c3aed`). It appears only where it earns its place — CTA buttons, active states, the terminal prompt icon in the logo, and the moments where something is about to happen. Everything else recedes into a warm neutral palette where every gray carries a subtle yellow-brown undertone. There are no cool grays anywhere. Borders use Warm Border (`#e8e5e0`) — barely visible cream strokes that contain without confining. Shadows are absent entirely; depth is communicated through surface color shifts alone, creating a flat hierarchy that feels clean without feeling empty.

The typography tells a deliberate story. The Outfit wordmark sits tight and geometric, announcing the brand with the confidence of a bold sans-serif. Inter handles all gameplay and UI text — chosen for speed, not beauty, because players have 10 seconds to read a question and tap an answer while standing in a crowded conference hall with one hand. Lora appears only in "knowledge moments" — reputation profiles, post-game summaries, marketing headlines — where the serif says "this matters, slow down." The dual-font system isn't decorative; it's functional. Speed where speed is needed, authority where reflection is invited.

What makes BlockTrivia's design genuinely distinctive is that it must survive conditions no typical product faces. Bright stage lighting that washes out low-contrast UI. One-handed phone use while holding a conference lanyard and a drink. Sweaty thumbs on answer buttons during a 10-second countdown. Flaky venue Wi-Fi that drops connections mid-question. Every design decision passes through this IRL filter: if it doesn't work at ETH Denver at 3pm with 200 people in the room, it doesn't ship.

**Key Characteristics:**
- Warm Canvas (`#faf9f7`) evoking premium paper, never sterile white or cold gray
- Single accent color: Electric Violet (`#7c3aed`) — used sparingly, only where it earns attention
- Exclusively warm-toned neutrals — every gray has a yellow-brown undertone, no cool blues anywhere
- Flat surface hierarchy — zero drop shadows, depth from surface color and border shifts only
- Dual typography: Outfit (wordmark, buttons, display headings), Inter (gameplay/body), Lora (brand/knowledge moments)
- Sharp-cornered buttons (border-radius: 0) reinforcing the blocky geometric logo identity
- IRL-first design: 44px minimum touch targets, WCAG AA contrast, thumb-zone-only interaction
- Component library: shadcn/ui + Tailwind CSS — copy-paste ownership, not npm dependency
- Logo: 2x2 block grid. Top-left: violet `>_` terminal prompt. Bottom-right: violet checkmark. "Code → verified knowledge" narrative.
- Light mode default, dark mode via one-tap sun/moon toggle (`next-themes`)

---

## 2. Color Palette & Roles

### Accent

- **Electric Violet** (`#7c3aed`): The singular accent color — CTA buttons, active input borders, selected states, brand moments. Deliberately un-crypto: not blue, not teal, not neon. Reads as "competitive intelligence" without the dApp baggage.
- **Violet Hover** (`#6d28d9`): One shade deeper for hover states. The subtle darkening confirms interactivity without jarring the eye.
- **Violet Deep** (`#5b21b6`): Active/pressed states and text on violet-tinted surfaces. The darkest violet in the system.
- **Violet Tint** (`#f0ecfe` light / `rgba(124,58,237,0.15)` dark): The lightest violet — pill backgrounds, badge fills, selected answer states, subtle highlights. In dark mode, use translucent violet instead of the opaque light tint.
- **Violet Glow** (`rgba(124,58,237,0.15)`): Transparent violet for focus rings, breathing pattern overlays, and ambient accent effects.

### Surface & Background

- **Warm Canvas** (`#faf9f7`): The emotional foundation of the light theme. A cream-toned off-white that feels like quality paper. NOT `#ffffff`. This single choice separates BlockTrivia from every cold-gray tech product.
- **Surface White** (`#ffffff`): Cards, inputs, and elevated elements that sit on top of Warm Canvas. The contrast between canvas and surface creates subtle layering without shadows.
- **Warm Border** (`#e8e5e0`): The default light border — cream-tinted, barely visible, containing without confining. Used on inputs, cards, dividers.
- **Warm Hover** (`#f5f3ef`): Surface color shift on hover — one shade darker than Warm Canvas. The hover state for secondary buttons and interactive surfaces.
- **Night Canvas** (`#09090b`): Dark mode page background. Near-black with a barely perceptible warmth — not pure `#000000`.
- **Night Surface** (`#18181b`): Dark mode cards, inputs, elevated containers. One step up from Night Canvas.
- **Night Border** (`#27272a`): Dark mode borders and dividers. Warm-toned dark gray.
- **Night Hover** (`#1f1f23`): Dark mode hover state — subtle lift from Night Surface.

### Text

- **Ink** (`#1a1917`): Primary text color — headings, body copy, the darkest mark on Warm Canvas. Not pure black; the warm undertone prevents harshness and matches the paper-like canvas.
- **Stone** (`#78756e`): Secondary text — labels, helper text, captions, section descriptions. Warm medium gray that recedes without disappearing.
- **Fog** (`#b5b1aa`): Muted text — placeholders, disabled states, de-emphasized metadata. The lightest readable text on Warm Canvas.
- **Charcoal** (`#4d4c48`): Button text on light warm surfaces — darker than Stone, lighter than Ink. Used when Stone is too light but Ink is too heavy.
- **Snow** (`#fafafa`): Dark mode primary text. Near-white with a barely perceptible warmth.
- **Ash** (`#a1a1aa`): Dark mode secondary text. Cool-neutral gray — the only non-warm gray in the system, justified because dark backgrounds shift color perception.
- **Smoke** (`#52525b`): Dark mode muted text. Placeholders and disabled states on Night Canvas.

### Functional (reserved — never use as accent or decoration)

- **Correct Green** (`#22c55e`): Correct answer feedback. Always paired with a checkmark icon — never color alone.
- **Correct Tint** (`#dcfce7` light / `rgba(34,197,94,0.15)` dark): Light green background for correct answer button states.
- **Wrong Red** (`#ef4444`): Wrong answer feedback. Always paired with an X icon.
- **Wrong Tint** (`#fef2f2` light / `rgba(239,68,68,0.15)` dark): Light red background for wrong answer button states.
- **Timer Amber** (`#f59e0b`): Timer bar at 50% remaining. Urgency without alarm.
- **Timer Critical** (`#ef4444`): Timer bar in final 20%. Full urgency.
- **Live Green** (`#22c55e`): Green dot for live/active indicators. Standard convention.
- **Info Blue** (`#3b82f6`): Links, informational badges. The only blue in the active palette.
- **Focus Ring** (`rgba(124,58,237,0.3)`): Violet-tinted focus ring for accessibility. The only "shadow" in the entire system.

### Gradient System

BlockTrivia is **gradient-free** in the traditional sense. No CSS gradients appear on surfaces, buttons, or backgrounds. The one exception is the timer bar, which transitions from Electric Violet → Timer Amber → Timer Critical as time runs out — a functional gradient that communicates urgency, not decoration. Visual richness comes from the interplay of warm surface tones, the breathing violet pattern overlay, and the light/dark section alternation.

### Section Background Patterns

For **marketing and info pages only** (landing, how-it-works, pricing) we layer three section backgrounds in alternating rhythm. Gameplay screens (question, leaderboard, lobby, results) **never** use these blocks — they stay on Warm Canvas / Night Canvas to keep zero distraction.

| Block | Background | Headings | Body | Accent / borders | Cards / CTA |
|-------|------------|----------|------|------------------|-------------|
| **Warm Canvas** (default) | `#faf9f7` | Ink | Stone | Warm Border | as documented |
| **Ink** (dark editorial) | Ink `#1a1917` | Snow `#fafafa` | Ash `#a1a1aa` | Night Border `#27272a` | Night Surface `#18181b` cards; Electric Violet pops on dark |
| **Violet** (loud brand) | Electric Violet `#7c3aed` | `#ffffff` | `rgba(255,255,255,0.8)` | `rgba(255,255,255,0.15)` | Inverted CTA: Ink bg + white text |

**Rules of the rhythm:**

- Use Ink sections for hero stats, social proof, "how it works", testimonials, footer.
- Use **one** Violet section per page maximum — it's the loudest moment, dilute it and it stops working. Typical use: a "join the arena" CTA block.
- Every Warm Canvas section between blocks creates the breath that makes the dark / violet sections feel earned.

Reusable React primitives live at `src/app/_components/marketing/section.tsx`: `<CanvasSection>`, `<InkSection>`, `<VioletSection>`.

---

## 3. Typography Rules

### Font Family

- **Wordmark / Display / Buttons**: `Outfit`, weight 500–800, letter-spacing -0.02em for wordmark. Used for the "BlockTrivia" logo lockup, all button labels, and display headings. Geometric, tight, confident. The brand voice in type.
- **UI / Gameplay**: `Inter`, with fallback: `-apple-system, BlinkMacSystemFont, Segoe UI, system-ui, sans-serif`. The workhorse font — every gameplay screen, every input, every button. Chosen for reading speed under pressure, not aesthetics.
- **Brand / Knowledge**: `Lora`, with fallback: `Source Serif 4, Georgia, Times New Roman, serif`. The editorial voice — reputation profiles, post-game summaries, marketing headlines. Never appears in gameplay screens.
- **Code / IDs**: `JetBrains Mono`, with fallback: `ui-monospace, SF Mono, Menlo, monospace`. Join codes, session IDs, technical labels.

### Hierarchy

| Role | Font | Size | Weight | Line Height | Letter Spacing | Notes |
|------|------|------|--------|-------------|----------------|-------|
| Wordmark | Outfit | — | 800 | — | -0.02em | Logo only. Tight, geometric, confident. |
| Hero / page title | Outfit | `clamp(52px, 8vw, 96px)` | **800** | 1.05 | **-0.03em** | Display headings, marketing heroes — bumped Apr 2026 for boldness |
| Section heading | Outfit | 28–40px | **700** | 1.15 | **-0.03em** | Clear section anchors — bumped Apr 2026 |
| Subheading | Inter | 17–18px | 500 | 1.40 | 0 | Card titles, feature names |
| Question text | Inter | 18–20px | 500 | 1.40 | 0 | The most critical size — must be readable at arm's length in 2 seconds |
| Body | Inter | 16px | 400 | 1.60 | 0 | Standard reading text |
| Button label | Outfit | 14–16px | 500 | 1.30 | 0 | All button text — CTA, secondary, ghost |
| Answer button | Inter | 15–16px | 500 | 1.30 | 0 | Gameplay tap targets — speed over style |
| Label / caption | Inter | 13–14px | 400 | 1.40 | 0.01em | Helper text, metadata, timestamps |
| Small / helper | Inter | 12px | 400 | 1.40 | 0.02em | Micro-labels, overlines |
| Mono | JetBrains Mono | 13px | 400 | 1.50 | 0 | Join codes (G4H66), session IDs, technical data |

### Principles

- **Speed over beauty in gameplay**: Inter was chosen because it's the fastest sans-serif to parse on screens under time pressure. Not because it's interesting — because it's invisible. When a player has 10 seconds, the font should never slow them down.
- **Serif for authority, only at rest**: Lora appears exclusively in "knowledge moments" — never in gameplay. The serif says "this matters, slow down." It would be wrong on a question screen where the message is "hurry up."
- **Outfit for identity and action**: The wordmark uses tight letter-spacing (-0.02em) to feel like a mark, not a word. Buttons use Outfit because they're the brand speaking directly — "Join Game," "Host an Event." The geometric sharpness of Outfit pairs with the 0-radius button corners to reinforce the blocky logo identity.
- **Monospace for precision**: Join codes and session IDs use JetBrains Mono because every character must be unambiguous. Is that a zero or an O? Monospace resolves it.

### CSS Variables

```css
--font-wordmark: 'Outfit', sans-serif;
--font-gameplay: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
--font-brand: 'Lora', 'Source Serif 4', Georgia, 'Times New Roman', serif;
--font-mono: 'JetBrains Mono', ui-monospace, 'SF Mono', Menlo, monospace;
```

---

## 4. Component Stylings

### Buttons

**Primary (CTA)**
- Background: Electric Violet (`#7c3aed`) → hover: Violet Hover (`#6d28d9`) → active: Violet Deep (`#5b21b6`)
- Text: `#ffffff`, weight 500
- Height: 48–56px, full-width on mobile
- Border-radius: 0 (sharp corners — intentional, matches the blocky geometric logo identity)
- Font: Outfit, weight 500 (semibold)
- Transition: `background 150ms ease, transform 50ms ease`
- Active: `transform: scale(0.98)`
- Focus: `box-shadow: 0 0 0 3px rgba(124, 58, 237, 0.3)`
- The only filled-color button in the system. If it's violet and filled, it's the primary action.

**Secondary (outlined)**
- Background: transparent → hover: Warm Hover (`#f5f3ef`) light / Night Hover (`#1f1f23`) dark
- Border: 1px solid Warm Border (`#e8e5e0`) light / Night Border (`#27272a`) dark
- Text: Ink (`#1a1917`) light / Snow (`#fafafa`) dark, Outfit weight 500
- Same height, sharp corners, transitions as primary
- Used for secondary actions: "Host an Event," "Scan QR Code"

**Ghost (text button)**
- Background: transparent → hover: Violet Tint (`#f0ecfe` light / `rgba(124,58,237,0.15)` dark)
- Text: Electric Violet (`#7c3aed`), Outfit weight 500
- No border by default. In high-density layouts, a 1px dashed border may be added for clarity.
- Used for tertiary actions: "Play as guest," "Skip"

### Inputs

- Background: Surface White (`#ffffff`) light / Night Surface (`#18181b`) dark
- Border: 1px solid Warm Border (`#e8e5e0`) → focus: 1px solid Electric Violet (`#7c3aed`)
- Border-radius: 0 (matching button sharpness)
- Padding: 12px 14px
- Font-size: 15px, Inter
- Height: 44px minimum (Apple HIG touch target)
- Placeholder: Fog (`#b5b1aa`) light / Smoke (`#52525b`) dark
- Focus ring: `box-shadow: 0 0 0 3px rgba(124, 58, 237, 0.15)`
- Transition: `border-color 150ms ease, box-shadow 150ms ease`

### Cards

- Background: Surface White (`#ffffff`) light / Night Surface (`#18181b`) dark
- Border: 1px solid Warm Border (`#e8e5e0`) light / Night Border (`#27272a`) dark
- Border-radius: 8px
- Padding: 16px 20px
- No shadow — depth comes from surface contrast against Warm Canvas / Night Canvas

### Pills / Badges

- Background: Violet Tint (`#f0ecfe`) light / `rgba(124,58,237,0.2)` dark
- Text: Violet Deep (`#5b21b6`) light / `#c4b5fd` dark, weight 500, size 12–13px
- Padding: 4px 12px
- Border-radius: 9999px (full pill)
- Gameplay variants: Correct Tint + dark green text, Wrong Tint + dark red text, Amber tint + dark amber text
- **Dark mode rule:** All tinted backgrounds must use translucent `rgba()` values, never opaque light colors on dark canvas.

### Answer Buttons (gameplay)

- Layout: 2x2 grid for short answers (<30 chars), stacked list for long answers
- Each labeled A/B/C/D with muted background
- Height: 56px minimum — generous thumb target
- Default: Surface White bg, 1px Warm Border
- Selected: 2px Electric Violet border + Violet Tint background (`#f0ecfe` light / `rgba(124,58,237,0.2)` dark) + 50ms scale bounce
- Correct: Correct Tint background (`#dcfce7` light / `rgba(34,197,94,0.15)` dark) + 2px Correct Green border + checkmark icon — 200ms fade
- Wrong: Wrong Tint background (`#fef2f2` light / `rgba(239,68,68,0.15)` dark) + 2px Wrong Red border + X icon — 200ms fade

### Timer Bar

- Position: top of question screen, full-width
- Height: 4px
- Color transition: Electric Violet (`#7c3aed`) → Timer Amber (`#f59e0b`) at 50% → Timer Critical (`#ef4444`) at 20%
- Width animation: smooth CSS transition, linear timing
- The only gradient in the entire system — and it's functional, not decorative.

### Leverage Slider (gameplay)

- Position: between question text and answer buttons
- Range: 1x to 3x (safe to all-in)
- Default: 1x
- Track: 4px, Violet Tint background
- Thumb: 20px circle, Electric Violet fill
- Value display: large bold number next to slider (e.g. "3x") in Electric Violet
- Players see the question first, set leverage, then answer — all within one timer. Informed conviction, not blind gambling.

### Code Input (join screen)

- 5 individual character boxes, 56px tall
- Active/filled: 1.5px Electric Violet border, Violet Tint background, bold 16px centered character
- Empty: 1px Warm Border, Surface White background
- Auto-advance between characters on input
- Monospace font (JetBrains Mono) for unambiguous characters

---

## 5. Layout Principles

### Spacing Scale

| Token | Value | Usage |
|-------|-------|-------|
| space-1 | 4px | Inline icon gaps, tight internal padding |
| space-2 | 8px | Component-internal gaps, pill padding |
| space-3 | 12px | Standard component gap, card internal spacing |
| space-4 | 16px | Card padding, section internal spacing |
| space-5 | 20px | Between related content blocks |
| space-6 | 24px | Between content sections |
| space-8 | 32px | Major section breaks |
| space-10 | 40px | Page-level vertical rhythm |
| space-12 | 48px | Hero spacing, maximum breathing room |

### Grid

- Mobile: single column, 16px horizontal padding
- Tablet (640px+): max-width 640px, centered
- Desktop (1024px+): max-width 1024px, centered
- No multi-column layouts in gameplay screens — singular focus is everything

### Whitespace Philosophy

Whitespace is the most important design element in BlockTrivia. It's not "empty space" — it's the room between a player's thumb and a wrong button tap. It's the breathing room that lets a question be parsed in 2 seconds instead of 4. When in doubt, add more space. A screen that feels "too empty" in Figma will feel "exactly right" at 3pm at ETH Denver with 200 people in the room.

### Section Rhythm (marketing pages)

On marketing/info pages — landing, how-it-works, pricing — sections alternate background blocks (see §2 "Section Background Patterns") to create visual rhythm and let the eye breathe between dense moments.

Canonical landing-page rhythm:

```
[Warm Canvas]  hero
[Ink]          social proof / stats
[Warm Canvas]  how it works
[Violet]       CTA block (one per page max)
[Warm Canvas]  features
[Ink]          footer
```

Gameplay screens do **not** alternate sections — they stay on Warm Canvas / Night Canvas only. The rhythm is for marketing surfaces where the goal is "make me feel something"; gameplay screens have one goal: "make me answer in 10 seconds."

### Numbered Step Badges

For "How it works" sequences and any numbered list rendered visually:

- 32×32px (default), 6px radius, Outfit 16px weight 700, white text
- 3-step rotation: Step 1 = Electric Violet · Step 2 = Ink · Step 3 = Timer Amber
- Component: `<NumberedStep n={1} />` from `src/app/_components/marketing/numbered-step.tsx`

### Landing Page Stats Bar

Marketing-only stats row (e.g. "12k+ players · 340 events · 97% cheat-free"):

- Number: Outfit 36px weight 800
- Label: Inter 14px weight 400
- Layout: horizontal, evenly spaced, centered
- Component: `<StatsBar tone="light|dark" />` from `src/app/_components/marketing/stats-bar.tsx`

In-app stats bars (profile, results) keep their current sizing — this section bar is louder by design because marketing pages are reaching, not reporting.

---

## 6. Depth & Elevation

BlockTrivia uses a **flat surface hierarchy** — the most extreme version of this approach in any live gaming product. Zero drop shadows. Zero box-shadows on containers. Depth is communicated entirely through surface color contrast and border presence.

| Level | Name | Light treatment | Dark treatment | Usage |
|-------|------|----------------|----------------|-------|
| 0 | Canvas | Warm Canvas (`#faf9f7`) | Night Canvas (`#09090b`) | Page background |
| 1 | Surface | Surface White (`#ffffff`) + 1px Warm Border | Night Surface (`#18181b`) + 1px Night Border | Cards, inputs, modals |
| 1+ | Accent | Surface White + 1px border + 3px violet left accent | Night Surface + 1px border + 3px violet left accent | Callouts, editorial blocks |
| 2 | Overlay | `rgba(0,0,0,0.4)` over everything | `rgba(0,0,0,0.6)` over everything | Pause screen, modals, focus isolation |

**Only exception:** Focus rings use `box-shadow: 0 0 0 3px` for accessibility — the only shadow in the system.

### Border Radius Scale

| Value | Name | Usage |
|-------|------|-------|
| 0 | Sharp | Buttons, inputs — the default. Matches the blocky geometric logo. |
| 4px | Tight | Code blocks, small inline elements |
| 8px | Comfortable | Cards, containers |
| 12px | Generous | Modals, hero containers |
| 9999px | Pill | Badges, tags, event pills |

---

## 7. Do's and Don'ts

### Do

- Use Warm Canvas (`#faf9f7`) as the light background — the warm cream tone IS the BlockTrivia personality
- Use Electric Violet (`#7c3aed`) only for CTAs, active states, and brand moments — it's precious, don't dilute it
- Pair every color-coded state with an icon (checkmark + green, X + red) — never color alone
- Design thumb-first — every interactive element reachable by one thumb on a phone held one-handed
- Use warm-toned neutrals exclusively — every gray should carry a yellow-brown undertone
- Auto-advance inputs and screens — minimize required taps
- Show loading states with the branded BlockSpinner — conference Wi-Fi fails constantly
- Use translucent `rgba()` tints in dark mode — never use opaque light backgrounds (Correct Tint, Wrong Tint, Violet Tint) on Night Canvas
- Swap logo to dark variant (dark blocks → `#e8e5e0`) when on Night Canvas
- Swap BlockSpinner fills from Ink (`#1a1917`) to `#e8e5e0` in dark mode
- Respect `prefers-reduced-motion` — wrap all animations in the media query
- Use Inter for any text a player reads under time pressure
- Test every screen at maximum phone brightness
- Alternate section backgrounds on marketing pages (Warm Canvas → Ink → Warm Canvas → Violet → Warm Canvas → Ink) — the rhythm creates breath

### Don't

- Don't use pure white (`#ffffff`) as a page background — Warm Canvas is always the base
- Don't use gradients, glows, neon effects, or drop shadows — the system is intentionally flat
- Don't use cool blue-grays anywhere — the palette is exclusively warm-toned (Ash in dark mode is the only exception)
- Don't use serif fonts in gameplay screens — Lora is for brand moments only
- Don't reference blockchain, wallets, or tokens in the UI — Web3-native but not Web3-alienating
- Don't use a bottom navigation bar — this is a linear web flow, not a native app
- Don't use touch targets smaller than 44x44px — people are standing, distracted, holding things
- Don't use blue as an accent color — it's reserved for links and info states only
- Don't default to dark mode — light is the default entry point; dark mode is a toggle
- Don't clutter gameplay screens — every pixel must serve the 10-second decision window
- Don't use color blocks (Ink, Violet) on gameplay screens — they're marketing-only. Gameplay stays on Warm Canvas / Night Canvas
- Don't ship more than ONE Violet section per page — it's the loudest moment, dilute it and it stops working

---

## 8. Responsive Behavior

### Breakpoints

| Name | Width | Behavior |
|------|-------|----------|
| Mobile | < 640px | Single column, full-width buttons, 16px padding |
| Tablet | 640–1024px | Centered max-640px container, same layout |
| Desktop | > 1024px | Centered max-1024px container, more breathing room |

### Touch Targets

- Minimum: 44x44px (Apple Human Interface Guidelines)
- Answer buttons: 56px minimum height
- CTA buttons: 48–56px height, full-width on mobile
- Code input boxes: 56px height, large centered characters

### Collapsing Strategy

- Gameplay screens: **no layout changes** between mobile/tablet/desktop — same single-column focus at every width
- Host control panel: mobile-first, desktop gets more breathing room (no separate layout for MVP)
- Landing page: content reflows at tablet breakpoint, hero text scales down

### IRL Event Overrides

These rules override all responsive defaults when the product is used at a live event:
1. Maximum screen brightness assumed — WCAG AA contrast is the floor, not the ceiling
2. One-handed phone use assumed — all interactive elements in the thumb zone
3. Standing with movement assumed — no precision tapping, no hover-dependent interactions
4. Bad Wi-Fi assumed — every screen must degrade gracefully, show cached data, never white-screen on connection drop

---

## 9. Agent Prompt Guide

### Quick Color Reference

```
Warm Canvas: #faf9f7 (light bg)      Night Canvas: #09090b (dark bg)
Surface White: #ffffff (light cards)  Night Surface: #18181b (dark cards)
Warm Border: #e8e5e0 (light)         Night Border: #27272a (dark)
Warm Hover: #f5f3ef (light)          Night Hover: #1f1f23 (dark)
Ink: #1a1917 (light text)            Snow: #fafafa (dark text)
Stone: #78756e (light secondary)     Ash: #a1a1aa (dark secondary)
Fog: #b5b1aa (light muted)           Smoke: #52525b (dark muted)
Charcoal: #4d4c48 (button text)
Electric Violet: #7c3aed             Violet Hover: #6d28d9
Violet Deep: #5b21b6                 Violet Tint: #f0ecfe
Correct Green: #22c55e               Correct Tint: #dcfce7
Wrong Red: #ef4444                   Wrong Tint: #fef2f2
Timer Amber: #f59e0b                 Info Blue: #3b82f6
```

### Logo

2x2 block grid icon + "BlockTrivia" wordmark (Outfit ExtraBold, letter-spacing -0.02em).
- TOP-LEFT: violet (`#7c3aed`) block with `>_` terminal prompt
- TOP-RIGHT: dark block
- BOTTOM-LEFT: dark block
- BOTTOM-RIGHT: violet (`#7c3aed`) block with checkmark
- Light mode: dark blocks are Ink (`#1a1917`), violet blocks are Electric Violet
- Dark mode: dark blocks swap to `#e8e5e0`, violet blocks stay `#7c3aed`
- **IMPORTANT: Do NOT mirror or flip the icon positions.**

### Component Library

shadcn/ui + Tailwind CSS. All components use Tailwind utility classes and shadcn/ui primitives. Radix UI handles accessibility (focus management, keyboard navigation, screen readers).

### Round Types

- **MCQ**: 4 answer options in 2x2 grid (short answers) or stacked list (long). Timer bar at top.
- **True/False**: Two massive full-width buttons.
- **Leverage**: MCQ + wager slider (1x–5x). Player sees question first, sets leverage, taps answer — all within one timer. Correct = multiplied points. Wrong = lose leveraged amount (wipeout). Informed conviction, not gambling.
- **Sponsored interstitial**: "Trivia Factoid" format — editorial, not ad-y. Full-screen card. Optional quick reaction (Cool / Already knew that). Host can skip. Auto-advances on configurable timer.

### Animation Tokens

- Selection tap: `transform: scale(0.98)` over 50ms
- Correct/wrong feedback: `background-color` fade over 200ms
- Leaderboard rank shift: `translateY` slide over 300ms ease-out
- Timer bar: width transition, linear timing
- Background pattern: breathing checkmarks and `>_` prompts at ~5s cycle, 3% opacity
- Loading spinner: BlockSpinner "story" variant (logo assembles itself in 3.2s loop). Light mode: dark blocks `#1a1917`, violet `#7c3aed`. Dark mode: dark blocks `#e8e5e0`, violet `#7c3aed`.
- Haptic: on by default. Sound: off by default.
- All animations: `@media (prefers-reduced-motion: no-preference)` wrapper mandatory

### Example Component Prompts

- "Create a join screen on Warm Canvas (#faf9f7) with a hero heading in Lora at 32px weight 600. Event name in Electric Violet (#7c3aed). Five code input boxes 56px tall with violet borders, JetBrains Mono 16px bold centered characters. Below: outlined 'Scan QR Code' button with 1px Warm Border (#e8e5e0). Solid violet 'Join Game' CTA button 48px tall, 12px radius."
- "Design an answer grid with four options in a 2x2 layout. Each button 56px tall, Surface White background, 1px Warm Border, 10px radius, Inter 15px weight 500. Selected state: 2px Electric Violet border + Violet Tint (#f0ecfe) background. Correct state: 2px Correct Green (#22c55e) border + Correct Tint (#dcfce7) background + checkmark icon."
- "Build a leverage round screen. Question in Inter 18px weight 500 at the top. Below: a slider from 1x to 3x, track in Violet Tint, thumb in Electric Violet, value displayed as '3x' in Electric Violet bold. Below slider: four answer buttons in 2x2 grid. Timer bar at top of screen transitioning violet → amber → red."

### Ready-to-Use Agent Prompt

Append to any AI agent prompt for BlockTrivia UI generation:

> Build with Next.js + Tailwind CSS + shadcn/ui. Light mode default, warm off-white background (#faf9f7, called "Warm Canvas"). Accent: Electric Violet (#7c3aed) used sparingly — only on CTAs, active states, brand moments. Typography: Outfit for buttons, display headings, and wordmark; Inter for body/gameplay text; Lora for brand/editorial moments only. Buttons have border-radius: 0 (sharp corners). No bottom nav, no wallet references, no neon/crypto aesthetic. Minimum touch targets 44x44px. Mobile-first, 390px base width. Zero drop shadows — depth from surface color shifts only. Design language: Anthropic/Claude warmth meets Linear precision with sharp geometric confidence.

### Iteration Guide

1. Reference colors by name — "use Stone (#78756e)" not "make it gray"
2. Always specify warm-toned neutrals — no cool grays
3. Describe font role explicitly — "Inter for the button, Lora for the heading"
4. For depth, use "surface color shift" — never "drop shadow" or "elevation"
5. Specify the warm background — "on Warm Canvas (#faf9f7)" or "on Night Canvas (#09090b)"
6. Keep gameplay screens minimal — if it doesn't serve the 10-second window, remove it

---

## 10. Iconography System

BlockTrivia uses **Lucide Icons** — the same library that ships with shadcn/ui. Icons follow the "warm brutalist" aesthetic: heavier than default, sharp where possible, and colored from the existing palette. They should feel like they were drawn with the same pen that drew the UI borders.

### Provider & Global Config

- **Library:** `lucide-react` (already a shadcn/ui dependency)
- **Stroke weight:** `2.5px` mandatory — never use the default 2px. The heavier stroke matches Outfit's bold weight and the sharp 0-radius buttons.
- **Base size:** `20px` icon inside a `44px` minimum hit area
- **Corner style:** Use Lucide's default shapes. Do not force sharp terminals on naturally rounded icons — the sharpness comes from the stroke weight and the context (sharp buttons, flat surfaces), not from distorting icon geometry.

### Color States

| State | Icon color | Background | Transition |
|-------|-----------|------------|------------|
| Default/inactive | Stone `#78756e` (light) / Ash `#a1a1aa` (dark) | Transparent | — |
| Hover | Electric Violet `#7c3aed` | Transparent | 150ms ease |
| Active/selected | Electric Violet `#7c3aed` | `rgba(124,58,237,0.10)` fill | 150ms ease |
| Disabled | Fog `#b5b1aa` (light) / Smoke `#52525b` (dark) | Transparent | — |
| Destructive | Wrong Red `#ef4444` | Transparent | — |

Icons inherit `currentColor` from parent elements. For the active state, apply a 10% opacity fill of Electric Violet behind the icon — this creates a subtle "selected" indicator without breaking the flat surface hierarchy.

### Icon Mappings (BlockTrivia features)

**Global / navigation:**

| Function | Lucide icon | Notes |
|----------|------------|-------|
| Dark mode (light) | `sun` | Toggles to moon |
| Dark mode (dark) | `moon` | Toggles to sun |
| Sign out | `log-out` | Top-right nav |
| Share / invite | `share-2` | Lobby share actions |
| Copy to clipboard | `copy` | Game code, inline |
| Back | `arrow-left` | Navigation back |
| QR code | `qr-code` | Show QR modal |
| Settings | `settings` | Host settings |
| Close / dismiss | `x` | Modals, overlays |

**Lobby & gameplay:**

| Function | Lucide icon | Notes |
|----------|------------|-------|
| Players | `users` | Stat card, player count |
| Rounds | `layers` | Stat card |
| Questions | `help-circle` | Stat card |
| Timer | `timer` | Timer indicator |
| Leverage / wager | `scale` | Leverage round indicator |
| Leaderboard | `trophy` | Leaderboard header |
| Correct answer | `check` | Answer feedback (paired with Correct Green) |
| Wrong answer | `x` | Answer feedback (paired with Wrong Red) |
| Streak | `flame` | Streak indicator |
| Live indicator | `circle` | 8px, filled Live Green `#22c55e` |

**Host controls:**

| Function | Lucide icon | Notes |
|----------|------------|-------|
| Start game | `play` | Primary host action |
| Pause | `pause` | Global pause |
| Skip | `skip-forward` | Skip interstitial/leaderboard |
| Stage view | `monitor` | Toggle projector view |
| Analytics | `bar-chart-3` | Post-event insights |
| Edit questions | `pencil` | Question management |

**Profile & auth:**

| Function | Lucide icon | Notes |
|----------|------------|-------|
| Profile | `user` | Account page |
| Events | `calendar` | Event history |
| Reputation | `award` | Reputation score |
| Edit | `pencil` | Edit profile/display name |

### Implementation

```tsx
import { Users, Trophy, Timer, Play } from 'lucide-react';

// Always apply global props
<Users size={20} strokeWidth={2.5} />
<Trophy size={20} strokeWidth={2.5} />

// Active state example
<div className="p-2 rounded-sm bg-violet-500/10">
  <Trophy size={20} strokeWidth={2.5} className="text-violet-600" />
</div>
```

### Rules

- **Always** set `strokeWidth={2.5}` and `size={20}` on every Lucide component
- Icons inherit `currentColor` — style the parent element, not the icon directly
- Vertically center icons within buttons and nav items
- Transitions: 150ms ease (snappy, not soft — matches the warm brutalist aesthetic)
- Never use icon-only buttons without a tooltip or `aria-label`
- Never use icons as decoration — every icon must communicate a function
- In dark mode, default icons use Ash (`#a1a1aa`), not Stone
