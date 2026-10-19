# Auth module

> **Verified against the code on 2026-10-19** (branch `fix/code-audit-and-deps`). Built: Redis
> sessions, lockout, CSRF, the Google provider, OTP flows and the audit log. **Target design — not
> built:** permissions as database rows ([authorization.md](authorization.md)) and the Postgres schema
> ([data-model.md](data-model.md)). Each page says which it is. No production build has been run.

**One-line summary:** an opaque session token in an httpOnly per-portal cookie, hashed at rest in
Redis, one entry per device. Authenticating a request costs one Redis round trip and no database
call; revoking a session deletes it.

**There is no JWT and no refresh token.** A JWT that still needs a server-side lookup adds crypto to
every request and buys nothing, so the layer was dropped; opaque sessions revoke instantly on their
own. The reasoning and sources are in [../../decisions.md](../../decisions.md).

| Document | Covers | Status |
|---|---|---|
| [flows.md](flows.md) | login, the hot path, revocation, lockout, CSRF | **built** |
| [security.md](security.md) | the hardening requirements | mixed — marked per section |
| [data-model.md](data-model.md) | Postgres schema; cookies as built | target design, plus one built section |
| [authorization.md](authorization.md) | permissions as data, `own`/`tenant`/`any` scope | target design — not built |
| [legacy-migration.md](legacy-migration.md) | what the inherited code did, and why it was replaced | historical |

---

## The big picture

```mermaid
flowchart LR
  subgraph Client
    W["Web app<br/>session cookie + csrf cookie"]
    M["Mobile / S2S<br/>same cookies + header"]
  end

  subgraph API["Express API"]
    AUTHN["authenticate(roleCode)<br/>one Redis round trip, no DB"]
    AUTHZ["authorizeRoles(...)<br/>reads the session's availableRoles"]
    SVC["controllers / services"]
  end

  subgraph Stores
    R[("Redis<br/>sess:sid · user:id:sessions<br/>lockout · rate limits · OTP")]
    P[("MongoDB<br/>users · roles · user roles · audit")]
  end

  W -- "cookies + x-csrf-token on writes" --> AUTHN
  M -- "cookies + x-csrf-token on writes" --> AUTHN
  AUTHN <--> R
  AUTHN --> AUTHZ --> SVC --> P

  classDef hot fill:#0b7285,stroke:#0b7285,color:#fff
  class AUTHN,R hot
```

**The load-bearing idea:** the highlighted path is the hot path, and it touches **Redis only**.
Authenticating a request costs one Redis round trip (GET + TTL in one MULTI on the session key) and
no database call. It writes only when less than half the session TTL remains: an EXPIRE on the
session key and its user index, fire-and-forget. Details and citations: [flows.md §2](flows.md#2-authenticated-request--the-hot-path).

Services today call Mongoose models directly. `models/<X>/repo.ts` for every entity is the target
design — today only the Redis-backed `models/Session/` has a `repo.ts`.

### What that costs, and how the cost is paid

The session record carries the display fields `req.user` promises, so the middleware never loads the
user. A copy can go stale, so every write that changes one either **rewrites** the copy or
**destroys** the session:

```mermaid
flowchart TD
  subgraph Writes["Something changes about the user"]
    P["Profile edited<br/>name · avatar"]
    V["Email verified"]
    S["Account suspended"]
  end

  P --> SY["syncSessionUser(userId, user)"]
  V --> SY
  S --> RV["revokeUserSessions(userId)"]

  SY --> RW["rewrite user{} in every<br/>session for that user"]
  RV --> DEL["delete every session<br/>reason: account_inactive"]

  RW --> R[("Redis<br/>sess:sid")]
  DEL --> R
  R --> HP["next request reads<br/>fresh data, or gets 401"]

  classDef danger fill:#c92a2a,stroke:#c92a2a,color:#fff
  class S,RV,DEL danger
```

**The red path is the security-critical one.** `authenticate` does not check `user.status`, so
revocation on suspension is the only thing that ends a suspended account's access
(`auth/index.ts:23-26`, `user/controllers/admin/managedUser.ts:249-254`).

**Roles are the exception: they are cached and not kept honest.** `authorizeRoles` reads the
session's `availableRoles`, a snapshot taken at login (`authenticate.ts:57-60`). `switch-role`
writes the same snapshot back (`portalAuth.ts:73-77`), and no endpoint revokes or changes a user
role. A role change in MongoDB reaches a device only when that session ends and the user logs in
again — that includes deactivating a role, which the next login skips (`UserRole/schema.ts:72-81`)
but a live session keeps. Full detail: [flows.md — What the session copy does decide](flows.md#what-the-session-copy-does-decide-roles).

---

## API surface

Mounted at `/api/v1/<portal>/auth/...` (`auth/index.ts:31-36`). Portals: `admin`, `vendor`,
`associate`, `customer` (`cookieHelper.ts:6-11`). Each portal has its own router, so
**availability differs** — read from `routes/<portal>/auth.ts`.

A ✅ in CSRF means the route needs the `x-csrf-token` header, from browsers and mobile clients alike
unless `CSRF_ENABLED=false` ([flows.md — Where CSRF fits](flows.md#where-csrf-fits)).

| Endpoint | admin | vendor | associate | customer | CSRF | Notes |
|---|:-:|:-:|:-:|:-:|:-:|---|
| `POST /register` | — | ✓ | ✓ | ✓ | — | Gated by `role.canSelfRegister`; password policy applies; same body whether or not the email exists (`auth.service.ts:58-107`). 201, `message` at top level, `data: { user, role, requiresEmailVerification }` |
| `POST /login` | ✓ | ✓ | ✓ | ✓ | — | Sets the cookies; `data: { user, csrfToken }`, or `{ requiresEmailVerification, email }` with no cookie ([flows.md §1](flows.md#1-login)) |
| `POST /oauth/:provider` | ✓ | ✓ | ✓ | ✓ | — | Only `google` is registered (`providers/registry.ts:4-6`). Unknown or disabled → 404 `PROVIDER_NOT_AVAILABLE`. `data: { user, isNewUser, csrfToken }` |
| `POST /logout` | ✓ | ✓ | ✓ | ✓ | ✅ | Deletes this session. `message` at top level, no `data` (`portalAuth.ts:48-63`) |
| `POST /logout-all` | ✓ | ✓ | ✓ | ✓ | ✅ | Deletes every session for the user. `message` at top level, no `data` |
| `GET /me` | ✓ | ✓ | ✓ | ✓ | — | `data: { user }`, from `req.user` |
| `GET /sessions` | ✓ | ✓ | ✓ | ✓ | — | `data: { sessions }` — this user's devices |
| `DELETE /sessions/:sid` | ✓ | ✓ | ✓ | ✓ | ✅ | Revoke one device; 404 if not the caller's. `message` at top level, `data: { sid }` |
| `POST /switch-role` | ✓ | ✓ | ✓ | — | ✅ | Sets `activeRole` to a code in the session's `availableRoles`; `data: { activeRole }` |
| `GET /roles` | — | ✓ | ✓ | — | — | Approved roles read from MongoDB; `data: { roles }` |
| `POST /request-role` | — | ✓ | ✓ | — | ✅ | Creates a user role for a `canSelfRegister` role. `PENDING`, unless that role has `autoApproveOnSignup` (`UserRole/schema.ts:107-112`). **No endpoint approves a `PENDING` request.** `message` at top level — `Role granted.` if approved, otherwise `Request submitted. Awaiting admin approval.` (`portalAuth.ts:93-96`) — and `data: { role }` |
| `POST /verify-email` · `POST /send-otp` | — | ✓ | ✓ | ✓ | — | Same response whether or not the account exists |
| `POST /forgot-password` · `POST /verify-otp` · `POST /reset-password` | ✓ | ✓ | ✓ | ✓ | — | Reset clears the lockout and revokes every session (`passwordReset.ts:140-141`) |
| `GET /referral-code` | — | ✓ | ✓ | — | — | Served by the **referral** module at this URL (`referral/index.ts:14-15`), not by auth |

Handlers: `controllers/<portal>/index.ts` builds `register`, `login`, `logout`, `logoutAll`,
`getMe`, `switchRole`, `getAvailableRoles`, `requestRole` and `socialLogin` from
`createPortalAuthController` (`portalAuth.ts:11-110`), and re-exports `forgotPassword`,
`verifyResetOtp`, `resetPassword`, `verifyEmailOtp`, `sendEmailOtp`, `listSessions` and
`revokeSessionById` from `controllers/shared/`.

**No `/refresh`.** There is no refresh token — see [../../decisions.md](../../decisions.md).

---

## Where the code lives

```
src/
├─ config/env.ts                     # fail-fast secrets, readInt-validated numbers
├─ middlewares/rateLimit.ts          # own Redis limiter (global + per route)
├─ modules/auth/
│  ├─ index.ts                       # front door: register, authenticate, authorizeRoles, verifyCsrf, …
│  ├─ signupHooks.ts                 # setSignupHook — how a product module joins registration
│  ├─ middlewares/
│  │  ├─ authenticate.ts             # authenticate(roleCode) + authorizeRoles
│  │  └─ csrf.ts                     # session-bound double-submit
│  ├─ services/
│  │  ├─ auth.service.ts             # register, login, logout-all, switch / request role
│  │  ├─ session.service.ts          # create / verify / revoke / list devices, reset sessions
│  │  ├─ password.service.ts         # credential check, hashing, policy + HIBP
│  │  ├─ lockout.service.ts          # per-account counters in Redis
│  │  └─ identity.service.ts         # provider identity → find / link / create user
│  ├─ providers/{google,registry,types,index}.ts
│  ├─ helpers/otp.ts                 # generateOtp, storeOtp, verifyOtp, clearOtpKeys
│  ├─ models/Session/{index,types,repo}.ts
│  ├─ validators/index.ts            # zod schemas
│  ├─ controllers/{admin,vendor,associate,customer}/ + shared/
│  └─ routes/<portal>/auth.ts + routes/shared/limits.ts
├─ modules/audit/                    # AuditLog model + record()
├─ modules/user/models/{User,Role,UserRole}/
└─ utils/{cookieHelper,redisKeys}.ts # portal map + cookies; every Redis key builder
```

**Front door** (`auth/index.ts:38-50`): `register`, `registerUser`, `hashPassword`,
`assertPasswordAllowed`, `revokeUserSessions`, `syncSessionUser`, `authenticate`,
`authorizeRoles`, `verifyCsrf`, `setSignupHook`, and the `SignupHook` type.

**Signup hook.** Auth knows nothing about referrals. The referral module registers one hook
(`referral/index.ts:10`, implemented in `referral/signupHook.ts`). Auth runs it before creating the
user, so a rejected referral code leaves nothing behind, and calls the function it returns once the
role is assigned (`signupHooks.ts:13-15`, `auth.service.ts:69,124,237,243`). Delete the referral
module and registration still works — the hook is simply never set.

**Target design — not built**, named so nobody hunts for them: `config/prisma.ts`,
`middlewares/authorize.ts` (`requirePermission`), `seed/permissions.ts`, `req.actor`, the `prisma/`
schema, and `models/<X>/repo.ts` for the Mongo entities. Models are Mongoose `schema.ts` today.

**The reuse test** (not yet achievable — roles are still a `ROLE_CODE` enum,
`user/models/Role/types.ts:10-16`): onboarding a client should touch `seed/roles.ts`,
`seed/permissions.ts` and `.env`, nothing else. If adding a role means opening a controller, the
design has drifted.
