# BlockTrivia Design Audit — 2026-04-19

Audit of every visible drift between `src/` and the design system shipped in
PR #128 (`--bt-*` token layer + DESIGN.md v3.1 + DESIGN-CHECKLIST.md).
Nothing in this PR is fixed; this document is a triage backlog.

## Scope
- **Spec source:** `/DESIGN.md` v3.1, `/DESIGN-CHECKLIST.md`, the new `--bt-*` token layer in `src/app/globals.css`.
- **Scanned:** `src/app/**`, `src/rounds/**`, `src/components/**`.
- **Not scanned:** `tests/**`, generated `.next/**`, `node_modules/**`.
- **Method:** ripgrep for `#[0-9a-fA-F]{6}` (322 hits) + `strokeWidth={2}` (53 hits) + manual review of every site.

## Severity legend
- **P0** — breaks pilot. Visible wrongness, broken dark mode, missing content, accessibility fail.
- **P1** — visible drift. Off-palette color, hardcoded tint duplicating a token, ad-hoc spacing/border.
- **P2** — polish. Icon stroke weight, micro-spacing, low-impact copy, intentional brand colors that *could* migrate.
- **P3** — intentional, leave alone. Telegram/Google brand colors, OG image hex (server-rendered, no theme), confetti palettes.

## Drift summary

| Category | P0 | P1 | P2 | P3 | Total |
|---|---:|---:|---:|---:|---:|
| Hardcoded hover surfaces (`#f5f3ef` / `#1f1f23`) | — | 18 | — | — | 18 |
| Hardcoded correct/wrong tints (`#dcfce7` / `#fef2f2`) | — | 28 | — | — | 28 |
| Hardcoded violet (`#7c3aed`, `#5b21b6`, `#a78bfa`) outside button/CTA | — | 22 | 8 | — | 30 |
| Hardcoded green/red functional (`#22c55e`, `#ef4444`) | — | 18 | — | — | 18 |
| Hardcoded ink/canvas (`#1a1917`, `#faf9f7`, `#09090b`) outside primitives | — | 12 | — | 4 | 16 |
| Off-palette color (`#f97316` orange) | — | 1 | — | — | 1 |
| `strokeWidth={2}` on UI action icons | — | — | 53 | — | 53 |
| Telegram/Google brand colors | — | — | — | 6 | 6 |
| OG image static hex | — | — | — | 18 | 18 |
| Confetti palette literals | — | — | — | 8 | 8 |
| Inline `font-family: Inter, sans-serif` | — | 11 | — | — | 11 |
| **Total** | **0** | **110** | **61** | **36** | **207** |

No P0. Pilot is safe. P1s are token migrations (find/replace), P2s are stroke weight bumps.

---

## Findings by route

### `/game/[code]/play` (P4) — pilot-critical

**`src/app/game/[code]/play/_components/play-view.tsx`**
- [P1] :55–57 — timer color thresholds hardcoded (`#7c3aed` / `#f59e0b` / `#ef4444`). Replace with `var(--bt-violet)` / `var(--bt-timer-amber)` / `var(--bt-timer-critical)`. Also see `play-view.tsx:1132`.
- [P1] :741, 743 — paused pill `color: "#f59e0b"`, `background: "#f59e0b18"`. Use `.bt-pill bt-pill--amber`.
- [P1] :1035, 1105 — `bg-[#f5f3ef] dark:bg-[#1f1f23]` → `bg-[var(--bt-hover)]`.
- [P1] :1224, 1226 — answer reveal banner uses `bg-[#dcfce7]` / `bg-[#fef2f2]` → `bg-[var(--bt-correct-tint)]` / `bg-[var(--bt-wrong-tint)]`.
- [P3] :659–663, 675–677 — confetti palettes, intentional decorative literals.

### `/game/[code]/lobby` (P3) — pilot-critical

**`src/app/game/[code]/lobby/_components/lobby-view.tsx`**
- [P1] :207, 209 — "Live" pill open-codes green dot. Replace with `<span className="bt-pill bt-pill--correct bt-pill--live">Live</span>`.
- [P1] :248, 254, 261, 276, 280 — inline `style={{ fontFamily: "Inter, sans-serif", color: "#78756e" }}` etc. Use `.bt-mono` for the rank number, `.bt-body` for the name; drop the inline styles.

### `/game/[code]/leaderboard` (P7)

**`src/app/game/[code]/leaderboard/_components/leaderboard-view.tsx`**
- [P1] :38–43 — `STATUS_PILL` map literal hex (`#78756e`, `#22c55e`, `#f59e0b`, `#7c3aed`). Token-ize: `var(--bt-stone)` / `var(--bt-correct)` / `var(--bt-timer-amber)` / `var(--bt-violet)`.
- [P3] :95–97 — confetti palettes; leave as-is.

### `/game/[code]/final` (P8)

**`src/app/game/[code]/final/_components/final-view.tsx`**
- [P3] :61, 68, 77 — confetti palettes; leave.

### `/host/game/[code]/control` (H5) — pilot-critical

**`src/app/host/game/[code]/control/_components/control-panel.tsx`**
- [P1] :1026, 1029 — duplicate of `play-view` timer thresholds. Same fix.
- [P1] :1089, 1158, 1246, 1248 — hover surface + violet pill + amber pill literals. Use `.bt-pill` variants and `var(--bt-hover)`.
- [P1] :1436, 1576 — inline SVGs `strokeWidth={2}` instead of `={2.5}`.

### `/host` dashboard

**`src/app/host/_components/host-sidebar.tsx`**
- [P1] :92, 107, 108 — sidebar active-link styling open-codes `#f0ecfe` / `rgba(124,58,237,0.15)` / `text-violet-700`. Migrate to `bg-[var(--bt-violet-tint)] text-[var(--bt-violet-deep)]`.

**`src/app/host/(dashboard)/_components/event-list.tsx`**
- [P1] :81, 97, 162 — destructive text uses `text-[#ef4444]` / `hover:text-[#dc2626]`. Use `text-wrong` Tailwind class (already mapped to `var(--wrong)`).
- [P1] :111, 126 — hover surfaces.

**`src/app/host/(dashboard)/events/new/_components/create-event-form.tsx`**
- [P1] :1236, 1247 — light/dark canvas previews use literal `#faf9f7` / `#09090b`. Acceptable since this *is* a preview of the bg color, but could read from `var(--bt-bg)` with a forced `:root` / `.dark` wrapper.

### `/profile`

**`src/app/profile/_components/profile-view.tsx`**
- [P1] :370, 376, 406, 422, 534, 557, 704 — eight hover-surface and accent-tint literals across the profile chrome. Same migration pattern as the host sidebar.
- [P3] :624–627, 631 — Google logo brand colors. Leave.
- [P1] :737, 759 — destructive button `bg-[#ef4444]` / `hover:bg-[#dc2626]`. Use `<Button variant="destructive">`.

### `/results/[code]` and `/host/game/[code]/summary`

**`src/app/results/[code]/_components/results-view.tsx:76, 85`**, **`announce-results-button.tsx:58, 68`**
- [P3] Telegram brand color `#229ED9` / `#26A5E4`. Leave.

### Marketing / shared

**`src/app/page.tsx`**
- [P1] :38, 45, 103, 115, 176–186 — landing page `<Button>` consumers open-code `bg-[#1a1917]` / `bg-[#7c3aed]` / `text-[#1a1917]` / `border-[#e8e5e0]`. Replace with shadcn variants (`variant="default"`, `variant="outline"`) which already pull from theme tokens.

**`src/app/_components/marketing/section.tsx`**
- [P1] :52, 53, 68, 83 — `InkSection` / `MintSection` / `VioletSection` use literals. Section components are the *one place* literals are arguably justified (they paint a fixed brand color regardless of theme). Could migrate to `var(--bt-ink)` etc. for consistency. Low ROI.

**`src/app/_components/marketing/numbered-step.tsx:9`**
- [P1] `STEP_COLORS = ["#7c3aed", "#3ddabe", "#f59e0b"]`. Token-ize.

**`src/app/_components/marketing/stats-bar.tsx:51–55`**
- [P1] Tone palette literals. Token-ize.

**`src/app/_components/lb-podium.tsx`**
- [P1] :50–52, 72 — rank-bar gold/silver/bronze (`#f59e0b` / `#9ca3af` / `#d97706`). These are podium awards — could stay as semantic constants in a dedicated `RANK_COLORS` map but keep literal.
- [P1] :115, 123, 296, 303, 308, 319, 323, 360, 364, 434, 441, 455, 458 — many inline `font-family: "Inter, sans-serif"` + color literals. Replace `Inter, sans-serif` with `var(--font-sans)` (or just remove and let the body inherit). Replace color hexes with `var(--bt-stone)`, `var(--bt-violet)`, `var(--bt-correct)`, `var(--bt-wrong)`.

**`src/app/_components/global-footer.tsx:13`**
- [P1] Dark footer `background: "#1a1917", color: "#a1a1aa", borderTopColor: "#27272a"`. Use `var(--bt-ink)`, `var(--bt-stone)`, `var(--bt-border)`.

**`src/app/_components/avatar-dropdown.tsx`**
- [P1] :85, 103, 112, 124 — selected/hover/destructive items. Migrate to `var(--bt-violet-tint)` / `var(--bt-hover)` / `text-wrong`.

**`src/app/_components/round-type-badge.tsx`** ⚠
- [P1] :83 — hardcoded `background: "#7c3aed"`. **Switch to `className="bt-round-badge"`** (newly available) and remove inline style.
- [P3] :92 — `strokeWidth={2}` is correct per DESIGN §11 (round badges intentionally thinner than UI icons at 2.5).

**`src/app/_components/branded-qr.tsx:32, 35, 39`**
- [P1] QR code tile colors (dark/violet/violet-deep). Use tokens `var(--bt-ink)` / `var(--bt-violet)` / `var(--bt-violet-deep)`.

**`src/app/_components/falling-blocks-error.tsx:48, 59, 63, 81, 95, 109, 120`**
- [P1] Error page block fills `#7c3aed` / `#f0e6fc` / `var(--color-foreground, #1a1917)`. Migrate to `var(--bt-violet)` / `var(--bt-violet-tint)` / `var(--bt-ink)`.

**`src/app/_components/liveness-challenge.tsx:29–60, 448–453`**
- [P1] SVG illustrations + timer-bar keyframe animation use raw violet/cream/ink/amber/red literals. Token-ize (CSS custom props work inside `<style>` tags).

**`src/app/_components/confirm-modal.tsx:65`**
- [P1] Destructive button `text-[#ef4444] hover:text-[#dc2626]`. Use `text-destructive`.

### Round implementations (`src/rounds/**`) — pilot-critical, biggest cluster

The following ten files are mostly mechanical migrations of the same patterns:
- `bg-[#dcfce7]` → `bg-[var(--bt-correct-tint)]`
- `bg-[#fef2f2]` → `bg-[var(--bt-wrong-tint)]`
- `bg-[#f5f3ef] dark:bg-[#1f1f23]` → `bg-[var(--bt-hover)]`
- `bg-[#22c55e]` / `bg-[#ef4444]` → `bg-[var(--bt-correct)]` / `bg-[var(--bt-wrong)]`

Files (all under `src/rounds/`):
- `mcq/player-view.tsx:45, 46, 58, 60, 61` (5 sites)
- `wipeout/player-view.tsx:93, 95, 108, 110, 111` (5)
- `the-narrative/player-view.tsx:53, 72, 74, 76, 106, 108, 109` (7) + `host-reveal-view.tsx:55, 83, 88, 108, 112, 113` (6)
- `oracles-dilemma/player-view.tsx:94, 108, 140, 185, 186, 237, 238, 250, 252, 253` (10)
- `reversal/player-view.tsx:51, 74, 77, 94, 102, 108` (6)
- `pressure-cooker/player-view.tsx:53, 56, 60, 92, 93, 105, 107, 108` (8) — **includes the lone P1 off-palette `#f97316` at :53** (orange "fire" indicator). Migrate to `var(--bt-timer-amber)` if intentional warning, or remove if duplicating the timer bar.
- `closest-wins/player-view.tsx:108, 188, 217, 220` (4) + `host-reveal-view.tsx:47` (1) + `distribution-chart.tsx:39–41` (3 named constants — fine to keep)
- `pixel-reveal/player-view.tsx:312, 313, 479, 519, 520, 532, 534, 535` (8) + `host-reveal-view.tsx:42, 47, 48` (3)
- `_shared/default-host-reveal-view.tsx:35, 41, 42` (3)

**Recommended path:** one PR per round folder (10 small PRs) so reviews stay focused, OR one mass find/replace with eyeball verification.

### Primitives

**`src/components/ui/block-spinner.tsx:20–22`**
- [P1] `dark = isDark ? '#e8e5e0' : '#1a1917'` etc. The new layer ships `var(--bt-spinner-ink)` (theme-adaptive) and `var(--bt-violet)`; switch to those and drop the `useTheme()` dependency.

**`src/components/ui/block-pattern-bg.tsx:22, 32`**
- [P3] Canvas-rendered, `getComputedStyle` not available pre-paint. Hardcoded canvas/night-canvas hex is acceptable here.

### Lucide stroke weight (P2 — 53 sites)

DESIGN.md §10 mandates `strokeWidth={2.5}` on every UI action icon (the current Lucide default `={2}` is too thin against Outfit weight 500–800).

Per file (number of sites in parens):
- `host/(dashboard)/events/[id]/questions/_components/`: question-row (6), round-card (4), sponsors-panel (3), question-builder (1), social-panel (2), event-logo-panel (1), share-button (1), json-import-modal (1), mindscan-modal (2)
- `host/game/[code]/control/_components/`: control-panel (4), host-control-bar (6)
- `host/(dashboard)/events/new/_components/create-event-form.tsx` (3)
- `host/(dashboard)/events/archived/_components/archived-event-list.tsx` (2)
- `join/_components/`: identity-panel (3), feedback-button (1)
- `rounds/`: oracles-dilemma (8), pressure-cooker (2), the-narrative (1), closest-wins (1)
- `app/_components/round-type-badge.tsx` (1) — **leave at 2.0 per §11**
- `profile/_components/profile-view.tsx` (1)

**Caveat:** `Sparkles` decorative icons in `oracles-dilemma` (5 sites) are intentionally thinner; `Flame` in `pressure-cooker` is intentional. Skip those — net P2 sites to fix is ~38.

---

## Recommended next sessions

1. **Spike fix (~15 min, low risk)** — `src/app/_components/round-type-badge.tsx:83` ➜ `className="bt-round-badge"`. Single inline-style removal, immediate proof the new tokens are wired.
2. **Round views batch (~60 min)** — 10 files, one find/replace per pattern. Highest-volume win, all on pilot-critical surfaces.
3. **Marketing/profile chrome (~45 min)** — landing, profile, lb-podium, footer, sidebar. Touch consumer code without breaking visuals.
4. **Lucide strokeWidth sweep (~30 min)** — script-able: `find . -name '*.tsx' -exec sed -i 's/strokeWidth={2}/strokeWidth={2.5}/g' {} \;` then revert on intentional decorative icons (Sparkles, Flame, RoundTypeBadge).
5. **Defer:** OG image, confetti, brand-color SVGs (Telegram/Google), liveness-challenge SVG illustrations — all P3.

Total cleanup ≈ 2.5 hours of dispatched-Claude-Code work, splittable into 4 PRs.
