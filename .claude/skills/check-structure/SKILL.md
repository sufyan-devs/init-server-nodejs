---
name: check-structure
description: Audit placement and module boundaries against docs/standards/project-structure.md — module anatomy, 3-file model folders, index.ts front doors, cross-module deep imports, layer responsibilities, over-engineering. Use for "is this in the right place", "did I break the boundary", "review the structure".
---

# Check structure

Run the `structure-auditor` agent against the current working diff, or against the paths or module
name given as arguments. Give it the hard constraints verbatim:

> NEVER run npm install, npm ci, npx (in any form), or add any package. NEVER run npm run build.
> You may run `npm run type-check`. Do NOT run `npm run lint:fix` — it edits files; the caller runs it.

Quick manual sweep worth doing first — deep imports are the failure mode that actually rots this
codebase, and they are greppable. Cross-module imports go through `@<x>/index`; models are the one
exception (`docs/standards/project-structure.md` §12 Rule 1, CLAUDE.md hard rule 2). This prints
every cross-module import that is neither:

```bash
for m in auth audit user coupon referral dashboard notification; do
  grep -rnE "(from|import) '@$m/[^']+'" src --include=*.ts \
    | grep -v "^src/modules/$m/" \
    | grep -vE "@$m/(index|models/[A-Za-z]+)'"
done
```

Empty output is a pass (it was empty on 2026-10-19). Add a new module's name to the list.

Then check core does not depend on product (project-structure.md §3, "Core and product"). The only
allowed hits are the three registrations in `src/routes/index.ts`:

```bash
grep -rnE "@(coupon|referral|dashboard)/" src --include=*.ts | grep -vE "^src/modules/(coupon|referral|dashboard)/"
```

Then relay the agent's findings: what is misplaced, which rule and section, where it belongs.

Also confirm the reuse test still holds — nothing client-specific in `src/config/`,
`src/middlewares/`, `src/utils/` or `src/constants/` (CLAUDE.md hard rule 6).

Report only. Apply moves only if the user asks; then run `npm run type-check` (path aliases break
loudly) and `npm run lint:fix`.
