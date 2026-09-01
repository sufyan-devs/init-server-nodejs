---
name: check-perf
description: Audit the working diff (or given paths) against docs/standards/performance-practices.md — N+1 queries, loops over data in a request, missing indexes or pagination, deep OFFSET, event-loop blocking. Use for "will this scale", "check performance", "is this query ok".
---

# Check performance

Run the `perf-auditor` agent against the current working diff, or against the paths given as
arguments if there are any.

```
git diff HEAD --stat        # scope, if no paths were given
```

Every finding must come with a **growth curve** — what happens at 10 rows vs 100k vs 1M — and the
performance-practices.md section it violates. Findings without one are speculation; drop them.

Two things get priority over everything else in this repo:

1. Any Postgres read or write added to the auth hot path (`middlewares/authenticate.ts`) — see
   `docs/modules/auth/flows.md`. That path is Redis-only by design.
2. Any query inside a loop (N+1) — the single most common real cause of a slow endpoint.

Report only. Apply fixes only if the user asks; then re-run `npm run type-check`.
