---
name: new-module
description: Scaffold a new domain module in this starter's exact shape, in the correct order, without breaking module boundaries. Use for "add a module", "create the orders module", "I need a new feature area".
---

# New module

Creates `src/modules/<domain>/` in this repo's shape. Follow the order — each step depends on the
one before it, and doing them out of order is how the layers end up leaking.

## First: is it actually a module?

If it cannot exist, be listed, or be ordered **without its parent**, it is a sub-entity and belongs
*inside* the parent module — not a peer module (`docs/decisions.md` §3). A product variant is not a module.
Ask before scaffolding if it is borderline.

## Order

**1. Schema** — `prisma/models/<domain>.prisma`. One file per module (`docs/decisions.md` §6.2). Add indexes
for the queries you know you will run, in ESR order (docs/standards/performance-practices.md §4). Include `tenantId`
if the entity is tenant-scoped.

```bash
npx prisma migrate dev --name add_<domain>
```

**2. Model folders** — `models/<Entity>/` with **exactly 3 files** (docs/standards/project-structure.md §5):
- `types.ts` — enums (`UPPER_SNAKE as const`) + DTO types
- `repo.ts` — every Prisma query for this entity, and nothing else
- `index.ts` — front door, re-exports repo + types

**3. Services** — `services/<domain>.service.ts`. Business rules. Takes plain arguments, returns
plain data; no `req`, no `res`. Must be callable from a job, a CLI or a test. Accepts the actor's
scope and applies it via `scopeWhere` (`docs/modules/auth/authorization.md`).

**4. Validators** — `validators/`. zod schemas for body, query **and** params. Infer the DTO types
from the schemas so there is one source of truth.

**5. Controllers** — `controllers/<audience>/`. Thin: parse → call service → respond via
`utils/response.ts`. No `prisma`, no business rules. One folder per audience (admin, vendor,
customer, public) — this split is deliberate, it is what lets several people work in parallel.

**6. Permissions** — add the new `resource:action` keys to `modules/user/seed/permissions.ts`, and
grant them with a scope in `seed/roles.ts`. **Never invent a role check in code.**

**7. Routes** — `routes/<audience>/<domain>.ts`:

```ts
router.get('/',      authenticate(portal), requirePermission('<domain>:read'),   ctrl.list);
router.patch('/:id', authenticate(portal), requirePermission('<domain>:update'), ctrl.update);
```

**8. Front door** — `index.ts` exports `register(router)` **and** the module's public facade. Other
modules may import *only* from here (`docs/decisions.md` §4.3).

**9. Wire it up** — one line in `src/routes/index.ts`, one alias in `tsconfig.json` `paths`.

**10. Verify** — `npm run lint:fix && npm run type-check`, then `/preflight`.

## Rules while building

- Do not create empty folders "for later" — `jobs/`, `listeners/`, `__tests__/` appear when there
  is something to put in them.
- Do not import another module's internals. Need product data in an order? Snapshot it onto the
  order line and call the facade for live checks (`docs/decisions.md` §3).
- Do not duplicate a service per audience. Same service, different scope — that is the whole point
  of the permission model.
- Split a file only on a trigger from `docs/decisions.md` §4.4, never pre-emptively.
