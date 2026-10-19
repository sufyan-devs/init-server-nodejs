---
name: check-code
description: Audit the working diff (or given paths) against docs/standards/coding-practices.md — comments, DRY, single responsibility, magic values, naming, comparisons, control flow — then APPLY the fixes. Use for "check my code", "is this clean", "review this file".
---

# Check code

Audit against `docs/standards/coding-practices.md`, **then fix what you find.** This skill is not
report-only: reporting a violation and leaving it in the code is a failed run.

```
git diff HEAD --stat                        # scope, if no paths were given
git ls-files --others --exclude-standard src   # new files the diff does not show
```

## 1. Measure comments first — mechanically, not by eye

Comment violations are the ones that keep coming back, and they are measurable, so measure them
before reading anything:

```bash
for f in $(git diff HEAD --name-only --diff-filter=d -- '*.ts'; git ls-files --others --exclude-standard -- '*.ts'); do node -e "
const l=require('fs').readFileSync('$f','utf8').split('\n').filter(x=>x.trim());
const c=l.filter(x=>/^\s*(\/\/|\/\*|\*)/.test(x)).length;
const p=100*c/l.length;
if(p>8) console.log(p.toFixed(1)+'%  '+c+'/'+l.length+'  $f');
"; done
```

Then read every comment in the changed files (`grep -nE "^\s*(//|/\*|\*)" <file>`) and delete any
that:

- **restates the code** — if the line below it says the same thing, it goes
- **describes history** — "no longer", "now", "previously", "used to", "which is what X did",
  "left as-is". The code is the present tense; git holds the past
- **repeats a rationale that already exists elsewhere** — the same *why* in two files is a DRY
  violation. Keep it where the decision lives, point at it from the other
- **is a banner, divider or section header**

Keep only a *why* that is non-obvious and load-bearing: a guard against a specific failure, a
deliberate trade-off someone would otherwise "fix", a non-intuitive ordering.

A file at **0% is telling you the house style**. Adding the first comment to such a file needs a
real reason.

Density above 8% is a finding. Note that on a file under ~30 lines the percentage is noise — judge
those on content alone.

## 2. Then the rest

Run the `code-auditor` agent for the substantive rules (DRY, magic values, dead code, fail-loud,
naming, `===`/`??`, guard clauses). Pass it the file list and any concern the user raised.

Give it the hard constraints verbatim, or it will install something to check its work:

> NEVER run npm install, npm ci, npx (in any form), or add any package. NEVER run npm run build.
> You may run `npm run type-check`. Do NOT run `npm run lint:fix` — it edits files; the caller runs it.

## 3. Apply, then verify

Fix every finding you agree with. For any you do **not** apply, say so and why — an unfixed finding
must be a stated decision, never an oversight.

```bash
npm run type-check
npm run lint:fix
```

These two are the only build-ish commands this skill runs (CLAUDE.md hard rule 0).

Then re-measure the density from step 1 and show the before/after. If a number is still over 8%,
either fix it or justify it in one line.

## 4. Report

`file:line`, the section violated, and **what you changed** — ranked most severe first. Findings you
left, and why, go at the end.

For the full gate including performance, structure and lint, use `/preflight`.
