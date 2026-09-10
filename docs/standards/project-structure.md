# Project Structure Guide

> **Use this as the blueprint for every new project from scratch.**
> Copy this folder/file organization so all projects look and feel the same.
> It is intentionally simple: a few clear rules, repeated everywhere.

This project is a **Node.js + Express + TypeScript + MongoDB (Mongoose)** API.
The whole idea: code is split into **modules** (one per business domain), and
inside each module everything follows the **same shape**.

---

## 1. The Golden Rules (read these first)

1. **Everything lives under `src/`.** Config files (package.json, tsconfig, etc.) stay at the root.
2. **One module = one business domain** (auth, user, coupon, referral, dashboard, notification).
3. **Inside a module, code is split by layer:** `routes/` → `controllers/` → `models/`.
4. **Routes and controllers are split by audience (role):** `admin/`, `vendor/`, `customer/`, `associate/`, `public/`.
5. **A model is its own folder** with always the same 3 files: `index.ts`, `schema.ts`, `types.ts`.
6. **`index.ts` is always the "front door"** of a folder — it wires things up and re-exports.
7. **Shared, app-wide code lives outside modules:** `config/`, `middlewares/`, `utils/`, `constants/`, `types/`.
8. **Import with path aliases (`@user/...`), never long `../../../` chains.**

If you follow these 8 rules, a new project will mirror this one perfectly.

---

## 2. The Request Flow (how a request travels)

```
HTTP request
   │
   ▼
server.ts                  ← app setup, /health, mounts routes at /api/v1
   │
   ▼
routes/index.ts            ← calls each module's register()
   │
   ▼
modules/<domain>/index.ts  ← register(): mounts that module's routes (e.g. /admin/coupons)
   │
   ▼
routes/<role>/<name>.ts    ← defines URLs + attaches auth middleware + points to controller
   │
   ▼
controllers/<role>/index.ts← the actual logic: read req, talk to models, send response
   │
   ▼
models/<Model>/            ← Mongoose schema = how data is stored & validated in MongoDB
```

**Remember it as:** `server → routes → module → role-route → controller → model`.

---

## 3. Top-Level Layout (what each folder is for)

| Path | What it holds | Rule of thumb |
|------|---------------|---------------|
| `src/server.ts` | App entry point. Builds Express, mounts middleware & routes, starts server. | One file. Don't put business logic here. |
| `src/routes/index.ts` | The master router. Registers every module. | Add one line per new module. |
| `src/config/` | Environment + database connection setup. | `env.ts` (read & validate env vars), `database.ts` (connect/disconnect). |
| `src/middlewares/` | Express middleware used app-wide. | auth, error handling, request id, http logging. |
| `src/utils/` | Small reusable helpers, no business logic. | apiError, response, logger, redis, etc. |
| `src/constants/` | Fixed values shared across the app. | e.g. `authErrors.ts`. |
| `src/types/` | Global TypeScript types. | e.g. `express.d.ts` extends the Request object. |
| `src/scripts/` | Operator CLIs run by hand or via an npm script; never imported by app code. | `reset-db.ts` (`npm run db:reset`). |
| `src/modules/` | **All business features live here**, one folder per domain. | This is where you spend most of your time. |

---

## 4. Anatomy of a Module (the pattern to repeat)

Take `coupon` as the reference example. **Every full-featured module looks like this:**

```
modules/coupon/
├── index.ts            ← register(router): mounts all of this module's routes
├── routes/             ← URL definitions, split by who calls them
│   ├── admin/coupon.ts
│   ├── vendor/coupon.ts
│   ├── customer/coupon.ts
│   └── public/coupon.ts
├── validators/         ← input checks (Joi schemas), split by role  ★ add this
│   ├── admin/coupon.ts
│   └── vendor/coupon.ts
├── controllers/        ← thin HTTP layer: read req → call service → send res
│   ├── admin/index.ts
│   ├── admin/redemption.ts   ← extra file when one role has many actions
│   ├── vendor/index.ts
│   ├── customer/index.ts
│   └── public/index.ts
├── services/           ← the business rules / logic, reusable across roles  ★ add this
│   └── coupon.service.ts
└── models/             ← data shapes, one folder per collection
    ├── Coupon/
    ├── CouponPurchase/
    └── CouponRedeem/
```

> ★ `validators/` and `services/` are the **two layers to add** as the app grows.
> The current code keeps both *inside* the controllers — pulling them out is the
> single biggest upgrade. See §12 for the full reasoning.

### The layers explained simply (one job each)

Think of a restaurant: the **controller is the waiter**, the **service is the chef**,
the **model is the labeled shelf** where ingredients live.

- **`routes/`** — *"What URLs exist and who can hit them."*
  Defines paths (`GET /`, `PATCH /:id/approve`), attaches auth middleware, forwards to a controller. No logic.

- **`validators/`** ★ — *"Is the INPUT shaped correctly?"*
  Joi schema per request. Rejects garbage (missing fields, bad types) *before* any logic runs.

- **`controllers/`** — *"HTTP plumbing only."*
  Reads `req`, calls a **service**, sends `res`. Stays thin — no business rules, no DB calls.

- **`services/`** ★ — *"The actual business rules."*
  e.g. "a coupon must be DRAFT before it can be submitted." Reusable: admin/vendor/customer
  controllers all call the same service instead of copy-pasting logic.

- **`models/`** — *"How data is stored."*
  Mongoose schema, validation rules, indexes, and instance methods (e.g. `coupon.approve()`).

> **What about `repositories/`?** A repository is a thin file holding *only* DB
> queries (the "pantry clerk" — fetch & store, no rules). It lets you swap the
> database without touching services. **But Mongoose models already act like a
> light repository**, so for this project you can **skip it** — let services call
> models directly. Add it later *only* if you plan to change databases or need to
> mock queries in tests. Practical target: `routes → validators → controllers → services → models`.

### Splitting by role

Routes and controllers are grouped into folders by **audience**:

| Folder | Who | Example |
|--------|-----|---------|
| `admin/` | Internal admins | approve/reject coupons |
| `vendor/` | Business vendors | create their own coupons |
| `customer/` | End customers | buy/redeem coupons |
| `associate/` | Business associates / referrers | referral actions |
| `public/` | Anyone, no login | browse published coupons |

A module only includes the roles it needs. (e.g. `referral/` only has `associate/`.)

> **Tip:** when one role's controller grows too big, split it into named files
> (like `controllers/admin/index.ts` + `controllers/admin/redemption.ts`)
> instead of one giant file.

---

## 5. Anatomy of a Model Folder (always 3 files)

Every model is a **folder** (named in `PascalCase`) with exactly these files:

```
models/Coupon/
├── types.ts    ← TS interface (ICoupon) + enums/constants (COUPON_STATUS, ...)
├── schema.ts   ← Mongoose Schema: fields, validation, indexes, methods. Exports the model.
└── index.ts    ← front door: re-exports the model (default) + everything from types
```

**`index.ts` is always tiny:**
```ts
export { default } from './schema';
export * from './types';
```

This lets the rest of the app import cleanly:
```ts
import Coupon, { COUPON_STATUS } from '@coupon/models/Coupon';
```

**Why three files?**
- `types.ts` = the contract (no logic, just shapes & enums) — safe to import anywhere.
- `schema.ts` = the implementation (depends on Mongoose).
- `index.ts` = the public entry, so callers never reach into internal files.

---

## 6. The `index.ts` Convention (the "front door" rule)

`index.ts` always means: **"this is how the outside world enters this folder."**

| Where | What its `index.ts` does |
|-------|--------------------------|
| `modules/<domain>/index.ts` | Exports `register(router)` that mounts the module's routes. |
| `models/<Model>/index.ts` | Re-exports the model + its types. |
| `controllers/<role>/index.ts` | The default controller file for that role. |

A module's `index.ts` is just wiring — short and predictable:
```ts
// modules/coupon/index.ts
const register = (router: Router): void => {
  router.use('/admin/coupons', adminCouponRoutes);
  router.use('/vendor/coupons', vendorCouponRoutes);
  router.use('/customer/coupons', customerCouponRoutes);
  router.use('/pub/coupons', publicCouponRoutes);
};
export { register };
```

And `routes/index.ts` calls every module's `register`:
```ts
authModule.register(router);
userModule.register(router);
couponModule.register(router);
// ...one line per module
```

---

## 7. Path Aliases (no more `../../../`)

Defined in `tsconfig.json`. Always import with these:

| Alias | Points to |
|-------|-----------|
| `@/*` | `src/*` |
| `@config/*` | `src/config/*` |
| `@constants/*` | `src/constants/*` |
| `@middlewares/*` | `src/middlewares/*` |
| `@utils/*` | `src/utils/*` |
| `@modules/*` | `src/modules/*` |
| `@auth/*` | `src/modules/auth/*` |
| `@user/*` | `src/modules/user/*` |
| `@coupon/*` | `src/modules/coupon/*` |
| `@referral/*` | `src/modules/referral/*` |
| `@dashboard/*` | `src/modules/dashboard/*` |
| `@notification/*` | `src/modules/notification/*` |

**Rule:** every new module gets its own `@<module>/*` alias here.

---

## 8. Naming Conventions (keep it consistent)

| Thing | Style | Example |
|-------|-------|---------|
| Folders (general) | lowercase | `controllers/`, `routes/` |
| Model folders | PascalCase | `Coupon/`, `LoginSession/` |
| Files | camelCase | `authHelper.ts`, `requestId.ts` |
| Role folders | lowercase role name | `admin/`, `vendor/` |
| Module front door | `index.ts` | always |
| Enums/constants | `UPPER_SNAKE` object `as const` | `COUPON_STATUS`, `ROLE_CODE` |
| Model interface | `I` + name | `ICoupon`, `IUser` |
| URL prefix per role | plural noun | `/admin/coupons`, `/pub/coupons` |

---

## 9. Where Do I Put...? (quick decision guide)

| I want to add... | Put it in... |
|------------------|--------------|
| A new business feature (whole domain) | `src/modules/<newdomain>/` + add alias + register in `routes/index.ts` |
| A new data collection | `modules/<domain>/models/<Model>/` (3 files) |
| A new endpoint for an existing feature | `modules/<domain>/routes/<role>/` + matching controller |
| Input validation for a request (Joi) | `modules/<domain>/validators/<role>/` ★ |
| Business rules / logic (reused across roles) | `modules/<domain>/services/` ★ |
| Database queries only (optional, advanced) | `modules/<domain>/repositories/` — skip with Mongoose unless needed |
| Logic shared between roles in a module | a **service** (preferred) or `controllers/shared/` (see `auth/controllers/shared/`) |
| A reusable helper with no business logic | `src/utils/` |
| A constant used across the app | `src/constants/` |
| Auth / logging / error handling | `src/middlewares/` |
| A global TS type | `src/types/` |
| Env var reading or DB connection | `src/config/` |
| A one-off script (seeding data) | `modules/<domain>/seed/` (see `user/seed/`) |
| Domain-specific helper (e.g. image upload) | `modules/<domain>/helpers/` (see `user/helpers/`) |

---

## 10. Checklist: Adding a New Module

1. Create `src/modules/<name>/`.
2. Add `models/<Model>/` with `types.ts`, `schema.ts`, `index.ts`.
3. Add `validators/<role>/<name>.ts` — Joi schemas for the request input. ★
4. Add `services/<name>.service.ts` — the business rules. ★
5. Add `routes/<role>/<name>.ts` for each audience that needs it.
6. Add `controllers/<role>/index.ts` — thin: validate → call service → respond.
7. Create `index.ts` exporting `register(router)` that mounts the routes.
8. Add the `@<name>/*` alias in `tsconfig.json`.
9. Import and call `<name>Module.register(router)` in `src/routes/index.ts`.
10. If the model must be registered at boot, `import '@<name>/models/<Model>'` in `server.ts`.

> Steps 3 & 4 (★) are the new layers. Skip `repositories/` unless you specifically
> need it (DB swap or mockable tests) — with Mongoose, services can call models directly.

Do these steps and the new module matches the project's enterprise-ready shape.

---

## 11. Full Project Tree (infinite depth)

```
.
├── src/
│   ├── config/
│   │   ├── database.ts
│   │   └── env.ts
│   ├── constants/
│   │   └── authErrors.ts
│   ├── middlewares/
│   │   ├── authenticate.ts
│   │   ├── errorMiddleware.ts
│   │   ├── httpLogger.ts
│   │   └── requestId.ts
│   ├── modules/
│   │   ├── auth/
│   │   │   ├── controllers/
│   │   │   │   ├── admin/
│   │   │   │   │   └── index.ts
│   │   │   │   ├── associate/
│   │   │   │   │   └── index.ts
│   │   │   │   ├── customer/
│   │   │   │   │   └── index.ts
│   │   │   │   ├── shared/
│   │   │   │   │   ├── authHelper.ts
│   │   │   │   │   ├── emailVerification.ts
│   │   │   │   │   └── passwordReset.ts
│   │   │   │   └── vendor/
│   │   │   │       └── index.ts
│   │   │   ├── models/
│   │   │   │   └── LoginSession/
│   │   │   │       ├── index.ts
│   │   │   │       ├── schema.ts
│   │   │   │       └── types.ts
│   │   │   ├── routes/
│   │   │   │   ├── admin/
│   │   │   │   │   └── auth.ts
│   │   │   │   ├── associate/
│   │   │   │   │   └── auth.ts
│   │   │   │   ├── customer/
│   │   │   │   │   └── auth.ts
│   │   │   │   └── vendor/
│   │   │   │       └── auth.ts
│   │   │   └── index.ts
│   │   ├── coupon/
│   │   │   ├── controllers/
│   │   │   │   ├── admin/
│   │   │   │   │   ├── index.ts
│   │   │   │   │   └── redemption.ts
│   │   │   │   ├── customer/
│   │   │   │   │   └── index.ts
│   │   │   │   ├── public/
│   │   │   │   │   └── index.ts
│   │   │   │   └── vendor/
│   │   │   │       └── index.ts
│   │   │   ├── models/
│   │   │   │   ├── Coupon/
│   │   │   │   │   ├── index.ts
│   │   │   │   │   ├── schema.ts
│   │   │   │   │   └── types.ts
│   │   │   │   ├── CouponPurchase/
│   │   │   │   │   ├── index.ts
│   │   │   │   │   ├── schema.ts
│   │   │   │   │   └── types.ts
│   │   │   │   └── CouponRedeem/
│   │   │   │       ├── index.ts
│   │   │   │       ├── schema.ts
│   │   │   │       └── types.ts
│   │   │   ├── routes/
│   │   │   │   ├── admin/
│   │   │   │   │   └── coupon.ts
│   │   │   │   ├── customer/
│   │   │   │   │   └── coupon.ts
│   │   │   │   ├── public/
│   │   │   │   │   └── coupon.ts
│   │   │   │   └── vendor/
│   │   │   │       └── coupon.ts
│   │   │   └── index.ts
│   │   ├── dashboard/
│   │   │   ├── controllers/
│   │   │   │   ├── admin/
│   │   │   │   │   └── index.ts
│   │   │   │   ├── associate/
│   │   │   │   │   └── index.ts
│   │   │   │   └── vendor/
│   │   │   │       └── index.ts
│   │   │   ├── routes/
│   │   │   │   ├── admin/
│   │   │   │   │   └── dashboard.ts
│   │   │   │   ├── associate/
│   │   │   │   │   └── dashboard.ts
│   │   │   │   └── vendor/
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
│   │   │   │   └── associate/
│   │   │   │       ├── coupon.ts
│   │   │   │       └── onboard.ts
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
│   │   │   │   └── associate/
│   │   │   │       └── referral.ts
│   │   │   └── index.ts
│   │   └── user/
│   │       ├── controllers/
│   │       │   ├── admin/
│   │       │   │   ├── associate/
│   │       │   │   │   └── index.ts
│   │       │   │   ├── customer/
│   │       │   │   │   └── index.ts
│   │       │   │   ├── role/
│   │       │   │   │   └── index.ts
│   │       │   │   └── vendor/
│   │       │   │       └── index.ts
│   │       │   ├── associate/
│   │       │   │   └── profile.ts
│   │       │   ├── customer/
│   │       │   │   └── profile.ts
│   │       │   └── vendor/
│   │       │       └── profile.ts
│   │       ├── helpers/
│   │       │   ├── image.ts
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
│   │       │   │   ├── role.ts
│   │       │   │   └── vendor.ts
│   │       │   ├── associate/
│   │       │   │   └── profile.ts
│   │       │   ├── customer/
│   │       │   │   └── profile.ts
│   │       │   └── vendor/
│   │       │       └── profile.ts
│   │       ├── seed/
│   │       │   ├── users.ts
│   │       │   └── roles.ts
│   │       └── index.ts
│   ├── routes/
│   │   └── index.ts
│   ├── types/
│   │   └── express.d.ts
│   ├── utils/
│   │   ├── apiError.ts
│   │   ├── catchAsync.ts
│   │   ├── clientIp.ts
│   │   ├── cookieHelper.ts
│   │   ├── logger.ts
│   │   ├── mongoHelper.ts
│   │   ├── redisClient.ts
│   │   ├── redisKeys.ts
│   │   └── response.ts
│   └── server.ts
├── .env.prod
├── .gitignore
├── deploy.sh
├── Dockerfile
├── eslint.config.js
├── package-lock.json
├── package.json
├── postman_collection.json
└── tsconfig.json
```

---

## 12. Cross-Module Dependencies & Features That Span Modules

Modules are **not** islands — `coupon` needs `user`, `dashboard` needs everything,
`auth` sends emails via `notification`. That's normal and expected. The question is
**how** they link without turning into spaghetti.

### Your project's real dependency map (today)

```
auth      ──→ user, notification, referral
coupon    ──→ user, referral, notification
referral  ──→ user, coupon, notification, auth
dashboard ──→ coupon, user, referral
notification ──→ (nothing — leaf)
user      ──→ auth (front door only)
```

- `notification` is a **leaf** — everyone depends on it, it depends on no one.
  That's healthy: stable, low-level modules at the bottom.
- ⚠️ **`auth ↔ user` is circular.** `auth` reads the user models; `user` calls back
  into `auth` for three things it cannot own — hashing a password, revoking a
  suspended account's sessions, and refreshing the display fields a session caches
  (`user/controllers/admin/*/index.ts:1`, `user/seed/users.ts:2`). Session lifecycle
  is genuinely `auth`'s job, so this edge is real rather than accidental.
  **The constraint that keeps it safe:** `user` imports `@auth/index` and nothing
  deeper, so the surface is four named functions instead of the whole module.
  Breaking the cycle properly needs an event bus, which this codebase does not
  justify yet — revisit if a third module needs to react to user state changes.
- `dashboard` depends on many — also healthy: it's a **high-level** module that
  *reads* from others. Dependencies point *downward*.
- ⚠️ **`coupon ↔ referral` and `auth ↔ referral` are circular** (each imports the
  other). It works now because you import *model files* (Node tolerates that), but
  it's a smell — see the fix below.

### Rule 1 — Depend on a module's *public API*, not its internals

Import another module through its **front door** (its `index.ts` / its model index /
its service), never reach into its `controllers/` or `validators/`.

```ts
// ✅ good — using user's public model
import User from '@user/models/User';
import { couponService } from '@coupon/services/coupon.service';

// ❌ bad — reaching into another module's internal controller
import { create } from '@coupon/controllers/vendor/index';
```

> You already do this well — almost every cross-module import is a **model**, which
> is a legitimate public API. (One exception: `@auth/controllers/shared/authHelper`
> is imported across modules — that helper should move to a service or `utils/`.)

### Rule 2 — Keep dependencies pointing ONE direction (no cycles)

Picture modules in layers. Arrows may only point **down**:

```
            dashboard          ← high-level (reads many)
           ↙    ↓    ↘
      coupon  referral  auth    ← feature modules
           ↘    ↓    ↙
            user   notification ← low-level leaves (depend on nothing)
```

If two modules need each other (like `coupon ↔ referral`), that's a cycle. Fix it
one of three ways:

1. **Move the shared piece down** into a leaf both can depend on (e.g. a shared
   type or a small `@shared` module).
2. **Pick an owner.** Decide `coupon` owns the relationship; `referral` exposes a
   thin service `coupon` calls — not the reverse.
3. **Use an event** (Rule 3) so neither imports the other at all.

### Rule 3 — For "when X happens, also do Y", use events (decoupling)

When a feature spans modules and you don't want hard imports, emit an **event**
instead of calling the other module directly. Classic case: notifications.

```ts
// coupon/services/coupon.service.ts
await couponRepo.create(data);
events.emit('coupon.created', { couponId, vendorId });   // coupon knows nothing about email

// notification/listeners/coupon.listener.ts
events.on('coupon.created', ({ vendorId }) => sendEmail(vendorId, templates.couponCreated));
```

Now `coupon` does **not** import `notification` at all — the link is broken cleanly.
This is also the seam you'd cut along when splitting into microservices later
(events become a message queue). Put listeners in `modules/<domain>/listeners/`.

### Rule 4 — A feature that spans modules → an *orchestrator service*

When one user action touches several modules (e.g. "buy a coupon" = update coupon
stock + create purchase + credit referral + send receipt), don't cram it into one
controller. Give it a **service that orchestrates** the others:

```ts
// coupon/services/purchase.service.ts  → the orchestrator (high-level)
export const purchaseCoupon = async (customerId, couponId) => {
  const coupon = await couponService.assertPurchasable(couponId);   // coupon module
  const purchase = await purchaseRepo.create({ customerId, couponId });
  await referralService.creditIfReferred(coupon, purchase);          // referral module
  events.emit('coupon.purchased', { purchase });                     // → notification
  return purchase;
};
```

The orchestrator lives in the module that **owns the action** (here `coupon`), and
calls *other modules' services* — keeping each module's rules inside that module.

### Quick decision guide

| Situation | Do this |
|-----------|---------|
| Module A needs data from module B | Import B's **model/service** (public API), arrows point down |
| Two modules import each other (cycle) | Move shared part down, pick an owner, or use an event |
| "When X happens, also notify / log / sync" | **Event** (`events.emit` + a listener), no hard import |
| One action spans 3+ modules | **Orchestrator service** in the module that owns the action |
| Same helper/type needed by many modules | Put it in `src/utils/`, `src/constants/`, or a small `@shared` module |
| Heavy logic shared by two peer modules | Extract to a **lower/leaf module** both depend on |

> **Concrete next step for your repo:** break the `coupon ↔ referral` and
> `auth ↔ referral` cycles by having `referral` emit/expose a service the others
> call (one direction), and move `authHelper` out of `controllers/shared` into a
> service or `utils/` so other modules stop importing a controller.

---

## 13. Engineering Conventions (the daily "how we build" decisions)

Folder structure is *half* the picture. These are the **cross-cutting conventions**
every file must follow — they keep 100 files behaving like one codebase. Most are
already established in your repo; copy them into new projects verbatim.

### A. API response shape — always use `response` / `ApiError`

Never hand-roll `res.json(...)`. Every endpoint returns the **same envelope**.

```ts
// success  → utils/response.ts
return response.success(res, data, 200, 'Optional message');
return response.created(res, data);            // 201

// failure  → throw, let errorMiddleware format it
throw ApiError.badRequest('Coupon code already exists', 'COUPON_DUP');
throw ApiError.notFound('Coupon not found');
```

Result is consistent for the frontend:
```jsonc
{ "success": true,  "data": { ... } }
{ "success": false, "message": "...", "code": "COUPON_DUP" }
```

### B. Async errors — always wrap in `catchAsync`

Controllers are async; an unhandled rejection crashes the request. Wrap every one:

```ts
const create = catchAsync(async (req, res) => { ... });   // .catch(next) is automatic
```

`errorMiddleware` (registered last in `server.ts`) catches everything and formats it.
**Rule:** throw `ApiError` for expected failures; never `res.status(500)` by hand.

### C. Auth & roles (RBAC) — middleware on the route, not in the controller

Authorization is declared where the URL is defined:

```ts
const requireAdmin = [authenticate(ROLE_CODE.ADMIN), authorizeRoles(ROLE_CODE.ADMIN, ROLE_CODE.SUPER_ADMIN)];
router.get('/', ...requireAdmin, couponController.list);
```

**Rule:** every non-public route starts with `authenticate(...)`. Role checks use
`ROLE_CODE` constants, never raw strings.

### D. Config & secrets — only through `@config/env`

Never read `process.env.X` scattered in code. Read + validate once in `config/env.ts`,
import `envConfig` everywhere. Secrets live in `.env` (git-ignored); `.env.prod` is
the deployment template. **Rule:** a missing required env var should fail fast at boot.

### E. Logging — `@utils/logger` (Winston), never `console.log`

```ts
logger.info(`${envConfig.APP_NAME} started`);
logger.error('Redis init failed', { code: err.code });
```

`httpLogger` + `requestId` middleware already tag each request. **Rule:** no
`console.*` in committed code (the linter should flag it).

### F. Caching & Redis — go through the helpers + a key convention

Use `@utils/redisKeys` helpers (`setKey`, `getKey`, `delKey`, TTL-aware), never the
raw client. **Rule:** namespace keys (`otp:<userId>`, `pwreset:<token>`) and always
set a TTL on volatile data.

### G. Validation — reject bad input at the edge

Put Joi schemas in `validators/` (see §4) and validate **before** the controller
logic runs. **Rule:** controllers may assume `req.body` is already clean.

### H. Money & dates — use the shared helpers

Prices use `priceField` / `Decimal128` (never JS floats for money). Dates go through
`mongoHelper` helpers (`todayDateRange`, `formatDate`). **Rule:** no `parseFloat`
on currency, no ad-hoc date math.

### I. API versioning — prefix is fixed

Everything mounts under `/api/v1`. **Rule:** breaking changes go to `/v2`, never
mutate `/v1` contracts in place.

### J. Code style — ESLint + Prettier decide, not opinions

`npm run lint:fix` before commit. `type-check` must pass (`tsc --noEmit`).
**Rule:** CI (when added) blocks merge on lint or type errors.

---

## 14. What's NOT Covered Yet (honest gap checklist)

This guide fully covers **structure + conventions**. For a project that's "complete
for real production work," these operational pieces are still **missing in the repo
today** — decide on each before/at launch:

| Area | Status today | Recommended decision |
|------|--------------|----------------------|
| **Automated tests** | ❌ none | Add Jest/Vitest + `__tests__/` per module; test services first |
| **Rate limiting** | ❌ none | Add `express-rate-limit` (Redis store) — esp. on auth/OTP routes |
| **CI/CD pipeline** | ❌ no `.github/` | GitHub Actions: lint → type-check → test → build on every PR |
| **Git hooks** | ❌ none | Husky + lint-staged to run lint/type-check pre-commit |
| **API documentation** | ⚠️ Postman only | Add OpenAPI/Swagger so docs stay in sync with code |
| **Background jobs/queue** | ❌ none | BullMQ (Redis) for email/heavy work — see §13 "jobs/" |
| **DB transactions** | ⚠️ ad-hoc | Use Mongoose sessions for multi-doc writes (e.g. purchase flow) |
| **DB migrations** | ⚠️ seed scripts only | Add a migration tool (migrate-mongo) for schema/data changes |
| **Monitoring/alerting** | ⚠️ logs only | Add error tracking (Sentry) + uptime/health monitoring |
| **Secrets management** | ⚠️ `.env` files | Move prod secrets to a vault / cloud secret manager |
| **Centralized pagination** | ⚠️ per-endpoint | A shared `paginate()` helper so every list behaves the same |

> **Verdict:** the guide is *complete for architecture & conventions* — the decisions
> that shape how code is **organized and written**. The table above is the
> *operational* layer (how it's **tested, shipped, and run**). Tackle those as the
> project moves from "building features" to "production-grade." Update this table as
> each item lands so the doc stays the single source of truth.

---

## 15. Is This Enterprise-Scalable? (honest verdict)

This is a solid **modular monolith** — the *correct* starting point. But "infinite
enterprise scale + large DB tables" needs a few more layers. No structure is ever
"final"; it should grow in this order:

**Today:**   `routes → controllers → models`
**Enterprise target:**   `routes → validators → controllers → services → repositories → models`

### What to add as you grow

| Add | Why | Where it goes |
|-----|-----|---------------|
| `validators/` (Joi already installed) | Reject bad input before it reaches logic/DB | `modules/<domain>/validators/<role>/` |
| `services/` | Move business logic OUT of controllers → reusable & testable | `modules/<domain>/services/` |
| `repositories/` (optional) | Isolate Mongoose queries → swappable, mockable | `modules/<domain>/repositories/` |
| `__tests__/` | Safety net for refactors | `modules/<domain>/__tests__/` |
| `jobs/` / worker | Offload email & heavy work off the request path (BullMQ + Redis) | `modules/<domain>/jobs/` or a `worker` module |

> **Biggest single upgrade:** extract a `services/` layer so controllers stay thin.
> It also makes any future NestJS / microservice migration dramatically cheaper.

### Handling large DB tables (millions+ of rows)

You already do some of this well (compound indexes, Redis present). Full checklist:

- **Always paginate** list endpoints — never return unbounded results.
- **Compound indexes** matching your query shapes (✅ already in `Coupon`).
- **`.lean()`** on read-only queries (skips Mongoose hydration → big memory win).
- **Project only needed fields** (`.select()`), never fetch whole docs for lists.
- **Cache hot reads in Redis** (✅ Redis client exists) with sensible TTLs.
- **Soft-delete + archival** — move cold rows out (you already have `isDeleted`).
- **Read replicas** for heavy read traffic; writes go to primary.
- **Sharding** (by tenant / region / userId) once a single replica set isn't enough.
- **Avoid unbounded `$lookup`/joins** on hot paths — denormalize where it pays off.

### When to go microservices

Don't start there. Split **only when** a module needs independent scaling,
deployment, or a different team owns it. Your module seams (`auth`, `coupon`,
`referral`, `user`, `dashboard`, `notification`) are already the natural cut lines.

---

## 16. Using a Different Stack / ORM (when you DO need `repositories/`)

Everything above assumes **MongoDB + Mongoose**, where the model itself acts like a
light repository — so we skipped the layer. **The moment you switch to a SQL
database (Postgres / MySQL) with Prisma, TypeORM, Drizzle, or Sequelize, the
`repositories/` folder becomes worth adding.** Here's why and how.

### Why SQL/Prisma changes the picture

With Mongoose, the model **is** the query tool (`Coupon.find(...)`) and the schema
lives next to it. With Prisma & friends it's different:

| | Mongoose (current) | Prisma / TypeORM / Drizzle (SQL) |
|---|---|---|
| Where the schema lives | Per-model `schema.ts` inside each module | **One central file** (`prisma/schema.prisma`) for the whole app |
| How you query | `Coupon.find()` — model is the query API | A shared **client** (`prisma.coupon.findMany()`) |
| Relations / joins | Manual `$lookup` / refs | First-class joins, often multi-table |
| Transactions | Rare, manual | Common, and span several tables |
| Result | Model = data + queries together | Query logic has **no natural home** → put it in `repositories/` |

Because the Prisma client is **global and shared**, if every service calls
`prisma.*` directly your DB logic gets scattered everywhere. A `repositories/`
folder gives those queries one home — that's the whole reason the layer exists.

### How the module shape adapts

```
modules/coupon/
├── index.ts
├── validators/        ← unchanged (Joi / Zod input checks)
├── controllers/       ← unchanged (thin HTTP layer)
├── services/          ← business rules — now call the repository, never prisma directly
├── repositories/      ← ★ NEW HOME for all DB queries (prisma.coupon.*)
│   └── coupon.repo.ts
└── types/             ← TS types/enums (Prisma also auto-generates types you can re-use)
    └── coupon.ts
```

Note what's **gone**: the per-model `models/<Model>/{schema,index}.ts` folders.
With Prisma the schema is centralized in `prisma/schema.prisma` at the project
root, so the module no longer carries its own schema files — it carries a
**repository** instead.

### Layer mapping across stacks (same job, different home)

| Job | Mongoose (Mongo) | Prisma (Postgres/MySQL) |
|-----|------------------|--------------------------|
| Validate input | `validators/` (Joi) | `validators/` (Joi or Zod) |
| HTTP plumbing | `controllers/` | `controllers/` |
| Business rules | `services/` | `services/` |
| **DB queries** | inside model (skip repo) | **`repositories/` (needed)** |
| Data shape / schema | `models/<Model>/schema.ts` | central `prisma/schema.prisma` + generated types |

### Example: the repository with Prisma

```ts
// repositories/coupon.repo.ts  → ONLY Prisma queries live here
import { prisma } from '@config/prisma';

export const findById = (id: string) =>
  prisma.coupon.findUnique({ where: { id } });

export const create = (data: Prisma.CouponCreateInput) =>
  prisma.coupon.create({ data });

export const findByVendor = (vendorId: string) =>
  prisma.coupon.findMany({ where: { userId: vendorId } });

// service calls the repo — never touches `prisma` itself
export const submit = async (id: string) => {
  const coupon = await couponRepo.findById(id);
  if (coupon?.status !== 'DRAFT')
    throw new ApiError(400, 'Only DRAFT coupons can be submitted');
  return couponRepo.update(id, { status: 'PENDING' });
};
```

### Quick rule of thumb

| Stack | Add `repositories/`? | Target layering |
|-------|----------------------|-----------------|
| **MongoDB + Mongoose** (current) | ❌ Optional — model already covers it | `routes → validators → controllers → services → models` |
| **Postgres / MySQL + Prisma** | ✅ Yes | `routes → validators → controllers → services → repositories` |
| **Postgres / MySQL + TypeORM / Sequelize** | ✅ Yes (or use the ORM's own repository) | same as above |
| **Drizzle / raw SQL** | ✅ Strongly yes | same as above |

> **One-liner:** Mongoose bundles the query tool into the model, so a repository is
> redundant. Prisma/SQL split the query tool (a shared client) from the schema (one
> central file), so the repository is where those queries belong.

---

## 17. AI-Assisted Migration Estimates

> Snapshot of this codebase: **~8,800 LOC**, **103 files**, **6 modules**,
> **~4,600 LOC in controllers** (the logic-heavy part). Estimates assume an AI
> coding agent (Claude Code / Cursor) doing the bulk work with a developer
> reviewing every step. "AI-assisted" = roughly **3–5× faster** than fully manual.

### Option A — Express → NestJS (same monolith, better framework)

NestJS gives you DI, decorators, built-in validation pipes, and enforced layering
— it formalizes exactly the structure this guide recommends.

| Phase | Work | Manual | **AI-assisted** |
|-------|------|--------|-----------------|
| Scaffold | Nest project, modules, config, Mongoose integration | 2–3 d | **0.5–1 d** |
| Models | Reuse Mongoose schemas as `@Schema()` providers (mostly copy) | 2 d | **0.5 d** |
| Routes → Controllers | Convert each route file to a Nest `@Controller` | 4–5 d | **1–1.5 d** |
| Controllers → Services | Split logic into `@Injectable()` services (the real effort) | 6–8 d | **2–3 d** |
| Validation | Joi → `class-validator` DTOs (or keep Joi via a pipe) | 3 d | **1 d** |
| Middleware/Guards | auth/error/logger → Nest guards & filters | 2–3 d | **1 d** |
| Test + verify parity | Endpoint-by-endpoint smoke tests vs old API | 4–5 d | **1.5–2 d** |
| **Total** | | **~23–29 dev-days** | **~7.5–10 dev-days** |

**Risk:** Low–Medium. Same DB, same process, mechanical mapping. The mapping is
1:1 enough that AI handles most of it well; the human-judgment part is the
service split.

### Option B — Express monolith → Microservices

Much bigger jump: splitting the deployable, adding inter-service comms, and
dealing with data ownership. Do this **per service**, not all at once.

| Phase | Work | Manual | **AI-assisted** |
|-------|------|--------|-----------------|
| Design | Service boundaries, data ownership, contracts | 5–8 d | **2–3 d** |
| Shared libs | Extract common utils/types/auth into a shared package | 3–4 d | **1–1.5 d** |
| Per service (×6) | Carve module → standalone service + own deploy (≈2–4 d each manual) | 14–24 d | **5–9 d** |
| Comms layer | REST/gRPC or message queue (Redis/RabbitMQ/Kafka) between services | 5–7 d | **2–3 d** |
| Data split | Separate DBs / collections per service, handle cross-service reads | 6–10 d | **3–5 d** |
| API gateway | Routing, auth, rate-limit at the edge | 3–4 d | **1–2 d** |
| Infra/DevOps | Per-service Docker, CI/CD, observability, service discovery | 8–12 d | **4–6 d** |
| Integration test | End-to-end across services, failure/retry handling | 6–8 d | **3–4 d** |
| **Total** | | **~50–77 dev-days** | **~21–33 dev-days** |

**Risk:** High. Distributed systems add network failures, eventual consistency,
and ops complexity. **Recommendation:** only split the 1–2 modules that actually
need it (e.g. `notification` as a worker, `coupon` if it's the hot path); keep the
rest as a monolith. A full 6-service split is rarely worth it at this size.

### Pragmatic recommendation

1. **First**, add `services/` + `validators/` to the *current* Express app
   (~3–5 AI-assisted days). This captures ~80% of the maintainability/scale benefit.
2. **Then**, if you want stricter structure & a team-friendly framework → **NestJS**.
3. **Only if** a specific module needs independent scale → peel *that one* into a
   microservice. Don't big-bang the whole thing.

> ⚠️ Estimates are planning ballparks, not quotes — actual effort depends on test
> coverage (none today = higher risk), business-rule complexity in controllers,
> and how much behavior parity you require.

---

## 18. One-Sentence Summary

> **Put shared code in `src/{config,middlewares,utils,constants,types}`; put every
> feature in its own `src/modules/<domain>/` folder split into `routes → controllers → models`,
> grouped by role, with each model a 3-file folder and each folder fronted by an `index.ts`.**

Mirror that, and any new project will look exactly like this one.
