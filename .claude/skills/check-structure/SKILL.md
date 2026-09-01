---
name: check-structure
description: Audit placement and module boundaries against docs/standards/project-structure.md — module anatomy, 3-file model folders, index.ts front doors, cross-module deep imports, layer responsibilities, over-engineering. Use for "is this in the right place", "did I break the boundary", "review the structure".
---

# Check structure

Run the `structure-auditor` agent against the current working diff, or against the paths or module
name given as arguments.

Quick manual sweep worth doing first — deep imports are the failure mode that actually rots this
codebase, and they are greppable:

```
grep -rn "@\(auth\|user\|coupon\|referral\|dashboard\|notification\)/\(models\|services\|controllers\)/" src --include=*.ts
```

Anything outside its own module that matches is a violation of `docs/decisions.md` §4.3 rule 1 — cross-module
access goes through `modules/<x>/index.ts`. (Known existing offender: `auth → @referral/models/ReferralCode`.)

Then relay the agent's findings: what is misplaced, which rule and section, where it belongs.

Also confirm the reuse test still holds — nothing client-specific in `src/config/`,
`src/middlewares/`, `src/utils/` or `src/constants/`.

Report only. Apply moves only if the user asks; then re-run `npm run type-check` (path aliases
break loudly).
