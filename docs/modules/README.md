# Modules

> **Status: 1 of 7 modules is documented.** This page is the index, and it is deliberately honest
> about the gap — a missing row is a real gap, not an oversight to be assumed away.

One folder per domain module, mirroring `src/modules/`. A module owns its routes, controllers,
services and models, and everything another module may use goes through its `index.ts`
([../standards/project-structure.md](../standards/project-structure.md) §12).

---

## Documented

| Module | What it owns | Pages |
|---|---|---|
| [auth/](auth/README.md) | sessions, login providers, password policy, lockout, CSRF, OTP lifecycles | [README](auth/README.md) · [flows](auth/flows.md) · [security](auth/security.md) · [authorization](auth/authorization.md) *(design)* · [data-model](auth/data-model.md) *(design)* · [legacy-migration](auth/legacy-migration.md) *(historical)* |

`auth/` is the worked example. Copy its shape when documenting a new module: a `README.md` that
states what the module owns and what it deliberately does not, plus a page per concern once the
README stops being scannable (roughly past 400 lines).

---

## Not documented yet

These exist in `src/modules/` with no page here. The routes are read out of each module's
`index.ts`, so this table is accurate even though the modules are undocumented.

| Module | Mounts | Note |
|---|---|---|
| `user` | `/admin/{customers,vendors,associates,roles}`, `/{customer,vendor,associate}/profile` | The largest undocumented module. Also the one `auth` depends on, and the one that calls back into `auth` for session revocation and password hashing |
| `coupon` | `/admin/coupons`, `/vendor/coupons`, `/customer/coupons`, `/pub/coupons` | Product-specific. Slated for deletion when the starter is cloned for a client that does not sell coupons — see [../decisions.md](../decisions.md) |
| `referral` | `/associate/referrals` | Product-specific, same caveat |
| `dashboard` | `/admin/dashboard`, `/vendor/dashboard`, `/associate/dashboard` | Read-only aggregation over the others |
| `notification` | *(no routes)* — exports `emailService` | Email templates and the SMTP transport. Branding comes from `APP_NAME` / `APP_LOGO_URL` |
| `audit` | *(no routes)* — exports `record` | Append-only MongoDB audit log. `record()` never throws, so a logging failure cannot break a request |

**Document a module when someone has to change it and cannot work out why it is shaped that way.**
Not before — a page written ahead of the code is a page that will be wrong by the time it is read,
and this repo has already paid that cost once.
