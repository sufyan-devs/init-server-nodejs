---
name: docs-first
description: Enforces this project's standing rule — read the official docs for the pinned version before writing config or calling a library API, and prefer the modern path over the beginner default. Use before scaffolding Prisma, Redis, Express, zod, argon2 or BullMQ config, or when unsure whether an API is current.
---

# Docs first

The standing rule is CLAUDE.md hard rule 1. This starter is written once and reused for years, so
the cost of writing config from memory — or from a tutorial targeting an older major — is paid
repeatedly.

## The rule

1. **Before using a feature, open that tool's official docs for the exact version pinned in
   `package.json`.** Not blogs, not tutorials, not memory, not an older major.
2. **Prefer the tool's advanced/modern path over the beginner default** when it costs nothing extra.
3. **Record the version + date checked** next to the decision, the way the "Settled" table in
   `docs/decisions.md` dates every row.

## When this triggers

Any time you are about to write a config block, a generator block, a client initialisation, or call
an API you have not verified this session. Especially:

| Tool | Trap |
|---|---|
| **Prisma v7** | **Not installed** — target design, not built. Adding it is an install, which the owner does: stop and say so (CLAUDE.md hard rule 0). When it lands: most online material is v5/v6. `prisma-client-js` is **deprecated** — use the `prisma-client` generator with a required `output`. `adapter`, `engine`, `directUrl`, `studio` were **removed** from `prisma.config.ts` in v7. Prisma **8 is RC only** (`prisma@next`) — do not adopt it for client work; check whether it has gone stable before assuming v7 is still current |
| **Express** | v4 and v5 docs are interleaved online. **v5 is decided** and `package.json` pins `express ^5.3.0`. v5 forwards a rejected promise from an async handler to the error middleware; `catchAsync` is kept anyway for typed handlers (`docs/standards/project-structure.md` §13B). v5 also makes `req.query` a getter (`src/middlewares/validate.ts:36`) |
| **node-redis** | The client is `src/utils/redisClient.ts`, on `redis ^5` (`package.json`). v3/v4 examples do not work on v5 — check the v5 docs before changing the client or using a command for the first time |
| **zod** | v3 and v4 APIs differ. Pinned: **v4** (`zod ^4.5.4`) |
| **argon2** | parameters must come from current OWASP guidance, then be benchmarked on the real prod box (`docs/modules/auth/security.md`) |
| **BullMQ** | Not installed. API has moved repeatedly across majors |

## How to do it

- Fetch the actual doc page (WebFetch/WebSearch) for the pinned major before writing the code.
- If the pinned version is behind the current stable, say so and let the owner decide — do not
  silently upgrade, and never install anything yourself.
- When you finish, add a line next to the decision: `verified against <tool> <version> docs on
  <date>`. If a decision in `docs/decisions.md` turns out to be stale, correct it there rather than
  working around it.

## What not to do

Do not write a config block "roughly right" and plan to fix it when it errors. Config that is
subtly wrong but does not throw — a missing `omit`, a TTL that resets on every write, a pool sized
by default — is exactly the kind of thing that survives to production.
