# Decisions

What is settled, and what is still open. When something here changes, change it **here** — no
second copy anywhere else.

---

## Settled

| Decision | Why | Date |
|---|---|---|
| **One repo, not one per database** | Auth is the asset. Two repos means writing every security fix twice and backporting forever. A client's clone adapts after cloning | 2026-08-23 |
| **PostgreSQL + Prisma v7** as the default | v8 is an RC — a moving target with no LTS. Mongo is unsupported on v7 and is a per-client decision | 2026-08-23 |
| **Express 5** | The Technical Committee's production-recommended release; v4 sunsets. v5 auto-forwards async errors | 2026-08-23 |
| **zod v4** over Joi | Better inference, and it validates env and requests from one source of truth | 2026-08-23 |
| **argon2id** over bcryptjs | Current OWASP guidance; bcryptjs is the slowest implementation | 2026-08-23 |
| **Sessions in Redis, identity in the database** | Losing a session is a re-login; losing a user is unrecoverable | 2026-08-24 |
| **Roles and permissions as data**, not enums | A new client role must be a seed row, never a code change and a redeploy | 2026-08-23 |
| **Per-portal cookies**, driven by env not an enum | An admin cookie cannot be replayed against the customer API | 2026-08-23 |
| **Our own rate limiter** | ~15 lines of Redis; owning it means shared connection, key convention and failure policy | 2026-08-24 |
| **Limiter fails open, auth fails closed** | Failing closed on limits turns a cache outage into a total outage; auth failing closed protects data | 2026-08-24 |
| **Providers are pluggable, identity is generic** | Adding Google/Apple/GitHub must never need a migration, a route or a session change | 2026-08-24 |
| **Never install dependencies** | The owner's machine cannot absorb it — report the need instead | 2026-08-24 |

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

**The plan says** short-lived access JWT + rotating opaque refresh token. **What is built** is an
opaque session in a cookie, looked up in Redis.

Researched 2026-08-24. The consensus is that a JWT which still requires a server-side lookup on
every request has given up the only thing JWTs buy you: *"once you're maintaining server-side state
to validate tokens, you have lost the primary architectural benefit of JWTs and have a more complex
system with additional cryptographic overhead on every request"*
([reptile.haus](https://reptile.haus/journal/stop-defaulting-to-jwts-choosing-the-right-session-architecture-in-2026/)).

That describes our planned design exactly — verify a signature, *then* read Redis for the session,
*then* read the epoch. The JWT adds crypto per request and buys nothing, because permissions
deliberately do not live in the token.

JWTs earn their place in microservices, at the edge, or for third-party consumers. This starter is a
single Express app. **Proposal: keep opaque sessions as the default; add the JWT layer the day a
client actually needs cross-service identity.** That also removes refresh rotation, reuse detection
and open question 1 — a large amount of code and one genuinely hard concurrency problem, for a
benefit no current client has.

### Drop the epoch counter

It exists to kill tokens you cannot enumerate. We *can* enumerate: `user:<id>:sessions` indexes
every live session, so logout-all and role changes can delete or rewrite them directly.

It cost a second Redis read on every authenticated request — half the hot-path budget. **Removed;
authentication is now one Redis read.** Reinstate it only if the JWT layer ever comes back, because
stateless tokens genuinely need it.

### Built instead, because the research says a cookie-based API needs them

| | Why |
|---|---|
| **CSRF** — stateless double-submit | Cookie auth is forgeable cross-site by definition, and we had no defence |
| **Enumeration defence** | Distinct errors, a 409 on register, and an unhashed early return all leaked which emails exist |
| **Password policy** — ≥8 chars, no composition rules, HIBP k-anonymity | Length beats composition (NIST/OWASP); fails open so an outage cannot block signups |
| **Audit log** — MongoDB, durable | Once every response is deliberately generic, this is the only place the real reason is recorded |
| **Absolute session cap** — 30 days | A sliding TTL alone lets a stolen cookie live forever while it keeps being used |
| **Display fields cached in the session** | Removes the last database read from the auth hot path; see below for what it costs |

### Display fields live in the session record (settled 2026-09-01)

`authenticate` used to do one Redis read **and** a `User.findById`, purely to fill the `email`,
`firstName`, `lastName`, `emailVerified` and `profileImage` that `req.user` promises. Those five
fields are now copied into the session at login, so the hot path makes **no database call at all**.

That read was doing a second, unadvertised job: enforcing `user.status === ACTIVE`. Removing it
without replacement would let a **suspended account keep working sessions for up to 30 days** — a
security regression disguised as a performance win. So suspension now revokes every session for that
user (`revokeUserSessions`), and the two events that change a cached field — profile edits and email
verification — rewrite the copy in place (`syncSessionUser`).

**The trade-off we accepted:** every write that touches a display field must call one of those two
functions, and a missed call shows up as stale data in `/me` rather than as a test failure. That is
8 call sites today (4 admin in `user/controllers/admin/managedUser.ts`, 3 self-service in
`user/controllers/shared/profile.ts`, 1 email verification). The alternative — re-reading the user on every request — costs a database round
trip on *every authenticated request forever*, which is the thing hard rule 7 exists to prevent.

**Revisit if** a fourth kind of consumer needs to react to user state changes; at that point the
call-site discipline should become an event, not more copies of the same two lines.

---

## Open

Each needs an owner decision before the work it blocks.

| # | Question | Recommendation | Blocks |
|---|---|---|---|
| 1 | **`authorizeRoles` checks `availableRoles`, not `activeRole`** — a user holding CUSTOMER+ADMIN passes admin checks while acting as customer | Fix it, but as its own change: it silently alters who can reach what | authorization pass |
| 2 | **Business modules** — delete `coupon/`, `referral/`, `dashboard/` from the starter, or keep one as a worked example? | Delete; keep `notification/` as a leaf utility | trimming the starter |
| 3 | **`@utils/clientIp` trusts spoofable headers** and feeds the logger and error middleware (the rate limiter deliberately does not use it) | Fix to use `req.ip`; it changes what gets logged, so it needs sign-off | logging integrity |
| 4 | **Account lockout is a DoS vector** — an attacker who knows an email can lock it for 15 minutes with 5 requests | Count only *failed* attempts against a separate signal, or add CAPTCHA before the lock | hardening |
| 5 | **`identity.service.ts` still returns a distinct 409** on OAuth linking, unlike every other endpoint | Left deliberate: probing costs a controlled Google account per email, and a generic error would strand a real user who signed up with a password | consistency |

**Closed by the 2026-08-24 work:** the refresh-token race and JWT signing questions are moot (neither
is built); HIBP is on by default; lockout counters moved to Redis.

---

## How to add to this file

State the decision, the reason in one sentence, and the date. A decision without a reason gets
re-litigated in six months; a decision without a date cannot be re-evaluated when the ecosystem
moves. If it came from a tool's documentation, name the version you checked.
