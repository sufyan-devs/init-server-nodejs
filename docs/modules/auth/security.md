# Auth — security requirements

> **Mixed status, checked 2026-09-01.** BUILT: argon2id hashing (bcryptjs retained only to verify
> pre-migration hashes, upgraded on next login), zod validation at the request edge, the
> enumeration defence, the password policy (length + HIBP), Redis lockout, rate limiting, CSRF
> bound to the session, secret and Redis fail-fast at boot, the absolute session cap, and the audit
> log. NOT BUILT: the upload hardening at the end of this page.
> The JWT and refresh-rotation sections below are **obsolete** — neither exists; see
> [../../decisions.md](../../decisions.md).

Not optional extras. These are the **acceptance criteria** for the auth build
([security.md](security.md)). Each one is a known way auth implementations fail in
production.

## Account enumeration — make every path indistinguishable

- `login`: **always** run an argon2 verify, even when the user does not exist (hash against a fixed
  dummy hash). Otherwise response time is an account oracle.
- Return **one** generic failure for wrong-password / locked / inactive / unverified. The real
  reason goes in the audit log, not the response.
- `register` and `forgot-password` must return the **same response whether or not the email
  exists** ("if that address is registered, we've sent a link"). Handle a duplicate by emailing the
  existing owner, not by 409-ing the caller.
- Same for `resend-otp` and `verify-email`.

## JWT correctness

- **Pin the algorithm on verify** — `jwt.verify(token, key, { algorithms: ['HS256'] })`. Never let
  the token's own header choose (alg-confusion, `alg:none`).
- Verify `iss` **and** `aud`. `aud` is the portal, so an admin-portal token cannot be replayed on
  the customer API even if the cookie gate were bypassed.
- Plan secret rotation via a `kid` header + key map, so rotating does not log everyone out.
- Access token TTL stays short (~10 min). Never put roles or permissions in it.

## Refresh rotation — the race nobody plans for

- Parallel tabs (or a retried request) refresh at the same time → the second presents an
  already-rotated token → naive reuse detection **logs out a legitimate user**.
- Fix: a short **grace window** (~10–30 s) on the previous token, treating it as theft only on
  replay after the window or from a different IP/UA. Alternative: a per-family Redis lock.
  **Decide before writing `/refresh`.**
- **Absolute session lifetime cap** (e.g. 30 days) regardless of activity.

## Session lifecycle

- **Rotate the session id on privilege change** — login, role switch, password reset.
- Revocation is a delete, not a counter: logout-all and password reset remove every session key
  through the per-user index, so they take effect on the very next request.

## Passwords

- argon2id, `m=19456, t=2, p=1` minimum — **benchmark to ~250–400 ms on the actual prod box.**
- Minimum length ≥ 12, **no composition rules, no forced rotation** (current NIST/OWASP guidance).
- Check candidates against a breached-password list (HIBP range API, k-anonymity — only the first 5
  SHA-1 chars leave your server). Fail open if unreachable.
- Reset tokens: single-use, short TTL, hashed at rest, and revoke all sessions on use.

## Lockout and rate limiting

- 5–10 fails in a rolling window → exponential backoff (1 s / 4 s / 16 s) → temporary lock
  15–60 min → CAPTCHA fallback. **Never permanent locks** — they are a DoS vector.
- Rate limit login / register / forgot-password / verify-otp via Redis, **per-IP and per-account**
  (per-account is what stops a distributed attack on one user).
- CSRF double-submit token for the cookie flow.

## Secrets and logging

- **Redact** `authorization`, `cookie`, `set-cookie`, `password`, `token`, `otp` in `httpLogger`
  and in error serialization. A token in a log file is a token in your log aggregator.
- Never log a full session or refresh token, even at debug level.
- Env secrets fail fast at boot. **Redis must fail fast at boot**, not warn-and-continue —
  otherwise OTP and reset degrade silently in production.
- Production secrets belong in a vault, not `.env.prod`.

## Transport and headers

- CSP for a JSON API: `default-src 'none'; frame-ancestors 'none'`. No `script-src`, and never
  `'unsafe-inline'` / `'unsafe-eval'`.
- HSTS on in production, `X-Powered-By` off, cookies `Secure` + `SameSite`.
- CORS: explicit origin allowlist, `credentials: true`, **never** reflect an arbitrary origin.

## Input and upload

- Validate every request at the edge with zod — body, query **and** params. An unvalidated `:id` is
  a common injection and enumeration path.
- Cap body size globally (~100 kb) with per-route overrides where uploads actually happen.
- Uploads: sniff the real MIME (do not trust the client header), cap size, sanitize/replace the
  filename, and serve from behind an authorizing route rather than a static directory.

## Audit and supply chain

- An `audit_logs` row on every grant, revoke, denial, failed login and admin action.
- `npm audit --omit=dev` plus a lockfile-diff check in CI. Pin majors. Review new dependencies
  before adding them.
