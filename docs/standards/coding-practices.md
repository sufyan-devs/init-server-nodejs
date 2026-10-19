# Coding Practices

> **Verified against the code on 2026-10-19.** Examples marked *illustrative* name code that does not exist.
>
> **Companion to [project-structure.md](project-structure.md).**
> That file says *where code goes*. This file says *how to write the code itself* —
> so it stays **easy to read, easy to debug, scalable, and free of duplication**.
>
> Read it once, then keep it open while coding. Most rules have a ❌ bad / ✅ good
> example; the ones that name real code cite it as `file:line`.

---

## The 15 Rules (the whole file in one screen — one line per section)

1. **DRY** — write a thing once, import it everywhere; extract on the third copy.
2. **One function = one job** — small, named, testable.
3. **Encapsulate** — hide *how*, expose *what* (the front-door rule).
4. **Reuse before you write** — check `utils/` and the module's `services/` first.
5. **No magic values** — named constants, not scattered strings/numbers.
6. **Fail loud, fail early** — validate at the edge, throw `ApiError` with a `code`.
7. **Shallow & flat** — guard clauses over nested `if`; early `return`.
8. **Name for intent** — code reads like a sentence; comments explain *why*, not *what*.
9. **Pure where possible** — calculation separate from I/O.
10. **Consistency beats cleverness** — match the surrounding file.
11. **Right primitive** — a value's type stays stable.
12. **Real booleans** — `true`/`false`, and an enum for more than two states.
13. **Strict comparisons** — `===` everywhere; `== null` is the one exception.
14. **Don't repeat a comparison** — name it, `includes` it, or table it.
15. **Right control flow** — guard `if`, `switch` with `default`, lookup map, simple ternary.

---

## 1. DRY — Don't Repeat Yourself

If you copy-paste a block, stop — extract it.

**Where extracted code lives (decide by what it is):**

| The repeated thing is... | Put it in... |
|--------------------------|--------------|
| Pure helper, no business rules | `src/utils/` |
| Business rule reused across roles | `modules/<domain>/services/` |
| A fixed value (status, role, limit) | `src/constants/` or a model's `types.ts` |
| Same DB query | a service method today; the entity's `models/<X>/repo.ts` in the Prisma target |
| Same response/error | `utils/response.ts` + `utils/apiError.ts` |

**Example — field stripping.** Today it is done once, in the model: `toJSON` on the user schema
deletes `passwordHash` and `__v` (`user/models/User/schema.ts:66-71`). The duplication to avoid is
the same `delete` lines copied into every controller that needs a trimmed view.

```ts
// ❌ duplicated in each controller — illustrative
const obj = referral.toObject();
delete obj.rejectionReason; delete obj.__v; delete obj.createdAt;
```

```ts
// ✅ one reusable shaper, imported wherever needed — illustrative, no such file exists
// utils/sanitize.ts
export const omit = <T extends object>(obj: T, keys: (keyof T)[]) => {
  const clone = { ...obj };
  for (const k of keys) delete clone[k];
  return clone;
};
// usage
const publicView = omit(referral.toObject(), ['rejectionReason', '__v', 'createdAt']);
```

> **Rule of three:** the *first* time write it inline. The *second* time, note the
> duplication. The *third* time, extract it. An abstraction with fewer than three real callers
> is deleted (CLAUDE.md hard rule 10).

---

## 2. One Function, One Job

A function should do *one* thing and be nameable without "and".

```ts
// ❌ createAndValidateAndNotifyReferral — three jobs, untestable
const create = async (req, res) => { /* validate + save + email, 80 lines */ };
```

```ts
// ✅ each job named and separate (validator → service) — illustrative, referralService does not exist
const create = catchAsync(async (req, res) => {
  const referral = await referralService.createForAssociate(String(req.user!._id), req.body);
  return response.created(res, referral);
});
```

- Aim for functions short enough to read without scrolling.
- If you need "and" to describe it, split it.
- A long function isn't a sin — a function doing *unrelated* things is.

---

## 3. Encapsulation — hide the *how*, expose the *what*

Callers should use a clean front door and never reach into internals.

**This codebase already does this with barrel `index.ts` files:**

```ts
// referral/models/Referral/index.ts:1-2 — the front door
export { default } from './schema';
export * from './types';
```

```ts
// ✅ callers import the front door, not internal files (dashboard/controllers/associate/index.ts:1)
import Referral, { REFERRAL_STATUS } from '@referral/models/Referral';

// ❌ never reach past it into internals
import Referral from '@referral/models/Referral/schema';
```

**Apply the same to services & utils:** export only what's meant to be used. Keep
helper functions module-private (don't `export` them) unless another file needs them.

```ts
// service file — illustrative
const buildWelcomeBlock = (user) => { ... };        // private — no export
export const createForAssociate = (...) => { ... };  // public API only
```

---

## 4. Reuse Before You Write

Before writing a helper, **search `utils/` first** — it may already exist:

| Need | Use (already exists) |
|------|----------------------|
| Convert an id to an ObjectId; recognise a Mongo duplicate-key error | `toObjectId`, `DUPLICATE_KEY_ERROR_CODE` (`@utils/mongoHelper`) |
| Normalise an email, escape HTML or a regex, read an error's message | `normalizeEmail`, `escapeHtml`, `escapeRegex`, `errorMessage` (`@utils/format`) |
| Send a response | `response.success/created/error/notFound` (`@utils/response`) |
| Throw an error | `ApiError.badRequest/forbidden/notFound/conflict/internal`, `ApiError.fromAuthError(entry)` (`@utils/apiError`) |
| Async handler wrapping | `catchAsync` (`@utils/catchAsync`) |
| Redis get/set/del with TTL, Redis key names | `setKey/getKey/delKey/getKeyWithTtl` and the key builders (`@utils/redisKeys`) |
| A numeric env value | `readInt` (`@config/env`) |
| Logging | `logger` (`@utils/logger`) |

> **Rule:** a `utils/` helper carries **no business knowledge**. If it knows about "referrals" or
> "vendors", it belongs in that module's service or `helpers/`, not utils.

---

## 5. No Magic Values

Every fixed string/number gets a name. This repo's pattern: `UPPER_SNAKE` objects
`as const` in the model's `types.ts`.

```ts
// ❌ magic strings — typo-prone, un-searchable
if (referral.status === 'PENDING') { ... }

// ✅ named constant (already the convention here — referral/models/Referral/schema.ts:75)
import { REFERRAL_STATUS } from '@referral/models/Referral';
if (referral.status === REFERRAL_STATUS.PENDING) { ... }
```

Benefits: autocomplete, one place to change, the compiler catches typos.

---

## 6. Fail Loud, Fail Early (debuggability)

Validate at the **edge**, throw a **typed** error, let the central handler format it.

```ts
// ✅ guard clauses at the top, then the happy path runs flat — illustrative
const submit = async (id: string) => {
  if (!mongoose.isValidObjectId(id)) throw ApiError.badRequest('Invalid id', 'BAD_ID');
  const referral = await Referral.findById(id);
  if (!referral) throw ApiError.notFound('Referral not found', 'REFERRAL_404');
  if (referral.status !== REFERRAL_STATUS.PENDING)
    throw ApiError.badRequest('Only PENDING can be activated', 'BAD_STATE');
  // ...happy path, no nesting
};
```

**Rules:**
- Always give errors a `code` — the frontend branches on codes, not on message text.
- Never swallow errors silently (`catch {}`); log with context or rethrow.
- Don't `res.status(500)` by hand — `throw` and let `errorMiddleware` decide.

---

## 7. Shallow & Flat — guard clauses over nesting

```ts
// ❌ arrow-shaped pyramid
if (user) {
  if (user.active) {
    if (referral) {
      // do work
    }
  }
}
```

```ts
// ✅ exit early, keep the main logic at the left margin
if (!user) throw ApiError.fromAuthError(AUTH_ERRORS.SESSION_REQUIRED);
if (!user.active) throw ApiError.forbidden('Inactive user');
if (!referral) throw ApiError.notFound('Referral not found');
// do work — flat and readable
```

Max ~2–3 levels of indentation inside a function. Deeper = extract a function.

---

## 8. Naming for Intent

Code is read 10× more than written. Optimize for the reader.

| Kind | Convention | Example |
|------|------------|---------|
| Functions = verbs | `camelCase`, action-first | `createForAssociate`, `assertPending` |
| Booleans = questions | `is/has/can` | `isDeleted`, `hasReferral`, `canApprove` |
| Variables = nouns | descriptive, no abbreviations | `pendingReferrals`, not `pr` |
| Constants | `UPPER_SNAKE` | `REFERRAL_STATUS`, `ROLE_CODE` |
| Async returns | reads naturally | `const referral = await findReferral(id)` |

```ts
// ❌ what is d? what is the 2?
const d = await c.find({ s: 2 });

// ✅ self-documenting — no comment needed
const pendingReferrals = await Referral.find({ status: REFERRAL_STATUS.PENDING });
```

**Comments explain WHY, not WHAT.** If a comment restates the code, delete it and
rename instead. Match the comment density of the surrounding file — in this repo that is close to
zero (CLAUDE.md hard rule 10).

```ts
// ❌ noise
i++; // increment i

// ✅ explains a non-obvious decision
// Capped per user so one leaked password cannot open unlimited devices.
```

---

## 9. Pure Functions & Isolated Side-Effects

Keep calculation separate from I/O. Pure functions (same input → same output, no DB,
no network) are trivial to test and reuse.

```ts
// ✅ pure — computable, testable, reusable — illustrative, no pricing code exists
export const finalPrice = (base: number, discount: Discount): number =>
  discount.type === DISCOUNT_TYPE.PERCENTAGE
    ? base * (1 - discount.value / 100)
    : base - discount.value;

// side-effects (DB, email, redis) stay in services, called explicitly — illustrative
const referral = await Referral.create(data);   // I/O isolated in the service
```

**Rule:** a function that *both* calculates *and* hits the DB is two functions.

---

## 10. Consistency Beats Cleverness

The whole point of these files is that **every module looks the same**. A clever
one-off that breaks the pattern costs more than it saves.

- Match the surrounding file's style, naming, and structure.
- New endpoint? Copy an existing one as the template, then change the logic.
- `npm run lint:fix` + `npm run type-check` before every commit — the tools settle style
  arguments so humans don't.

---

## 11. JavaScript Primitives — pick the right type

JS has **7 primitives**: `string`, `number`, `boolean`, `null`, `undefined`,
`bigint`, `symbol` (everything else is an `object`, including arrays). Most bugs come
from using the wrong one or mixing them.

| Primitive | Use for | Don't abuse it for |
|-----------|---------|--------------------|
| `string` | text, ids, codes, enums-as-text | numbers you'll do math on |
| `number` | counts, math (64-bit float) | money (precision loss) → use Decimal |
| `boolean` | true/false flags | tri-state ("yes"/"no"/"maybe") → use an enum |
| `null` | "intentionally empty" (set by you) | "not provided" → that's `undefined` |
| `undefined` | "missing / never set" (default) | don't assign it manually; let it be the default |
| `bigint` | integers beyond 2^53 (rare) | normal counts |
| `symbol` | unique keys (rare, library-level) | everyday code |

```ts
// ❌ a number forced into a string, a flag as a string
const total = "5";  if (total > 3) { ... }   // string compare — lands you in bug city
const active = "true";                        // a string that's ALWAYS truthy

// ✅ right primitive for the job
const total = 5;            // number for math
const active = true;        // real boolean
```

> **Rule:** keep a value's type stable. A variable that is sometimes a `number` and
> sometimes a `string` ("stringly typed") is the root of countless bugs. TypeScript
> helps — type it once and let the compiler enforce it.

---

## 12. Booleans — store true booleans, not `1`/`0`/`"yes"`

A flag is `true`/`false`. Don't encode it as `1/0`, `"Y"/"N"`, or `"true"/"false"`.

```ts
// ❌ integer/string flags — every reader must remember the encoding
user.verified = 1;
if (user.verified === 1) { ... }
referral.active = "yes";

// ✅ real boolean — self-explanatory, no decoding
user.verified = true;
if (user.verified) { ... }                    // not `=== true` — see §13
```

**But for more than two states, a boolean is the wrong tool — use an enum.** This repo
already does this well: a role request isn't `isPending` + `isApproved` + `isRevoked` (three
booleans that can contradict each other) — it's one `status` with named values
(`user/models/UserRole/types.ts:3-9`):

```ts
// ✅ one source of truth, can't be in two states at once (auth/services/auth.service.ts:127,258)
import { USER_ROLE_STATUS } from '@user/models/UserRole';
if (userRole.status === USER_ROLE_STATUS.APPROVED) { ... }
```

> **Smell:** two or more booleans that are never true together → replace with one enum.
> **Note on DBs:** some columns *store* `0/1` or `'Y'/'N'`. Convert at the boundary
> (model/mapper) so the rest of your code only ever sees a real `boolean`.

---

## 13. Comparisons — `===`, truthiness, and the `== null` exception

### Always `===` / `!==` (never `==` / `!=`)

`==` does type coercion with surprising results (`0 == ''`, `'' == false`,
`1 == '1'` are all `true`). Use strict equality everywhere. ESLint enforces it: `eqeqeq` with
`null: "ignore"` (`eslint.config.js:56`).

```ts
// ❌ loose — coerces types, hides bugs
if (count == '0') { ... }

// ✅ strict — compares value AND type
if (count === 0) { ... }
```

### The ONE allowed loose check: `== null`

`x == null` is the idiomatic way to test "null **or** undefined" in one shot — the
only `==` worth keeping.

```ts
// ✅ true for BOTH null and undefined — illustrative
if (query.page != null && query.limit != null) { ... }

// equivalent but verbose:
if (total !== null && total !== undefined) { ... }
```

### null vs undefined — check the one you mean

- `undefined` = "was never set / not provided" (default, missing keys, missing args).
- `null` = "explicitly empty" (you, or the DB, set it to nothing on purpose).

```ts
obj.value ?? 'fallback'      // ?? triggers ONLY on null/undefined  ← usually what you want
obj.value || 'fallback'      // || triggers on ALL falsy: 0, '', false too  ← often a BUG
obj?.nested?.field           // optional chaining — safe access, no "cannot read of undefined"
```

### Truthiness traps — `0`, `''`, `NaN`, `false` are all falsy

`if (x)` is fine for genuine yes/no, but **dangerous when `0` or `''` are valid values.**

```ts
// ❌ a valid quantity of 0 is treated as "missing" — illustrative
if (!order.discount) applyDefault();        // 0 is falsy → wrong branch!

// ✅ say exactly what you mean
if (order.discount == null) applyDefault(); // only null/undefined trigger it
```

> **Rule:** for "does this value exist?", check `== null`. Reserve bare `if (x)` for
> values that are *truly* boolean-ish.

---

## 14. Don't Repeat the Same Comparison — name it or table it

If you compare the same value against several options, or repeat a condition, extract
it. This is DRY (§1) applied to logic.

### Repeated `||` against the same field → `includes` / `Set`

```ts
// ❌ same variable compared over and over
if (status === 'REJECTED' || status === 'SUSPENDED' || status === 'INACTIVE') { ... }

// ✅ one readable membership check
const CLOSED_STATUSES: readonly ReferralStatus[] = [REFERRAL_STATUS.REJECTED, REFERRAL_STATUS.SUSPENDED, REFERRAL_STATUS.INACTIVE];
if (CLOSED_STATUSES.includes(status)) { ... }
// for hot paths / big lists, a Set gives O(1): new Set([...]).has(status)
```

### A compound condition used twice → name it once

```ts
// ❌ same logic duplicated — change one, forget the other
if (user.status === 'ACTIVE' && user.emailVerified) issueSession();
// ...later...
if (user.status === 'ACTIVE' && user.emailVerified) sendLoginAlert();

// ✅ name the concept once (reads like a sentence, single point of change)
const canSignIn = user.status === USER_STATUS.ACTIVE && user.emailVerified;
if (canSignIn) issueSession();
if (canSignIn) sendLoginAlert();
```

> Better still, put `canSignIn` on the model/service as a method so *every* caller
> shares one definition (encapsulation, §3).

---

## 15. Control Flow — `if` vs `switch` vs ternary vs lookup map

Pick the structure that makes intent clearest. Rough guide:

| Situation | Use | Why |
|-----------|-----|-----|
| 1–2 conditions, or guard clauses | `if` / early `return` | simplest, flattest |
| One value → one of a few **discrete** cases | `switch` (or a map) | clearer than an `if/else` ladder |
| Map a key → a value/handler | **lookup object/Map** | no branching at all, easy to extend |
| Pick between **two** values inline | ternary `a ? b : c` | concise for simple assignment |

### Guard clauses beat nested `if` (recap of §7)
```ts
if (!user) throw ApiError.fromAuthError(AUTH_ERRORS.SESSION_REQUIRED);
if (!referral) throw ApiError.notFound('Referral not found');
// happy path, flat
```

### `switch` over a long `if/else` ladder on the same variable
```ts
// ❌ ladder repeating `status ===`
if (status === 'PENDING') ...
else if (status === 'APPROVED') ...
else if (status === 'REJECTED') ...

// ✅ switch — the variable is stated once
switch (status) {
  case USER_ROLE_STATUS.PENDING:  return handlePending();
  case USER_ROLE_STATUS.APPROVED: return handleApproved();
  case USER_ROLE_STATUS.REJECTED: return handleRejected();
  default:                      throw ApiError.badRequest(`Unknown status: ${status}`);
}
```
> Always include a `default`. In a `switch`, every `case` should `return`/`break` —
> accidental fall-through is a classic bug. The TypeScript compiler option
> `noFallthroughCasesInSwitch` (`tsconfig.json:12`) rejects it at `npm run type-check`.

### Best for "key → value/handler": a lookup map (no branching)
```ts
// ✅ data instead of control flow — trivial to extend, no if/switch growth (illustrative ORDER_STATUS)
const NEXT_STATUS = {
  [ORDER_STATUS.DRAFT]:  ORDER_STATUS.PLACED,
  [ORDER_STATUS.PLACED]: ORDER_STATUS.PAID,
  [ORDER_STATUS.PAID]:   ORDER_STATUS.SHIPPED,
};
const next = NEXT_STATUS[current] ?? throwInvalid(current);
```

### Ternary — only for simple value selection, never nested
```ts
// ✅ fine
const label = isActive ? 'Active' : 'Inactive';

// ❌ nested ternary — unreadable; use if/switch/map instead
const x = a ? b ? c : d : e ? f : g;
```

---

## Pre-Commit Checklist (run through this before pushing)

- [ ] No copy-pasted block — duplication extracted to util/service/constant.
- [ ] Each function does one nameable job; no "and" in the name.
- [ ] Imported from front-door `index.ts`, not internal files (across modules: `@<x>/index`, models
      excepted — [project-structure.md §12](project-structure.md) Rule 1).
- [ ] Reused existing `utils/` helpers instead of rewriting.
- [ ] No magic strings/numbers — used a named constant.
- [ ] Validated input at the edge (zod via `validate()`); errors thrown via `ApiError` with a `code`.
- [ ] Guard clauses, not nested pyramids (≤ 3 indent levels).
- [ ] Names read like intent; comments say *why*, not *what*; comment density matches the file.
- [ ] Calculation separated from DB/network side-effects.
- [ ] Right primitive for each value; types stay stable (no "stringly typed").
- [ ] Real `boolean` flags (not `1/0`/`"yes"`); >2 states use an enum, not many booleans.
- [ ] `===`/`!==` everywhere; only `== null` allowed (null-or-undefined check).
- [ ] Used `??`/`?.` for null-safety; didn't use `||`/`if(x)` where `0`/`''` are valid.
- [ ] No repeated comparison — extracted to a named boolean, `includes`, or a map.
- [ ] Right control flow: guard `if` / `switch` (with `default`) / lookup map / simple ternary.
- [ ] `npm run lint:fix` and `npm run type-check` pass.

---

## One-Sentence Summary

> **Write each thing once, name it for what it does, hide its internals behind a
> front door, validate and fail early, and keep calculation separate from I/O — so
> any teammate can read, debug, and extend it without surprises.**
