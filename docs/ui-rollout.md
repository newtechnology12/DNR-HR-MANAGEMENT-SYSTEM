# UI consistency rollout

Goal: every page of RALGA IMS looks, reads and behaves the same, built from one shared kit.
Not changed: sidebar, data, business logic, permissions, API.

- Tokens: `src/design/tokens.json` (Tailwind classes `bg-ims-*`, `text-ims-*`, `text-t-*`, `rounded-card`, `rounded-control`, `h-control`…)
- Kit: `src/components/ims` — import from `@/components/ims`
- Live catalogue: `/dashboard/ui-kit`

## Components

| Component | Use |
|---|---|
| `Page` | page frame: 28px padding (16px on phones), 16px between cards |
| `PageHeader` + `Breadcrumb` | title (noun), one-line subtitle, at most 1 primary + 2 secondary actions |
| `Tabs` | at most 5, optional counts, navy text + blue underline |
| `FilterBar`, `SearchBox`, `FilterSelect`, `DateRangeFilter` | above every table; chips; "Clear filters"; export on the right |
| `DataTable` + `Pager` | sentence-case sortable headers, column lines, 56px rows, second lines, totals row, "⋯" row menu, loading / empty / error |
| `Num`, `DocNo`, `Person`, `TwoLine` | table cells: numbers only, document numbers that never wrap, name + role |
| `StatusPill` + glossary (`status.ts`) | Draft, Pending approval, Approved, In progress, Converted to PO, Completed, Closed, Returned, Rejected, Cancelled (+ Active / Inactive for records) |
| `Priority` | dot + text: Urgent, High, Medium, Low |
| `KpiBand` | one card, 4–6 small numbers, thin dividers |
| `Card`, `CardHeader` | border, radius 14px, 17px/800 title, "View all →" |
| `DetailHeader`, `Details` | back link, number · type · status, title, key facts, next-step actions; label/value lists |
| `Field`, `Input`, `Select`, `Textarea`, `MoneyInput`, `DatePicker` | 42px fields, label above, hint, error that says how to fix |
| `FormBody`, `FormSection`, `ErrorSummary`, `SummaryPanel`, `FormActions`, `useAutosave` | numbered sections, summary + checklist, Submit / Save draft / Cancel, drafts |
| `Button`, `ButtonLink` | primary, secondary, danger, link |
| `Modal`, `ConfirmDialog` | question title, one line, reason when rejecting / returning |
| `EmptyState`, `ErrorState`, `notify` | one line + one action; "Try again"; toasts bottom-right, 4 s |
| `fmtDate`, `fmtDateTime`, `fmtWhen`, `fmtMoney`, `fmtNumber`, `overdue` | writing rules |

Existing shared kits are rebuilt on top of the kit so their pages follow it:
`components/ui/*` (shadcn), `enterprise/ui` (PageHeader, Panel, StatusBadge, EmptyState, MetricGroup, KeyValues),
`enterprise/RecordTable`, `enterprise/DocumentLayout`, `portal/kit` (forms), `workspace/WorkspaceKit`, `DataTable` (legacy), `StatCard`, `breadcrumb`.

## Pages by template

Status: ☐ to do · ◐ kit applied through shared components · ☑ page checked and converted

### Procurement (module 2)
| Page | Route | Template | Status |
|---|---|---|---|
| Purchase requisitions (+ approvals view) | procurement/requisitions, procurement/approvals | List | ☑ |
| Requisition | procurement/requisitions/:id | Detail | ☑ |
| New / edit requisition | procurement/requisitions/new, …/:id/edit | Form | ☑ |
| Suppliers · Supplier | procurement/suppliers, …/:id | List · Detail | ☑ |
| Supplier bank change | procurement/bank-changes/:id | Detail | ☑ |
| Requests for quotation · RFQ | procurement/rfqs, …/:id | List · Detail | ☑ |
| Purchase orders · Purchase order · Receive delivery | procurement/purchase-orders, …/:id, …/:id/receive | List · Detail · Form | ☑ |
| Goods received | procurement/receipts | List | ☑ |
| Inventory | procurement/inventory | List | ☑ |
| Returns · Return | procurement/returns, …/:id | List · Detail | ☑ |
| Contracts · Contract | procurement/contracts, …/:id | List · Detail | ☑ |
| Procurement plans · Plan | procurement/plans, …/:id | List · Detail | ☑ |
| Procurement overview | procurement | Dashboard | ☑ |
| Procurement reports | procurement/reports | Dashboard (reports) | ☑ |
| Approval workflows · Procurement settings | procurement/workflows, procurement/settings | Form (settings) | ☑ |
| Print: RFQ, purchase order, goods received note | print/* | Print layout (tokens only) | ☑ |

### My workspace (module 3)
| Page | Route | Template | Status |
|---|---|---|---|
| My workspace | my | Dashboard | ☑ |
| My attendance · My leave · My payslips · My requests | my/attendance, my/leave, my/payslips, my/requests | List | ☑ |
| My performance · My documents · My expenses · My equipment | my/performance, my/documents, my/expenses, my/equipment | List | ☑ (the expense list itself belongs to the staff-expenses rebuild) |
| Help & HR policies | help | Detail (reading) | ☑ |

### Plans & reports (module 4)
| Page | Route | Template | Status |
|---|---|---|---|
| My plans & reports (+ department, reports, team tabs) | my/plans | List | ☑ |
| Plan | my/plans/:id | Detail | ☑ |
| New / edit plan | my/plans/new, …/:id/edit | Form | ☑ |
| Action plan / report (portal) | employee-portal/plans/*, employee-portal/reports/* | Detail · Form | ☑ |

### HR & payroll (module 5)
| Page | Route | Template | Status |
|---|---|---|---|
| Employees · Employee · Import employees | hr/employees, …/:id, …/import | List · Detail · Form | ☑ |
| Departments · Designations | hr/departments, hr/designations | List | ☑ |
| Leave requests · Leave plan | hr/leaves, hr/leave-plan | List | ☑ |
| Staff expenses | finance/staff-expenses (was hr/prepayments) | List · Detail | ☑ (rebuilt server-side on the kit by the build session) |
| Attendance logs · Attendance report · Attendance corrections | attendance/*, hr/attendance-corrections | List | ☑ |
| Timesheet · Timesheet report | reports/employee-timesheet, reports/timesheet-report | List (report) | ☑ |
| Performance · Templates · Appraisal · Evaluation form | hr/performance/* | Dashboard · Form · Detail · Form | ☑ |
| Payroll runs · Payroll run · Salary structures · Staff loans | hr/payroll/* | List · Detail · List · List | ☑ |
| Payroll tax settings · Leave policy | settings/payroll, settings/leaves | Form (settings) | ☑ |

### Finance (module 5)
| Page | Route | Template | Status |
|---|---|---|---|
| Supplier invoices · Invoice · Payments | finance/invoices, …/:id, finance/payments | List · Detail · List | ☑ |
| Payment vouchers · Voucher · New / edit voucher | finance/vouchers/* | List · Detail · Form | ☑ |
| Journals · Journal · Trial balance · Period close | finance/journals, …/:id, finance/trial-balance, finance/periods | List · Detail · Report | ☑ (built on the kit by the build session) |
| Payables reports | finance/reports | Dashboard (reports) | ☑ |
| Vehicle requests | finance/carmanagement | List | ☑ |
| Petty cash accounts · Petty cash requests · Expense reports | finance/petty-cash-*, reports/expense-reports | — | retired: petty cash books are Bank & cash accounts, requests are staff expenses, expense reports are the staff-expenses "By category" view |
| Bank & cash overview · Accounts · Account · Receipts · Receipt · Transfers · Transfer · Salary payments · Statements · Statement · Reconcile · Reconciliations · Reconciliation · Reports | treasury/* | Dashboard · List · Detail · Form | ☑ |
| Budget overview · Budgets · Budget · Revisions · Revision · Budget reports | budget/* | Dashboard · List · Detail · List · Detail · Dashboard | ☑ |

### Assets (module 5)
| Page | Route | Template | Status |
|---|---|---|---|
| Assets overview · Register · Asset · Transfers · Disposals · Disposal · Depreciation runs · Run · Counts · Count · Categories · Reports · Equipment requests | assets/* | Dashboard · List · Detail · List · List · Detail · List · Detail · List · Detail · List · Dashboard · List | ☑ |

### Approvals, administration, setup, settings (module 5)
| Page | Route | Template | Status |
|---|---|---|---|
| My approvals | approvals | List | ☑ |
| Users & security · Permission matrix · Delegations · System health · Audit log | admin/*, security/audit-log | List · Form · List · Dashboard · List | ☑ |
| Fiscal years · Chart of accounts · Funding sources · Projects · Cost centres · Strategic objectives · Tax rates · Approval limits | setup/* | List | ☑ |
| Posting accounts | setup/posting-accounts | List | ☑ (kit, owned by the build session) |
| General settings · Attendance · E-mail (SMTP) · Branches · Account settings | settings/*, account-settings | Form (settings) | ☑ |
| Team overview | dashboard | Dashboard | ☑ |

### Not converted on purpose
- Sign-in and Forgot password: their own design supplied by RALGA (`AuthShell`); they keep it.
- The sidebar, its profile menu and the notification bell: the brief says not to change the sidebar.

### Legacy pages (still routed, not in the sidebar): tokens only
Classic employee portal (employee-portal/classic), old leave plan (leave-plan-2), RequestCash, AddReason, weeklyplane, clients, assets-allocation. They use the design tokens (colours, sizes, sentence-case labels, no "Please") but are not rebuilt on the list / detail / form templates. Pages under `src/pages/dashboard/projects/*` and other unrouted files (Payroll.tsx, NewPayroll.tsx, PayrollDetails.tsx, LeavesSettings.tsx, Performance.tsx, Report*.tsx, Task.tsx, Roles.tsx…) are not reachable and were left alone.

### Known gaps in the kit
- No searchable (async) select: forms that pick an employee, role or department still use `AsyncSelectField` (react-select), restyled on the tokens.
- DataTable has no grouped headers, sticky header/column or group rows: the permission matrix, leave plan grid, attendance report and payroll register keep hand-built tables on the tokens.
