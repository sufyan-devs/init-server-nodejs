# Redis

> **Runtime-verified 2026-09-01** against Redis 8.2.7: the app connects to db 11, and session,
> per-user index and rate-limit keys were confirmed present there and absent from db 0.
> **Not exercised:** failover, or behaviour with Redis down mid-request. No production build has been run.

Redis holds everything **ephemeral, high-churn and rebuildable**. The database holds everything
durable. Getting this line wrong in either direction is expensive, so it is worth stating plainly:

| | Redis | Database |
|---|---|---|
| Holds | sessions, lockout counters, rate limits, OTP | users, roles, permissions, audit |
| If wiped | everyone logs in again | nothing — it is backed up |
| Written | constantly | rarely |

Losing a session is a re-login. Losing a user is a company-ending incident. That is the whole rule.

---

## Which database

**This app uses Redis logical database `11`, not `0`** — `REDIS_DB`, defaulting to 11 in
`config/env.ts:253-255`. A developer machine usually runs several projects against one Redis, and
`npm run db:reset` calls `FLUSHDB`: on the default db 0 that wipes whatever else is running.

The index is written into the connection URL (`utils/redisClient.ts:6-17`), not passed as the
`database` option. node-redis parses `url` **after** the plain options, so a `database` option is
silently overridden by the URL's index — which is 0 when the URL omits one. Setting `REDIS_DB=11`
alongside `REDIS_URL=redis://host:6379` therefore looks correct, logs correct, and still writes to
db 0. Building the index into the URL is what makes `REDIS_DB` authoritative.

If `REDIS_URL` carries a db index that disagrees with `REDIS_DB`, the process **refuses to start**
(`utils/redisClient.ts:9-24`). Silently preferring one would let a service read an empty keyspace,
which looks identical to having lost every session.

---

## Key map

Every key is built by a helper in `src/utils/redisKeys.ts`. **Never hand-write a key string at a
call site** — a typo silently creates a second namespace that nothing reads.

| Key | Holds | TTL |
|---|---|---|
| `sess:<sid>` | the session record, JSON | session lifetime (7d default) |
| `user:<id>:sessions` | SET of that user's live sids | extended with the session |
| `rl:<bucket>:<identifier>` | rate-limit counter | the window |
| `<purpose>:<email>:code` / `:attempts` / `:send_count` | OTP | short |

**Every key carries a TTL.** A key without an expiry is a memory leak, and for a counter it is a
permanent lockout.

---

## The session record

The cookie carries `<sid>.<secret>`. Redis stores **only `SHA-256(secret)`**, so a Redis dump
cannot be replayed as a live session — the same reasoning that applies to password hashes.

Verification compares hashes with `timingSafeEqual`, then checks the session has not passed its
absolute 30-day deadline. **That is one Redis read, and no write.**

There is no epoch counter. It exists to invalidate tokens you cannot enumerate, and we can:
`user:<id>:sessions` indexes every live session, so logout-all deletes them directly. Keeping it
would have cost a second read on every request for nothing.

The record is kept deliberately small — user id, active role, available roles, portal, device
metadata, and the five display fields `req.user` promises (`email`, `firstName`, `lastName`,
`emailVerified`, `profileImage`, in `session.user`). Those five are what removed the last database
read from the auth hot path.

**Never store the whole user document in it.** The five are a closed list chosen because they are
display-only and change rarely; each one added is another field that can go stale and another write
path that has to call `syncSessionUser`. Anything that decides *access* — roles, status,
permissions — either lives here already (`availableRoles`) or must invalidate the session rather
than be cached (`revokeUserSessions`). Small values also keep the batched `MGET` fast and memory
bounded.

---

## Scaling rules

These are [performance-practices](../standards/performance-practices.md) applied to Redis. The
rules are about round trips and unbounded work, so they transfer directly.

**No N+1.** A `GET` per session id in a loop is the same defect as a query in a loop. Listing a
user's devices is one `MGET` via `findManyBySids`, never a read per id.

**One command, not N.** Revoking every session is a single `DEL` with all keys, not a loop.

**Never `KEYS` or a wildcard scan.** The per-user SET is the index — that is why it exists.

**Bound every collection.** `SESSION_MAX_PER_USER` (10 by default) caps live sessions per user,
evicting the oldest. Without it a scripted login loop grows the set forever: memory that never
returns, and a list call that gets slower with every login.

**No write on the hot path.** Authenticating is a read. The sliding TTL refresh only fires when the
remaining TTL has dropped below half, and it is fire-and-forget.

---

## Failure modes

| Redis is | Effect | Why |
|---|---|---|
| **down at boot** | process exits | a server that rejects every login while reporting healthy is worse than one that does not start |
| **down at runtime** | authenticated requests fail; **rate limiting passes traffic through** | the limiter fails *open* deliberately — failing closed turns a cache outage into a total outage |
| **flushed** | everyone logs in again | sessions are rebuildable by design |

The asymmetry is intentional: auth failing closed is correct, limiting failing open is correct.
One protects data, the other protects availability.

---

## Version requirement

**Redis >= 7.0.** The limiter uses `EXPIRE key ttl NX`, which is 7.0+. An unconditional `EXPIRE`
would push the reset forward on every hit, letting a client hammering a blocked endpoint renew its
own block indefinitely.
