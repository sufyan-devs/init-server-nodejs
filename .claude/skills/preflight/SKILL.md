---
name: preflight
description: The pre-commit gate. Runs lint + type-check, then audits the working diff for code quality, performance and structure in parallel, and reports one consolidated verdict. Use before every commit, or when asked to "check my work", "review this before I push", "is this ready".
---

# Preflight

The gate that must pass before any commit in this repo. Replaces asking for the same three reviews
by hand every time.

## Steps

**1. Mechanical checks first — they are cheap and they gate everything else.**

```bash
npm run lint:fix
npm run type-check
```

These are the only build-ish commands to run. Never `npm install`, `npm ci`, `npx` or
`npm run build` (CLAUDE.md hard rule 0).

If either fails, **stop and fix it before auditing.** Reporting style findings on code that does
not compile wastes everyone's time.

**2. Scope the review.**

```bash
git status --short
git diff HEAD --stat
git ls-files --others --exclude-standard src
```

If the diff is empty and there are no new files, say so and stop. Inherited legacy code that the
diff does not touch is out of scope.

**3. Run the three audits in parallel** — one message, three `Agent` calls, so they run
concurrently:

- `code-auditor` — docs/standards/coding-practices.md compliance
- `perf-auditor` — docs/standards/performance-practices.md compliance
- `structure-auditor` — docs/standards/project-structure.md placement and boundaries

Give each the changed file list, tell them to report findings only, not to edit, and pass the hard
constraints verbatim:

> NEVER run npm install, npm ci, npx (in any form), or add any package. NEVER run npm run build.
> You may run `npm run type-check`. Do NOT run `npm run lint:fix` — it edits files; the caller runs it.

**4. Apply the docs/standards/coding-practices.md pre-commit checklist** yourself to anything the
agents missed — it is the bar the repo is held to.

**5. Consolidate.** Merge the three reports, drop duplicates, rank most severe first:

- **Must fix** — bugs, security issues, boundary violations, anything that puts a database call on
  the auth hot path (CLAUDE.md hard rule 7), anything that makes a client change require a code
  change
- **Should fix** — real violations with a clear fix
- **Consider** — judgement calls

End with: `PREFLIGHT: PASS` or `PREFLIGHT: N must-fix`.

## Rules

- Do not fix anything unless the user asks — report first. `/preflight fix` means apply the
  must-fix items, then re-run steps 1–2 to confirm nothing broke.
- Never report a finding you have not verified by reading the code around it.
- No padding. "Nothing found in this pass" is a valid and useful result.
