# Rate limiting

> **Runtime-verified 2026-09-01**: the login bucket returned 429 after repeated attempts from one IP,
> and counters were observed in Redis as `rl:login:ip:<ip>`. **Not exercised:** the account-scoped OTP
> buckets, or fail-open behaviour with Redis down. No production build has been run.

Our own layer, in `src/middlewares/rateLimit.ts`. No third-party package: the logic is about
fifteen lines of Redis, and owning it means the limiter can share the connection, the key
convention and the failure policy with everything else.

---

## The algorithm

Fixed window, one counter per bucket per identifier.

```
INCR   rl:<bucket>:<identifier>
EXPIRE rl:<bucket>:<identifier> <window> NX
TTL    rl:<bucket>:<identifier>
```

All three commands, for every identifier being checked, go into **one pipelined round trip**. The
limiter runs in front of every request, so its own cost matters more than what it protects — three
sequential awaits per counter would make the guard more expensive than the thing guarded.

**`NX` is load-bearing.** It sets the expiry only when the key has none. An unconditional `EXPIRE`
would push the reset forward on every hit, so a client hammering a blocked endpoint would keep
renewing its own block and never get out. It also self-heals a counter that somehow lost its TTL,
so a counter can never become a permanent lockout.

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
| `global` | IP | 300 / 60s | all of `/api/v1` |
| `login` | IP | 30 / 15min | `/login`, `/oauth/:provider` |
| `register` | IP | 10 / hour | `/register` |
| `otp` | IP **and** account | 10 / hour | `/send-otp`, `/forgot-password` |
| `otp-verify` | IP **and** account | 10 / hour | `/verify-otp`, `/verify-email`, `/reset-password` |

All tunable via `RATE_LIMIT_*` env vars — see [configuration.md](configuration.md).

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
| **Lockout** | user id | brute force against **one account**, from anywhere | 5 fails / 15 min |
| **Rate limit** | IP | one host spraying **many accounts** | 30 / 15 min |

The strict OWASP number lives in the lockout, where it belongs, and the IP limit stays loose enough
not to punish shared addresses. Two account-scoped controls would be worse than one: whichever
tripped first would be the only one that ever fired.

`otp` keeps its account counter because there is no OTP lockout, and because each request costs an
outbound email.

**`otp-verify` is a separate bucket from `otp` on purpose.** Sharing one would mean a wrong guess
consumes the allowance for requesting a fresh code — so a user who fat-fingers the digits gets
locked out of the retry that would have fixed it. Both draw their numbers from `RATE_LIMIT_OTP_*`;
they just count independently.

The account identifier is normalised (trimmed, lowercased) before hashing — otherwise one capital
letter buys a fresh allowance — then SHA-256 truncated, which bounds key size and keeps raw email
addresses out of Redis and out of logs.

---

## Response headers

Every response carries `RateLimit-Limit`, `RateLimit-Remaining` and `RateLimit-Reset`, not only
rejections, so a client can back off before being blocked. A 429 also carries `Retry-After`.

The `TTL` read that makes `Reset` accurate is in the same pipeline as the `INCR`, so accuracy costs
no extra round trip.

---

## It fails open, and that is deliberate

If Redis is unreachable the limiter **logs an error and lets the request through**.

A limiter that fails closed converts a cache outage into a total product outage — every user
blocked because a counter could not be read. The exposure while Redis is down is a window of
unthrottled traffic; the alternative is a guaranteed full outage. For the same reason, a malformed
Redis reply is treated as a failure rather than coerced to zero: a count of zero reads as an empty
counter, which would silently disable the limit instead of noisily bypassing it.

**This is a security trade-off, not an oversight.** If a deployment needs auth endpoints to fail
closed while the rest stays open, that is a per-bucket policy flag — ask before assuming.

---

## Known gaps

**Per-account limiting is itself a denial-of-service vector.** An attacker who knows a victim's
email can burn their counter and lock them out. The standard mitigation is counting only *failed*
attempts, which needs a post-handler hook. Accepted for now; revisit if abuse appears.

**Client IP.** The limiter uses `req.ip`, which respects the `trust proxy` hop count set in
`server.ts`. It deliberately does **not** use `@utils/clientIp`, which reads `X-Forwarded-For` and
friends straight off the request — those are attacker-controlled, so keying a limiter on them means
rotating a header value buys a fresh allowance. That helper is still used by the logger and error
middleware, so **logged IPs are attacker-controlled and should not be acted on** until it is fixed.
