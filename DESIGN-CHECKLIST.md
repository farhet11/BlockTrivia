# Design Compliance Checklist

> **Run this before every PR.** Every item that fails the check must be fixed before merge. If you cannot fix it in this PR, file an issue and link it in the PR description.

This checklist enforces the BlockTrivia design system documented in [DESIGN.md](./DESIGN.md). Use it as a literal pre-flight: tick each box, fix violations, then ship.

---

## Typography

- [ ] Headings/buttons use Outfit — NOT Inter, NOT system font
- [ ] Gameplay/body text uses Inter — NOT Outfit
- [ ] Brand/editorial uses Lora — reputation, post-game, marketing only
- [ ] Codes/IDs use JetBrains Mono — join codes, game codes, timer numbers
- [ ] No font-weight above 600 on Inter
- [ ] Outfit uses 500–800 only (500 buttons, 700 section headings, 800 hero/wordmark)
- [ ] No text smaller than 12px
- [ ] Question text is 18–20px Inter weight 500

## Colors

- [ ] Page background is Warm Canvas (`#faf9f7`) — NEVER `#ffffff` for page bg
- [ ] Cards/inputs use Surface White (`#ffffff`) — sits on top of Warm Canvas
- [ ] No cool grays anywhere — every gray has warm undertone
- [ ] Electric Violet (`#7c3aed`) only on CTAs, active states, brand moments
- [ ] Correct Green (`#22c55e`) always paired with checkmark icon — never color alone
- [ ] Wrong Red (`#ef4444`) always paired with X icon — never color alone
- [ ] Dark mode tints use `rgba()`, not opaque light colors

## Buttons

- [ ] `border-radius: 0` on ALL buttons — sharp corners, no exceptions
- [ ] Primary CTA: violet bg, white text, Outfit font — only ONE per screen
- [ ] Secondary: transparent bg, 1px Warm Border, Ink text, Outfit font
- [ ] Ghost: transparent bg, no border, violet text, Outfit font
- [ ] Min height 48px on CTA, 44px on others
- [ ] Full-width on mobile

## Icons

- [ ] Lucide icons only — no other libraries
- [ ] `strokeWidth={2.5}` on every UI icon — not 2, not 1.5
- [ ] `size={20}` default inside 44px min hit area
- [ ] No emoji in UI elements — emojis are for Spotlight Stats content only
- [ ] Every icon has `aria-label` or paired text
- [ ] Default color: Stone (`#78756e`) light / Ash (`#a1a1aa`) dark

## Inputs

- [ ] `border-radius: 0`
- [ ] 1px Warm Border default, 1px violet on focus
- [ ] Height 44px minimum
- [ ] Placeholder in Fog (`#b5b1aa`) light / Smoke (`#52525b`) dark
- [ ] Inter 15px

## Cards

- [ ] `border-radius: 8px` (cards get 8px, buttons get 0)
- [ ] 1px Warm Border / Night Border
- [ ] No drop shadows — zero, none, never
- [ ] Surface White bg light / Night Surface dark

## Pills / Badges

- [ ] `border-radius: 9999px` (full pill)
- [ ] Violet Tint bg + Violet Deep text (default)
- [ ] Dark mode pills use `rgba()` backgrounds

## Status Indicators

- [ ] Status pills are NOT buttons — no `cursor: pointer`, no hover state
- [ ] "Waiting" states have pulsing dot animation
- [ ] Timer colors: violet (100–50%) → amber (50–20%) → red (20–0%)

## Dark Mode

- [ ] All screens tested in both themes
- [ ] Logo dark blocks swap to `#e8e5e0`
- [ ] All tinted backgrounds use `rgba()` not opaque colors

## Accessibility

- [ ] `prefers-reduced-motion` wraps ALL animations
- [ ] WCAG AA contrast on all text
- [ ] Focus rings: `box-shadow: 0 0 0 3px rgba(124, 58, 237, 0.3)`

---

## Top 5 Most Common Mistakes

1. **Inter for button labels** → Should be Outfit
2. **`#ffffff` as page background** → Should be `#faf9f7` (Warm Canvas)
3. **Rounded corners on buttons** → Should be `border-radius: 0`
4. **Status indicators styled as buttons** → Should be pills (`9999px` radius, no hover)
5. **Missing `strokeWidth={2.5}` on Lucide icons** → Default 2px is too thin
