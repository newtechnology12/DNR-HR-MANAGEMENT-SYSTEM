# DNR HR Management System — Full System Audit

**Date:** 2026-07-17
**Scope:** Frontend (React + TypeScript + Vite), Backend (PocketBase), Data flow between them
**Purpose:** Working reference for fixing bugs and prioritizing improvements

---

## 1. System Overview

| Layer | Technology | Notes |
|---|---|---|
| Frontend | React 18 + TypeScript + Vite, React Router v6, React Query v3, react-hook-form + zod | ~54,000 lines in `src/`, ~70 dashboard pages |
| Backend | PocketBase (Go BaaS) | JS hooks in `pocketbase/pb_hooks/`, SQLite-backed |
| Auth | PocketBase built-in auth (`users` collection) | Client-side role/permission gating only |
| Hosting (implied) | Frontend on Vercel, backend previously on Railway | Not consistently wired (see §3) |

### 1.1 Data flow, as it exists today

```mermaid
sequenceDiagram
    participant U as User (browser)
    participant R as React app
    participant PB as PocketBase SDK
    participant API as PocketBase server

    U->>R: Loads app
    R->>R: getApiUrl() builds base URL from window.location.hostname + ":8090"
    R->>PB: new PocketBase(baseUrl)
    R->>API: authRefresh() on mount (auth.context.tsx)
    API-->>R: user record + expanded role/department/designation
    R->>R: AuthContext stores user; RolesContext fetches full "roles" list
    U->>R: Navigates to a route
    R->>R: ProtectedRoute checks user.role.permitions client-side only
    R->>API: Any collection.create/update/delete/getList call
    API-->>R: PocketBase applies its own collection API rules (NOT in this repo)
```

**Key structural fact:** authorization is decided **twice**, in two different places, and only one of them is visible in source control:

1. **Client-side** — `ProtectedRoute.tsx` + `roles.context.tsx` + the hardcoded `basePermissions` list in `CreateOrUpdaterRole.tsx`. This only controls what's rendered in the browser.
2. **Server-side** — PocketBase's per-collection `listRule`/`createRule`/`updateRule`/`deleteRule` strings. These are the *actual* security boundary, and they live only in the running PocketBase instance's database — **there is no schema/rules export anywhere in this repo**, so they cannot be reviewed, versioned, or reproduced from source. See §2.1.

---

## 2. Critical Issues (P0 — fix immediately)

### 2.0 CONFIRMED: the entire permission system is structurally broken at the schema level

While testing the Dashboard redesign against a locally-run copy of `pocketbase/pb_data`, I traced why a freshly-seeded user could not pass **any** `ProtectedRoute` check, including a full-access "Admin" role. Two compounding schema bugs, found by direct inspection of the live collection schema via the PocketBase Admin API:

1. **The `roles` collection has no `permitions` field in its schema at all.** `basePermissions` (`CreateOrUpdaterRole.tsx`), `roles.context.tsx`, `ProtectedRoute.tsx`, and every seed script all assume `roles` records carry a `permitions: [{name, title, access}]` JSON field — but the live collection schema in this `pb_data` only has `name`, `description`, `created_by`. Any seed script trying to write a `permitions` value onto a role record has it silently dropped by PocketBase (unknown fields are ignored on write), so **no role in this database has ever actually stored permission data**, regardless of what seed.js/seed data looks like.
2. **The `users` collection's `role` field is a plain text field, not a relation.** The frontend (`auth.service.ts`, `auth.context.tsx`) calls `authRefresh({ expand: "department,role,designation" })` and reads `user.record?.expand?.role` expecting PocketBase to resolve the role ID into the full role record. `expand` only works on relation-type fields — since `role` is `type: "text"`, PocketBase can never expand it, so `expand.role` is `undefined` for every user, always. Even if bug #1 were fixed, this alone means `user.role` is never populated after login, `user.role.permitions` is always `undefined`, and every `ProtectedRoute` entity check fails for every user.
3. **Additionally, the `roles` collection's `listRule`/`viewRule`/`createRule`/`updateRule`/`deleteRule` were all `null`** (admin/superuser-only) — so even a correctly-typed relation would 403 for a normal logged-in user calling `roles.context.tsx`'s `getFullList()`.

**Net effect:** on this local database, the permission system doesn't fail closed for certain roles or certain pages — it fails closed for *every* page, for *every* user, all the time. The only reason the team may not have noticed this in a shared/hosted PocketBase instance is if that instance's schema was manually patched through the Admin UI at some point and never re-exported (consistent with §2.3 — there is no committed schema, so this kind of drift between environments is invisible and undetectable from source).

**What I did, scoped to this local `pb_data` only, with explicit approval before each backend change:**
- Set `roles.listRule` / `roles.viewRule` to `@request.auth.id != ""` (any authenticated user can read role definitions; write rules are untouched/still admin-only).
- Added the missing `permitions` JSON field to the `roles` collection schema.
- Populated the seeded "Admin" role's `permitions` with `access: true` for every permission name defined in `CreateOrUpdaterRole.tsx`'s `basePermissions`.
- Did **not** convert `users.role` from text to a relation field — that's a real schema migration (not just a rule/data tweak) and needs a decision from whoever owns this database, since it may have knock-on effects on any other code/report that reads `role` as a raw string today.

**Action required from you:**
1. Decide whether to convert `users.role` to a proper `relation` field targeting `roles` (this is very likely the correct long-term fix, since the entire frontend already assumes this shape).
2. Check whether your actual shared/production PocketBase instance has the same three problems, or whether it was hand-patched at some point and just never had that state exported to a migration (§2.3 makes this unverifiable from source — check directly in the Admin UI).
3. Once schema is fixed, re-populate `permitions` on all seven seeded roles (Admin was done for local testing; HR Manager, Department Head, Employee, Driver, Accountant, IT Support were not).

### 2.1 Server-side authorization cannot be verified — likely relying entirely on client-side checks
- `pocketbase/pb_hooks/main.pb.js` is 25 lines total: one test route and one cron job. **Zero** `onRecordBeforeCreateRequest` / `onRecordBeforeUpdateRequest` / `onRecordBeforeDeleteRequest` hooks exist.
- No `pb_data`, schema export, or `listRule`/`createRule`/etc. definitions exist anywhere in the repo.
- **Action:** Log into the live PocketBase Admin UI for every collection (especially `users`, `roles`, `attendance`, payroll/petty-cash/payslip collections) and confirm the API rules are NOT empty strings (empty = public in some PocketBase configurations) or superuser-only where appropriate. Then **export the schema** (`pocketbase/pb_migrations`) and commit it — see §2.3. Until verified, assume any authenticated (or possibly anonymous) user can read/write sensitive HR data directly via the API, bypassing every `ProtectedRoute` check in the frontend entirely.

### 2.2 `getApiUrl()` builds a malformed URL — breaks all API calls in some environments
`src/utils/getApiUrl.ts:5`
```ts
const apiUrl = `${protocol}//${hostname} :${port}`;   // <-- stray space before ":"
```
This produces a string like `"http://localhost :8090"`. Confirmed: `new URL(path, "http://localhost :8090")` throws `Invalid URL` — and PocketBase's SDK constructs request URLs this way internally. **Fix:** remove the space.

But fixing the space alone is not enough — the deeper design bug:
- `getApiUrl()` always derives the backend host from `window.location.hostname` and hardcodes port `8090`.
- On a Vercel-hosted frontend, `window.location.hostname` is the Vercel domain — there is no PocketBase reachable at `https://<vercel-domain>:8090` (Vercel doesn't expose arbitrary ports), so the deployed frontend cannot reach a real backend unless the backend happens to be reverse-proxied on the same domain/port. There is no env var (`VITE_POCKETBASE_URL` or similar) anywhere to override this.
- Meanwhile `src/utils/getFileUrl.ts` and `src/pages/dashboard/PrePayments.tsx:244` **hardcode** `https://pocketbase-production-f0b0.up.railway.app` directly — a *third*, different way of finding the backend, inconsistent with `getApiUrl()`.

**Net effect:** there are three different, inconsistent strategies for locating the PocketBase backend in the same codebase (`getApiUrl()` host-derived, hardcoded Railway URL in two files, and a stale commented-out Railway URL in `src/lib/pocketbase.ts:1-7`). This is very likely the root cause of "works locally, breaks in prod" (or vice versa) symptoms.

**Recommended fix:** introduce a single `VITE_POCKETBASE_URL` env var, read it in `src/lib/pocketbase.ts` and `src/utils/getFileUrl.ts`, delete `getApiUrl.ts`'s host-guessing logic, and delete the hardcoded URL in `PrePayments.tsx`.

### 2.3 PocketBase migrations are entirely gitignored — schema has no version control
`.gitignore:18` → `pocketbase/pb_migrations`

This means:
- `pocketbase/pb_migrations/1721000000_seed_data.js` (which exists on disk and is referenced in `SEEDING_GUIDE.md`) can **never actually be committed**.
- No teammate or fresh deploy can reproduce the database schema from git history — the schema only exists as whatever is currently inside the live PocketBase SQLite file.
- This compounds §2.1: even the seed/migration record of what collections and rules *should* exist is not tracked.

**Action:** remove `pocketbase/pb_migrations` from `.gitignore` and commit the existing migration file(s), plus export current collection schemas as a migration going forward (`pocketbase migrate collections` or via Admin UI export).

### 2.4 Hardcoded, exposed Google Maps API key, logged to console
`src/pages/dashboard/EmployeePortal.tsx:1711-1722`
```ts
const NEXT_PUBLIC_GOOGLE_MAPS_API_KEY="AIza…(redacted — rotate this key in Google Cloud)";
const apiKey = NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
console.log("Google Maps API Key:", apiKey);            // logs the secret
...
const geocodingUrl = `https://maps.googleapis.com/maps/api/geocode/json?...&key=${apiKey}...`;
```
This is a real-format, live-looking key committed to source and shipped in the client bundle, plus printed to the browser console on every use.

**Action:**
1. Rotate this key in Google Cloud Console immediately (treat as compromised — it's in git history even if removed later).
2. Restrict the new key by HTTP referrer + API (Geocoding API only) in Google Cloud Console.
3. Move it to `import.meta.env.VITE_GOOGLE_MAPS_API_KEY`, mirroring the correct pattern already used in `src/lib/googleDrive.ts:4`.
4. Remove both `console.log` lines that print the key.

### 2.5 Hardcoded PocketBase superuser password in seed script
`seed.js:31-32`
```js
const ADMIN_EMAIL = process.env.PB_ADMIN_EMAIL || 'admin@dnr-hr.rw';
const ADMIN_PASSWORD = process.env.PB_ADMIN_PASSWORD || 'admin123456';
```
This is a **superuser/admin** credential default (distinct from the documented `password123` demo-employee password in `SEEDING_GUIDE.md`). If this script has ever been run against a real/production PocketBase instance without overriding the env vars, that instance has a superuser account with a guessable password.

**Action:** Confirm no production instance has an `admin@dnr-hr.rw` / `admin123456` superuser account. Remove the hardcoded fallback; require the env var to be set (fail loudly if missing) rather than defaulting silently.

---

## 3. High Priority Issues (P1)

### 3.1 Broken account features: password change & profile update are dead code
`src/services/auth.service.ts:57-71`
```ts
async updateProfile(profile: any) {
  console.log(profile);
  // const { data, error } = await supabase.auth.updateUser({ ...profile });
  ...
}
async changePassword({ newPassword }) {
  console.log(newPassword);   // logs a user's plaintext new password to console
  // const { data, error } = await supabase.auth.updateUser({ password: newPassword });
  ...
}
```
Leftover from an incomplete Supabase → PocketBase migration. **Both features currently do nothing** — whatever UI calls these (Account Settings) silently no-ops. If a user tries to change their password today, nothing happens and their new password is printed to the console.

**Action:** Reimplement using `pocketbase.collection("users").update(userId, {...})` for profile, and PocketBase's password-change flow (requires old password: `update(id, { oldPassword, password, passwordConfirm })`) for password change. Remove the console.log.

### 3.2 PocketBase filter strings built from raw, unsanitized user input (filter-injection risk)
At least 10 files build `filter` query strings via template literals with live keystroke input, e.g.:
- `src/components/modals/BranchesFormModal.tsx:95` — `` filter: `name~"${search}"` ``
- Same pattern in `DesignationFormModal.tsx:87`, `ActionPlansModal.tsx:87,97`, `DepartmentFormModal.tsx:82`, `LeaveFormModal.tsx:160`, `LeavePlaneFormModel.tsx:152`, `MessageFormModal.tsx:85`, `ReportFormModal.tsx:99`, `TaskFormModal.tsx:96`, `EmployeeReportModel.tsx:109`
- `src/components/FilterModateFaceted.tsx:75,80` — joins raw fragments: `` `role = "waiter"&&${searchQ}` ``

If `search` contains a literal `"` or PocketBase filter operators (`||`, `&&`), a user can break out of the intended clause and widen the query. Severity is capped by whatever each collection's `listRule` allows (unknown — see §2.1), which makes this doubly important once rules are audited.

**Action:** escape embedded quotes before interpolating, or use PocketBase SDK's filter-building helper (`pocketbase.filter(expr, params)`) which parameterizes values safely.

### 3.3 Routing bugs in `src/routes.tsx`
- **Duplicate path, dead route:** `"attendance"` is defined twice as a child of the settings route — line ~432 (`<AttendaceSettings />`) and line ~440 (`<PayrollSettings />`). Only the first match renders; the second is unreachable (and `PayrollSettings` is already correctly reachable via its own `payroll` path).
- **Stray comma rendered as literal text:** line ~312, inside `ProtectedRoute` children:
  ```tsx
  <AccountTransactions />,
  ```
  The trailing comma is JSX text content, so a literal `,` renders on the petty-cash account-transactions page.
- **Unprotected routes** (no `<ProtectedRoute>` wrapper at all — reachable by any authenticated user regardless of role): `leave-plan-2` (~line 124), `weeklyplane` (~141), `clients` (~146), `account-settings` (~467). Confirmed by direct read — `account-settings` in particular exposes account/profile settings with zero permission check.
- **Permission reuse across unrelated features:** the `carmanagement` route (~line 325) is gated with `entity="view_petty_cash_requests"` — the same permission that governs the Petty Cash Requests page. Anyone granted petty-cash visibility automatically gets Car Management access, and vice versa. Likely unintended; should have its own `view_car_management`-style entity.
- **Confusing duplicate import:** two import names (`CountInventorySession` and `ExcelStyleLeavePlan`) both point at the same file `./pages/dashboard/CountInventorySession`, and three separate routes (`dashboard/leave-plan`, `hr/leave-plan`, and the unprotected `leave-plan-2`) all render this one component.

**Action:** de-duplicate the `attendance` path, remove the stray comma, add `ProtectedRoute` wrappers with distinct entity permissions to the four unprotected routes, split the `carmanagement` permission from `view_petty_cash_requests`, and clean up the duplicate import/route aliasing.

### 3.4 Inconsistent data-fetching strategy causes stale-UI risk
React Query is the dominant, correct pattern (73 files), but several pages **mix** `useQuery` with manual `useEffect` + direct `pocketbase.collection(...)` calls **in the same file**, meaning some data is cache-invalidated by React Query and some isn't kept in sync after mutations:
- `src/pages/dashboard/EmployeePortal.tsx` — a single ~2,188-line "god component" covering many unrelated tabs/features; hardest file in the codebase to safely modify.
- `src/pages/dashboard/PrePayments.tsx` (manual fetch ~line 384, `useQuery` ~line 419)
- `src/pages/dashboard/RequestCash.tsx` (manual fetch ~line 29, `useQuery` ~line 339)
- `NewPayroll.tsx`, `PerfomanceForm.tsx`, `CreateOrUpdaterRole.tsx`

**Action:** as each of these pages is touched, migrate the manual fetch to `useQuery`/`useMutation` with proper `queryClient.invalidateQueries(...)` on mutation success. Longer-term, `EmployeePortal.tsx` should be split into per-tab components/routes.

### 3.5 Inconsistent error handling — many failures are silently swallowed
Pattern found repeatedly: `catch (error) { console.log(error); }` with **no user-facing feedback**:
- `src/components/PosCart.tsx:148-150, 171-173`
- `src/pages/dashboard/projects/TenderDetails.tsx:51-53`
- `src/pages/dashboard/projects/ProjcetDetails.tsx:69-71`

By contrast, 32 of 38 modal files under `src/components/modals` correctly wire `onError` to `toast.error(...)`. The codebase clearly knows the right pattern — it's just not applied to older/rawer page components.

**Action:** standardize on toast-on-error for every mutation; treat `PosCart`, `projects/*`, and similarly-aged files as a cleanup pass.

---

## 4. Medium Priority Issues (P2)

### 4.1 Duplicate/orphaned page files (dead code, double-maintenance risk)
| File | Status |
|---|---|
| `src/pages/dashboard/ActionPlans .tsx` (trailing space in filename) | Near-duplicate of `ActionPlansparUser.tsx` (3 lines differ); not imported anywhere — orphaned |
| `src/pages/dashboard/Report.tsx` & `Report copy.tsx` | Both define an identical `Reports()` component; neither is imported anywhere |
| `src/pages/dashboard/Reports.tsx` | Duplicates `EmployeeReportModel.tsx` (which is the one actually used) |
| `CountInventorySession.tsx:45-56, 119-150` | Large blocks of working logic commented out, duplicating live code at `:342-353/:416-448` |

Unconfirmed-but-suspect (no incoming references found; verify before deleting): `Cashmanagement.tsx`, `DepartmentNav.tsx`, `EmployeeDeductions.tsx`, `EmployeeLeavesPlane.tsx`, `EnhancedWeeklyPlans.tsx`, `HRDashboard.tsx`, `LeaveCalendar.tsx`, `PettyCashAccount.tsx`, `PettyCashGroupTable.tsx`, `PettyCashTransactionTable.tsx`, `Project.tsx`.

**Action:** confirm each is truly unreferenced (`grep` the component name across `src/`), then delete. This shrinks the surface area for the next audit/refactor significantly.

### 4.2 `pocketbase/pb_hooks/seed.js` is dead code
Defines and exports `seedData()` but nothing ever calls it — not wired into `main.pb.js`, no invocation anywhere in the repo. Combined with root `seed.js` and the gitignored migration seed (§2.3), there are **three** ~500-600 line, near-verbatim copies of the same seed dataset to maintain by hand, and only one is even reachable.

**Action:** pick one seeding strategy (the standalone `seed.js` script is documented as "Recommended" in `SEEDING_GUIDE.md` and is the most portable) and delete the other two, or clearly document why all three exist if there's a reason not evident from code.

### 4.3 Console logging left in production code paths
Roughly **152** `console.log`/`console.error`/`console.warn` calls across `src/`. Most are harmless debug noise, but notable ones:
- `src/components/DashboardSidebar.tsx:36,44` — logs on every permission check, i.e. on nearly every render.
- `src/pages/Login.tsx:55,63` — logs on every login attempt.
- `src/services/auth.service.ts:65` — logs a user's plaintext new password (see §3.1).
- `EmployeePortal.tsx:1713,1722` — logs the exposed Maps API key and full request URL (see §2.4).

**Action:** strip debug `console.log`s from hot paths (render-time, auth, anything touching credentials) as a quick low-risk cleanup pass; consider an ESLint rule (`no-console`, warn-level) to prevent regression.

### 4.4 Granularity gap in settings permissions
`Settings.tsx` gates the entire settings section (payroll, attendance, SMTP, branches, leaves, roles) behind one coarse `access_general_settings` permission on the parent route, while the Roles UI (`CreateOrUpdaterRole.tsx`) presents these as if they were separately toggleable. The UI implies granular control that isn't actually enforced by routing.

**Action:** either add per-sub-page `ProtectedRoute` entities matching the granularity shown in the Roles UI, or simplify the Roles UI to match the coarser reality.

### 4.5 Type safety erosion concentrated in the riskiest code
`any` typing is heaviest exactly where correctness matters most:
- `src/components/` (modals/datatable/forms): ~179 occurrences
- `src/pages/dashboard/`: ~106 occurrences
- `src/context/`: ~16
- `src/utils/`, `src/hooks/`, `src/services/`: nearly clean (11, 1, 1)

Examples: `ProtectedRoute({ entity, children }: any)`, most modal props typed `: any`, PocketBase records consumed untyped throughout pages. This means the compiler catches almost nothing in forms/modals/pages — exactly the surface most frequently edited.

**Action:** no big-bang rewrite needed. Start by typing the shared primitives that everything else depends on: `ProtectedRoute`'s props, the `User` interface in `auth.context.tsx` (currently every field is `any`), and a shared `Role`/`Permission` type used by both `roles.context.tsx` and `CreateOrUpdaterRole.tsx`'s `basePermissions`. These few types would immediately catch the `entity` typo class of bug described in §4.6.

### 4.6 Dead/typo'd permission reference
`src/components/DashboardSidebar.tsx:37` checks `entity === "view_fileManager"`, but the File Manager route is commented out in `routes.tsx:38` and no such permission exists in `basePermissions` (`CreateOrUpdaterRole.tsx`). Dead branch — harmless today, but exactly the class of bug that better typing (§4.5) would catch at compile time instead of requiring a manual grep to find.

---

## 5. Low Priority / Cleanup (P3)

### 5.1 Dependency hygiene (`package.json`)
| Issue | Detail |
|---|---|
| Four date libraries | `date-fns`, `date-fns-tz`, `dayjs`, `moment` all present — `moment` is in upstream maintenance mode. Pick one (recommend keeping `date-fns`/`date-fns-tz`, migrating off `moment`/`dayjs`). |
| Backend-oriented packages in a frontend app | `googleapis` (^144.0.0, large Node-oriented client) and `@supabase/supabase-js` (fully dead post-migration) |
| Junk/accidental dependencies | `"add": "^2.0.6"` and `"npx": "^10.2.2"` listed as runtime deps — almost certainly accidental `npm install` typos, not real dependencies |
| Misplaced dev tool | `shadcn-ui` (^0.7.0) is a CLI scaffolder, listed as a runtime dependency; components are already vendored into `src/components/ui` |
| Redundant | `lodash` + `lodash.debounce` both present; `lodash` already ships debounce |
| Outdated major versions | `react-query` v3 (current major is v5, v3 is unsupported); `pocketbase` SDK pinned to `^0.20.1` — verify compatibility with the deployed PocketBase server binary version |

**Action:** a dedicated dependency-cleanup PR: remove `add`, `npx`, `@supabase/supabase-js`, `googleapis` (unless actually used server-side somewhere not found in this audit), move `shadcn-ui` out of `dependencies`, and plan a `moment`/`dayjs` → `date-fns` consolidation.

### 5.2 Stale artifacts in repo
- `src/lib/pocketbase.ts:1-7` — commented-out reference to a defunct Railway PocketBase URL, left next to the current (buggy) `getApiUrl()` call. Remove once §2.2 is fixed.
- `vite-dev.err.log` and `vite-dev.out.log` at repo root — check whether these are tracked in git (`*.log` is gitignored, so they likely aren't, but confirm with `git ls-files | grep .log` and `git rm --cached` if they are).
- Two throwaway files at repo root from recent seeding work: `seed.js`, `SEEDING_GUIDE.md`, and `pocketbase/pb_hooks/seed.js` are currently **untracked** (`git status` shows `??`). Decide whether to commit them (recommended — this is useful onboarding tooling) or discard.

### 5.3 Minor code typos (harmless but indicate low review rigor)
- `src/services/auth.service.ts:86` — `await await pocketbase.authStore.clear();` (double `await`, no functional impact but a clear copy-paste artifact).

### 5.4 XSS surface worth a second look
`dangerouslySetInnerHTML` is used in exactly two places:
- `src/pages/dashboard/projects/TenderDetails.tsx:484`
- `src/pages/dashboard/projects/ProjcetDetails.tsx:548`

Only a concern if the rendered content (tender/project descriptions) can ever be authored by a lower-trust role rather than admin-only input. Confirm the authorship path for this field; sanitize (e.g. `DOMPurify`, already a transitive dependency per `dist/assets/purify.es-*.js`) if untrusted input can reach it.

---

## 6. Prioritized Fix Roadmap

Suggested order of work, grouped so each phase is independently shippable. **Updated after hands-on testing (§2.0): the `users.role` schema fix is now the single highest-priority item — nothing permission-gated works correctly until it's done.**

**Phase 0 — The permission system itself (blocks everything else)**
0. Convert `users.role` from a `text` field to a `relation` field targeting `roles`; confirm `expand: "role"` then actually resolves; re-populate `permitions` on all seven roles, not just Admin (§2.0)

**Phase 1 — Stop the bleeding (security & breakage)**
1. Rotate the exposed Google Maps API key; restrict it; move to env var (§2.4)
2. ~~Fix the stray-space bug in `getApiUrl.ts`~~ — done independently via a simpler relative-URL + Vite proxy approach (§8); still confirm the equivalent proxy exists in production hosting, not just dev (§2.2)
3. Verify PocketBase collection API rules directly in the Admin UI; lock down anything unexpectedly public — partially done for `roles` (read-only, locally) in §2.0, the rest of the collections are still unverified (§2.1)
4. Un-gitignore `pocketbase/pb_migrations`, commit schema/migrations — increasingly urgent now that §2.0 shows schema can silently drift from what the app needs (§2.3)
5. Remove the hardcoded admin superuser password fallback in `seed.js`; rotate if it was ever used against a real deploy (§2.5)

**Phase 2 — Restore broken functionality**
6. Reimplement `updateProfile`/`changePassword` against PocketBase (§3.1)
7. Fix the four unprotected routes, the duplicate `attendance` path, the stray comma, and the `carmanagement`/`view_petty_cash_requests` permission mixup in `routes.tsx` (§3.3)

**Phase 3 — Harden data access**
8. Escape/parameterize the ~10 raw PocketBase filter-string interpolations (§3.2)
9. Standardize error handling (toast on every mutation failure) across `PosCart`, `projects/*` (§3.5)

**Phase 4 — Cleanup (safe to batch, low risk)**
10. Delete confirmed-orphaned files (§4.1), pick one seed script and delete the other two (§4.2)
11. Strip stray `console.log`s, add `no-console` lint rule (§4.3)
12. Dependency cleanup PR (§5.1)
13. Type the shared primitives: `User`, `ProtectedRoute` props, `Role`/`Permission` (§4.5)

**Phase 5 — Structural improvement (larger effort, schedule separately)**
14. Split `EmployeePortal.tsx` (~2,188 lines) into per-feature components/routes; migrate its manual fetches to React Query (§3.4)
15. Decide on and enforce settings-permission granularity to match the Roles UI (§4.4)

---

## 8. Frontend Redesign — Phase 1 (completed this session)

Following a request to redesign the frontend toward an enterprise design system, scoped down from "redesign all 70 pages" to a foundation-first, one-pilot-page approach:

**Dead code removed** (confirmed zero live references before deletion — see §4.1's related finding): `PosCart.tsx`, `PosMenu.tsx`, `Orders.tsx`, `RecentOrders.tsx`, `KitchenModalPrint.tsx`, `MenuDetails.tsx`, `NewOrderModal.tsx`, `EditOrderModal.tsx`, `UpdateOrderItemModal.tsx`, `shared/KitchenSidebar.tsx`, `shared/MenuItems.tsx`, `shared/OrderCard.tsx`, `shared/OrderSound.tsx` (+ its two `.mp3` assets), `skeleton/OrderCardSkeleton.tsx`, `ui/DragAndDropOrders.tsx`. These were leftovers from this codebase's origin as "saga_bay," a bar/restaurant POS product (see `package.json` name), never wired into `routes.tsx`.

**Design tokens** (`tailwind.config.js`, `src/index.css`):
- Colors: `primary` #16A34A (was navy #242364), `primaryDark` #15803D, plus new `info` #2563EB, `success` #22C55E, `warning` #F59E0B, `danger` #EF4444 — each with a `.foreground` pair.
- Radius scale: `btn`/`input` 10px, `card` 14px, `modal` 16px.
- Shadows: `card`, `card-hover`, `modal`.
- Font swapped from self-hosted Outfit to `@fontsource-variable/inter` (self-hosted, no external network call).

**Core primitives restyled** to the new tokens, with new semantic variants added (`info`/`success`/`warning`/`danger`) so future pages have a consistent vocabulary instead of ad-hoc colors: `button.tsx`, `card.tsx`, `input.tsx`, `badge.tsx`, `alert.tsx`, `dialog.tsx` (also added backdrop blur, per the brief).

**New reusable component:** `src/components/StatCard.tsx` — a color-coded stat card (icon chip + tone + loading skeleton), extracted because nearly every dashboard page repeats this exact pattern by hand.

**Pilot page redesigned:** `src/pages/dashboard/Dashboard.tsx` —
- Replaced a fragile `grid-cols-9` layout (zero responsive breakpoints, would visibly break on tablet/mobile) with a responsive `1 → 2 → 3` column grid.
- Replaced six hand-duplicated stat card blocks with `StatCard`, added color-by-meaning (green=present, red=absent, amber=leave-related, blue=departments).
- Fixed a real bug in `AttendanceView`: duplicate/dead conditional branches meant the "loading" state and a stale attendance legend could render simultaneously after a refetch (`keepPreviousData`); consolidated into a clean loading/success/empty state machine using the shared `Skeleton` component instead of a hand-rolled pulsing-donut hack.
- Removed leftover `console.log`s (including one that logged internal attendance counts on every load) and a debug-only, invalid CSS class (`bg-slate-300-`, trailing-dash typo, a no-op).
- Fixed the mislabeled "Total program" card (was showing department count) to "Departments," and the "Toady Attendance" typo.
- Header/date-picker made to wrap and shrink on narrow viewports instead of forcing overflow.

**Verification:** ran the actual app end-to-end (PocketBase + Vite dev servers, logged in as the seeded admin user, Playwright screenshots at desktop and mobile viewports) rather than relying on typecheck alone. This is what surfaced §2.0/§2.2's backend bugs — the redesigned page itself typechecks cleanly and the design tokens render correctly (confirmed via the new green button/Inter font showing on the login/access-denied screens), but full end-to-end screenshot confirmation of the Dashboard's own content is blocked pending the `users.role` relation-type fix in §2.0.

**Explicitly not done, pending your review of this pilot:** the other ~69 dashboard pages, `EmployeePortal.tsx` in particular (§3.4), and the `users.role` schema conversion (§2.0) — each is a separate decision.

**Note on `getApiUrl.ts`:** while this session was in progress, this file was independently edited (by you, concurrently) from the buggy `` `${hostname} :${port}` `` to a simpler `return "/";`, paired with a new `/api` proxy added to `vite.config.ts`. That's a cleaner fix than the one originally proposed in §2.2 — it resolves the stray-space bug and sidesteps the Vercel-port problem, provided your production hosting also proxies `/api` to PocketBase (Vercel: via `vercel.json` rewrites, not yet present — see §2.2's remaining production concern).

## 7. How this document was produced

This audit was compiled by directly reading the core auth/data-flow files (`src/context/auth.context.tsx`, `src/services/auth.service.ts`, `src/lib/pocketbase.ts`, `src/utils/getApiUrl.ts`, `pocketbase/pb_hooks/main.pb.js`, `src/routes.tsx`) and cross-checked with two independent codebase sweeps (frontend pages/components, and backend/config/security), with the highest-impact claims (the `getApiUrl` bug, the gitignored migrations, the duplicate routes, the seed admin password) independently re-verified against the actual files before being included here. File:line references are accurate as of the commit at audit time — re-check line numbers if the file has since changed.
