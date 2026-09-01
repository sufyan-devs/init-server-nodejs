# Database

> **Current state: MongoDB + Mongoose.** The Postgres + Prisma move is planned, not built.
> Sessions have already left the database entirely — they live in [Redis](redis.md).

---

## What belongs here

Durable, queryable, relational data: `users`, `roles`, `user_roles`, `permissions`, `audit_logs`.

Not sessions, not OTPs, not counters. The split and its reasoning are in [redis.md](redis.md).

The line is worth restating because it gets argued: **losing a session is a re-login, losing a user
is a company-ending incident.** Anything in the second category needs backups, transactions,
relational integrity and ad-hoc queries — four things an in-memory store does not give you.

---

## Target: PostgreSQL + Prisma v7

> Verified against the official Prisma documentation on **2026-08-23**. Re-check before scaffolding
> — most material online still targets v5/v6, where several of these defaults were different.

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

---

## Layout

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

One `.prisma` file per module restores the per-module schema ownership that a single 900-line
`schema.prisma` would take away. Add a module, add a file. Nobody merges a shared schema.

---

## The repository layer

Every query lives in `models/<Entity>/repo.ts` and nowhere else. Controllers never touch the ORM;
services call repos.

This is not tidiness — it is the seam that makes the ORM replaceable. Swapping database or ORM
means rewriting `repo.ts` files and the schema; services, controllers, routes, validators and the
whole auth layer are untouched. It is also what would make an eventual Prisma 8 migration a
per-entity change rather than a whole-codebase one.

---

## Query rules

From [performance-practices](../standards/performance-practices.md), the ones that bite first:

- No query inside a loop. Batch with `in`, or `include` with `relationJoins`.
- Filter, sort and paginate **before** joining.
- Every filter, sort and foreign key backed by an index, in ESR order.
- `select` only the columns needed; list endpoints never fetch whole rows.
- Cursor pagination for large lists; the limit is always capped.
- Transactions only for genuine multi-table writes — a role grant plus its audit row, not a single
  insert.
