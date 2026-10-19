# Configuration

Everything the server reads at boot is in `src/config/env.ts`, exported as `envConfig`. Nothing
else in the codebase may read `process.env` — one place to look, one place to validate.

---

## The three tiers

Every value belongs in exactly one of these. **If a new client requirement makes you edit tier 1,
the design has drifted.**

| Tier | Holds | Changed by | Examples |
|---|---|---|---|
| **Code** | true for every project, forever | a pull request | the permission catalog, session verification, the limiter algorithm |
| **Env** | differs per deployment | ops | `MONGO_URI`, `JWT_SECRET`, `APP_NAME`, rate-limit numbers |
| **Seed data** | differs per client | editing a seed array, then re-seeding | roles, role→permission grants, scopes |

This is what makes the starter reusable. Onboarding a client should touch `.env`,
`seed/roles.ts` and `seed/permissions.ts` — nothing else.

---

## Fail fast

Secrets have **no fallback**. `JWT_SECRET` and `COOKIE_SECRET` throw at boot when missing, with a
message naming the variable and how to generate one.

The previous code defaulted `JWT_SECRET` to a hardcoded string. Shipping without the variable set
meant signing tokens with a value that is public in the git history, and nothing would have looked
wrong. A refusal to start is loud; a silent insecure default is not.

Redis connectivity is the same: failure to connect **exits the process** rather than logging a
warning and continuing.

---

## Groups

| Group | Notable |
|---|---|
| Branding | `APP_NAME`, `APP_LOGO_URL` |
| Core | `NODE_ENV`, `PORT`, `TRUSTED_PROXY_COUNT`, `ALLOWED_ORIGINS` |
| Database | `MONGO_URI` |
| Redis | `REDIS_URL` or host/port/password, timeouts, retries |
| Session | `SESSION_EXPIRY_MS`, `SESSION_ABSOLUTE_MAX_MS`, `SESSION_MAX_PER_USER` |
| Cookies | `COOKIE_NAME`, `COOKIE_SECRET`, `COOKIE_DOMAIN`, `COOKIE_MAX_AGE_MS` |
| Rate limits | `RATE_LIMIT_*` per bucket — max and window seconds |
| Lockout | `LOCKOUT_MAX_ATTEMPTS`, `LOCKOUT_WINDOW_SECONDS`, `LOCKOUT_DURATION_SECONDS` |
| Providers | `GOOGLE_AUTH_ENABLED`, `GOOGLE_CLIENT_IDS` |
| Email / OTP | SMTP settings, OTP length and expiry |

The API is mounted at a fixed `/api/v1` (`src/server.ts:103`) — it is not configurable, because a
prefix that varies per deployment makes every client's docs, Postman collection and frontend differ
for no benefit.

**Branding.** `APP_NAME` is the name in outbound email and in the `/health` payload. `APP_LOGO_URL`
is optional: unset, the email header renders the name as text rather than a broken image
(`src/modules/notification/email/templates.ts:53-63`). Cloning the starter for a client means
setting these two, not editing templates.

`.env.example` is the authoritative list, with a comment on every entry explaining what it does and
which are required. Copy it to `.env` to start.

---

## Rules

- **Never read `process.env` outside `config/env.ts`.** Scattered reads cannot be validated, and a
  typo becomes `undefined` at runtime instead of an error at boot.
- **No product-specific config in `src/config/`.** Module configuration belongs to the module.
  `COUPON_REDEEM_*` currently violates this and should move when the coupon module is dealt with.
- **No magic numbers in code.** A timeout, a cap or a window is config with a documented default.
- Production secrets belong in a vault, not in a file on the box. `.env*` is gitignored except
  `.env.example`.
