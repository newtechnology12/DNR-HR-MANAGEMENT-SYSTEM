# RALGA IMS — Integrated Management System

Integrated finance, procurement, HR and asset management for **RALGA** (Rwanda Association of Local
Government Authorities): budgets and budget control, procurement and purchase orders, supplier invoices
and payment vouchers, bank and cash, payroll, fixed assets, general ledger, financial statements and
role dashboards — with a configurable approval engine, segregation of duties and a read-only audit trail.

Built by DNR Partners.

## Build status

| Step | Scope | Status |
|---|---|---|
| 1 | Foundation: 13 roles, permission matrix (two-person confirmation), users & security (2FA, lockout, password policy, session timeout), audit log, approval engine (limits, delegations, overdue escalation), master data (fiscal years, chart of accounts, funding sources, projects, cost centres, tax rates) | **Done** |
| 2 | Budgeting & budget control (M2): budgets by line with monthly phasing and Excel import, revisions (supplementary, reduction, virement, re-phasing), hard-stop control with DAF override, commitments from POs, actuals from invoices, utilisation dashboard, budget vs actual, commitments and overrides reports | **Done** |
| 3 | Procurement, suppliers, PO, GRN (M3) | Existing module — requisitions and POs now charged to budget lines; supplier bank-detail re-approval and plan ↔ budget links next |
| 4 | Supplier invoices & payment vouchers (M4) | Planned |
| 5 | Bank & cash, reconciliation (M5) | Planned |
| 6 | Payroll (M6) | Existing module — GL posting and funding split to add |
| 7 | Fixed assets & depreciation (M7) | Planned |
| 8 | General ledger, period close (M8) | Planned |
| 9 | Reports, financial statements, role dashboards (M9) | Planned |
| 10 | Data migration, tests, documentation | Planned |

## Architecture

| Layer | Technology |
|---|---|
| Frontend | React 18 + TypeScript, Vite, Tailwind CSS, react-query |
| Backend | PocketBase 0.21 (Go, SQLite) — REST API, auth, files, backups |
| Business rules | JavaScript hooks in `pocketbase/pb_hooks/` (rules in `pb_hooks/lib/*.js`) |
| Schema | Migrations in `pocketbase/pb_migrations/` (applied automatically on start) |

Every permission is enforced **on the server** (hooks and collection rules). The screens only hide what
a role cannot use; calling the API directly cannot bypass a role, an approval or a budget check.

Key files:

- `src/lib/permission-catalog.json` — every permission, grouped by module
- `src/lib/ims-roles.json` — the 13 roles and one demo login per role
- `scripts/ims/roles.mjs` — the seeded permission matrix (permission → roles), checked for segregation of duties
- `pocketbase/pb_hooks/lib/approvals.js` — approval engine; `lib/security.js` — sign-in security;
  `lib/rolechanges.js` — permission changes (maker–checker); `lib/masterdata.js` — fiscal years, chart of accounts, tax rates

## Quick start (development)

Requirements: Node.js 18+, Windows / Linux / macOS.

```bash
npm install --legacy-peer-deps

# 1. Backend (port 8090). First start applies all migrations.
cd pocketbase && ./pocketbase serve --http=127.0.0.1:8090      # Windows: pocketbase.exe serve …
#    Create the superuser at http://127.0.0.1:8090/_/ the first time.

# 2. Demo data (local PocketBase only) — roles, permission matrix, organisation, demo users and transactions
npm run seed:ralga

# 3. Frontend (http://localhost:5173, proxies /api to the backend)
npm run dev:frontend

# 4. API tests (must stay green: 152 checks)
npm run test:api
```

## Demo logins

One account per role. Password for all: **`password123`** (development / demo only — the login page shows
one-click role cards when `VITE_DEMO_LOGINS=true` or in development).

| Role | E-mail | Person |
|---|---|---|
| System Administrator | admin@dnr-hr.rw | Patrick Nshuti |
| Secretary General (SG) | director@dnr-hr.rw | Emmanuel Kayitare |
| Director of Finance (DAF) | finance@dnr-hr.rw | Claudine Mukeshimana |
| Accountant | accountant@dnr-hr.rw | Eric Habimana |
| Budget Officer | budget@dnr-hr.rw | Diane Ingabire |
| Cashier / Treasury Officer | cashier@dnr-hr.rw | Olivier Mugisha |
| Procurement Officer | procurement@dnr-hr.rw | Jean-Paul Nkusi |
| Head of Department | hod@dnr-hr.rw | Solange Umutoni |
| HR & Payroll Officer | hr@dnr-hr.rw | Grace Uwimana |
| Store & Asset Officer | stores@dnr-hr.rw | Innocent Mugabo |
| Staff / Requester | employee@dnr-hr.rw | Aline Mukamana |
| Internal Auditor | auditor@dnr-hr.rw | Fabrice Ndayisaba |
| Management Viewer | board@dnr-hr.rw | Vestine Uwase |

The RALGA organisation structure in the demo is **illustrative** (RALGA does not publish its internal
organigram). Confirm departments and designations with RALGA before go-live.

## Roles, permissions and segregation of duties

- One person may hold several roles (main role + extra roles). Department heads also hold *Head of
  Department*; most staff also hold *Staff / Requester*.
- **Permission matrix:** Administration → Permission matrix. An administrator proposes changes with a reason;
  a **second administrator or the DAF** must confirm before anything changes. Both steps are audited. Roles
  cannot be changed directly through the API.
- Segregation of duties, enforced by the server for every document:
  1. nobody approves a document they created or submitted;
  2. nobody decides the same document at two levels;
  3. the voucher preparer cannot execute the payment (only the Cashier executes payments; payment vouchers arrive in Step 4);
  4. the payroll preparer cannot approve it;
  5. the bank reconciliation preparer cannot approve it (Step 5);
  6. suppliers registered by Procurement are approved by Finance before use; bank-detail changes need re-approval;
  7. System Administrators, Internal Auditors and Management Viewers can never approve;
  8. delegations: an approver on leave hands approvals to a named person for a date range — shown on every approval.

## Approval engine

Administration of flows: Setup → Approval workflows and Setup → Approval limits.

- Workflows per document type with conditions on amount, department, category and **funding source**.
- Steps by role, person or department head, with optional fallback role and conditions: amount range or
  “only above the approval limit of role X” (e.g. *SG above the DAF limit*). Limits live in `approval_limits`.
- Rejecting or returning needs a reason. Approvers act from **My approvals** (works on phones).
- Overdue approvals (default 48 h, per workflow) are escalated hourly to the next level and reminded.
- Notifications: in-app always; e-mail when SMTP is configured (Admin UI → Settings → Mail); every e-mail /
  SMS attempt is logged in `outbound_messages` (SMS gateway can be plugged in there).

## Budget control

Budget → Budgets / Revisions / Overview / Reports. The Budget Officer prepares the annual budget (lines =
GL account × department × funding source × project, phased over 12 months; Excel template import), DAF and
SG approve. Only approved lines can be charged.

- **Available = revised budget − open commitments − actuals.** Ledger entries are never edited:
  commitments are released and actuals reversed by new entries (`budget_ledger`, no API access).
- Requisitions are checked against their line at submission; an approved PO **commits** its total; an
  approved supplier invoice turns the commitment into an **actual**; cancelling or closing a PO releases what
  is left; cancelling an approved invoice reverses the actual.
- Setup → Numbering & procurement → *Budget control* (changed only by holders of `manage_finance_settings`): `block` (hard stop, default), `warn` (notify the Budget Officer and
  DAF) or `none`. When blocked, only the DAF can **override** one document, with a reason; overrides are
  permanent and listed in Budget reports → Budget overrides for the Internal Auditor.
- Revisions change approved lines only after their own approval (DAF → SG); a reduction can never go below
  what is committed or spent; a virement must net to zero.
- Utilisation status: green < 75 %, amber 75–90 %, red > 90 % (settings `budget_amber_pct` / `budget_red_pct`).

## Security

| Control | Default (Settings) |
|---|---|
| Password policy | ≥ 10 characters, upper + lower case, digit, symbol; not containing the e-mail name |
| Account lockout | 5 failed sign-ins → locked 15 minutes; unlock by a System Administrator with a reason |
| Two-factor authentication | Authenticator app (TOTP) + 8 one-time recovery codes; can be required for finance roles or everyone |
| Session timeout | Sign-out after 30 minutes without activity (one-minute warning) |
| Audit log | Every create / change / submit / approve / reject / login / permission change / export; read-only for everyone |
| Secrets | 2FA secrets and lockout state are in `user_security` (no API access); the SMTP password is never sent to browsers |
| Rate limiting | 30 sign-ins / minute and 1,200 API calls / minute per IP — **also configure rate limits at the reverse proxy** (PocketBase 0.21 reads client IPs from proxy headers) |

## Tax and statutory rates

VAT, withholding tax, PAYE bands and RSSB rates are **dated tables** (Setup → Tax & statutory rates), never
hard-coded. The seeded values reflect the vendor's understanding of Rwandan law and are marked
**“to be confirmed by Finance”**: the DAF must check each against the current law on rra.gov.rw and rssb.rw
and press *Confirm* (the source is recorded in the audit log).

## Environment variables

| Variable | Where | Purpose |
|---|---|---|
| `VITE_DEMO_LOGINS` | frontend build | `true` shows the one-click role cards on the login page (never in production) |
| `VITE_PRODUCT_NAME`, `VITE_PRODUCT_LONG_NAME`, `VITE_ORG_NAME`, `VITE_ORG_SHORT_NAME`, `VITE_ORG_ADDRESS`, `VITE_VENDOR_NAME` | frontend build | Branding on screens and exported reports |
| `VITE_LOGO_URL` | frontend build | Another logo file (e.g. `/logo.svg`) instead of the built-in RALGA wordmark |
| `PB_URL` | seed / test scripts | PocketBase URL (default `http://127.0.0.1:8090`; seeds refuse non-local URLs) |
| `PB_ADMIN_EMAIL`, `PB_ADMIN_PASSWORD` | seed / test scripts | PocketBase superuser |
| `ALLOW_REMOTE_SEED` | seed scripts | `true` to allow seeding a non-local server (never on production) |

## Backup and restore

- Automatic daily backup at 02:00, 14 copies kept (Admin UI → Settings → Backups; add S3 for an off-site copy).
- **Restore:** Admin UI → Settings → Backups → download the backup (keep a copy) → *Restore*. PocketBase
  restarts on the restored data. Sign in and check the audit log and the latest documents.
- **Restore on a new server:** install the same PocketBase version, copy `pb_migrations/` and `pb_hooks/`,
  start once, create a superuser, then restore the backup zip from the Admin UI (or stop the server and unzip
  it into `pb_data/`).

## Deployment and rollback

1. Build the frontend: `npm run build` (static files in `dist/`), served by Nginx (or any static host) with
   `/api` proxied to PocketBase.
2. Copy `pocketbase/pb_hooks` and `pocketbase/pb_migrations` to the server; run PocketBase as a service
   (`pocketbase serve --http=127.0.0.1:8090`) behind Nginx with HTTPS and rate limiting.
3. **Before every release:** create a backup (Admin UI → Backups) and tag the release in git.
4. Deploy: stop the service, replace hooks / migrations / `dist/`, start the service (new migrations apply).
5. **Rollback:** stop the service, restore the previous release's files, restore the pre-release backup,
   start the service.

## Testing

`npm run test:api` runs API-level checks against a seeded local server, including negative tests:
self-approval blocked, double approval blocked, admins / auditors cannot approve, roles cannot be changed
without confirmation, lockout and 2FA, password policy, settings guards, chart-of-accounts rules,
overlapping tax rates, approval limits and delegations, budget hard stop and override rules, commitments and
actuals reconciling to the ledger, virement and reduction rules, and department scoping of budget figures.
