<!-- BEGIN: blocktrivia-agent-rules -->

# Agent Behavior Rules

These rules apply to every session, every worktree, every task.
No exceptions. No "I'll verify after." These are non-negotiable.

---

## 1. Never Lie About Status

**The most important rule.**

Never tell the user something is merged, shipped, deployed, or done
without running a verification command first and showing the output.

Before saying any of these words — merged / shipped / done / deployed /
pushed / complete — you MUST run the appropriate check:

| Claim | Required verification |
|---|---|
| "merged to main" | `git log --oneline main \| head -10` |
| "committed" | `git status && git log --oneline -5` |
| "deployed" | Check Vercel dashboard or `git log --oneline origin/main \| head -5` |
| "file exists / is updated" | `cat` the file or `ls` the path |
| "all conflicts resolved" | `git status \| grep -E "conflict\|both"` |

Show the output. Don't summarize it. If the output contradicts your
claim, say so immediately and fix it.

---

## 2. Git Rules

- **Never force push** to main or any shared branch
- **Never `git checkout --theirs` or `--ours`** without explicitly telling
  the user which files will be overwritten and why
- **Never resolve merge conflicts silently** — list every conflicted file
  before touching any of them
- **Always confirm the current branch** before starting any work:
  `git branch --show-current`
- **Never commit directly to main** — always work on a feature branch
- **Worktree awareness:** always confirm which worktree you're in.
  `git worktree list` if unsure.

---

## 3. Database & Auth Rules — NEVER TOUCH WITHOUT EXPLICIT INSTRUCTION

These files and systems are off-limits unless the user explicitly says
"edit the migration" or "change the RLS policy":

- `supabase/migrations/` — never edit existing migration files
- RLS policies — never modify without a security review prompt
- `src/lib/supabase.ts` and `src/lib/supabase-server.ts` — never refactor
  client instantiation
- `src/app/proxy.ts` — the auth middleware, do not touch
- `.env.local` — never read aloud, never log, never commit

If a task seems to require touching these, **stop and ask** instead.

---

## 4. Next.js 16 Rules

This is NOT the Next.js from your training data. Breaking changes apply.

- Read `node_modules/next/dist/docs/` before writing any Next.js code
- `params` is async: always `const { id } = await params`
- Auth middleware is `src/app/proxy.ts` — NOT `middleware.ts`
- Never install a Next.js plugin or middleware without checking docs first
- Server components cannot use hooks — check before writing

---

## 5. Context & Session Rules

- Run `/compact` when context feels large — don't wait to be asked
- If you're unsure what's already built, check `CLAUDE.md` before asking
  the user or guessing
- If a file is "large," write it directly with the Write tool — never
  output it to chat and risk hitting output limits
- Never say "I'll do X next" and then do Y — do what you said or ask first
- If you hit an output limit mid-task, say so immediately. Don't pretend
  the task is complete.

---

## 6. Definition of Done

A task is DONE only when ALL of the following are true:

- [ ] Code is written and saved
- [ ] `npm run build` passes with no errors *(only required if the task touched `.ts`, `.tsx`, `.js`, `.jsx`, or `.css` files)*
- [ ] `npm run lint` passes with no errors *(same scope as above)*
- [ ] Changes are committed to the correct branch
- [ ] You have shown the user `git log --oneline -5` as proof
- [ ] If it touches UI: you have described what changed and where to verify it

Doc-only and config-only changes skip the build/lint checks but still
require the commit + `git log` proof.

Until all required boxes are checked, the task is IN PROGRESS. Say so.

---

## 7. What "Done" Does NOT Mean

- "I wrote the code" ≠ done
- "It should work" ≠ done
- "The logic is correct" ≠ done
- "I committed it" ≠ done if it's not on the right branch
- "It's merged" ≠ done without `git log` proof

<!-- END: blocktrivia-agent-rules -->
