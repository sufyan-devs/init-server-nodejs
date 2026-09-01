# init-server-nodejs

A reusable, production-grade Node.js API starter. Clone it, edit two seed arrays and a `.env`, and
you have auth, roles, permissions and the module structure already done — for any client, without
rewriting the core.

> ### ⚠️ Status: conversion in progress
>
> This repo began as a copy of a client codebase (Express + TypeScript + **MongoDB/Mongoose**) and
> is being converted into the reusable starter described below.
>
> **Built, compiling, and building to `dist/`** (not yet runtime-tested): Redis-backed sessions —
> one per device, token hashed at rest, device list and revoke, absolute 30-day cap, verified in
> **one Redis read with zero writes**. Plus our own Redis rate limiter, per-account lockout in Redis,
> pluggable login providers with Google, CSRF double-submit, enumeration-proof auth responses, a
> password policy with a breached-password check, a MongoDB audit log, and fail-fast env + Redis.
>
> **Deliberately not built:** access JWTs, refresh tokens and rotation. A JWT that still needs a
> server-side lookup adds crypto per request and buys nothing — see [docs/decisions.md](docs/decisions.md).
>
> **Still the legacy stack:** MongoDB/Mongoose for identity, and roles as a `ROLE_CODE` enum
> rather than data. `bcryptjs` remains only to verify pre-migration hashes — new passwords are
> argon2id, and each user is upgraded on their next login. Not yet built: Postgres + Prisma,
> permissions as database rows.
>
> **Do not start a client project on this yet.**

---

## Why this exists

Most starters give you a folder layout and a login route. The expensive parts of every new project
are the ones they leave out:

- **Roles and permissions are data, not code.** A new client's "regional manager who can approve
  vendors but not issue refunds" is a seed row. No code change, no redeploy.
- **Auth that survives production** — per-device sessions with instant revocation, account lockout,
  rate limiting, CSRF, enumeration defence, and an audit trail.
- **A module shape that scales to a team** — folder-per-audience so four developers work in four
  files instead of fighting over one.
- **Boundaries that are enforced, not aspirational** — lint-checked module facades, so the codebase
  is still comprehensible in year three.

Deliberately **not** over-engineered: no DDD layers, no speculative abstractions. Layers are added
only when a stated trigger says so ([docs/standards/project-structure.md](docs/standards/project-structure.md)).

---

## Stack

| | |
|---|---|
| Runtime | Node.js + **Express 5** + TypeScript (strict, path aliases) |
| Database | **PostgreSQL** + **Prisma v7** — multi-file schema, one `.prisma` per module |
| Cache / sessions | **Redis** |
| Auth | opaque session in an httpOnly per-portal cookie, Redis-backed, one per device |
| Authorization | RBAC with permissions as DB rows + `own` / `tenant` / `any` scope |
| Passwords | **argon2id** |
| Validation | **zod** — request edges and env, one source of truth |

Version pins and the reasoning behind each choice: [docs/decisions.md](docs/decisions.md).

---

## Requirements

- Node.js 20+
- **Redis 7+** (the rate limiter uses `EXPIRE ... NX`)
- PostgreSQL 14+ *(target stack — not needed to run it today)*
- npm

---

## Quickstart

```bash
git clone <this-repo> my-client-api
cd my-client-api
npm install
cp .env.example .env      # then fill in the required values
npm run dev
```

The server starts on `http://localhost:8000` (override with `PORT`).

> `npm run dev` needs **both** MongoDB and Redis running. Redis is not optional: sessions, lockout,
> rate limits and OTP all live there, so the server exits rather than boot without it.

### Scripts

| Command | Does |
|---|---|
| `npm run dev` | tsx + nodemon, watches `src/` |
| `npm run type-check` | `tsc --noEmit` |
| `npm run lint:fix` | ESLint with `--fix` |
| `npm run build` | compile to `dist/` and resolve path aliases |
| `npm run start:prod` | build, then run in production mode |
| `npm run seed:roles` | seed roles and permissions |
| `npm run seed:admin` | create the first admin user |

`npm run lint:fix` and `npm run type-check` must both pass before any commit.

---

## Starting a new client project

This is the whole point of the repo. Onboarding a client should touch **three files** — never a
controller.

1. **Rename** — `name` and `description` in `package.json`.
2. **Configure** — in `.env`: `MONGO_URI`, `REDIS_URL`, and real `JWT_SECRET` / `COOKIE_SECRET`
   values. Every variable in `.env.example` is read by the config; a bad one stops the server at
   boot and names itself. (Portals and the route prefix are not yet env-driven — they still come
   from the `ROLE_CODE` enum and a constant in `server.ts`.)
3. **Define the client's access model** — edit
   `src/modules/user/seed/permissions.ts` (the `resource:action` catalog) and
   `src/modules/user/seed/roles.ts` (roles and their scoped grants), then run `npm run seed:roles`.
4. **Add the business modules** — one folder each, using the `/new-module` recipe.
5. **Delete what you do not need** — the example business modules ship separately from the core.

**The test that keeps this true:** if adding a role requires opening a controller, the design has
drifted. Fix the starter, not the client project.

---

## Project layout

```
src/
├─ server.ts               # boot, middleware, mount, graceful shutdown
├─ config/                 # env (fail-fast, validated), database, redis
├─ constants/              # error catalogs, permission keys
├─ middlewares/            # authenticate, rateLimit, csrf, validate, errors
├─ routes/index.ts         # module registry — one line per module
├─ types/                  # express.d.ts — req.user, req.sessionId
├─ utils/                  # response, apiError, logger, redisKeys, format, otp
└─ modules/<domain>/
   ├─ index.ts             # front door: register(router) + the module's public facade
   ├─ routes/<audience>/   # admin · vendor · customer · public
   ├─ validators/          # zod — body, query and params
   ├─ controllers/         # thin: req → service → res
   ├─ services/            # business rules, callable from jobs, CLI and tests
   ├─ models/<Entity>/     # 3 files: index.ts · types.ts · schema.ts (repo.ts under Prisma)
   └─ seed/
docs/                      # see docs/README.md

prisma/ is the target layout, not yet present.
```

Full anatomy and the reasoning:
[docs/standards/project-structure.md](docs/standards/project-structure.md).

---

## Conventions

1. **Official docs before writing config or calling an API** — for the *pinned* version. Record the
   version and date checked next to the decision.
2. **Cross-module imports go through `modules/<x>/index.ts`.** Never reach into another module's
   internals.
3. **Controllers never touch the ORM.** Controller → service → `models/<X>/repo.ts`.
4. **Roles and permissions are data.** Never a hardcoded role check in a route or controller.
5. **No secret fallbacks.** Env is validated at boot and fails loudly.
6. **Nothing on the auth hot path may hit the database.** One Redis read, no writes.
7. **Do not over-engineer.** Split a file only on a trigger, never pre-emptively.

---

## Claude Code setup

The repo ships with a configured Claude Code workspace so reviews and scaffolding are one command
instead of a re-typed prompt each time.

| Command | Does |
|---|---|
| `/preflight` | the pre-commit gate — lint, type-check, then three audits in parallel, consolidated |
| `/check-code` | audit the diff against the coding standards |
| `/check-perf` | audit for N+1s, missing indexes, hot-path regressions |
| `/check-structure` | audit placement and module boundaries |
| `/new-module` | scaffold a module in the correct order |
| `/docs-first` | enforce the pinned-version documentation rule |
| `/verify-docs` | re-check documentation claims against the code |

Backed by three subagents in `.claude/agents/`. `CLAUDE.md` is the project context loaded every
session — keep it current when decisions change.

---

## Documentation

| | |
|---|---|
| [docs/README.md](docs/README.md) | index and documentation conventions |
| [docs/decisions.md](docs/decisions.md) | design of record — decisions, findings, build order, open questions |
| [docs/modules/auth/](docs/modules/auth/README.md) | how auth works, with diagrams |
| [docs/standards/](docs/standards/project-structure.md) | structure, coding and performance standards |

---

## Roadmap

| Scope | Status |
|---|---|
| Redis session layer — per device, hashed, absolute cap, one read per request | ✅ built |
| Rate limiting — own Redis layer, per-IP, pipelined | ✅ built |
| Account lockout in Redis, cleared by password reset | ✅ built |
| Pluggable login providers — password + Google | ✅ built |
| CSRF double-submit on state-changing routes | ✅ built |
| Enumeration defence + password policy (12 chars, HIBP) | ✅ built |
| Audit log (MongoDB) | ✅ built |
| argon2id hashing, with transparent bcrypt→argon2 upgrade on login | ✅ built |
| zod validation at the request edge | ✅ built |
| Prisma v7 + Postgres foundation | ⬜ |
| Authorization — permission catalog, `requirePermission`, scope resolver | ⬜ |
| Reuse layer — CRUD factory, shared filter/sort/search, pagination | ⬜ |
| Ship-ability — docker-compose, tests, CI | ⬜ |
| Remove the inherited product-specific modules | ⬜ |

Open questions blocking some of these: [docs/decisions.md](docs/decisions.md).
