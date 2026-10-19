# Documentation

```
docs/
├─ decisions.md              # what is settled, what is still open
├─ platform/                 # how the server itself works
│  ├─ configuration.md · redis.md · rate-limiting.md
│  └─ database.md · scaling.md
├─ standards/                # cross-cutting law, applies to all code
│  ├─ project-structure.md
│  ├─ coding-practices.md
│  └─ performance-practices.md
└─ modules/                  # one folder per domain module
   ├─ README.md              # index: which modules are documented, which are not
   └─ auth/
```

## Start here

| If you want to… | Read |
|---|---|
| know what is decided and what is open | [decisions.md](decisions.md) |
| follow a request through the server | [platform/](platform/README.md) |
| know what lives in Redis and why | [platform/redis.md](platform/redis.md) |
| understand the rate limiter | [platform/rate-limiting.md](platform/rate-limiting.md) |
| understand how auth works | [modules/auth/](modules/auth/README.md) |
| see which modules are documented at all | [modules/](modules/README.md) |
| add a module or a feature | [standards/project-structure.md](standards/project-structure.md), then `/new-module` |
| know if your code meets the bar | [standards/coding-practices.md](standards/coding-practices.md) — the pre-commit checklist at the end |
| know if it will survive traffic | [standards/performance-practices.md](standards/performance-practices.md) and [platform/scaling.md](platform/scaling.md) |

---

## The rules for writing these documents

This is a starter that other people clone. A wrong sentence here becomes a wrong decision in
somebody's client project six months from now. These rules are not style preferences.

### 1. Accuracy first — verify, do not remember

**Every factual claim about code must come from reading that code**, in the session you write it.
Not from memory, not from the design document, not from what the function name implies.

- Cite the source: `` `authenticate.ts:67` `` or `` `User/schema.ts:58-60` ``. A reader must be able
  to check you in ten seconds.
- If you cannot verify it, do not write it. "I believe" and "should" do not belong in a factual
  description.
- Numbers are claims too. "3 database round-trips" means you counted three, and can point at them.

### 2. Never present a design as if it were built

Every page states its status in the first three lines:

```markdown
> **Target design — not built yet.** Nothing on this page exists in `src/` today.
```
```markdown
> **Verified against the code on 2026-08-23.** Line numbers refer to the working tree.
```

A design document mistaken for documentation of working code costs hours and, in auth, can cost a
security incident. [modules/auth/](modules/auth/README.md) is the worked example: five pages of
design, one page of verified reality, and you cannot confuse them.

### 3. Write for a competent stranger

Assume a good engineer who has never seen this repo, and assume English may be their second
language.

- Short sentences. One idea each.
- Expand a term the first time it appears: "an *epoch* — a counter we bump to invalidate every
  token a user holds".
- Prefer the plain word: "overwrites" over "clobbers", "check" over "assert against".
- No unexplained acronyms. RBAC, TTL, CSRF and ESR each get a clause the first time.
- If a paragraph needs re-reading to parse, rewrite it. That is a defect, not the reader's problem.

### 4. Show what breaks in the real world

Every non-obvious rule earns its place with a concrete scenario — real actors, real consequence:

> **Real world:** Sara is logged into the admin portal on her laptop. She opens the app on her
> phone. The phone login overwrites the row's token, so her laptop is silently logged out
> mid-task.

That sentence teaches the bug. "Sessions are not per-device" does not. This matters more here than
in a normal repo, because this code is copied into projects by people who were not in the design
conversation.

### 5. Draw it when it has a sequence or a branch

Use mermaid — it renders on GitHub, diffs like text, and never goes stale as an unversioned image.
`sequenceDiagram` for anything with more than two steps or more than one actor, `flowchart` for
decisions, `erDiagram` for tables. Prose for everything else.

### 6. One source of truth

A rule lives in exactly one file. Everything else links to it and cites the section number.
**Never copy a rule into a second document** — copies drift, and then nobody knows which is
current. `standards/` holds what applies everywhere; `modules/<domain>/` holds what applies to one
domain.

### 7. The document changes in the same commit as the code

If you change `authenticate.ts`, you update the page that describes it, in that commit. A doc
corrected "later" is a doc that is wrong in production for a month. Run `/verify-docs` before
committing when you have touched code that a document describes.

### 8. Record the version and the date

Any decision taken from a tool's official documentation carries the version it was checked against
and the date, the way [decisions.md](decisions.md) does. Tools move; a decision without a date cannot be
re-evaluated.

### 9. No filler

Delete the introduction that says what the page is about when the title already says it. No
"comprehensive guide to", no restating the same point in three registers. Length is not thoroughness.

### 10. Split a module's docs when the file stops being scannable

Roughly past 400 lines, or when a reader would want one concern without the others. Split along
concerns — data model, flows, authorization, security — not arbitrarily. A small module stays one
`README.md`; copy the shape of [modules/auth/](modules/auth/README.md) when a second one is needed.

---

`CLAUDE.md` at the repo root is the map loaded at the start of every Claude Code session, and it
points here. Keep it short; the detail belongs in these files.
