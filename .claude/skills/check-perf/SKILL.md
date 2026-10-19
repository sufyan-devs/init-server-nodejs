---
name: check-perf
description: Audit the working diff (or given paths) against docs/standards/performance-practices.md — N+1 queries, loops over data in a request, missing indexes or pagination, deep OFFSET, event-loop blocking. Use for "will this scale", "check performance", "is this query ok".
---

# Check performance

Run the `perf-auditor` agent against the current working diff, or against the paths given as
arguments if there are any.

```
git diff HEAD --stat                        # scope, if no paths were given
git ls-files --others --exclude-standard src   # new files the diff does not show
```

Give it the hard constraints verbatim:

> NEVER run npm install, npm ci, npx (in any form), or add any package. NEVER run npm run build.
> You may run `npm run type-check`. Do NOT run `npm run lint:fix` — it edits files; the caller runs it.

Every finding must come with a **growth curve** — what happens at 10 rows vs 100k vs 1M — and the
performance-practices.md section it violates. Findings without one are speculation; drop them.

Two things get priority over everything else in this repo:

1. Any database read or write (MongoDB today, Postgres in the target) added to the auth hot path —
   `src/modules/auth/middlewares/authenticate.ts` and `verifySessionToken` in
   `src/modules/auth/services/session.service.ts`. Authentication is one Redis round trip and no
   database call (CLAUDE.md hard rule 7; performance-practices.md §11).
2. Any query inside a loop (N+1) — the single most common real cause of a slow endpoint.

Report only. Apply fixes only if the user asks; then run `npm run type-check` and `npm run lint:fix`.
