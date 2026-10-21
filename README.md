# RALGA IMS — Integrated Management System

Integrated finance, procurement, HR and asset management for **RALGA** (Rwanda Association of Local
Government Authorities): budgets and budget control, procurement and purchase orders, supplier invoices
and payment vouchers, bank and cash, payroll, fixed assets, general ledger, financial statements and
role dashboards — with a configurable approval engine, segregation of duties and a read-only audit trail.

Developed by Infinity Core Solutions Ltd.

## Build status

| Step | Scope | Status |
|---|---|---|
| 1 | Foundation: 13 roles, permission matrix (two-person confirmation), users & security (2FA, lockout, password policy, session timeout), audit log, approval engine (limits, delegations, overdue escalation), master data (fiscal years, chart of accounts, funding sources, projects, cost centres, tax rates) | **Done** |
| 2 | Budgeting & budget control (M2): budgets by line with monthly phasing and Excel import, revisions (supplementary, reduction, virement, re-phasing), hard-stop control with DAF override, commitments from POs, actuals from invoices, utilisation dashboard, budget vs actual, commitments and overrides reports | **Done** |
| 3 | Procurement, suppliers, PO, GRN (M3): requisitions, POs and procurement plan lines charged to budget lines (plans cannot exceed a line), supplier bank-detail changes verified by Finance, supplier balances and plan execution reports | **Done** |
| 4 | Supplier invoices & payment vouchers (M4): duplicate invoice control, payment vouchers for invoices or direct expenses with withholding tax from the dated table, approval Accountant → DAF → SG above limit, execution by the Cashier, supplier ageing, outstanding liabilities, payment register, WHT schedule | **Done** |
| 5 | Bank & cash, reconciliation (M5): bank accounts and cash books with opening balances, receipts and inter-account transfers approved by the DAF, voucher payments from a chosen account (no overdraft, restricted donor accounts), cash book, bank statement import from Excel / CSV with column mapping and automatic matching, matching by hand, bank charges recorded from the statement, reconciliation (Accountant prepares, DAF approves, then locked), cash counts, cash position and reports | **Done** |
| 6 | Payroll (M6): Rwanda PAYE and RSSB from dated rates, grades and funding split of donor-funded staff, staff loans repaid through the payroll, comparison with the previous month, approval posts a balanced GL journal and budget actuals by department / funding source / project, payment from a chosen bank account (cash book + payment journal), payroll register, PAYE (RRA), RSSB and bank-file exports; general ledger core (journals, posting accounts) | **Done** |
| 7 | Fixed assets & depreciation (M7) | Planned |
| 8 | General ledger, period close (M8) | Planned |
| 9 | Reports, financial statements, role dashboards (M9) | Planned |
| 10 | Data migration, tests, documentation | Planned |
| + | Staff workspace: every staff member's own pages (attendance, leave, plans, payslips, requests, performance, documents), attendance corrections approved by HR, work planning and reporting (annual performance contract → quarter → month → week, supervisor approval, reports and assessment), Help & HR policies | **Done** |

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

# 4. API tests on a freshly seeded server (must stay green: 310 checks in 12 suites)
npm run test:api
```

## Demo logins

One account per role. Password for all: **`password123`** (development / demo only — the login page shows a
*Demo access* picker that fills the form with any role when `VITE_DEMO_LOGINS=true` or in development).

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

## My workspace (every staff member)

Everyone lands on **My workspace** (`/dashboard/my`):

- clock in and out (the location is recorded; the clock-in window comes from Settings → Attendance), the
  attendance calendar for the last 30 working days, and a notice when days have no clock-in;
- the annual leave balance with what is coming up (approved leave, public holidays), the latest payslip (amounts
  can be hidden), every request in one table with its next step, this week's plan, and what is waiting for the
  person's decision.

The sidebar lists every page the person can use: My attendance, My leave, My plans & reports, My payslips,
My requests, My performance, My documents; Requests (purchase requisitions, expenses & petty cash, equipment);
Help & HR policies (working hours, leave types, public holidays, PAYE bands and contributions, read from the
settings). People who oversee staff also get **Team overview** (their department or the whole organisation).
Old employee-portal links open the new pages.

**Attendance corrections:** for a working day without a clock-in (mission, training, a meeting outside the
office, clock-in failure) the staff member asks HR to correct the log, with the reason and the evidence.
HR & payroll → Attendance corrections: HR approves (the days are recorded as *correction* with the normal
hours) or rejects with a reason; nobody decides their own request.

## Work planning and reporting

My plans & reports follows the public-service planning cycle — an Imihigo-style performance contract
cascaded down to the week — with the department's monthly plan alongside:

| Plan | Period | What it needs before it is sent |
|---|---|---|
| Annual performance contract | Fiscal year (July–June) | Objectives with indicator, unit, baseline, target, weight (together 100 %), quarters, evidence, strategic objective |
| Quarterly plan | Quarter of the fiscal year | Outputs with indicator, target, weight (100 %) and strategic objective |
| Department plan | Calendar month | Prepared by the head of department: shared activities (DA-01, DA-02…) with a target in a unit, due date, weight, strategic objective |
| Monthly plan | Calendar month | Activities with expected output, indicator, unit, target, weight (100 %), due date, strategic objective; optionally the department activity they contribute to |
| Weekly plan | Monday–Friday | Activities by day |
| Assigned task | Its own dates (up to three months) | Deliverables with due dates — assigned by a supervisor |

- **The form** (New plan) works in three steps — what is planned; the period and the plan it carries out; the
  activities — with the department's activities to contribute to, a live *Plan check* (period, alignment,
  indicators, weights, fields to fix, department links), a summary with the approval route, and the entries
  kept on the device while it is filled. Drafts may be incomplete; what the level needs is checked when the
  plan is sent (also by the server).
- **Department achievement adds up**: a monthly activity (or task) linked to a department activity carries
  its share of the target; the quantities achieved in approved staff plans add up on the department plan
  (achieved, % progress, what remains, how many people contribute). Nobody types the department's progress.
- **Health** compares achievement with the time passed in the period: on track ≥ expected − 10 points, at risk ≥
  expected − 25, off track below; completed when reported or at 100 %.
- **Assigned work**: the head of department (or the Secretary General) assigns a task with its own dates, or sets
  a plan at any level (e.g. the annual contract from the strategic plan, with its source). Assigned work starts
  approved; the assigner is its supervisor and assesses the report. *Plan a quarter / month / week* prepares the
  next level down from an approved plan (shown as cascaded).
- **Issues and risks**: the owner or the supervisor raises an issue on a plan (severity, activity concerned);
  the other side is notified; it is resolved with a note and can be reopened. Open issues show in the lists.
- Draft → sent to the supervisor (the head of department; heads, and units without a head, report to the
  Secretary General, whose own plan is approved when sent) → approved, or returned with comments → progress
  (status, %, quantity achieved) → report at the end of the period (achievements, challenges, next steps,
  support needed, self-rating) → the supervisor's assessment (1–5 with feedback), or returned for more detail.
- Supervisors work from the *My team* tab: plans to approve, reports to assess, *Assign work*. Evidence documents
  can be attached; every step is in the plan's history and the audit log; any plan exports to Excel or PDF.
- **Strategic objectives** (Setup → Strategic objectives) are the list plans link to. The five seeded objectives,
  and the "RALGA Strategic Plan 2024–2029" source on the demo contract, are **illustrative** — replace them
  with RALGA's approved Strategic Plan before go-live.

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

## Payment vouchers

Payables → Payment vouchers. Every supplier payment and direct expense goes through a voucher:

- **Accountant** prepares it: approved invoices of one supplier (the amount to pay on each), or a direct
  expense charged to a budget line (budget control applies at submission; the actual is charged on approval).
- **Withholding tax** comes from Setup → Tax & statutory rates and is computed on the amount before VAT.
- **DAF** approves; the **Secretary General** also approves above the DAF voucher limit (Setup → Approval limits).
- **Cashier** executes it (method, date, reference): one payment per invoice with the tax withheld and the net
  paid. Whoever prepared or approved the voucher cannot execute it; if the supplier's verified bank details
  changed after preparation, the payment stops.
- An invoice cannot be on two open vouchers for the same money; invoices are never paid outside a voucher.
- **Duplicate invoices:** the same supplier reference (ignoring case and punctuation) is refused; the same
  amount within 7 days (setting `duplicate_invoice_days`) needs a reason and stays an exception until the DAF
  clears it.

## Supplier bank details

Once a supplier is approved, its bank details are locked. Procurement asks for new details with
*Change bank details* on the supplier page (reason required; the bank letter goes under Documents). Finance
(`approve_suppliers`) verifies them — the requester cannot — and only then are they applied; until then
payments keep going to the verified account. Old and new details stay on the request; every step is
audited. Bank details are visible only to supplier, payables and audit roles.

## Bank and cash

Bank & cash in the menu (Cashier, Accountant, DAF, SG, Internal Auditor).

- **Accounts:** the DAF sets up each bank account and cash book with its GL cash account, an opening balance on
  the go-live date (taken from the bank statement or a cash count), and optionally a funding source: a
  *restricted* donor account only receives and pays that funding source's money. Once an account has
  transactions its type, GL account and opening balance are locked.
- **Receipts** (member contributions, Government transfers, donor grants, fees): the Cashier records them; the
  DAF verifies; only then are they posted to the cash book. Excel import is available for many receipts at once.
- **Transfers** between RALGA accounts (petty cash replenishment, bank to bank): Cashier prepares, DAF approves
  (SG too above the DAF transfer limit), then posted out of one account and into the other. Money leaving a
  restricted account needs a written reason.
- **Payments:** the Cashier chooses the account a voucher is paid from (cash only from a cash book); the account
  must hold enough money and must not be a donor account of another funding source.
- **Bank statements:** the Accountant imports the bank's Excel or CSV file (column mapping remembered per
  account; a template is provided for PDF-only statements). The lines must add up to the closing balance and
  follow the running balance; periods already imported are refused. Lines are matched to the cash book
  automatically (same amount and direction within 7 days — setting `bank_match_days` — the reference first).
- **Reconciliation screen:** statement lines and cash book entries not yet matched side by side; select items
  with equal totals and match them, record bank charges and interest from the statement (optionally charged to a
  budget line), give every open item a follow-up (timing difference, to record, to investigate, error to
  correct). The reconciliation statement updates live.
- **Reconciliation:** prepared by the Accountant as of a statement date (difference must be nil, every open item
  followed up), approved by the DAF — whoever prepares cannot approve. After approval its matches are locked and
  nothing can be dated on or before that date. Cash books are reconciled by a **cash count**.
- **Reports:** cash position, bank transaction summary, cash book with running balance, unreconciled items,
  receipts register, reconciliation register; the reconciliation statement itself exports to Excel / PDF.
- A posted receipt or transfer that is not yet on a bank statement can be **reversed** by the DAF (reason
  required): an opposite entry dated today, never an edit.

## Working with data

- **Excel import** (button *Import* on lists): download the template (Data sheet with the right headers, an
  Example sheet, the allowed values on a Lists sheet, Instructions), fill it, upload it. Every row is checked
  first (required fields, numbers, dates, e-mails, choices, links to other records by code / name / e-mail,
  duplicates in the file); you see each problem and can download the rows to fix. Valid rows are created one
  by one through the API, so permissions, business rules and the audit trail apply exactly as in the forms.
  Available on master data (chart of accounts, funding sources, projects, cost centres, tax rates, approval
  limits), departments, designations, offices, suppliers (created as drafts), stock items, equipment
  (categories, types, register), leave types, public holidays, salary structures, partners, employees and
  receipts (created as drafts). Bank statements have their own import with column mapping (Bank and cash).
- **Export** (button *Export*): Excel, PDF or CSV with the RALGA header, the filters used and who generated it,
  on every list; exports are audited and follow each person's access (staff export only their own records).
- **Supporting documents** (tab *Documents* on budgets, revisions, purchase orders, invoices, vouchers, returns,
  bank-detail changes, receipts, transfers, bank statements and reconciliations; evidence on work plans): drag and drop several files (PDF, images, Office, CSV, e-mail, zip; 20 MB each).
  Files can be added at any stage; they can only be removed while the document is being prepared. Each
  upload and removal is audited.

## E-mail

Settings → E-mail. Enter the mail server (presets for Microsoft 365 and Google Workspace), the sender and the
public address of the system, switch sending on, then *Send test e-mail*. The settings are applied to the
server immediately. Approvals, reminders and alerts are e-mailed with the RALGA template; the **E-mail log** on
the same page lists every message (sent, failed, not sent) and lets an administrator send failed ones again.

## Payroll and the general ledger

HR & payroll → Payroll. The HR & Payroll Officer prepares, the DAF (and the SG) approve, the Cashier pays.

- **Preview:** *New payroll* first shows the whole month before anything is saved: every payslip (basic,
  allowances, gross, PAYE, pension, maternity, CBHI, other deductions, net, employer cost), the totals for RRA and
  RSSB, who is left out and why, and the PAYE bands and contribution rates **in force that month** (Settings →
  Payroll & taxes, dated rates). *Create payroll* then saves exactly those figures.
- **Salary structures:** basic, allowances, recurring deductions, **grade**, and for donor-funded staff the
  **funding split** (share per funding source and project, 100% in total). Without a split the salary is charged
  to member contributions. Each payslip keeps the department, grade and split of its month.
- **Staff loans** (HR & payroll → Staff loans): HR records the loan with its monthly instalment and first month
  (at most 60 instalments; all of a person's instalments together at most half of their last net pay); the DAF
  approves it — never the person who recorded it, never the borrower. The payroll deducts the instalment and the
  balance goes down when the payroll is paid. Staff see their loans under *My payslips*.
- **Against last month:** each payroll lists who joined, who left and whose pay changed, with the reason (basic,
  allowances, loan, deductions), and the difference per component.
- **Approval → general ledger and budget:** when the last approver signs, one balanced journal is posted. Costs
  are by department and funding source (basic salaries 5101, allowances 5102, employer contributions 5103–5106);
  the liabilities are net salaries 2103, PAYE 2104 and the RSSB contributions 2105–2107, 2112, 2113, other
  deductions 2111; advances (1120) and loans (1121) recovered are credited to the staff receivables. Every cost is
  charged to its budget line (department + account + funding source + project) as an actual. Salaries are never
  stopped by the budget: lines that go over and costs without a budget line are listed on the *GL & budget* tab.
  Journal lines never carry employee names.
- **Payment** (Bank & cash → Salary payments): the Cashier sees each approved payroll with the total to transfer
  to each bank — not who is paid what, which stays with HR & Payroll, the DAF, the SG and the Internal Auditor
  (HR sends the bank file). Once the bank has executed the transfer, the Cashier records the payment: the bank
  account (unrestricted, enough money), the date and the bank reference. A cash book entry and a payment journal
  (Dr net salaries payable / Cr bank) are posted, payslips become visible to staff and loan balances go down.
- **Exports** (Excel, PDF, CSV): payroll register, PAYE declaration schedule (RRA), RSSB contributions schedule,
  bank transfer file for all banks or one bank, and the full workbook.
- **Journal entries** (General ledger → Journal entries; DAF, Accountant, Internal Auditor): every journal with
  its lines and dimensions, linked to the document that caused it. Posted journals are never edited — they are
  reversed by an opposite journal. Other roles cannot read the ledger (checked by the server).
- **Posting accounts** (Setup → Posting accounts): which GL account each automatic posting uses. The DAF changes
  them; a change applies from the next posting. The seeded accounts and rates are illustrative and must be
  confirmed by Finance before go-live.

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
| `VITE_DEMO_LOGINS` | frontend build | `true` shows the *Demo access* role picker on the login page (never in production) |
| `VITE_SUPPORT_EMAIL` | frontend build | Address behind *Need access? Contact the RALGA ICT unit* on the login page (without it, the link explains who creates accounts) |
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
actuals reconciling to the ledger, virement and reduction rules, department scoping of budget figures, supplier
bank-detail changes (no direct edit, no self-verification, visibility), plan lines tied to budget lines, and
bank and cash (accounts set up by the DAF only, receipts and transfers verified before posting, no future or
pre-opening dates, no overdraft, restricted donor accounts, statements that do not add up or overlap refused,
automatic and manual matching, preparer ≠ approver of reconciliations, locked periods after approval, reversal),
work plans (private to the person, the supervisor and HR; only the supervisor approves and assesses; activity
dates inside the period; what each level needs checked when sent; approved plans locked except progress;
assigning only to people one supervises; cascading; issues; department plans prepared by the head, one a month,
with staff results adding up), attendance
corrections (HR only, never one's own; approved days added to the log) and payroll (loans recorded by HR and
approved by someone else, instalment limits, the slip deduction, a balanced journal equal to the employer cost,
donor-funded salaries charged to the donor programme, budget actuals equal to the posting, staff cannot read
journals, preparer cannot pay, payment from a bank account clears net salaries payable, comparison with the
previous month). Run them on a freshly seeded server
(`npm run seed:ralga` first): some checks use the seeded documents.
