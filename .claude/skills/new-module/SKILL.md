---
name: new-module
description: Scaffold a new domain module in this starter's exact shape, in the correct order, without breaking module boundaries. Use for "add a module", "create the orders module", "I need a new feature area".
---

# New module

Creates `src/modules/<domain>/` in this repo's shape (`docs/standards/project-structure.md` §4).
Follow the order — each step depends on the one before it, and doing them out of order is how the
layers end up leaking.

Hard constraints for this skill and any subagent it starts: NEVER run npm install, npm ci, npx (in
any form), or add any package. NEVER run npm run build. The only commands you run to check the work
are `npm run type-check` and `npm run lint:fix`. If the module needs a package that is not in
`package.json`, **stop and tell the owner**.

## First: is it actually a module?

If it cannot exist, be listed, or be ordered **without its parent**, it is a sub-entity and belongs
*inside* the parent module — not a peer module (project-structure.md §10, step 0). A product variant
is not a module. Ask before scaffolding if it is borderline.

## Order

**1. Model folders** — `models/<Entity>/` with **exactly 3 files** (project-structure.md §5):
- `types.ts` — interface + enums (`UPPER_SNAKE as const`)
- `schema.ts` — the Mongoose schema, with indexes for the queries you know you will run, in ESR
  order (`docs/standards/performance-practices.md` §4)
- `index.ts` — front door: `export { default } from './schema'; export * from './types';`

Register the models at boot by importing them from the module's `index.ts`, as
`src/modules/coupon/index.ts:2-4` does.

> **Target design — not built:** PostgreSQL + Prisma v7, with one schema file per module under
> `prisma/` and `repo.ts` in place of `schema.ts` (project-structure.md §16). Prisma is not
> installed. Do not create `prisma/`, do not run any Prisma or migration command. If the module
> genuinely needs Postgres, stop and tell the owner.

**2. Services** — `services/<domain>.service.ts`. Business rules. Takes plain arguments, returns
plain data; no `req`, no `res`. Must be callable from a job, a CLI or a test.

**3. Validators** — `validators/index.ts`. zod schemas for body, query **and** params, applied on
the route with `validate({ body, params, query })` from `@middlewares/validate`. Cap every page
size (see `src/modules/user/validators/index.ts:22-23`).

**4. Controllers** — `controllers/<audience>/`, one folder per audience the module serves: `admin`,
`vendor`, `associate`, `customer`, `public`. Thin: call the service → respond via
`utils/response.ts`, throw `ApiError`. No database calls, no business rules (CLAUDE.md hard rule 3).
The audience split is deliberate — it is what lets several people work in parallel.

**5. Routes** — `routes/<audience>/<domain>.ts`. Today authorization is a role check on the route
(project-structure.md §13C):

```ts
import { authenticate, authorizeRoles } from '@auth/index';
import { ROLE_CODE } from '@user/models/Role';

const requireAdmin = [authenticate(ROLE_CODE.ADMIN), authorizeRoles(ROLE_CODE.ADMIN, ROLE_CODE.SUPER_ADMIN)];
router.get('/', ...requireAdmin, validate({ query: listQuerySchema }), ctrl.list);
```

Never put a role check in a controller (CLAUDE.md hard rule 4).

> **Target design — not built:** permissions as database rows. New `resource:action` keys would go
> in `modules/user/seed/permissions.ts` and be granted with a scope in `seed/roles.ts`; routes would
> use `requirePermission('<domain>:read')`, and services would apply the actor's scope with
> `scopeWhere` (`docs/modules/auth/authorization.md`). None of these exist yet — do not create them
> as part of a module.

**6. Front door** — `index.ts` exports `register(router)` **and** the module's public API. Other
modules may import only `@<domain>/index`, or a model folder directly (CLAUDE.md hard rule 2;
project-structure.md §12 Rule 1).

**7. Config, only if needed** — env-driven values go in `modules/<domain>/config.ts`, each numeric
one read with `readInt` from `@config/env` (`src/modules/coupon/config.ts`). Never in `src/config/`
(CLAUDE.md hard rule 6). Add the variables to `.env.example`.

**8. Wire it up** — one `register` line in `src/routes/index.ts`, one `@<domain>/*` alias in
`tsconfig.json` `paths`.

**9. Verify** — `npm run type-check` and `npm run lint:fix`, then `/preflight`.

## Rules while building

- Do not create empty folders "for later" — `jobs/`, `listeners/`, `__tests__/` appear when there
  is something to put in them.
- Do not import another module's internals. Need product data in an order? Snapshot it onto the
  order line, and call the other module's `index.ts` for live checks.
- Do not duplicate a service per audience. One service; the route decides who may call it.
- Split a file only when a trigger in project-structure.md §4 ("When to split a file") fires, never
  pre-emptively.
