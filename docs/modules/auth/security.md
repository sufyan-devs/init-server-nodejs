# Auth — security requirements

> **Mixed status, verified against the code on 2026-10-19.** Every section carries a marker:
> **BUILT**, **PARTLY BUILT**, **NOT BUILT** or **OBSOLETE** (the requirement no longer applies,
> because the thing it guards does not exist). Line numbers refer to the working tree.

These are the acceptance criteria for auth. Each one is a known way auth implementations fail in
production.

## Account enumeration — PARTLY BUILT

*Enumeration* is learning which email addresses have accounts by comparing responses.

- **BUILT** — `login` always runs a hash check, against a dummy argon2 hash when there is no account
  or no password (`password.service.ts:77-80`).
- **BUILT** — one generic `401 AUTH_INVALID_CREDENTIALS` for no account, no password, inactive,
  locked and wrong password; the real reason goes to the audit log (`password.service.ts:63-99`).
  Three later answers are distinct — `requiresEmailVerification`, `ACCOUNT_NOT_APPROVED`,
  `PORTAL_ACCESS_DENIED` — but each needs the correct password first (`auth.service.ts:160-175`).
- **BUILT** — `register` returns the same body whether or not the email exists, and emails the
  existing owner instead of answering 409 (`auth.service.ts:74-107`). That email HTML-escapes the
  owner's first name (`auth.service.ts:81`).
- **BUILT** — `forgot-password` and `send-otp` answer identically and store an OTP even for an
  unknown address, so attempt counts match (`passwordReset.ts:43-69`, `emailVerification.ts:68-88`).
  `verify-email` checks the OTP the same way for any address (`emailVerification.ts:14-47`).
- **Deliberate exception** — Google sign-in can answer `409 AUTH_EMAIL_ALREADY_EXISTS` and
  `403 AUTH_ACCOUNT_INACTIVE` (`identity.service.ts:42-45,75,135,184`). Probing that way costs a
  verified Google account per email; see open question 5 in [../../decisions.md](../../decisions.md).

## JWT correctness — OBSOLETE

There is no JWT session layer ([../../decisions.md](../../decisions.md)), so algorithm pinning,
`iss`/`aud` checks, `kid` rotation and access-token lifetimes do not apply to sessions.

The one JWT the server reads is Google's ID token, and that check is **BUILT**: the header must say
`RS256`, and `jwt.verify` pins `RS256` and checks `iss` and `aud` against `GOOGLE_CLIENT_IDS`
(`providers/google.ts:203-217`). Signing keys are fetched from Google and cached
(`providers/google.ts:110-176`).

## Refresh rotation — OBSOLETE, except the absolute cap (BUILT)

There is no refresh token, so the parallel-refresh race and grace windows do not apply.

- **BUILT** — absolute session lifetime: 30 days from `createdAt`, whatever the activity
  (`env.ts:191`, `session.service.ts:68-69,169-172`). The sliding TTL refresh never extends past it
  (`session.service.ts:72-81`).

## Session lifecycle — PARTLY BUILT

- **BUILT** — login always creates a new session id (`session.service.ts:122-149`).
- **BUILT** — password reset deletes every session (`passwordReset.ts:141`).
- **NOT BUILT** — rotating the session id on role switch. `switch-role` rewrites the same record
  under the same sid (`session.service.ts:222-250`).
- **BUILT** — revocation is a delete, through the per-user index, so logout-all, password reset and
  suspension take effect on the next request ([flows.md §3](flows.md#3-revocation)).
- **NOT BUILT** — revoking a single *role* from live sessions. `availableRoles` is a login snapshot
  and no endpoint changes user roles. Deactivating a role stops it being granted at the next login
  (`UserRole/schema.ts:72-81`) but leaves live sessions alone
  ([flows.md §2](flows.md#what-the-session-copy-does-decide-roles)).

## Passwords — PARTLY BUILT

- **BUILT** — argon2id with defaults `m=19456, t=2, p=1`, overridable by env (`env.ts:289-293`,
  `password.service.ts:16-21`). Legacy `$2` bcrypt hashes are verified and re-hashed on the next
  successful login (`password.service.ts:36-61,102`).
- **NOT DONE** — benchmarking to ~250–400 ms on the production box. This is an operations task;
  nothing in the repo records a measurement.
- **BUILT** — minimum length `PASSWORD_MIN_LENGTH`, **default 8** (`env.ts:283`); no composition
  rules, no forced rotation (`password.service.ts:117-145`).
- **BUILT** — breached-password check against the HIBP range API, on by default, only the first 5
  SHA-1 characters leave the server, fails open (`password.service.ts:106-136`, `env.ts:285`).
- Reset tokens:
  - **BUILT** — single use: the OTP is deleted before the reset id is issued, and the reset id is
    deleted before the password is changed (`passwordReset.ts:97,128`).
  - **BUILT** — short lifetime: reset id 5 minutes by default (`env.ts:229`). The OTP that leads to
    it lives `OTP_EXPIRY_MINUTES`, default 60 (`env.ts:218`).
  - **NOT BUILT** — hashed at rest. The reset id is the Redis key name as is,
    `reset_session:<resetId>` (`session.service.ts:266-270`), and OTP codes are stored as plain
    values (`helpers/otp.ts:77-84`). Anyone who can read Redis can use a live one.
  - **BUILT** — every session revoked on use (`passwordReset.ts:141`).

## Lockout and rate limiting — PARTLY BUILT

- **BUILT** — per-account lockout, **fixed window**: 5 wrong passwords within 900 s lock the account
  for 900 s (`lockout.service.ts:27-43`, `env.ts:274-278`). The lock has a TTL, so it is never
  permanent. Details: [flows.md §4](flows.md#4-lockout).
- **NOT BUILT** — exponential backoff and a CAPTCHA fallback.
- **Rate limits** (`routes/shared/limits.ts`):

  | Endpoint | Per IP | Per account (email in body) |
  |---|:-:|:-:|
  | `login`, `oauth/:provider` | ✓ | — (the lockout is the per-account control, `env.ts:271-273`) |
  | `register` | ✓ | — |
  | `forgot-password`, `send-otp` | ✓ | ✓ |
  | `verify-otp`, `verify-email`, `reset-password` | ✓ | ✓ (a separate bucket from sending) |

  Every API request also passes the global per-IP limiter (`server.ts:95`). The full design is in
  [../../platform/rate-limiting.md](../../platform/rate-limiting.md).
- **BUILT** — CSRF double-submit token bound to the session ([flows.md — Where CSRF fits](flows.md#where-csrf-fits)).

## Secrets and logging — PARTLY BUILT

- **NOT BUILT** — a redaction filter for `authorization`, `cookie`, `set-cookie`, `password`,
  `token`, `otp`. What exists instead: the request log writes only method, URL, status, duration,
  IP and user agent (`httpLogger.ts:12-17`), and the error log adds message and stack
  (`errorMiddleware.ts:31-38`). Neither logs headers or bodies. The URL is logged with its query
  string.
- **BUILT** — emails are hashed (`identifierHash`) in the auth and email logs
  (`password.service.ts:64`, `passwordReset.ts:59`, `emailVerification.ts:79`, `helpers/otp.ts:70`,
  `notification/email/sender.ts:25`), and in the rate limiter's 429 log, which hashes the
  identifier of a per-account bucket and writes the IP of a per-IP one (`rateLimit.ts:127-133`).
  The audit log stores the raw email on `LOGIN_FAILURE` (`password.service.ts:65-70`) — that is the
  database, not a log file.
- **BUILT** — session logs carry the sid, never the secret (`session.service.ts:146,166,174`).
- **BUILT** — secrets fail fast at boot: `COOKIE_SECRET` is required (`env.ts:132-138,195`). Redis
  fails fast: the process exits if it cannot connect (`server.ts:116-121`).
- **NOT BUILT** — a secrets vault. Production secrets come from the environment.

## Transport and headers — BUILT

- CSP `default-src 'none'; frame-ancestors 'none'`, with helmet's defaults off for CSP only
  (`server.ts:39-51`).
- HSTS and `X-Powered-By` removal come from helmet 8.3.0's defaults
  (`node_modules/helmet/index.mjs:411-414,503-512`). HSTS is sent in **every** environment, not
  only production.
- Cookies: `SameSite=Lax` always, `Secure` in production only ([data-model.md](data-model.md#tokens-and-cookies--as-built)).
- CORS: explicit allowlist from `ALLOWED_ORIGINS`, `credentials: true`, no origin reflection
  (`server.ts:53-69`). Production refuses to boot with an empty list (`server.ts:110-113`). Outside
  production any `http(s)://localhost:<port>` origin is also allowed, and a request with no `Origin`
  header is always allowed.

## Input and upload — PARTLY BUILT

- **PARTLY BUILT** — zod at the edge (`middlewares/validate.ts`). Every auth route with a body or
  params validates it (`routes/<portal>/auth.ts`). Other modules are not complete: for example
  `POST /associate/referrals/onboard` runs no `validate()` (`referral/routes/associate/referral.ts:11`).
- **BUILT** — JSON body capped at 100 kb (`server.ts:97`).
- Uploads (`user/helpers/upload.ts`, `user/helpers/image.ts`):
  - **BUILT** — declared type limited to JPEG, PNG, WEBP (`400 INVALID_FILE_TYPE`), size capped at
    2 MB (`upload.ts:6-20`).
  - **BUILT** — the real content is proven by re-encoding with sharp; a non-image is
    `400 INVALID_IMAGE` (`image.ts:24-29`).
  - **BUILT** — the filename is generated, never the client's (`image.ts:15-17`).
  - **NOT BUILT** — serving from behind an authorizing route. Files are public under `/uploads`
    (`server.ts:87-91`).

## Audit and supply chain — PARTLY BUILT

- **PARTLY BUILT** — the audit log (`modules/audit/`). `record()` is called for: `LOGIN_SUCCESS`
  (password and Google), `LOGIN_FAILURE`, `ACCOUNT_LOCKED`, `LOGOUT`, `LOGOUT_ALL`,
  `SESSION_REVOKED`, `PASSWORD_RESET`, `REGISTER` (password and Google), `PROVIDER_LINKED`,
  `PERMISSION_DENIED`, and the admin actions `USER_CREATED`, `USER_UPDATED`, `USER_STATUS_CHANGED`,
  `USER_IMAGE_CHANGED`, `ROLE_CREATED`, `ROLE_UPDATED`, `ROLE_STATUS_CHANGED`
  (`AuditLog/types.ts:3-21`; call sites in `auth/services/*.ts`, `auth/controllers/shared/*.ts`,
  `auth/middlewares/authenticate.ts:62-68`, `user/controllers/admin/managedUser.ts:212-291`,
  `user/controllers/admin/role.ts:75-95`). **Not recorded:** `switch-role`, `request-role`, email
  verification, CSRF failures. There is no role-grant or role-revoke endpoint to audit.
- **NOT BUILT** — CI. There is no CI configuration in the repo, so no `npm audit --omit=dev` or
  lockfile-diff check runs automatically.
