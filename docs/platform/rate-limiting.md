# Rate limiting

> **Verified against the code on 2026-10-19.** Runtime check on 2026-09-01: the login bucket
> returned 429 after repeated attempts from one IP. **Not exercised:** the account-scoped OTP
> buckets, or fail-open behaviour with Redis down.

Our own layer: the middleware is `src/middlewares/rateLimit.ts` and the counter is
`incrementWithTTL` in `src/utils/redisKeys.ts:124-168`. No third-party package — owning it means
the limiter shares the Redis connection, the key convention and the failure policy with everything
else.

---

## The algorithm

Fixed window, one counter per bucket per identifier. Each counter is one `MULTI` on one key
(`redisKeys.ts:133-140`):

```
INCR   rl:<bucket>:<scope>:<hash>
EXPIRE rl:<bucket>:<scope>:<hash> <window> NX
TTL    rl:<bucket>:<scope>:<hash>
```

`<scope>` is `ip` or `acct`, and `<hash>` is the identifier, trimmed, lowercased, SHA-256'd and cut
to 32 hex characters (`redisKeys.ts:18-23`, `38-39`). Why the hash: see [redis.md](redis.md#key-map).

When a bucket checks two identifiers (IP and account), it sends two `MULTI`s at once with
`Promise.all` (`redisKeys.ts:156-168`). It does not put both keys in one `MULTI`: on a Redis
Cluster the two keys can sit in different hash slots, and a multi-key `MULTI` is then a `CROSSSLOT`
error (`redisKeys.ts:131-132`). The same comment records why this is still cheap: node-redis
flushes commands issued in the same tick as one socket write. The request is judged by whichever
counter is highest (`rateLimit.ts:79-80`).

**`NX` is load-bearing.** It sets the expiry only when the key has none (`redisKeys.ts:136-138`).
An unconditional `EXPIRE` would push the reset forward on every hit, so a client hammering a blocked
endpoint would keep renewing its own block and never get out. It also self-heals a counter that
somehow lost its TTL, so a counter can never become a permanent lockout. It needs Redis 7.0+.

### Why fixed window, knowing its flaw

A fixed window has a real defect: a client can send a full allowance just before the boundary and
another straight after, so the true worst case is **2× the limit** across that seam. A sliding
window removes it, at the cost of more memory and more moving parts.

Fixed window is the right trade **here** because nothing in this app depends on the limit being
exact. It is a coarse abuse brake, and the precise control — the one that actually stops credential
stuffing — is the per-account lockout, which has no boundary behaviour at all. Doubling 30 logins
per 15 minutes for one IP changes nothing that matters.

Revisit only on evidence: a high-traffic public endpoint where clients learn to hammer the reset
boundary, or a metered endpoint where a 2× overrun costs real money. Then it is a change inside
`incrementWithTTL`, not a redesign — every call site keeps working.

---

## Buckets

| Bucket | Limited by | Default | Where |
|---|---|---|---|
| `global` | IP | 300 / 60s | every request except `GET /health` and files served from `/uploads` (`src/server.ts:75-95`) |
| `static` | IP | same numbers as `global` | `/uploads` (`src/server.ts:87-91`) |
| `login` | IP | 30 / 15min | `/login`, `/oauth/:provider` |
| `register` | IP | 10 / hour | `/register` |
| `otp` | IP **and** account | 10 / hour | `/send-otp`, `/forgot-password` |
| `otp-verify` | IP **and** account | 10 / hour | `/verify-otp`, `/verify-email`, `/reset-password` |

Defaults are in `src/config/env.ts:251-269`; buckets are defined in
`src/modules/auth/routes/shared/limits.ts` and applied in each portal's `routes/<portal>/auth.ts`.
The admin portal has no `/register`, `/send-otp` or `/verify-email`
(`src/modules/auth/routes/admin/auth.ts:14-23`). All numbers are tunable via `RATE_LIMIT_*` — see
[configuration.md](configuration.md).

"Account" is the `email` field of the request body (`rateLimit.ts:13`, `43-47`). The limiter runs
before `validate`, so it sees the raw value; the hash lowercases and trims it first, so one capital
letter does not buy a fresh allowance.

### Why these numbers, and why login is per-IP only

Guidance for login endpoints clusters around **5 attempts per 15 minutes, keyed on username *and*
IP** ([OWASP API Security](https://owasp.org/API-Security/editions/2023/en/0xa2-broken-authentication/)),
and **60–300 requests per minute** for general API endpoints.

The trap is applying the strict number to the IP. **An IP is shared** — an office, a school, or a
mobile carrier's CGNAT puts hundreds of real users behind one address. A 5-per-15-minutes IP limit
locks out the eleventh person who logs in on Monday morning, and it will look like an outage.

So the two axes are split, each doing the job it is actually good at:

| Control | Keyed on | Stops | Default |
|---|---|---|---|
| **Lockout** | user id | brute force against **one account**, from anywhere | 5 fails / 15 min (`env.ts:274-278`) |
| **Rate limit** | IP | one host spraying **many accounts** | 30 / 15 min |

The strict OWASP number lives in the lockout, where it belongs, and the IP limit stays loose enough
not to punish shared addresses. Two account-scoped controls would be worse than one: whichever
tripped first would be the only one that ever fired.

### OTP has three layers

| Layer | Counts | Default | Where |
|---|---|---|---|
| `otp` / `otp-verify` buckets | requests per IP and per email address | 10 / hour each | the route limiter |
| send cap | codes sent per email and purpose | 5 per 60 min (`OTP_SEND_*`) | `src/modules/auth/helpers/otp.ts:54-75`, counted at `83` |
| verify cap | wrong guesses per code | 5 (`OTP_VERIFY_MAX_ATTEMPTS`), then locked until the code expires | `otp.ts:86-104` |

The route buckets stop a client before the handler does any work. The send cap runs inside the
handler, after a database lookup (`src/modules/auth/controllers/shared/passwordReset.ts:27-29`).

**`otp-verify` is a separate bucket from `otp` on purpose** (`limits.ts:22-28`). Sharing one would
mean a wrong guess consumes the allowance for requesting a fresh code — so a user who fat-fingers
the digits gets locked out of the retry that would have fixed it. Both draw their numbers from
`RATE_LIMIT_OTP_*`; they just count independently.

---

## Response headers

When a limiter runs, it sets `RateLimit-Limit`, `RateLimit-Remaining` and `RateLimit-Reset` on the
response, allowed or not (`rateLimit.ts:82-86`, `118`), so a client can back off before being
blocked. A 429 also carries `Retry-After` (`rateLimit.ts:125`) and the error code
`AUTH_RATE_LIMIT_EXCEEDED` (`src/constants/authErrors.ts:58-62`).

The headers are **absent** when no limiter ran: on `GET /health`, when `RATE_LIMIT_ENABLED=false`
(`rateLimit.ts:92-95`), when Redis failed (`98-108`), or when the request had no IP
(`110-114`). On a route with its own bucket, that bucket's values overwrite the global ones, because
both use `setHeader`.

The `TTL` that makes `Reset` accurate is in the same `MULTI` as the `INCR`, so accuracy costs no
extra round trip.

---

## It fails open, and that is deliberate

If Redis is unreachable the limiter **logs an error and lets the request through**
(`rateLimit.ts:100-108`).

A limiter that fails closed converts a cache outage into a total product outage — every user
blocked because a counter could not be read. The exposure while Redis is down is a window of
unthrottled traffic; the alternative is a guaranteed full outage. For the same reason, a malformed
Redis reply is treated as a failure rather than coerced to zero (`redisKeys.ts:142-152`): a count of
zero reads as an empty counter, which would silently disable the limit instead of noisily
bypassing it.

The OTP send cap is the exception: it fails **closed** (`otp.ts:64-73`), because sends it cannot
count would be unbounded outbound email.

**This is a security trade-off, not an oversight.** If a deployment needs auth endpoints to fail
closed while the rest stays open, that is a per-bucket policy flag — ask before assuming.

---

## Known gaps

**Per-account limiting is itself a denial-of-service vector.** An attacker who knows a victim's
email can burn their `otp` counter, or their lockout (open question 4 in
[../decisions.md](../decisions.md)). Accepted for now; revisit if abuse appears.

**Client IP depends on `TRUSTED_PROXY_COUNT`.** The limiter keys on `req.ip`
(`rateLimit.ts:41`). In production `trust proxy` is set to `TRUSTED_PROXY_COUNT`, default 1
(`src/server.ts:28-30`, `src/config/env.ts:179`); outside production it is not set, and `req.ip` is
the socket address. **Real world:** behind a load balancer *and* a CDN, a count of 1 makes every
visitor look like the CDN edge, so one busy edge node exhausts the global allowance for everyone
behind it. A count higher than the real number of proxies lets a client pick its own IP by sending
`X-Forwarded-For`, and with it a fresh allowance per request.
