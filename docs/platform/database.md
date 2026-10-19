# Database

> **"Today" is verified against the code on 2026-10-19. Every section marked "Target" is target
> design — not built.** Sessions are not in the database at all — they live in [Redis](redis.md).

---

## What belongs here

Durable, queryable data: users, roles, the user↔role link, and the audit log. Not sessions, not
OTPs, not counters — the split and its reasoning are in [redis.md](redis.md).

The line is worth restating because it gets argued: **losing a session is a re-login, losing a user
is a company-ending incident.** Anything in the second category needs backups, transactions,
relational integrity and ad-hoc queries — four things an in-memory store does not give you.

---

## Today: MongoDB + Mongoose

The connection is `mongoose.connect(MONGO_URI)` in `src/config/database.ts:6-16`, opened at boot
(`src/server.ts:123`) and closed on shutdown (`server.ts:153`).

No schema sets a `collection` option, so each collection takes Mongoose's default name — the model
name, lowercased and pluralised:

| Model | Defined at | Collection | Module |
|---|---|---|---|
| `User` | `src/modules/user/models/User/schema.ts:85` | `users` | core |
| `Role` | `src/modules/user/models/Role/schema.ts:56` | `roles` | core |
| `UserRole` | `src/modules/user/models/UserRole/schema.ts:117` | `userroles` | core |
| `AuditLog` | `src/modules/audit/models/AuditLog/schema.ts:36` | `auditlogs` | core |
| `Coupon`, `CouponPurchase`, `CouponRedeem` | `src/modules/coupon/models/*/schema.ts` | `coupons`, `couponpurchases`, `couponredeems` | product |
| `Referral`, `ReferralCode` | `src/modules/referral/models/*/schema.ts` | `referrals`, `referralcodes` | product |

There is no permissions collection: roles are the `ROLE_CODE` enum, enforced on `Role.code` by
the schema (`Role/schema.ts:11`).

**Where queries live today.** A model folder is `index.ts` + `types.ts` + `schema.ts`, and the
Mongoose model is called from services and, in legacy code, straight from controllers — for
example `src/modules/user/controllers/admin/role.ts:44` and the coupon, referral and dashboard
controllers. That breaks the layer rule (CLAUDE.md hard rule 3); new code must not add more.

`npm run db:reset` drops the whole Mongo database, flushes the app's Redis db and re-seeds. It
refuses to run when `NODE_ENV=production`, and unless the database it resolved to is named on the
command line: `npm run db:reset -- app` (`src/scripts/reset-db.ts:10-24`). A shell that lost its env
overrides points at the dev database; naming the target turns that silent mistake into a refusal.

---

## Target: PostgreSQL + Prisma v7

> **Target design — not built.** Checked against the official Prisma documentation on
> **2026-08-23**. Re-check before scaffolding — most material online still targets v5/v6, where
> several of these defaults were different.

Target table names (`users`, `roles`, `user_roles`, `permissions`, `audit_logs`, …) are in
[../modules/auth/data-model.md](../modules/auth/data-model.md).

| Decision | Note |
|---|---|
| **Multi-file schema** | `prisma/` as a folder, not one file. The file holding the `generator` block sits at the root of it |
| **`prisma.config.ts`** | the v7 config file. `adapter`, `engine`, `directUrl` and `studio` were **removed** in v7 — do not copy them from older examples |
| **`prisma-client` generator** | `prisma-client-js` is **deprecated**. The new generator emits plain TypeScript into your source tree; `output` is required |
| **Driver adapter** `@prisma/adapter-pg` | v7 dropped the Rust engine; migrations work with driver adapters automatically |
| **TypedSQL** (`prisma/sql/`) | type-safe raw SQL for what the query builder expresses badly — dashboards, aggregations, recursive CTEs |
| **`relationJoins`** | emits a real DB-level `JOIN` instead of separate queries — the N+1 fix at engine level |
| **Client extensions (`$extends`)** | home for soft-delete, tenant scoping and audit hooks; replaces the deprecated `$use` |
| **Global `omit`** | set `passwordHash` and any token hash to omit at client level, so a forgotten `select` cannot leak them |
| **`migrate dev` / `migrate deploy`** | `dev` locally, `deploy` in CI. Never `db push` outside prototyping |

**Version pin: v7.** Prisma 8 exists as a release candidate (`prisma@next`) and is a ground-up
TypeScript rewrite. Prisma's own docs recommend it for new projects, but an RC is a moving target
with no LTS — not appropriate for client work. Re-evaluate when it goes stable.

**MongoDB is not supported on v7.** A client who requires Mongo pins that clone to Prisma v6, or
keeps Mongoose. This is a per-client decision, not a reason to fork the starter.

### Target layout

```
prisma/
├─ schema.prisma          # generator + datasource ONLY
├─ models/
│  ├─ user.prisma         # one file per module
│  ├─ auth.prisma
│  ├─ rbac.prisma
│  └─ audit.prisma
├─ migrations/
├─ sql/                   # TypedSQL
└─ seed.ts
```

One `.prisma` file per module keeps per-module schema ownership that a single 900-line
`schema.prisma` would take away. Add a module, add a file. Nobody merges a shared schema.

### Target: every query in `models/<Entity>/repo.ts`

Every query lives in `models/<Entity>/repo.ts` and nowhere else; the folder becomes `index.ts` +
`types.ts` + `repo.ts`. Controllers never touch the ORM; services call repos. There is no separate
`repositories/` folder.

This is the seam that makes the ORM replaceable. Swapping database or ORM means rewriting `repo.ts`
files and the schema; services, controllers, routes, validators and the auth layer are untouched. It
is also what would make an eventual Prisma 8 migration a per-entity change rather than a
whole-codebase one.

The one `repo.ts` that exists today is `src/modules/auth/models/Session/repo.ts`, and it talks to
Redis, not a database.

---

## Query rules

They live in [../standards/performance-practices.md](../standards/performance-practices.md): no
query in a loop (§2), filter and paginate before joining (§3), index for the query in ESR order
(§4), fetch only the fields needed (§5), cursor pagination over deep offsets (§6).

**Today versus §6:** list endpoints cap the page size — 100 in the user module
(`src/modules/user/validators/index.ts:22-23,32`), 100 or 50 in the product modules — but they
paginate by offset (`skip`), for example `src/modules/user/controllers/admin/role.ts:32,44`. Cursor
pagination is target, not built.
