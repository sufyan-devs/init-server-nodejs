---
name: check-code
description: Audit the working diff (or given paths) against docs/standards/coding-practices.md — DRY, single responsibility, magic values, naming, comparisons, control flow. Use for "check my code", "is this clean", "review this file".
---

# Check code

Run the `code-auditor` agent against the current working diff, or against the paths given as
arguments if there are any.

```
git diff HEAD --stat        # scope, if no paths were given
```

Pass the agent: the file list, and any specific concern the user raised. Relay its findings —
`file:line`, the coding-practices.md section violated, and the fix — ranked most severe first.

Report only. Apply fixes only if the user asks; then re-run `npm run type-check`.

For the full gate including performance, structure, lint and type-check, use `/preflight` instead.
