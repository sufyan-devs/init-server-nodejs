# init-server-nodejs

A reusable Node.js API starter. Clone it, set a `.env`, edit the seed arrays, and you have sessions,
login, lockout, rate limiting and a module structure already done — without rewriting the core.

> ### ⚠️ Status: conversion in progress
>
> **Verified against the code on 2026-10-19.** `npm run type-check` passes; the code has not been
> runtime-tested end to end since the 2026-09-01 checks recorded in
> [docs/modules/auth/flows.md](docs/modules/auth/flows.md).
>
> This repo began as a copy of a client codebase (Express + TypeScript + **MongoDB/Mongoose**) and
> is being converted into the starter described below.
>
> **Built:** Redis-backed sessions — one per device, secret hashed at rest, device list and revoke,
> absolute 30-day cap, and a session works only on the portal it was created for. Authenticating a
> request costs **one Redis round trip and no database call**. Plus our own Redis rate limiter,
> per-account lockout in Redis, Google ID-token login, CSRF double-submit, enumeration-proof auth
> responses, a password policy with a breached-password check, a MongoDB audit log, admin approval
> of role requests with role changes written into live sessions, and fail-fast env + Redis at boot.
>
> **Deliberately not built:** access JWTs, refresh tokens and rotation. A JWT that still needs a
> server-side lookup adds crypto per request and buys nothing — see [docs/decisions.md](docs/decisions.md).
>
> **Still the legacy stack:** MongoDB/Mongoose, and roles as a `ROLE_CODE` enum rather than data.
> `bcryptjs` remains only to verify pre-migration hashes — new passwords are argon2id, and each user
> is upgraded on their next login.
>
> **Target design — not built:** Postgres + Prisma v7, permissions as database rows with scope.
>
> **Do not start a client project on this yet.**

---

## Why this exists

Most starters give you a folder layout and a login route. The expensive parts of every new project
are the ones they leave out:

- **Auth that survives production** — per-device sessions with instant revocation, account lockout,
  rate limiting, CSRF, enumeration defence, and an audit trail. *Built.*
- **A module shape that scales to a team** — folder-per-audience, so four developers work in four
  files instead of fighting over one. *Built.*
- **A core you can keep and a product you can delete** — the reusable modules do not depend on the
  example business modules (see [below](#starting-a-new-client-project)). *Built.*
- **Roles and permissions as data, not code** — a new client's "regional manager who can approve
  vendors but not issue refunds" becomes a seed row. *Target design — not built:* today a new role
  still needs a code change (see step 3 below).

Module boundaries are a convention, checked in review and by `/check-structure`. No lint rule
enforces them.

Deliberately **not** over-engineered: no DDD layers, no speculative abstractions. Layers are added
only when a stated trigger says so ([docs/standards/project-structure.md](docs/standards/project-structure.md)).

---

## Stack

| | Target (pinned decision) | Today |
|---|---|---|
| Runtime | Node.js + **Express 5** + TypeScript (strict, path aliases) | Express `^5.3.0` (`package.json:28`) |
| Database | **PostgreSQL** + **Prisma v7**, one `.prisma` file per module | **MongoDB + Mongoose** — Prisma not built |
| Cache / sessions | **Redis** | built |
| Auth | opaque session in an httpOnly per-portal cookie, Redis-backed, one per device | built |
| Authorization | RBAC with permissions as DB rows + `own` / `tenant` / `any` scope | **not built** — `ROLE_CODE` enum checked by `authorizeRoles` |
| Passwords | **argon2id** | built |
| Validation | **zod v4** at the request edge | built (`src/middlewares/validate.ts`). Env is checked by `readInt` / `requireSecret` in `src/config/env.ts`, not by zod |

Version pins and the reasoning behind each choice: [docs/decisions.md](docs/decisions.md).

---

## Requirements

- Node.js 20+
- **Redis 7+** (the rate limiter uses `EXPIRE ... NX`, `src/utils/redisKeys.ts:136-138`)
- MongoDB (today's database)
- PostgreSQL 14+ *(target stack — not needed to run it today)*
- npm

---

## Quickstart

```bash
git clone <this-repo> my-client-api
cd my-client-api
npm install
cp .env.example .env      # then set COOKIE_SECRET — the server will not boot without it
npm run seed              # roles, then one account per portal
npm run dev
```

The server starts on `http://localhost:8000` (override with `PORT`, `src/config/env.ts:176`).

> `npm run dev` needs **both** MongoDB and Redis running. Redis is not optional: sessions, lockout,
> rate limits and OTP all live there, so the server exits rather than boot without it
> (`src/server.ts:121-125`).

Outside production, `npm run seed:users` creates `admin@test.com`, `vendor@test.com`, `ba@test.com`
and `customer@test.com` (`src/modules/user/seed/users.ts:19-29`). They share one password: the value
of `SEED_ADMIN_PASSWORD`, or a development default that the script prints when it runs
(`users.ts:31-37`, `76-78`). In production only the admin is seeded, and `SEED_ADMIN_PASSWORD` is
required.

### Scripts

From `package.json:5-15`:

| Command | Does |
|---|---|
| `npm run dev` | tsx + nodemon, watches `src/` |
| `npm run type-check` | `tsc --noEmit` |
| `npm run lint:fix` | ESLint with `--fix` |
| `npm run build` | compile to `dist/` and resolve path aliases |
| `npm run start:prod` | build, then run in production mode |
| `npm run seed` | `seed:roles`, then `seed:users` |
| `npm run seed:roles` | upsert the roles in `src/modules/user/seed/roles.ts` |
| `npm run seed:users` | create the admin (and, outside production, one test user per portal) |
| `npm run db:reset -- <dbName>` | drop the Mongo database, flush the app's Redis db, re-seed. You must name the database it resolved to (e.g. `npm run db:reset -- app`), or it refuses; it also refuses in production (`src/scripts/reset-db.ts:10-24`) |

`npm run lint:fix` and `npm run type-check` must both pass before any commit.

---

## API testing with Postman

`postman_collection.json` runs the whole API end to end. The full QA steps are in the collection's
own description (its Overview tab in Postman). In short:

1. **Reset a QA database before every full run:** `npm run db:reset -- <dbName>`. The run creates
   fixed accounts, so a second run without a reset fails on duplicates.
2. **Raise the login limit:** set `RATE_LIMIT_LOGIN_MAX=1000` (default 30, `src/config/env.ts:258`).
   The run logs in about 25 times from one IP. Leave `RATE_LIMIT_ENABLED` on — one request checks
   the rate-limit headers.
3. **Import** `postman_collection.json` and set the `{{password}}` variable to the seed password
   (`Qa-Test-99` unless `SEED_ADMIN_PASSWORD` is set, `src/modules/user/seed/users.ts:31-37`).
4. **Run the folders in order, top to bottom.** Each folder creates what the next one uses (for
   example the associate's referral code, which the vendor signs up with); test scripts carry the
   ids forward.
5. **The 20 `[manual] ...` requests need a person.** Most need a code sent by email, so SMTP must be
   configured (`EMAIL_HOST`, `EMAIL_USER`, `EMAIL_PASSWORD`, `src/config/env.ts:205-211`). The
   Google ones need a real Google ID token issued for a client ID in `GOOGLE_CLIENT_IDS`
   (`env.ts:305`). Skip them in an unattended run — no other request depends on them.

---

## Starting a new client project

1. **Rename** — `name` and `description` in `package.json`.
2. **Configure** — in `.env`: `COOKIE_SECRET` (always required, `src/config/env.ts:195`),
   `MONGO_URI` (required in production, `env.ts:180`), `ALLOWED_ORIGINS` (required in production,
   `src/server.ts:114-117`), `REDIS_URL`, and `APP_NAME` / `APP_LOGO_URL` for email branding.
   `.env.example` lists every variable with its default. A number that is not a valid integer stops
   the server at boot and names itself (`env.ts:145-154`).
3. **Define the client's roles** — edit `src/modules/user/seed/roles.ts`, then run
   `npm run seed:roles`. **Today this only covers the five existing role codes.** A new role code
   must also be added to `ROLE_CODE` (`src/modules/user/models/Role/types.ts:10-16`, which the schema
   enforces as an enum) and to the role→portal map (`src/utils/cookieHelper.ts:15-21`). That is the
   drift CLAUDE.md hard rule 4 names. The target — permissions as rows, granted to roles by seed — is
   in [docs/modules/auth/authorization.md](docs/modules/auth/authorization.md) and is not built.
4. **Add the business modules** — one folder each, using the `/new-module` recipe.
5. **Delete the example product modules** if the client does not need them. `referral` and
   `dashboard` are an inherited client's product, not core. Nothing in the core imports them except
   `src/routes/index.ts`. To remove them:
   - delete `src/modules/referral/` and `src/modules/dashboard/`;
   - delete their two imports and two `register` calls in `src/routes/index.ts` (lines 5-6 and
     18-19);
   - delete the `@referral/*` and `@dashboard/*` aliases in `tsconfig.json:33-34`.

   Auth reaches referral only through two hooks, a signup hook and a role-approved hook
   (`src/modules/auth/signupHooks.ts`, set at `src/modules/referral/index.ts:10-11`). With referral
   gone no hook is set: the optional `referralCode` field on register
   (`src/modules/auth/validators/index.ts:22,36`) is ignored, and approving a role runs nothing
   extra (`signupHooks.ts:36,38-40`).

**The test that keeps this true:** if adding a role requires opening a controller, the design has
drifted. Fix the starter, not the client project.

---

## Project layout

```
src/
├─ server.ts               # boot order, middleware chain, mount, shutdown on SIGINT/SIGTERM
├─ config/                 # env.ts (fail-fast, readInt) · database.ts (Mongo connect/disconnect)
├─ constants/              # authErrors.ts — the AUTH_ERRORS catalog
├─ middlewares/            # requestId, httpLogger, rateLimit, validate, errorMiddleware
├─ routes/index.ts         # module registry — one register(router) call per module
├─ scripts/                # reset-db.ts
├─ types/                  # express.d.ts — req.user, req.sessionId, req.requestId
├─ utils/                  # response, apiError, logger, redisClient, redisKeys, cookieHelper,
│                          # catchAsync, format, mongoHelper
└─ modules/
   ├─ auth · user · audit · notification     # core
   ├─ referral · dashboard                   # product example — deletable (step 5 above)
   └─ <domain>/
      ├─ index.ts             # front door: register(router) + what other modules may import
      ├─ routes/<audience>/   # admin · vendor · associate · customer · public
      ├─ validators/          # zod — body, query and params
      ├─ controllers/<audience>/
      ├─ services/
      ├─ models/<Entity>/     # index.ts · types.ts · schema.ts (Mongoose)
      └─ seed/
docs/                      # see docs/README.md
```

Not every module has every folder. `auth/models/Session/` has `repo.ts` instead of `schema.ts`,
because sessions live in Redis. Under the Prisma target every entity gets a `repo.ts` — not built.
There is no `prisma/` folder yet.

Full anatomy and the reasoning:
[docs/standards/project-structure.md](docs/standards/project-structure.md).

---

## Conventions

The rules live in one place: the **Hard rules** in [CLAUDE.md](CLAUDE.md), and the three
[docs/standards/](docs/standards/project-structure.md) files. They are not repeated here.

---

## Claude Code setup

The repo ships with a configured Claude Code workspace, so reviews and scaffolding are one command
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
| [docs/decisions.md](docs/decisions.md) | settled decisions, what was deliberately not built, open questions |
| [docs/platform/](docs/platform/README.md) | request pipeline, Redis, rate limiting, config, database, scaling |
| [docs/modules/auth/](docs/modules/auth/README.md) | how auth works, with diagrams |
| [docs/standards/](docs/standards/project-structure.md) | structure, coding and performance standards |

---

## Roadmap

| Scope | Status |
|---|---|
| Redis session layer — per device, hashed, absolute cap, portal-bound, one Redis round trip per request | ✅ built |
| Rate limiting — own Redis layer, per IP, plus per account on OTP routes | ✅ built |
| Account lockout in Redis, cleared by password reset | ✅ built |
| Pluggable login providers — Google (the only provider; password login is the core flow) | ✅ built |
| CSRF double-submit on state-changing routes | ✅ built |
| Enumeration defence + password policy (8 chars minimum by default, HIBP) | ✅ built |
| Audit log (MongoDB) | ✅ built |
| argon2id hashing, with transparent bcrypt→argon2 upgrade on login | ✅ built |
| zod validation at the request edge | ✅ built |
| Express 5 | ✅ `package.json:28` |
| Core separated from the example product modules | ✅ built — whether the starter keeps shipping them is open ([decisions.md](docs/decisions.md), question 2) |
| Prisma v7 + Postgres foundation | ⬜ |
| Authorization — permission catalog, `requirePermission`, scope resolver | ⬜ |
| Reuse layer — CRUD factory, shared filter/sort/search, pagination | ⬜ |
| Ship-ability — docker-compose, tests, CI | ⬜ |

Open questions blocking some of these: [docs/decisions.md](docs/decisions.md).
