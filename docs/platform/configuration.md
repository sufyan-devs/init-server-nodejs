# Configuration

> **Verified against the code on 2026-10-19.** Line numbers refer to the working tree.

Everything the server reads at boot is in `src/config/env.ts`, exported as `envConfig`. Nothing
else in `src/` reads `process.env`. A module that owns its own settings calls the exported
`readInt` instead (`src/config/env.ts:145`). No module owns settings today.

---

## The three tiers

Every value belongs in exactly one of these. **If a new client requirement makes you edit tier 1,
the design has drifted.**

| Tier | Holds | Changed by | Examples |
|---|---|---|---|
| **Code** | true for every project, forever | a pull request | session verification, the limiter algorithm |
| **Env** | differs per deployment | ops | `MONGO_URI`, `COOKIE_SECRET`, `APP_NAME`, rate-limit numbers |
| **Seed data** | differs per client | editing a seed array, then re-seeding | roles (`src/modules/user/seed/roles.ts`) |

**Today the line is not clean.** Two things that should be seed data are still code: the role
codes (`ROLE_CODE`, `src/modules/user/models/Role/types.ts:10-16`) and which portal each role logs
into (`src/utils/cookieHelper.ts:15-21`). A client with a new role edits both. Permissions as seed
rows, with role→permission grants and scopes, are **target design — not built**
([../modules/auth/authorization.md](../modules/auth/authorization.md)). The onboarding steps as they
work today are in [README.md](../../README.md#starting-a-new-client-project).

---

## Fail fast

| Check | Where | What happens |
|---|---|---|
| `COOKIE_SECRET` missing or blank | `env.ts:132-138`, `195` | throws at import, naming the variable and how to generate one |
| `MONGO_URI` missing in production | `env.ts:156-160`, `180` | throws; in development it falls back to `mongodb://localhost:27017/app` |
| any integer setting not a whole number, or below its minimum | `readInt`, `env.ts:145-154` | throws, naming the variable and the bad value. Applies to every number in `env.ts`, `PORT` included (`env.ts:176`) |
| `REDIS_URL` db index disagrees with `REDIS_DB` | `src/utils/redisClient.ts:16-21` | throws at import |
| `ALLOWED_ORIGINS` empty in production | `src/server.ts:114-117` | logs and exits |
| Redis unreachable at boot | `src/server.ts:121-125` | exits |

`COOKIE_SECRET` is the only secret. It signs the session cookies (`src/server.ts:99`) and keys the
CSRF HMAC (`src/modules/auth/middlewares/csrf.ts:23-26`). `JWT_SECRET` no longer exists — there are
no JWTs to sign ([../decisions.md](../decisions.md)).

A refusal to start is loud; a silent insecure default is not. **Real world:** if `COOKIE_SECRET`
fell back to a string in the code, a deployment that forgot to set it would sign every cookie with a
value anyone can read in the git history, and nothing would look wrong.

**Not validated:** strings and booleans. An unset string falls back to its default. A boolean
switched off by the exact string `"false"` — `RATE_LIMIT_ENABLED`, `CSRF_ENABLED`,
`PASSWORD_HIBP_CHECK`, `GOOGLE_AUTH_ENABLED` — is on for any other value, including a typo
(`env.ts:252`, `285`, `297`, `304`). `EMAIL_SECURE` is the reverse: on only for `"true"`
(`env.ts:208`).

---

## Groups

| Group | Variables |
|---|---|
| Branding | `APP_NAME`, `APP_LOGO_URL` |
| Core | `NODE_ENV`, `PORT`, `TRUSTED_PROXY_COUNT`, `ALLOWED_ORIGINS` |
| Database | `MONGO_URI` |
| Seed | `SEED_ADMIN_PASSWORD` (read by `seed:users`; required there in production) |
| Redis | `REDIS_URL` or `REDIS_HOST` / `REDIS_PORT` / `REDIS_PASSWORD`, `REDIS_DB`, timeouts, retries |
| Session | `SESSION_EXPIRY_MS`, `SESSION_ABSOLUTE_MAX_MS`, `SESSION_MAX_PER_USER` |
| Cookies | `COOKIE_NAME`, `COOKIE_SECRET`, `COOKIE_DOMAIN`, `COOKIE_MAX_AGE_MS` |
| CSRF | `CSRF_ENABLED`, `CSRF_COOKIE_NAME`, `CSRF_HEADER_NAME` |
| Password policy | `PASSWORD_MIN_LENGTH` (default 8), `PASSWORD_HIBP_CHECK`, `ARGON2_*` |
| Rate limits | `RATE_LIMIT_ENABLED`, `RATE_LIMIT_<GLOBAL\|LOGIN\|REGISTER\|OTP>_MAX` and `_WINDOW_SECONDS` |
| Lockout | `LOCKOUT_MAX_ATTEMPTS`, `LOCKOUT_WINDOW_SECONDS`, `LOCKOUT_DURATION_SECONDS` |
| Providers | `GOOGLE_AUTH_ENABLED`, `GOOGLE_CLIENT_IDS` (comma-separated) |
| OTP / password reset | `OTP_LENGTH`, `OTP_EXPIRY_MINUTES` (default 10), `OTP_SEND_*`, `OTP_VERIFY_MAX_ATTEMPTS`, `RESET_TOKEN_EXPIRY_MINUTES` (default 5) |
| Email | `EMAIL_HOST`, `EMAIL_PORT`, `EMAIL_SECURE`, `EMAIL_USER`, `EMAIL_PASSWORD`, `EMAIL_FROM` |

The old aliases `CORS_ORIGIN` and `GOOGLE_CLIENT_ID` are no longer read; use `ALLOWED_ORIGINS` and
`GOOGLE_CLIENT_IDS`.

`TRUSTED_PROXY_COUNT` is applied only when `NODE_ENV=production` (`src/server.ts:28-30`). In
development `req.ip` is the socket address.

The API is mounted at a fixed `/api/v1` (`src/server.ts:102`) — it is not configurable, because a
prefix that varies per deployment makes every client's docs, Postman collection and frontend differ
for no benefit.

**Branding.** `APP_NAME` is the name in outbound email and in the `/health` payload
(`src/server.ts:78`). `APP_LOGO_URL` is optional: unset, the email header renders the name as text
rather than a broken image (`src/modules/notification/email/templates.ts:20-28`). Cloning the
starter for a client means setting these two, not editing templates.

`.env.example` lists every variable with a comment. Its numbers and switches match the code
defaults in `env.ts`; `REDIS_URL` and `ALLOWED_ORIGINS` are filled in with local-development values
that the code does not default to, and `EMAIL_FROM` holds a placeholder address. Copy it to `.env` to
start. `COOKIE_SECRET` stays empty on purpose: the file is committed, so any value in it is public.

The file ends with a commented **TEST MODE** block of short lifetimes (2-minute sessions, OTP and
reset codes; a 60-second lockout after 3 wrong passwords; low rate limits) for testing expiry by
hand. Uncomment a line to use it: dotenv lets a later duplicate key override an earlier one.

---

## Rules

- **Never read `process.env` outside `config/env.ts`.** Scattered reads cannot be validated, and a
  typo becomes `undefined` at runtime instead of an error at boot. Module config uses `readInt`.
- **No product-specific config in `src/config/`.** Module configuration belongs to the module
  (CLAUDE.md hard rule 6), in `src/modules/<x>/config.ts`.
- **No magic numbers in code** — [../standards/coding-practices.md §5](../standards/coding-practices.md).
- Production secrets belong in a vault, not in a file on the box. `.env*` is gitignored except
  `.env.example`.
