---
name: verify-docs
description: Check that documentation claims still match the code, and that pages follow the documentation rules. Use after changing code a document describes, before committing docs, or when asked "are the docs still correct", "check the docs".
---

# Verify docs

Documentation in this repo is a product, not a byproduct — other people clone this starter and act
on what these pages say. This skill checks two separate things: **is it true**, and **is it
readable**.

## 1. Scope

If given a path, check that page. Otherwise, find the pages at risk:

```bash
git diff HEAD --stat -- src/
```

Map changed source files to the pages that describe them. The mapping today:

| Source | Described in |
|---|---|
| `src/middlewares/authenticate.ts`, `src/modules/auth/**`, `src/utils/cookieHelper.ts`, `src/modules/user/models/**` | `docs/modules/auth/legacy-migration.md` |
| module layout, aliases, `src/routes/index.ts` | `docs/standards/project-structure.md` |
| anything under `src/` | `CLAUDE.md` (stack, status, commands) |

## 2. Verify every factual claim

For each page in scope, take its claims about code **one at a time** and open the cited file:

- Does the cited `file:line` still contain what the page says it does? Line numbers drift with every
  edit above them — a wrong line number is a defect, fix it.
- Are counts still right? "two reads and one write" means go count them.
- Is behaviour described as current still current? A page describing a fixed bug is worse than no
  page.
- Does anything described as **built** actually exist? Grep for it. Design and reality must never
  blur — see rule 2 in `docs/README.md`.

**Do not take the previous version of the page as evidence.** The code is the only source of truth.
If a claim cannot be verified from the code, it must be removed or rewritten as an explicit
open question.

## 3. Check the page against the documentation rules

`docs/README.md` holds the full list. The ones most often broken:

- **Status line present** in the first three lines — target design, or verified-on-date.
- **Sources cited** — factual claims carry `file:line`.
- **Plain language** — short sentences, terms expanded on first use, no unexplained acronyms.
- **A real-world example** for each non-obvious rule, showing the actual consequence.
- **A diagram** where there is a sequence or a branch.
- **No duplicated rules** — a rule that also lives in `standards/` must be a link, not a copy.
- **No filler.**

## 4. Report

List, per page: claims that are now wrong (with the correct fact), stale line numbers, missing
status lines, and rule violations. Fix them if the user asks; when you do, update the
verified-on date in the page's status line to today.

If everything checks out, say so plainly and name what you verified — a vague pass is not useful.
