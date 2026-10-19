# Decisions

> **Verified against the code on 2026-10-19.** Each settled row says whether it is built today or
> is target design. When something here changes, change it **here** — no second copy anywhere else.

---

## Settled

| Decision | Why | Date | Today |
|---|---|---|---|
| **One repo, not one per database** | Auth is the asset. Two repos means writing every security fix twice and backporting forever. A client's clone adapts after cloning | 2026-08-23 | policy |
| **PostgreSQL + Prisma v7** as the default | v8 is an RC — a moving target with no LTS. Mongo is unsupported on v7 and is a per-client decision | 2026-08-23 | **target — not built.** MongoDB + Mongoose (`src/config/database.ts:6-16`) |
| **Express 5** | The Technical Committee's production-recommended release; v4 sunsets. v5 auto-forwards rejected promises to the error handler | 2026-08-23 | built — `express ^5.3.0` (`package.json:28`) |
| **Keep `catchAsync`** under Express 5 | It still gives every handler one typed signature; v5's own forwarding makes it redundant only for error flow | 2026-10-19 | built (`src/utils/catchAsync.ts`) |
| **zod v4** over Joi, at the request edge | Better type inference; one schema is both the check and the type | 2026-08-23 | built (`src/middlewares/validate.ts`). Env is **not** validated by zod — `readInt` and `requireSecret` in `src/config/env.ts:132-160` do it |
| **argon2id** over bcryptjs | Current OWASP guidance; bcryptjs is the slowest implementation | 2026-08-23 | built (`src/modules/auth/services/password.service.ts:16-21`) |
| **Sessions in Redis, identity in the database** | Losing a session is a re-login; losing a user is unrecoverable | 2026-08-24 | built |
| **Roles and permissions as data**, not enums | A new client role must be a seed row, never a code change and a redeploy | 2026-08-23 | **target — not built.** Roles are the `ROLE_CODE` enum (`src/modules/user/models/Role/types.ts:10-16`, enforced by `Role/schema.ts:11`) |
| **Per-portal cookies, from one portal map** | An admin cookie cannot be replayed against the customer API | 2026-08-23 | built. `PORTAL` and the role→portal map are in `src/utils/cookieHelper.ts:6-32`; cookie name = `COOKIE_NAME` + `_<portal>`. A session presented on another portal is rejected (`session.service.ts:173-176`). Portals are code, not env |
| **Our own rate limiter** | One small file (`src/middlewares/rateLimit.ts`) plus one Redis helper (`src/utils/redisKeys.ts:124-168`); owning it means shared connection, key convention and failure policy | 2026-08-24 | built |
| **Limiter fails open, auth fails closed** | Failing closed on limits turns a cache outage into a total outage; auth failing closed protects data | 2026-08-24 | built — limiter `rateLimit.ts:100-108`; `authenticate` passes a Redis error on as a 5xx, not a 401 (`modules/auth/middlewares/authenticate.ts:30-31,51-52`) |
| **Providers are pluggable, identity is generic** | Adding Google/Apple/GitHub must never need a migration, a route or a session change | 2026-08-24 | built — Google is the only provider (`modules/auth/providers/registry.ts:4-6`) |
| **Cross-module imports only via `@<module>/index`; models may be imported directly** | Routing models through `index.ts` creates load-order cycles | 2026-10-19 | rule — [project-structure.md §12](standards/project-structure.md) |
| **Core and product are separate** | The core (config, constants, middlewares, routes, utils, scripts, types, `server.ts`; modules auth, user, audit, notification) must survive deleting `coupon`, `referral`, `dashboard`. The core imports them only in `src/routes/index.ts:5-7,19-21`; auth reaches referral only through a signup hook (`modules/auth/signupHooks.ts`) | 2026-10-19 | built — removal steps in [README.md](../README.md#starting-a-new-client-project) |
| **Unbuilt design stays in the docs, marked** | Postgres + Prisma, permission rows, `requirePermission` and `models/<X>/repo.ts` are the plan; deleting them loses the plan, leaving them unmarked misleads | 2026-10-19 | policy — every such page or section says "Target design — not built" |
| **Never install dependencies** | The owner's machine cannot absorb it — report the need instead | 2026-08-24 | policy |

### Rejected, do not resurrect

- **DDD layering** per module (`domain/ application/ infrastructure/`) — over-engineered here.
- **Flattening modules** to one `routes.ts` + one `controller.ts` — breaks parallel team work.
- **Drizzle** — Prisma chosen.
- **Users or roles in Redis** — see [platform/redis.md](platform/redis.md).
- **A database-agnostic abstraction layer** — you get the intersection of SQL and Mongo, which is
  worse than either.

---

## Settled after research — 2026-08-24

Both approved and implemented. They only removed code; nothing a client can do changed.

### Drop the access-JWT layer from the default design

The original plan was a short-lived access JWT plus a rotating opaque refresh token. **What is
built** is an opaque session in a cookie, looked up in Redis (`modules/auth/services/session.service.ts:154-180`).

Researched 2026-08-24. The consensus is that a JWT which still requires a server-side lookup on
every request has given up the only thing JWTs buy you: *"once you're maintaining server-side state
to validate tokens, you have lost the primary architectural benefit of JWTs and have a more complex
system with additional cryptographic overhead on every request"*
([reptile.haus](https://reptile.haus/journal/stop-defaulting-to-jwts-choosing-the-right-session-architecture-in-2026/)).

That described the planned design exactly — verify a signature, *then* read Redis for the session,
*then* read the epoch. The JWT adds crypto per request and buys nothing, because permissions
deliberately do not live in the token.

JWTs earn their place in microservices, at the edge, or for third-party consumers. This starter is a
single Express app. **Decision: opaque sessions are the default; add the JWT layer the day a client
actually needs cross-service identity.** That also removed refresh rotation, reuse detection and the
refresh-token race — a large amount of code and one genuinely hard concurrency problem, for a
benefit no current client has. `JWT_SECRET` no longer exists (`src/config/env.ts` reads no such
variable). `jsonwebtoken` stays as a dependency only to verify Google ID tokens
(`modules/auth/providers/google.ts:8`).

### Drop the epoch counter

It exists to kill tokens you cannot enumerate. We *can* enumerate: `user:<id>:sessions` indexes
every live session, so logout-all and suspension delete them directly
(`modules/auth/models/Session/repo.ts:119-123`).

It cost a second Redis read on every authenticated request. **Removed; authentication is now one
Redis round trip** — `GET` and `TTL` on the session key in one `MULTI` (`src/utils/redisKeys.ts:71-76`,
`Session/repo.ts:96-101`). Reinstate it only if the JWT layer ever comes back, because stateless
tokens genuinely need it.

### Built instead, because the research says a cookie-based API needs them

| | Why |
|---|---|
| **CSRF** — stateless double-submit | Cookie auth is forgeable cross-site by definition, and we had no defence |
| **Enumeration defence** | Distinct errors, a 409 on register, and an unhashed early return all leaked which emails exist |
| **Password policy** — ≥8 chars by default (`src/config/env.ts:283`), no composition rules, HIBP k-anonymity | Length beats composition (NIST/OWASP); fails open so an outage cannot block signups |
| **Audit log** — MongoDB, durable | Once every response is deliberately generic, this is the only place the real reason is recorded |
| **Absolute session cap** — 30 days (`env.ts:6`) | A sliding TTL alone lets a stolen cookie live forever while it keeps being used |
| **Display fields cached in the session** | Removes the last database read from the auth hot path; see below for what it costs |

### Display fields live in the session record (settled 2026-09-01)

`authenticate` used to do one Redis read **and** a `User.findById`, purely to fill the `email`,
`firstName`, `lastName`, `emailVerified` and `profileImage` that `req.user` promises. Those five
fields are now copied into the session at login (`modules/auth/models/Session/types.ts:21-29`), so
the hot path makes **no database call at all** (`modules/auth/middlewares/authenticate.ts:19-28`).

That read was doing a second, unadvertised job: enforcing `user.status === ACTIVE`. Removing it
without replacement would let a **suspended account keep working sessions for up to 30 days** — a
security regression disguised as a performance win. So suspension now revokes every session for that
user (`revokeUserSessions`, `modules/auth/index.ts:25-26`), and the two events that change a cached
field — profile edits and email verification — rewrite the copy in place (`syncSessionUser`,
`modules/auth/index.ts:28-29`).

**The trade-off we accepted:** every write that touches a display field must call one of those
functions, and a missed call shows up as stale data in `/me` rather than as a test failure. That is
8 call sites today: 4 admin in `user/controllers/admin/managedUser.ts:235,250,274,290`, 3
self-service in `user/controllers/shared/profile.ts:36,50,66`, and 1 email verification, which
calls `sessionService.syncUser` directly (`modules/auth/controllers/shared/emailVerification.ts:43`).
The alternative — re-reading the user on every request — costs a database round trip on *every
authenticated request forever*, which is the thing hard rule 7 exists to prevent.

**Revisit if** a fourth kind of consumer needs to react to user state changes; at that point the
call-site discipline should become an event, not more copies of the same two lines.

---

## Open

Each needs an owner decision before the work it blocks.

| # | Question | Recommendation | Blocks |
|---|---|---|---|
| 1 | **`authorizeRoles` checks `availableRoles`, not `activeRole`** (`modules/auth/middlewares/authenticate.ts:57-60`) — a user holding VENDOR+ADMIN who switches the admin session's active role to VENDOR still passes admin checks | Fix it, but as its own change: it silently alters who can reach what | authorization pass |
| 2 | **Product modules** — `coupon/`, `referral/`, `dashboard/` are now separable from the core (see the "Core and product" row). Should the starter keep shipping them as a worked example, or delete them? | Delete; keep `notification/` as a leaf utility | trimming the starter |
| 4 | **Account lockout is a DoS vector** — an attacker who knows an email can lock it for 15 minutes with 5 wrong passwords (`modules/auth/services/lockout.service.ts:27-37`, defaults `src/config/env.ts:275-277`) | Lock on a combined signal (account + IP), or add a CAPTCHA before the lock | hardening |
| 5 | **`identity.service.ts` still returns a distinct 409** on OAuth linking (`modules/auth/services/identity.service.ts:75,135,184`), unlike every other endpoint | Left deliberate: probing costs a controlled Google account per email, and a generic error would strand a real user who signed up with a password | consistency |
| 6 | **Role changes do not reach live sessions.** `availableRoles` is copied into the session at login (`modules/auth/services/auth.service.ts:181`, `controllers/shared/oauth.ts:50`), and switch-role writes the session's own copy back (`controllers/shared/portalAuth.ts:77`, `services/session.service.ts:235-242`). Deactivating a role (`modules/user/controllers/admin/role.ts:90-95`) touches no session; it takes effect only at the **next login**, because the login lookup skips roles whose `Role.isActive` is false (`modules/user/models/UserRole/schema.ts:72-81`). No endpoint approves, revokes or removes a role on a user. **Real world:** an admin deactivates the VENDOR role; a vendor already logged in keeps vendor access until that session ends — up to 30 days — and the next vendor login is refused | When a role is deactivated or taken away, revoke the affected users' sessions, the way suspension already does | authorization pass |

**Closed by the 2026-08-24 work:** the refresh-token race and JWT signing questions are moot (neither
is built); HIBP is on by default; lockout counters moved to Redis.

**Closed 2026-10-19 (was question 3, "client IP trusts spoofable headers"):** `src/utils/clientIp.ts`
is deleted. The logger, the error middleware, the rate limiter and the auth controllers all read
`req.ip` (`src/middlewares/httpLogger.ts:6`, `src/middlewares/errorMiddleware.ts:36`,
`src/middlewares/rateLimit.ts:41`), and `trust proxy` is set from `TRUSTED_PROXY_COUNT` only in
production (`src/server.ts:28-30`).

---

## How to add to this file

State the decision, the reason in one sentence, and the date. A decision without a reason gets
re-litigated in six months; a decision without a date cannot be re-evaluated when the ecosystem
moves. If it came from a tool's documentation, name the version you checked.
