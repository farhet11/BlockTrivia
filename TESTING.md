# Testing

100% test coverage is the key to great vibe coding. Tests let you move fast, trust your instincts, and ship with confidence — without them, vibe coding is just yolo coding. With tests, it's a superpower.

## Framework

**Vitest v4** + **@testing-library/react v16** + **jsdom**

## Run tests

```bash
npm test           # run once
npm run test:watch # watch mode during development
```

## Test directory

- `src/__tests__/` — unit tests for lib/utility code
- Future: `src/__tests__/components/` for React component tests

## Layers

| Layer | Tool | When |
|-------|------|------|
| Unit | Vitest | Pure functions, prompt builders, validators |
| Component | Vitest + Testing Library | React components with user interactions |
| E2E | (future) Playwright | Critical paths: game flow, onboarding, auth |

## Conventions

- File naming: `{module-name}.test.ts` or `{component}.test.tsx`
- Use `describe` blocks to group related tests
- Assert behavior, not implementation — test what code DOES, not what it IS
- Mock external dependencies (Supabase, Claude API) at the system boundary only
- Never import real `ANTHROPIC_API_KEY` or Supabase creds in tests
