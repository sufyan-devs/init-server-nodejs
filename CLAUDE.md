# CLAUDE.md — project context

**What this is:** a reusable production-grade Node.js starter server, cloned for each new client
project. It is a converted copy of an inherited client codebase.

**Current state:** mid-conversion. `npm run type-check` passes (2026-10-19); not runtime-tested
end to end since 2026-09-01.

**Built:** Redis sessions — one per device, `sess:<sid>` holding a hashed secret,
`GET`/`DELETE /sessions`, absolute 30-day cap, and a session only authenticates on the portal it was
created for. Authenticating a request is **one Redis round trip and no database call** (hard rule 7).
Plus our own Redis rate limiter, Redis lockout counters, Google ID-token login (the only provider),
CSRF double-submit, enumeration-proof auth responses, a password policy with HIBP, a MongoDB audit
log, and fail-fast env + Redis at boot. Deleted: the Mongo `LoginSession` model, the lockout/OTP
columns on `users`, `JWT_SECRET`, and the password provider.

**Where things live:** auth middlewares (`authenticate`, `authorizeRoles`, `verifyCsrf`) are in
`modules/auth/middlewares/` and exported from `@auth/index`; the old `authHelper` is
`modules/auth/services/auth.service.ts`; every Redis key builder is in `utils/redisKeys.ts`; the one
portal map is in `utils/cookieHelper.ts`. `catchAsync` is kept: it types handlers, although
Express 5 also forwards rejected promises.

**Core vs product:** the reusable core is `src/config`, `constants`, `middlewares`, `routes`,
`utils`, `scripts`, `types`, `server.ts`, and modules `auth`, `user`, `audit`, `notification`.
Modules `referral` and `dashboard` are an inherited client's product. The core imports
them only in `src/routes/index.ts`; auth reaches referral only through the signup hook
(`modules/auth/signupHooks.ts`). Removal steps: [README.md](README.md#starting-a-new-client-project).

**Deliberately NOT built** (see docs/decisions.md, settled 2026-08-24): access JWTs, refresh tokens,
rotation, reuse detection, and the epoch counter. A JWT that still needs a Redis lookup adds crypto
per request and buys nothing; opaque sessions revoke instantly. Add JWTs only when a client needs
cross-service or edge identity.

**Still legacy:** Mongoose for identity; several controllers query Mongoose models directly;
`ROLE_CODE` as an enum; `authorizeRoles` checking `availableRoles`, which is a snapshot taken at
login — a role change in the database does not reach a live session. `bcryptjs` is retained ONLY to
verify pre-migration `$2` hashes; new passwords are argon2id and users upgrade on their next login.

**Target design — not built:** Postgres + Prisma v7, permissions as database rows with
`own`/`tenant`/`any` scope, `requirePermission`, and a `models/<X>/repo.ts` for every entity.

Decisions and open questions: [docs/decisions.md](docs/decisions.md). How the runtime fits
together: [docs/platform/](docs/platform/README.md).

## Stack (pinned decisions — docs/decisions.md)

| | Decision | Today |
|---|---|---|
| Runtime | Node + **Express 5** (TC's production-recommended release; v5 auto-forwards async errors) | built — `express ^5.3.0` |
| Language | TypeScript, path aliases (`@auth/*`, `@user/*`, `@config/*` …) — never `../../../` | built |
| DB / ORM | PostgreSQL + **Prisma v7** (multi-file schema, `prisma.config.ts`, `prisma-client` generator). Prisma 8 is RC only — do not adopt yet | **target — not built.** MongoDB + Mongoose |
| Cache | Redis (sessions, lockout counters, rate limits, OTP, password-reset sessions) | built |
| Auth | opaque session in a per-portal httpOnly cookie, Redis-backed (no JWT — see docs/decisions.md) | built |
| Authz | RBAC with **permissions as DB rows** + `own`/`tenant`/`any` scope | **target — not built.** `ROLE_CODE` enum + `authorizeRoles` |
| Hashing | **argon2id** (`m=19456, t=2, p=1`), bcryptjs kept only to verify legacy hashes | built |
| Validation | **zod v4** at the request edge (`middlewares/validate.ts`); Joi removed | built. Env is checked by `readInt`/`requireSecret`, not zod |

## Commands

```bash
npm run dev          # tsx + nodemon
npm run type-check   # tsc --noEmit
npm run lint:fix     # eslint --fix
npm run build        # tsc + tsc-alias — owner only, see hard rule 0
npm run seed         # seed:roles, then seed:users
npm run db:reset -- <dbName>  # drop Mongo, flush the app's Redis db, re-seed; must name the db (refuses in production)
```

`npm run lint:fix` and `npm run type-check` must both pass before any commit.

## Hard rules

0. **NEVER install, NEVER build.** No `npm install`, no `npm ci`, no `npx`, no adding a package —
   not even to run `tsc` or `eslint`. And no `npm run build`: a build is for shipping, and the
   owner runs it when ready to commit. The owner's machine cannot absorb either; both hang it.
   **The development gate is `npm run type-check` + `npm run lint:fix`** — cheap, and they catch
   everything a build would except the emit step. If work genuinely needs a new package, **stop and
   say so**. This applies to every subagent too; put it in their instructions.
1. **Official docs before config or API calls.** Fetch the doc page for the *pinned* version —
   especially Prisma (v7; most tutorials online are v5/v6). Record version + date checked next to
   the decision. See `/docs-first`.
2. **Cross-module imports go only through `@<module>/index`** — never `@auth/services/...`.
   **Exception: models**, which may be imported directly (`@user/models/User`), because routing
   models through `index.ts` creates load-order cycles. Same rule:
   docs/standards/project-structure.md §12.
3. **Controllers never touch the database.** Controller → service → `models/<X>/repo.ts`. That
   chain is the target (with Prisma); today legacy controllers still call Mongoose models directly
   — do not add new ones.
4. **Roles and permissions are data, not enums.** If a new client role requires editing a
   controller, the design has drifted — stop and fix the starter. (Today a new role code still
   needs `ROLE_CODE` and the role→portal map in `utils/cookieHelper.ts` edited: known drift.)
5. **No hardcoded secret fallbacks.** `COOKIE_SECRET` throws at boot when missing, `MONGO_URI` is
   required in production, and every numeric env value — `PORT` included — goes through `readInt`:
   a bad value names itself and stops the process.
6. **No product-specific config in `src/config/`.** Module config lives in the module
   (`modules/<x>/config.ts`; no module needs one today).
7. **Nothing on the auth hot path may hit the database.** Authenticating a request costs one Redis
   round trip (GET + TTL in one MULTI on the session key) and no database call. It writes only when
   less than half the session TTL remains: an EXPIRE on the session key and on its user index,
   fire-and-forget. (The global rate limiter, INCR + EXPIRE NX + TTL, also runs on every API
   request — that is the limiter, not authentication.)
8. Responses only via `utils/response.ts` / `utils/apiError.ts`. Logging only via `utils/logger`.
9. Match the surrounding code: folder-per-audience, `index.ts` front doors, PascalCase model
   folders, `UPPER_SNAKE as const` enums.
10. **Do not over-engineer, over-abstract or over-comment.** Build what was asked, not the general
    case of it. Delete any abstraction with fewer than three real callers, any unrequested config
    option, any layer added "for flexibility", any handling for a state that cannot occur, and any
    folder created before it has content. Comments explain *why*, never *what* — match the comment
    density of the surrounding file, which in this repo is close to zero. Split a file only when a
    stated trigger fires (docs/standards/project-structure.md), never pre-emptively.
    The missing abstraction costs one refactor; the wrong abstraction costs every developer forever.
11. **Documentation must be verifiably true.** Every claim about code is read out of that code and
    cited as `file:line` — never written from memory or from the design. Never describe unbuilt
    design as if it exists: every page carries a status line. Write for a stranger, in plain
    language, with a real-world example for anything non-obvious. Update the page in the **same
    commit** as the code. Full rules: [docs/README.md](docs/README.md).

## Documentation

Everything lives under [docs/](docs/README.md) — index and conventions are in `docs/README.md`.

| Doc | What it is |
|---|---|
| [docs/decisions.md](docs/decisions.md) | Settled decisions, what was deliberately not built, open questions |
| [docs/modules/auth/](docs/modules/auth/README.md) | How auth works, with diagrams |
| [docs/platform/](docs/platform/README.md) | Request lifecycle, Redis, rate limiting, config, scaling |
| [docs/standards/project-structure.md](docs/standards/project-structure.md) | Folder layout, module anatomy, boundaries |
| [docs/standards/coding-practices.md](docs/standards/coding-practices.md) | The 10 principles + pre-commit checklist |
| [docs/standards/performance-practices.md](docs/standards/performance-practices.md) | High-traffic rules (N+1, indexes, pagination) |

The three `standards/` docs are the law. **Cite section numbers when applying them; never restate
their content in new files** — one source of truth. New module docs go in
`docs/modules/<domain>/`, following the shape of `docs/modules/auth/`.

## Skills

`/preflight` (run before every commit) · `/check-code` · `/check-perf` · `/check-structure` ·
`/new-module` · `/docs-first` · `/verify-docs`
