# Project Structure Guide

> **Verified against the code on 2026-10-19**, except sections marked **Target design — not built**.
> Line numbers refer to the working tree. Examples marked *illustrative* name code that does not exist.

This is the blueprint every project cloned from this starter follows. It is intentionally simple: a
few clear rules, repeated everywhere.

The stack today is **Node.js + Express 5 + TypeScript + MongoDB (Mongoose) + Redis**
(`package.json:28` pins `express ^5.3.0`). PostgreSQL + Prisma v7 is the decided target and is not
built (§16). Code is split into **modules** (one per business domain), and inside each module
everything follows the **same shape**.

---

## 1. The Golden Rules (read these first)

1. **Everything lives under `src/`.** Config files (package.json, tsconfig, etc.) stay at the root.
2. **One module = one business domain** (auth, user, audit, notification, referral, dashboard).
3. **Inside a module, code is split by layer:** `routes/` → `controllers/` → `services/` → `models/`,
   with `validators/` at the edge.
4. **Routes and controllers are split by audience:** `admin/`, `vendor/`, `associate/`, `customer/`, `public/`.
5. **A model is its own folder** of 3 files: `index.ts`, `types.ts`, and `schema.ts` (Mongoose) or
   `repo.ts` (Redis-backed today; every entity in the Prisma target) — §5.
6. **`index.ts` is always the "front door"** of a folder — it wires things up and re-exports.
7. **Shared, app-wide code lives outside modules:** `config/`, `constants/`, `middlewares/`,
   `routes/`, `types/`, `utils/`, `scripts/`.
8. **Import with path aliases (`@user/...`), never long `../../../` chains.**
9. **Cross-module imports go through the other module's `index.ts`**, except models, which may be
   imported directly (§12 Rule 1).

---

## 2. The Request Flow (how a request travels)

```
HTTP request
   │
   ▼
server.ts                  ← helmet, CORS, compression, /health, global rate limit,
   │                         body parsers, cookies, HTTP log; mounts /api/v1 (server.ts:32-104)
   ▼
routes/index.ts            ← auth registers first, then verifyCsrf, then every other module
   │                         (routes/index.ts:11-19)
   ▼
modules/<domain>/index.ts  ← register(): mounts that module's routers (e.g. /admin/roles)
   │
   ▼
routes/<audience>/<name>.ts← URLs + authenticate(role) + authorizeRoles(...) + validate({...})
   │
   ▼
controllers/<audience>/    ← HTTP plumbing: read req, call a service, respond via utils/response.ts
   │
   ▼
services/                  ← business rules
   │
   ▼
models/<Model>/            ← Mongoose schema (today) or repo.ts (Redis today; Prisma target)
```

**Remember it as:** `server → routes → module → audience route → controller → service → model`.

Controllers in `referral/` and `dashboard/` and some in `auth/` and `user/` still query
Mongoose directly. That is legacy; the rule is controller → service → model (CLAUDE.md hard rule 3).

---

## 3. Top-Level Layout (what each folder is for)

| Path | What it holds | Rule of thumb |
|------|---------------|---------------|
| `src/server.ts` | App entry point. Builds Express, mounts middleware & routes, starts and shuts down the server. | One file. No business logic. |
| `src/routes/index.ts` | The master router. Registers every module. | One line per new module. |
| `src/config/` | `env.ts` (read & validate every env var, export `envConfig` and `readInt`), `database.ts` (connect/disconnect). | No product-specific config here (CLAUDE.md hard rule 6). |
| `src/middlewares/` | App-wide Express middleware: `errorMiddleware`, `httpLogger`, `rateLimit`, `requestId`, `validate`. | Auth middleware is not here — it lives in `modules/auth/middlewares/` and is exported from `@auth/index`. |
| `src/utils/` | Reusable helpers with no business knowledge: `apiError`, `response`, `logger`, `redisClient`, `redisKeys`, `cookieHelper`, `format`, `mongoHelper`, `catchAsync`. | If it knows about referrals or vendors, it is not a util. |
| `src/constants/` | Fixed values shared across the app. | `authErrors.ts` (`AUTH_ERRORS`). |
| `src/types/` | Global TypeScript types. | `express.d.ts` extends the Request object. |
| `src/scripts/` | Operator CLIs run by hand or via an npm script; never imported by app code. | `reset-db.ts` (`npm run db:reset -- <dbName>`). |
| `src/modules/` | **All business features**, one folder per domain. | This is where you spend most of your time. |

### Core and product

The reusable **core** is `src/config`, `constants`, `middlewares`, `routes`, `utils`, `scripts`,
`types`, `server.ts`, and the modules `auth`, `user`, `audit` and `notification`. The **product**
modules `referral` and `dashboard` are a client example.

Core has no dependency on product except the two registrations in `src/routes/index.ts:5-6` and
`:18-19`. Removing the product means deleting the two module folders, those lines, and the
`@referral/*`, `@dashboard/*` aliases (`tsconfig.json:33-34`). Auth reaches referral
only through the signup hook (§12).

---

## 4. Anatomy of a Module (the pattern to repeat)

Every module uses only the folders it needs, from this set:

```
modules/<domain>/
├── index.ts            ← front door: register(router) and/or the module's public API
├── routes/             ← URL definitions, one folder per audience
│   └── <audience>/<name>.ts
├── validators/
│   └── index.ts        ← zod schemas for body, params and query
├── controllers/        ← thin HTTP layer: read req → call service → respond
│   └── <audience>/index.ts  (+ named files when one audience has many actions)
├── services/           ← business rules, reused across audiences
│   └── <name>.service.ts
├── models/             ← one folder per entity (§5)
│   └── <Entity>/
├── helpers/            ← domain-specific helpers (e.g. user/helpers/upload.ts)
├── seed/               ← seed scripts (user/seed/)
└── config.ts           ← this module's env-driven config, read with readInt (no module has one today)
```

Which modules have which layers today:

| Module | routes | validators | controllers | services | models | other |
|---|---|---|---|---|---|---|
| `auth` | ✅ | ✅ | ✅ | ✅ | `Session/` (repo.ts) | `middlewares/`, `providers/`, `helpers/`, `signupHooks.ts` |
| `user` | ✅ | ✅ | ✅ | — | `User/`, `Role/`, `UserRole/` | `helpers/`, `seed/` |
| `audit` | — | — | — | ✅ | `AuditLog/` | front door exports `record` only |
| `notification` | — | — | — | — | — | `email/` |
| `referral` | ✅ | — (inline) | ✅ | — | 2 models | `helpers/`, `signupHook.ts` |
| `dashboard` | ✅ | — | ✅ | — | — | |

Product modules validating inside controllers is legacy. New code validates at the edge with zod.

### The layers explained simply (one job each)

Think of a restaurant: the **controller is the waiter**, the **service is the chef**, the **model is
the labeled shelf** where ingredients live.

- **`routes/`** — *"What URLs exist and who can hit them."* Paths, `authenticate(role)`,
  `authorizeRoles(...)`, `validate({...})`, then the controller. No logic.
- **`validators/`** — *"Is the INPUT shaped correctly?"* zod schemas in `validators/index.ts`,
  applied with `validate({ body, params, query })` from `@middlewares/validate`
  (`middlewares/validate.ts:31`). Example: `routes/admin/auth.ts:14`.
- **`controllers/`** — *"HTTP plumbing only."* Reads `req`, calls a service, sends the response via
  `utils/response.ts`. No business rules, no database calls.
- **`services/`** — *"The actual business rules."* e.g. "a referral must be PENDING before it can be
  activated." Takes plain arguments, returns plain data — no `req`, no `res`.
- **`models/`** — *"How data is stored."* Today: the Mongoose schema, its indexes and instance
  methods. Target: `repo.ts` holds every query for that entity (§16).

> **There is no `repositories/` folder in any design.** Database queries live in the entity's
> model folder: Mongoose model calls today, `models/<X>/repo.ts` in the Prisma target.

### Splitting by audience

Routes and controllers are grouped into folders by **audience**. The four portal names come from one
map, `PORTAL` in `utils/cookieHelper.ts:6-11`; auth and user mount their routers from it
(`auth/index.ts:31-36`, `user/index.ts:12-18`).

| Folder | Who | Example |
|--------|-----|---------|
| `admin/` | Internal admins | manage customers, vendors, associates and roles (`user/index.ts:12-15`) |
| `vendor/` | Business vendors | their own profile and referral code (`user/index.ts:17`, `referral/index.ts:15`) |
| `associate/` | Business associates / referrers | onboard referrals, see referral stats (`referral/index.ts:13`, `dashboard/index.ts:5`) |
| `customer/` | End customers | their own profile (`user/index.ts:16`) |
| `public/` | Anyone, no login | none today |

A module only includes the audiences it needs. Logic used by several audiences in one module goes in
a service, or in `controllers/shared/` (see `auth/controllers/shared/`). Do not copy it per audience.

### When to split a file (the only triggers)

Split a file only when one of these fires. Never pre-emptively (CLAUDE.md hard rule 10).

1. **Size** — the file passes roughly **300 lines**, or a reader must scroll past unrelated handlers
   to find one. Split along actions, as `auth/controllers/shared/` is: `passwordReset.ts`,
   `emailVerification.ts`, `sessions.ts`.
2. **An actual second caller** — a second file outside this one really needs the code. Then move it
   to a service, `helpers/`, or `utils/` (no business knowledge).
3. **A real second use case** — the same code must now serve two different purposes. One purpose
   per file.

An abstraction with fewer than three real callers is not created at all (CLAUDE.md hard rule 10;
[coding-practices.md §1](coding-practices.md) rule of three).

---

## 5. Anatomy of a Model Folder (always 3 files)

Every model is a **folder** named in `PascalCase` with exactly three files:

```
models/Referral/                    models/Session/          (auth, Redis-backed)
├── types.ts   ← interface + enums  ├── types.ts
├── schema.ts  ← Mongoose schema    ├── repo.ts    ← every Redis read/write for sessions
└── index.ts   ← front door         └── index.ts
```

| File | Holds |
|---|---|
| `types.ts` | The contract: interfaces (`IReferral`) and `UPPER_SNAKE as const` enums (`REFERRAL_STATUS`). No logic — safe to import anywhere. |
| `schema.ts` | Mongoose models today: fields, validation, indexes, methods. Exports the model as default. |
| `repo.ts` | Instead of `schema.ts`, when the entity is not a Mongoose model: every query for that entity and nothing else. Today only `auth/models/Session/repo.ts` (Redis). In the Prisma target, every entity (§16). |
| `index.ts` | Front door — re-exports the default and everything from `types`. |

**`index.ts` is always tiny** (`referral/models/Referral/index.ts:1-2`, `auth/models/Session/index.ts:1-2`):

```ts
export { default } from './schema';   // or './repo'
export * from './types';
```

The rest of the app imports the folder, never a file inside it:

```ts
import Referral, { REFERRAL_STATUS } from '@referral/models/Referral';
```

---

## 6. The `index.ts` Convention (the "front door" rule)

`index.ts` always means: **"this is how the outside world enters this folder."**

| Where | What its `index.ts` does |
|-------|--------------------------|
| `modules/<domain>/index.ts` | Exports `register(router)` if the module has routes, plus the module's public API. |
| `models/<Model>/index.ts` | Re-exports the model (or repo) + its types. |
| `controllers/<audience>/index.ts` | The default controller file for that audience. |

A module's `index.ts` is wiring plus its public surface. From `auth/index.ts:31-49`:

```ts
const register = (router: Router): void => {
  router.use(`/${PORTAL.ADMIN}/auth`, adminAuthRoutes);
  router.use(`/${PORTAL.VENDOR}/auth`, vendorAuthRoutes);
  // ...
};

export { register, registerUser, hashPassword, authenticate, authorizeRoles, verifyCsrf, setSignupHook /* ... */ };
```

`audit` and `notification` have no routes, so their front doors export only their API
(`audit/index.ts:1-3`, `notification/index.ts:1-2`).

`routes/index.ts` calls every `register` (`routes/index.ts:11-19`):

```ts
authModule.register(router);
router.use(verifyCsrf);   // everything below already has a session
userModule.register(router);
referralModule.register(router);
// ...one line per module
```

---

## 7. Path Aliases (no more `../../../`)

Defined in `tsconfig.json:24-36`. Always import with these:

| Alias | Points to |
|-------|-----------|
| `@/*` | `src/*` |
| `@config/*` | `src/config/*` |
| `@constants/*` | `src/constants/*` |
| `@middlewares/*` | `src/middlewares/*` |
| `@utils/*` | `src/utils/*` |
| `@auth/*` | `src/modules/auth/*` |
| `@audit/*` | `src/modules/audit/*` |
| `@user/*` | `src/modules/user/*` |
| `@referral/*` | `src/modules/referral/*` |
| `@dashboard/*` | `src/modules/dashboard/*` |
| `@notification/*` | `src/modules/notification/*` |

There is no `@modules/*` alias. **Rule:** every new module gets its own `@<module>/*` alias here.

---

## 8. Naming Conventions (keep it consistent)

| Thing | Style | Example |
|-------|-------|---------|
| Folders (general) | lowercase | `controllers/`, `routes/` |
| Model folders | PascalCase | `Referral/`, `Session/` |
| Files | camelCase | `cookieHelper.ts`, `requestId.ts` |
| Service files | `<name>.service.ts` | `session.service.ts` |
| Audience folders | lowercase audience name | `admin/`, `vendor/` |
| Module front door | `index.ts` | always |
| Enums/constants | `UPPER_SNAKE` object `as const` | `REFERRAL_STATUS`, `ROLE_CODE`, `AUTH_ERRORS` |
| Model interface | `I` + name | `IReferral`, `IUser` |
| URL prefix per audience | plural noun | `/admin/roles`, `/admin/vendors` |

---

## 9. Where Do I Put...? (quick decision guide)

| I want to add... | Put it in... |
|------------------|--------------|
| A new business feature (whole domain) | `src/modules/<newdomain>/` — follow §10 |
| A new data entity | `modules/<domain>/models/<Entity>/` (3 files, §5) |
| A new endpoint for an existing feature | `modules/<domain>/routes/<audience>/` + matching controller |
| Input validation for a request | zod schema in `modules/<domain>/validators/index.ts`, applied with `validate({ body, params, query })` |
| Business rules / logic (reused across audiences) | `modules/<domain>/services/<name>.service.ts` |
| Database queries | Today: Mongoose model calls from a service. Target: `models/<Entity>/repo.ts` (§16). Never a `repositories/` folder |
| Logic shared between audiences in a module | a **service** (preferred) or `controllers/shared/` |
| A reusable helper with no business knowledge | `src/utils/` |
| A domain-specific helper (image upload, email template) | `modules/<domain>/helpers/` (`user/helpers/`, `referral/helpers/`) |
| A constant used across the app | `src/constants/` |
| A constant used by one model | that model's `types.ts` |
| An app-wide middleware (logging, errors, limits) | `src/middlewares/` |
| Auth middleware | `modules/auth/middlewares/`, exported from `@auth/index` |
| A global TS type | `src/types/` |
| Core env var reading or DB connection | `src/config/` |
| Env-driven config for one module | `modules/<domain>/config.ts`, read with `readInt` from `@config/env` |
| A seed script | `modules/<domain>/seed/` (see `user/seed/`) |
| An operator CLI | `src/scripts/` |

---

## 10. Checklist: Adding a New Module

The `/new-module` skill walks these steps in order.

0. **Is it a module?** If it cannot exist, be listed, or be ordered **without its parent**, it is a
   sub-entity and lives *inside* the parent module. A product variant is not a module.
1. Create `src/modules/<name>/`.
2. Add `models/<Entity>/` with `types.ts`, `schema.ts` (Mongoose today), `index.ts` (§5).
3. Add `validators/index.ts` — zod schemas for body, params and query.
4. Add `services/<name>.service.ts` — the business rules.
5. Add `controllers/<audience>/index.ts` — thin: call service → respond.
6. Add `routes/<audience>/<name>.ts` for each audience that needs it.
7. Create `index.ts` exporting `register(router)` and the module's public API.
8. Add the `@<name>/*` alias in `tsconfig.json`.
9. Import and call `<name>Module.register(router)` in `src/routes/index.ts`.
10. Register Mongoose models at boot by importing them from the module's `index.ts`, as
    `referral/index.ts:3-4` does (user's models are imported in `server.ts:21-23`).

---

## 11. Full Project Tree

Generated from the files present under `src/` in the working tree on 2026-10-19 (`find src -type f`).

```
.
├── src/
│   ├── config/
│   │   ├── database.ts
│   │   └── env.ts
│   ├── constants/
│   │   └── authErrors.ts
│   ├── middlewares/
│   │   ├── errorMiddleware.ts
│   │   ├── httpLogger.ts
│   │   ├── rateLimit.ts
│   │   ├── requestId.ts
│   │   └── validate.ts
│   ├── modules/
│   │   ├── audit/
│   │   │   ├── models/
│   │   │   │   └── AuditLog/
│   │   │   │       ├── index.ts
│   │   │   │       ├── schema.ts
│   │   │   │       └── types.ts
│   │   │   ├── services/
│   │   │   │   └── audit.service.ts
│   │   │   └── index.ts
│   │   ├── auth/
│   │   │   ├── controllers/
│   │   │   │   ├── admin/
│   │   │   │   │   └── index.ts
│   │   │   │   ├── associate/
│   │   │   │   │   └── index.ts
│   │   │   │   ├── customer/
│   │   │   │   │   └── index.ts
│   │   │   │   ├── shared/
│   │   │   │   │   ├── emailVerification.ts
│   │   │   │   │   ├── oauth.ts
│   │   │   │   │   ├── passwordReset.ts
│   │   │   │   │   ├── portalAuth.ts
│   │   │   │   │   └── sessions.ts
│   │   │   │   └── vendor/
│   │   │   │       └── index.ts
│   │   │   ├── helpers/
│   │   │   │   └── otp.ts
│   │   │   ├── middlewares/
│   │   │   │   ├── authenticate.ts
│   │   │   │   └── csrf.ts
│   │   │   ├── models/
│   │   │   │   └── Session/
│   │   │   │       ├── index.ts
│   │   │   │       ├── repo.ts
│   │   │   │       └── types.ts
│   │   │   ├── providers/
│   │   │   │   ├── google.ts
│   │   │   │   ├── index.ts
│   │   │   │   ├── registry.ts
│   │   │   │   └── types.ts
│   │   │   ├── routes/
│   │   │   │   ├── admin/
│   │   │   │   │   └── auth.ts
│   │   │   │   ├── associate/
│   │   │   │   │   └── auth.ts
│   │   │   │   ├── customer/
│   │   │   │   │   └── auth.ts
│   │   │   │   ├── shared/
│   │   │   │   │   └── limits.ts
│   │   │   │   └── vendor/
│   │   │   │       └── auth.ts
│   │   │   ├── services/
│   │   │   │   ├── auth.service.ts
│   │   │   │   ├── identity.service.ts
│   │   │   │   ├── lockout.service.ts
│   │   │   │   ├── password.service.ts
│   │   │   │   └── session.service.ts
│   │   │   ├── validators/
│   │   │   │   └── index.ts
│   │   │   ├── index.ts
│   │   │   └── signupHooks.ts
│   │   ├── dashboard/
│   │   │   ├── controllers/
│   │   │   │   └── associate/
│   │   │   │       └── index.ts
│   │   │   ├── routes/
│   │   │   │   └── associate/
│   │   │   │       └── dashboard.ts
│   │   │   └── index.ts
│   │   ├── notification/
│   │   │   ├── email/
│   │   │   │   ├── index.ts
│   │   │   │   ├── sender.ts
│   │   │   │   └── templates.ts
│   │   │   └── index.ts
│   │   ├── referral/
│   │   │   ├── controllers/
│   │   │   │   ├── associate/
│   │   │   │   │   └── onboard.ts
│   │   │   │   └── shared/
│   │   │   │       └── referralCode.ts
│   │   │   ├── helpers/
│   │   │   │   └── emailTemplates.ts
│   │   │   ├── models/
│   │   │   │   ├── Referral/
│   │   │   │   │   ├── index.ts
│   │   │   │   │   ├── schema.ts
│   │   │   │   │   └── types.ts
│   │   │   │   └── ReferralCode/
│   │   │   │       ├── index.ts
│   │   │   │       ├── schema.ts
│   │   │   │       └── types.ts
│   │   │   ├── routes/
│   │   │   │   ├── associate/
│   │   │   │   │   ├── referral.ts
│   │   │   │   │   └── referralCode.ts
│   │   │   │   └── vendor/
│   │   │   │       └── referralCode.ts
│   │   │   ├── index.ts
│   │   │   └── signupHook.ts
│   │   └── user/
│   │       ├── controllers/
│   │       │   ├── admin/
│   │       │   │   ├── managedUser.ts
│   │       │   │   └── role.ts
│   │       │   ├── customer/
│   │       │   │   └── profile.ts
│   │       │   └── shared/
│   │       │       └── profile.ts
│   │       ├── helpers/
│   │       │   ├── image.ts
│   │       │   ├── profileFields.ts
│   │       │   └── upload.ts
│   │       ├── models/
│   │       │   ├── Role/
│   │       │   │   ├── index.ts
│   │       │   │   ├── schema.ts
│   │       │   │   └── types.ts
│   │       │   ├── User/
│   │       │   │   ├── index.ts
│   │       │   │   ├── schema.ts
│   │       │   │   └── types.ts
│   │       │   └── UserRole/
│   │       │       ├── index.ts
│   │       │       ├── schema.ts
│   │       │       └── types.ts
│   │       ├── routes/
│   │       │   ├── admin/
│   │       │   │   ├── associate.ts
│   │       │   │   ├── customer.ts
│   │       │   │   ├── managedUser.ts
│   │       │   │   ├── role.ts
│   │       │   │   └── vendor.ts
│   │       │   ├── associate/
│   │       │   │   └── profile.ts
│   │       │   ├── customer/
│   │       │   │   └── profile.ts
│   │       │   └── vendor/
│   │       │       └── profile.ts
│   │       ├── seed/
│   │       │   ├── roles.ts
│   │       │   └── users.ts
│   │       ├── validators/
│   │       │   └── index.ts
│   │       └── index.ts
│   ├── routes/
│   │   └── index.ts
│   ├── scripts/
│   │   └── reset-db.ts
│   ├── types/
│   │   └── express.d.ts
│   ├── utils/
│   │   ├── apiError.ts
│   │   ├── catchAsync.ts
│   │   ├── cookieHelper.ts
│   │   ├── format.ts
│   │   ├── logger.ts
│   │   ├── mongoHelper.ts
│   │   ├── redisClient.ts
│   │   ├── redisKeys.ts
│   │   └── response.ts
│   └── server.ts
├── .claude/
├── docs/
├── .env.example
├── .gitignore
├── CLAUDE.md
├── deploy.sh
├── Dockerfile
├── eslint.config.js
├── package-lock.json
├── package.json
├── postman_collection.json
├── README.md
└── tsconfig.json
```

`user/routes/admin/managedUser.ts` is a router factory, not a mounted router: `customer.ts`,
`vendor.ts` and `associate.ts` beside it each call `makeManagedUserRouter` for one role
(`user/routes/admin/customer.ts:1-9`).

---

## 12. Cross-Module Dependencies & Features That Span Modules

Modules are **not** islands — `referral` needs `user`, `dashboard` reads `referral`, `auth` sends
emails via `notification`. That is normal. The question is **how** they link without turning into
spaghetti.

### The real dependency map (today)

Read from the imports in `src/modules/` on 2026-10-19. "(models)" means the edge is model imports
only.

```
auth         ──→ user (models), audit, notification
user         ──→ auth, audit
referral     ──→ auth, user (models), notification
dashboard    ──→ auth, user (models), referral (models)
audit        ──→ (none — leaf)
notification ──→ (none — leaf)
```

Representative edges: `auth/services/auth.service.ts:2` (User model),
`auth/controllers/shared/oauth.ts:6` (`@audit/index`),
`auth/controllers/shared/emailVerification.ts:3` (`@notification/index`),
`referral/controllers/associate/onboard.ts:4` (User model),
`dashboard/controllers/associate/index.ts:1` (Referral model).

- `audit` and `notification` are **leaves** — they import only core code. That is healthy: stable,
  low-level modules at the bottom.
- **`auth` does not import `referral`.** Signup runs a hook (`auth/services/auth.service.ts:69,237`)
  that `referral` registers at load time: `setSignupHook(referralSignupHook)`
  (`referral/index.ts:10`), implemented in `referral/signupHook.ts`. Delete `referral/` and signup
  still works — the hook is simply unset (`auth/signupHooks.ts:23`).
- ⚠️ **`auth ↔ user` is circular.** `auth` reads the user models; `user` calls back into `auth` for
  what it cannot own — checking and hashing a password, revoking a suspended account's sessions,
  refreshing the display fields a session caches, and the route middleware
  (`user/controllers/admin/managedUser.ts:3`, `user/controllers/shared/profile.ts:2`,
  `user/seed/users.ts:2`, `user/routes/admin/role.ts:3`). Session lifecycle is genuinely `auth`'s
  job, so the edge is real. **What keeps it safe:** `user` imports only `@auth/index`, so the surface
  is a handful of named functions, not the module.
- `dashboard` depends on `referral` and `user` — also healthy: it is a **high-level** module that
  *reads* from others. Dependencies point *downward*.

### Rule 1 — Import another module only through its `index.ts`, except models

Cross-module imports go through `@<module>/index`. **Models are the one exception** and may be
imported directly (`@user/models/User`): routing models through `index.ts` creates load-order
cycles, because a module's `index.ts` imports its routes, which import other modules. Never reach
into another module's `controllers/`, `services/`, `routes/`, `validators/`, `helpers/` or
`middlewares/`, and never past a model folder's `index.ts`.

```ts
// ✅ good
import { authenticate, authorizeRoles } from '@auth/index';
import { record, AUDIT_ACTION } from '@audit/index';
import User from '@user/models/User';

// ❌ bad — internals of another module
import sessionService from '@auth/services/session.service';
import Referral from '@referral/models/Referral/schema';
```

Today there are no violations: every cross-module import is `@<x>/index` or a model folder. A
module importing its *own* files through its own alias (`@user/routes/admin/managedUser` inside
`user/`) is not cross-module.

### Rule 2 — Keep dependencies pointing ONE direction (no cycles)

Picture modules in layers. Arrows may only point **down**:

```
                dashboard            ← high-level (reads others)
                    ↓
                referral             ← product module
               ↙    ↓
            auth ── user             ← core (auth ↔ user is the known cycle)
               ↘    ↓
          audit   notification       ← leaves
```

If two modules need each other (like `auth ↔ user`), fix it one of four ways:

1. **Move the shared piece down** into a module both can depend on.
2. **Pick an owner.** One module owns the relationship and exposes a function through its
   `index.ts`; the other calls it — not the reverse.
3. **Register a hook**, as `auth` and `referral` do (`auth/signupHooks.ts`): the lower module
   defines a slot, the higher one fills it, and the lower one never imports the higher.
4. **Use an event** (Rule 3) so neither imports the other.

### Rule 3 — For "when X happens, also do Y", use events (decoupling)

> **Target design — not built.** There is no event bus in `src/` today.

When a feature spans modules and you do not want hard imports, emit an **event** instead of calling
the other module. *Illustrative — there is no `order` module:*

```ts
// order/services/order.service.ts
events.emit('order.placed', { orderId, customerId });   // order knows nothing about email

// notification/listeners/order.listener.ts
events.on('order.placed', ({ customerId }) => sendEmail(customerId, templates.orderPlaced));
```

Listeners would live in `modules/<domain>/listeners/` — created only when the first one exists.
Until then, the signup hook (Rule 2, option 3) covers the one case the code has.

### Rule 4 — A feature that spans modules → an *orchestrator service*

When one user action touches several modules (e.g. "place an order" = reserve stock + create order +
credit referral + send receipt), give it one **service that orchestrates** the others, in the module
that **owns the action**. *Illustrative — there is no `order` module and none of these functions exist:*

```ts
// order/services/checkout.service.ts
export const placeOrder = async (customerId: string, cartId: string) => {
  const cart = await assertCheckoutable(cartId);            // order's own rule
  const order = await createOrder(customerId, cart);
  await creditIfReferred(customerId, order);                 // referral, via @referral/index
  return order;
};
```

### Quick decision guide

| Situation | Do this |
|-----------|---------|
| Module A needs data from module B | Import B's model folder or a function from `@B/index`; arrows point down |
| Two modules import each other (cycle) | Move shared part down, pick an owner, register a hook, or use an event |
| "When X happens, also notify / log / sync" | A hook today; an event once a bus exists |
| One action spans 3+ modules | **Orchestrator service** in the module that owns the action |
| Same helper/type needed by many modules | `src/utils/` or `src/constants/` — only if it has no business knowledge |

---

## 13. Engineering Conventions (the daily "how we build" decisions)

Folder structure is *half* the picture. These conventions keep 100+ files behaving like one codebase.

### A. API response shape — always `response` / `ApiError`

Never hand-roll `res.json(...)` (CLAUDE.md hard rule 8). Every endpoint returns the same envelope.

```ts
// success → utils/response.ts:22,29
return response.success(res, data, 200, 'Optional message');
return response.created(res, data);            // 201

// failure → throw; errorMiddleware formats it (utils/apiError.ts:18-40)
throw ApiError.conflict('A user with this email already exists', 'EMAIL_EXISTS');   // user/controllers/admin/managedUser.ts:186
throw ApiError.notFound('Role not found', 'ROLE_NOT_FOUND');                         // user/controllers/admin/role.ts:13
throw ApiError.fromAuthError(AUTH_ERRORS.SESSION_REQUIRED);   // one argument: the entry carries status
```

Result:

```jsonc
{ "success": true,  "data": { ... } }
{ "success": false, "message": "...", "code": "EMAIL_EXISTS" }
```

`errorMiddleware` always sends a `code` (`middlewares/errorMiddleware.ts:42-78`).

### B. Async handlers — wrap in `catchAsync`

Express 5 forwards a rejected promise from an async handler to the error middleware on its own.
`catchAsync` (`utils/catchAsync.ts:5-8`) is kept anyway: it gives every handler one typed signature
and keeps controllers uniform.

```ts
const create = catchAsync(async (req, res) => { ... });
```

`errorMiddleware` (registered last, `server.ts:104`) formats everything. **Rule:** throw `ApiError`
for expected failures; never `res.status(500)` by hand.

### C. Auth & roles — middleware on the route, not in the controller

Authorization is declared where the URL is defined (`user/routes/admin/managedUser.ts:14`):

```ts
const requireAdmin = [authenticate(ROLE_CODE.ADMIN), authorizeRoles(ROLE_CODE.ADMIN, ROLE_CODE.SUPER_ADMIN)];
router.get('/', ...requireAdmin, controller.list);
```

**Rules:** every non-public route starts with `authenticate(role)` — the role is required, and it
picks the portal whose session cookie is accepted (`auth/middlewares/authenticate.ts:32-38`). Role
checks use `ROLE_CODE` constants, never raw strings. Today `authorizeRoles` checks the session's
`availableRoles`, not `activeRole` (`auth/middlewares/authenticate.ts:57-60`; open question 1 in
[decisions.md](../decisions.md), "Open").

> **Target design — not built:** permissions as database rows with `own`/`tenant`/`any` scope,
> checked by `requirePermission('<resource>:<action>')` — see
> [modules/auth/authorization.md](../modules/auth/authorization.md).

### D. Config & secrets — only through `@config/env`

Never read `process.env` outside `src/config/env.ts`; import `envConfig`. Secrets live in `.env`
(git-ignored); `.env.example` is the template. **Rules** (CLAUDE.md hard rule 5):

- A missing required secret throws at boot. No hardcoded fallbacks.
- Every numeric env value — `PORT` included (`config/env.ts:176`) — is read with `readInt`, exported
  from `@config/env` (`config/env.ts:145-154`). A bad value names itself and stops the process.
- A module's own config lives in the module, not in `src/config/` (CLAUDE.md hard rule 6), in
  `modules/<domain>/config.ts`, read with `readInt`. No module needs one today.

### E. Logging — `@utils/logger` (Winston), never `console`

```ts
logger.info(`${envConfig.APP_NAME} started`);
logger.error('Redis init failed', { code: err.code });
```

`httpLogger` + `requestId` middleware tag each request. **Rule:** no `console.*` in committed code
(CLAUDE.md hard rule 8). ESLint warns on `console.log`/`info`/`debug` but **allows**
`console.warn` and `console.error` (`eslint.config.js:52`), so the linter does not catch those two —
review does.

### F. Redis — go through the helpers and the key builders

Use the `@utils/redisKeys` helpers (`setKey`, `getKey`, `delKey`, `getKeyWithTtl`,
`incrementWithTTL`, …), never the raw client. Build every key with a builder from the same file
(`utils/redisKeys.ts:25-39`):

| Builder | Key |
|---|---|
| `sessionKey(sid)` | `sess:<sid>` |
| `userSessionsKey(userId)` | `user:<userId>:sessions` |
| `loginFailKey(userId)` / `loginLockKey(userId)` | `login:fail:<userId>` / `login:lock:<userId>` |
| `resetSessionKey(resetId)` | `reset_session:<resetId>` |
| `otpKey(purpose, email, part)` | `otp:<purpose>:<hash of email>:<code\|attempts\|send_count>` |
| `rateLimitKey(bucket, scope, id)` | `rl:<bucket>:<ip\|acct>:<hash of id>` |

**Rule:** a new key gets a builder there, and volatile data always gets a TTL. Emails and IPs are
hashed into keys with `identifierHash` (`utils/redisKeys.ts:22-23`).

### G. Validation — reject bad input at the edge

zod schemas in the module's `validators/index.ts`, applied on the route with
`validate({ body, params, query })` (`middlewares/validate.ts:31-50`). The parsed value replaces the
raw one, so **controllers may assume `req.body`, `req.params` and `req.query` are already clean and
typed**. Express 5 makes `req.query` a getter, which is why `validate` redefines it rather than
mutating it (`middlewares/validate.ts:36-44`).

### H. Money & dates

No module stores money today. When one does: store it as `Decimal128` (Mongo), never a JS float,
and never run arithmetic on money as a JS number. Converting to a number with `parseFloat` is
acceptable for display only. Date-range and formatting helpers that know a business rule belong to
the module that needs them, not to `utils/`.

### I. API versioning — prefix is fixed

Everything mounts under `/api/v1` (`server.ts:102`). **Rule:** breaking changes go to `/v2`; never
change a `/v1` contract in place.

### J. Code style — the tools decide

`npm run lint:fix` and `npm run type-check` (`tsc --noEmit`) must both pass before any commit — run
`/preflight`. Never install packages or run a build to check your work (CLAUDE.md hard rule 0).

---

## 14. What's NOT Covered Yet (honest gap checklist)

This guide covers **structure + conventions**. These operational pieces are **missing in the repo
today** — decide on each before launch:

| Area | Status today | Recommended decision |
|------|--------------|----------------------|
| **Automated tests** | ❌ none | Add a test runner + `__tests__/` per module; test services first |
| **Rate limiting** | ✅ own Redis limiter, `src/middlewares/rateLimit.ts` | See [../platform/rate-limiting.md](../platform/rate-limiting.md) |
| **CI/CD pipeline** | ❌ no `.github/` | lint → type-check → test → build on every PR |
| **Git hooks** | ❌ none | run lint + type-check pre-commit |
| **API documentation** | ⚠️ Postman only (`postman_collection.json`) | OpenAPI so docs stay in sync with code |
| **Background jobs/queue** | ❌ none | BullMQ (Redis) for email/heavy work — see §15 `jobs/` |
| **DB transactions** | ⚠️ ad-hoc | Mongoose sessions for multi-document writes today; Prisma transactions in the target |
| **DB migrations** | ⚠️ seed scripts only | Prisma Migrate once Postgres lands (target — not built) |
| **Monitoring/alerting** | ⚠️ logs only | Error tracking + uptime/health monitoring |
| **Secrets management** | ⚠️ `.env` files | Move prod secrets to a vault / cloud secret manager |
| **Centralized pagination** | ⚠️ per-endpoint | One shared helper once three list endpoints need the same behaviour |

Update this table as each item lands.

---

## 15. Is This Enterprise-Scalable? (honest verdict)

This is a **modular monolith** — the correct starting point. It grows in this order:

**Today:** `routes → validators (auth, user) → controllers → services (auth, audit) → Mongoose models`;
product controllers still query models directly.
**Target:** `routes → validators → controllers → services → models/<Entity>/repo.ts` on Prisma (§16).

### What to add as you grow

| Add | Why | Where it goes |
|-----|-----|---------------|
| `validators/` in every module | Reject bad input before it reaches logic/DB | `modules/<domain>/validators/index.ts` |
| `services/` | Business logic out of controllers → reusable & testable | `modules/<domain>/services/` |
| `repo.ts` per entity (target) | One home for an entity's queries | `modules/<domain>/models/<Entity>/repo.ts` |
| `__tests__/` | Safety net for refactors | `modules/<domain>/__tests__/` |
| `jobs/` / worker | Email & heavy work off the request path (BullMQ + Redis) | `modules/<domain>/jobs/` or a `worker` module |

Create each folder only when it has content (CLAUDE.md hard rule 10).

### Handling large DB tables (millions+ of rows)

The rules are in [performance-practices.md](performance-practices.md). In short:

- **Always paginate** list endpoints, and cap the page size (`user/validators/index.ts:22-23`).
- **Compound indexes** matching your query shapes (`audit/models/AuditLog/schema.ts:33-34`).
- **`.lean()`** and `.select()` on read-only queries.
- **Cache hot reads in Redis** with a TTL.
- **Soft-delete + archival** for cold rows.
- **Read replicas**, then **sharding**, only when the numbers say so.

### When to go microservices

Do not start there. Split **only when** a module needs independent scaling, deployment, or a
different team. The module seams are the natural cut lines.

---

## 16. Target Database: PostgreSQL + Prisma v7

> **Target design — not built.** Prisma is not in `package.json` and there is no `prisma/` folder.
> Do not create one, and do not run Prisma commands: adding Prisma is an install, which the owner
> does (CLAUDE.md hard rule 0). Before writing any Prisma config, read the v7 docs (`/docs-first`).

The decision is PostgreSQL + Prisma v7 ([decisions.md](../decisions.md), "Settled"), with a
multi-file schema, `prisma.config.ts` and the `prisma-client` generator (CLAUDE.md, "Stack").

### Layout

```
prisma.config.ts              ← at the repo root
prisma/
└── models/
    ├── user.prisma           ← one schema file per module
    └── referral.prisma

src/modules/referral/
├── validators/index.ts       ← unchanged (zod)
├── controllers/              ← unchanged; never touches prisma (CLAUDE.md hard rule 3)
├── services/                 ← business rules; calls the model's repo
└── models/
    └── Referral/
        ├── types.ts          ← enums + DTO types
        ├── repo.ts           ← every Prisma query for Referral, and nothing else
        └── index.ts          ← re-exports repo + types
```

The model folder keeps its three files (§5); `repo.ts` replaces `schema.ts`, because the schema now
lives in `prisma/`. There is still no `repositories/` folder.

### Why the queries need `repo.ts`

With Mongoose, the model **is** the query tool (`Referral.find(...)`). With Prisma the client is one
shared object (`prisma.referral.findMany()`); if every service calls it directly, query logic scatters.
`repo.ts` gives each entity's queries one home, exactly as `auth/models/Session/repo.ts` does for
Redis today.

| Job | Mongoose (today) | Prisma (target) |
|-----|------------------|-----------------|
| Validate input | `validators/index.ts` (zod) | `validators/index.ts` (zod) |
| HTTP plumbing | `controllers/` | `controllers/` |
| Business rules | `services/` | `services/` |
| DB queries | Mongoose model calls | `models/<Entity>/repo.ts` |
| Data shape / schema | `models/<Entity>/schema.ts` | `prisma/models/<module>.prisma` + generated types |

*Illustrative:*

```ts
// models/Referral/repo.ts — only Prisma queries live here
const findById = (id: string) => prisma.referral.findUnique({ where: { id } });
const update = (id: string, data: Prisma.ReferralUpdateInput) => prisma.referral.update({ where: { id }, data });

// services/referral.service.ts — calls the repo, never prisma
export const activate = async (id: string) => {
  const referral = await referralRepo.findById(id);
  if (referral?.status !== REFERRAL_STATUS.PENDING)
    throw ApiError.badRequest('Only PENDING referrals can be activated', 'REFERRAL_NOT_PENDING');
  return referralRepo.update(id, { status: REFERRAL_STATUS.ACTIVE });
};
```

---

## 17. AI-Assisted Migration Estimates

> Planning ballparks, not decisions or quotes. Snapshot on 2026-10-19: **~6,600 LOC**, **107 `.ts`
> files**, **6 modules**, **~1,200 LOC in controllers**. Estimates assume an AI coding agent doing
> the bulk work with a developer reviewing every step — roughly **3–5× faster** than fully manual.

### Option A — Express → NestJS (same monolith, different framework)

NestJS gives DI, decorators, validation pipes and enforced layering. Express 5 is the settled
decision ([decisions.md](../decisions.md)); this option is recorded only as a cost estimate.

| Phase | Work | Manual | **AI-assisted** |
|-------|------|--------|-----------------|
| Scaffold | Nest project, modules, config, Mongoose integration | 2–3 d | **0.5–1 d** |
| Models | Reuse Mongoose schemas as `@Schema()` providers (mostly copy) | 2 d | **0.5 d** |
| Routes → Controllers | Convert each route file to a Nest `@Controller` | 4–5 d | **1–1.5 d** |
| Controllers → Services | Split logic into `@Injectable()` services (the real effort) | 6–8 d | **2–3 d** |
| Validation | zod → Nest pipes (or keep zod via a pipe) | 3 d | **1 d** |
| Middleware/Guards | auth/error/logger → Nest guards & filters | 2–3 d | **1 d** |
| Test + verify parity | Endpoint-by-endpoint smoke tests vs old API | 4–5 d | **1.5–2 d** |
| **Total** | | **~23–29 dev-days** | **~7.5–10 dev-days** |

**Risk:** Low–Medium. Same DB, same process, mechanical mapping. The human-judgment part is the
service split.

### Option B — Express monolith → Microservices

Splitting the deployable, adding inter-service comms, and dealing with data ownership. Do this
**per service**, not all at once.

| Phase | Work | Manual | **AI-assisted** |
|-------|------|--------|-----------------|
| Design | Service boundaries, data ownership, contracts | 5–8 d | **2–3 d** |
| Shared libs | Extract common utils/types/auth into a shared package | 3–4 d | **1–1.5 d** |
| Per service (×7) | Carve module → standalone service + own deploy (≈2–4 d each manual) | 14–28 d | **5–10 d** |
| Comms layer | REST/gRPC or message queue between services | 5–7 d | **2–3 d** |
| Data split | Separate DBs per service, handle cross-service reads | 6–10 d | **3–5 d** |
| API gateway | Routing, auth, rate-limit at the edge | 3–4 d | **1–2 d** |
| Infra/DevOps | Per-service Docker, CI/CD, observability, service discovery | 8–12 d | **4–6 d** |
| Integration test | End-to-end across services, failure/retry handling | 6–8 d | **3–4 d** |
| **Total** | | **~50–81 dev-days** | **~21–34 dev-days** |

**Risk:** High. Split only the 1–2 modules that actually need it (e.g. `notification` as a worker);
keep the rest as a monolith.

### Pragmatic recommendation

1. **First**, add `services/` + `validators/` to every module of the current Express app.
2. **Only if** a specific module needs independent scale, peel *that one* into a service.

> Effort depends on test coverage (none today = higher risk), business-rule complexity in
> controllers, and how much behaviour parity you require.

---

## 18. One-Sentence Summary

> **Put shared code in `src/{config,constants,middlewares,routes,types,utils,scripts}`; put every
> feature in its own `src/modules/<domain>/` folder split into `routes → validators → controllers →
> services → models`, grouped by audience, with each model a 3-file folder, each folder fronted by
> an `index.ts`, and other modules reached only through that `index.ts` (models excepted).**
