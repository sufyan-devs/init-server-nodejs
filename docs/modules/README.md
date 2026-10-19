# Modules

> **Verified against the code on 2026-10-19. 1 of 6 modules is documented.** This page is the
> index, and it is deliberately honest about the gap — a missing page is a real gap.

One folder per domain module, mirroring `src/modules/`. A module owns its routes, controllers,
services and models. **Another module may import only its `index.ts` — except its models, which may
be imported directly** (`@user/models/User`), because routing models through `index.ts` creates
load-order cycles. The rule lives in
[../standards/project-structure.md](../standards/project-structure.md) §12. A grep of `src/` on
2026-10-19 found no import that breaks it.

---

## Core and product modules

| | Modules | Meaning |
|---|---|---|
| **Core** | `auth`, `user`, `audit`, `notification` | The reusable starter, together with `src/config`, `constants`, `middlewares`, `routes`, `utils`, `scripts`, `types` and `server.ts` |
| **Product** | `referral`, `dashboard` | One client's business features, kept as a worked example |

**Core does not depend on product code.** The only references are in `src/routes/index.ts`: two
imports (`:5-6`) and two `register(router)` calls (`:18-19`). Auth reaches referral only through
two hooks that the referral module sets on itself — a signup hook and a role-approved hook
(`referral/index.ts:10-11`, `auth/signupHooks.ts:28-40`). How they behave:
[auth/README.md — Hooks](auth/README.md#where-the-code-lives).

**To drop the product modules:**

1. Delete `src/modules/referral/` and `src/modules/dashboard/`.
2. Delete those four lines in `src/routes/index.ts`.
3. Delete the `@referral/*` and `@dashboard/*` aliases in `tsconfig.json:33-34`.
4. Run `npm run type-check` and `npm run lint:fix`.

What changes: the referral-code routes disappear, and a `referralCode` sent to `/register` or
`/request-role` is accepted and ignored, and approving a role runs nothing extra, because no hook
is set (`auth/signupHooks.ts:36,38-40`). The
`BUSINESS_ASSOCIATE` role seed description still says "Referral partner" (`user/seed/roles.ts:43`).

---

## Documented

| Module | What it owns | Pages |
|---|---|---|
| [auth/](auth/README.md) | sessions, login providers, password policy, lockout, CSRF, OTP flows | [README](auth/README.md) · [flows](auth/flows.md) · [security](auth/security.md) · [authorization](auth/authorization.md) *(target design)* · [data-model](auth/data-model.md) *(target design + cookies as built)* · [legacy-migration](auth/legacy-migration.md) *(historical)* |

`auth/` is the worked example. Copy its shape when documenting a new module: a `README.md` that
states what the module owns and what it deliberately does not, plus a page per concern once the
README stops being scannable (roughly past 400 lines).

---

## Not documented yet

Mounts and exports are read out of each module's `index.ts`. Every mount is under `/api/v1`
(`server.ts:102`).

| Module | Kind | Mounts | Exports | Note |
|---|---|---|---|---|
| `auth` | core | `/{admin,vendor,associate,customer}/auth` (`auth/index.ts:36-41`) | `register`, `registerUser`, `hashPassword`, `assertPasswordAllowed`, `revokeUserSessions`, `syncSessionUser`, `syncSessionRoles`, `authenticate`, `authorizeRoles`, `verifyCsrf`, `setSignupHook`, `setRoleApprovedHook`, `runRoleApprovedHook`, types `SignupHook`, `RoleApprovedHook` (`auth/index.ts:43-58`) | Documented — see above |
| `user` | core | `/admin/{customers,vendors,associates,roles,role-requests}`, `/{customer,vendor,associate}/profile` (`user/index.ts:12-21`) | `register` (`user/index.ts:23`) | The largest undocumented module. Other modules use its models directly. It calls back into `auth` for session revocation and sync, role sync, the role-approved hook, password hashing and policy (`user/controllers/admin/managedUser.ts:3`, `user/controllers/shared/profile.ts:2`, `user/controllers/admin/role.ts:5`, `user/controllers/admin/roleRequest.ts:3`). Role requests, admin only (`user/routes/admin/roleRequest.ts:10-14`): `GET /admin/role-requests` lists them, `PENDING` by default, filterable by `status` and `roleCode` (`user/validators/index.ts:88-93`); `PATCH /:id/approve` and `PATCH /:id/reject` (optional `reason`, ≤500 chars, `validators/index.ts:97-99`) act only on a `PENDING` request — otherwise `404 ROLE_REQUEST_NOT_FOUND` or `400 ROLE_REQUEST_NOT_PENDING` (`roleRequest.ts:10-17`). Each decision is audited as `ROLE_REQUEST_APPROVED` / `ROLE_REQUEST_REJECTED` (`audit/models/AuditLog/types.ts:21-22`); approval also runs the role-approved hook and syncs the user's live sessions (`roleRequest.ts:71-72`) |
| `audit` | core | *(no routes)* | `record`, `AUDIT_ACTION`, `AUDIT_OUTCOME`, types `AuditAction`, `AuditOutcome`, `AuditEntry` (`audit/index.ts:1-3`) | Append-only MongoDB audit log. `record()` catches its own errors, so a logging failure cannot break a request (`audit/services/audit.service.ts:6-17`) |
| `notification` | core | *(no routes)* | `sendEmail`, `templates`, `layout`, type `EmailResult` (`notification/index.ts:1-2`) | Email templates and the SMTP transport. Branding comes from `APP_NAME` / `APP_LOGO_URL` (`env.ts:172-173`) |
| `referral` | product | `GET` and `POST /associate/referrals/onboard`, both validated by zod (`referral/routes/associate/referral.ts:12-13`, schemas in `referral/validators/index.ts:11-27`); `GET /associate/auth/referral-code` and `GET /vendor/auth/referral-code` (`referral/index.ts:13-17`) | `register` | Sets the auth signup and role-approved hooks when imported (`referral/index.ts:10-11`). A referral is recorded `PENDING` at signup and turned `ACTIVE` when the role is approved, by any path; an approved BUSINESS_ASSOCIATE or VENDOR without a referral code gets one then (`referral/signupHook.ts:21-52`) |
| `dashboard` | product | `/associate/dashboard`, one route: `GET /stats` (`dashboard/index.ts:5`, `dashboard/routes/associate/dashboard.ts:10`) | `register` | Read-only: counts the signed-in associate's referrals as pending, active and total (`dashboard/controllers/associate/index.ts:9-37`) |

Controllers in `referral`, `dashboard` and several core controllers call Mongoose models
directly. `models/<X>/repo.ts` for every entity is the **target design — not built**.

**Document a module when someone has to change it and cannot work out why it is shaped that way.**
Not before — a page written ahead of the code is a page that will be wrong by the time it is read,
and this repo has already paid that cost once.
