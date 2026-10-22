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
| My attendance · My leave · My payslips · My requests | my/attendance, my/leave, my/payslips, my/requests | List | ◐ (embedded legacy lists in progress) |
| My performance · My documents · My expenses · My equipment | my/performance, my/documents, my/expenses, my/equipment | List | ◐ (embedded legacy lists in progress; expense requests list on hold) |
| Help & HR policies | help | Detail (reading) | ☐ |

### Plans & reports (module 4)
| Page | Route | Template | Status |
|---|---|---|---|
| My plans & reports (+ department, reports, team tabs) | my/plans | List | ☐ |
| Plan | my/plans/:id | Detail | ☐ |
| New / edit plan | my/plans/new, …/:id/edit | Form | ☐ |
| Action plan / report (portal) | employee-portal/plans/*, employee-portal/reports/* | Detail · Form | ☐ |

### HR & payroll (module 5)
| Page | Route | Template | Status |
|---|---|---|---|
| Employees · Employee · Import employees | hr/employees, …/:id, …/import | List · Detail · Form | ☐ |
| Departments · Designations | hr/departments, hr/designations | List | ☐ |
| Leave requests · Leave plan | hr/leaves, hr/leave-plan | List | ☐ |
| Staff expenses | hr/prepayments | List | ☐ |
| Attendance logs · Attendance report · Attendance corrections | attendance/*, hr/attendance-corrections | List | ☐ |
| Timesheet · Timesheet report | reports/employee-timesheet, reports/timesheet-report | List (report) | ☐ |
| Performance · Templates · Appraisal · Evaluation form | hr/performance/* | Dashboard · Form · Detail · Form | ☐ |
| Payroll runs · Payroll run · Salary structures · Staff loans | hr/payroll/* | List · Detail · List · List | ☐ |
| Payroll tax settings · Leave policy | settings/payroll, settings/leaves | Form (settings) | ☐ |

### Finance (module 5)
| Page | Route | Template | Status |
|---|---|---|---|
| Supplier invoices · Invoice · Payments | finance/invoices, …/:id, finance/payments | List · Detail · List | ☐ |
| Payment vouchers · Voucher · New / edit voucher | finance/vouchers/* | List · Detail · Form | ☐ |
| Journals · Journal | finance/journals, …/:id | List · Detail | ☐ |
| Payables reports | finance/reports | Dashboard (reports) | ☐ |
| Petty cash accounts · Account · Petty cash requests · Vehicle requests · Expense reports | finance/petty-cash-*, finance/carmanagement, reports/expense-reports | List · Detail · List · List · List | ☐ |
| Bank & cash overview · Accounts · Account · Receipts · Receipt · Transfers · Transfer · Salary payments · Statements · Statement · Reconcile · Reconciliations · Reconciliation · Reports | treasury/* | Dashboard · List · Detail · Form | ☐ |
| Budget overview · Budgets · Budget · Revisions · Revision · Budget reports | budget/* | Dashboard · List · Detail · List · Detail · Dashboard | ☐ |

### Assets (module 5)
| Page | Route | Template | Status |
|---|---|---|---|
| Assets overview · Register · Asset · Transfers · Disposals · Disposal · Depreciation runs · Run · Counts · Count · Categories · Reports · Equipment requests | assets/* | Dashboard · List · Detail · List · List · Detail · List · Detail · List · Detail · List · Dashboard · List | ☐ |

### Approvals, administration, setup, settings (module 5)
| Page | Route | Template | Status |
|---|---|---|---|
| My approvals | approvals | List | ☐ |
| Users & security · Permission matrix · Delegations · System health · Audit log | admin/*, security/audit-log | List · Form · List · Dashboard · List | ☐ |
| Fiscal years · Chart of accounts · Funding sources · Projects · Cost centres · Strategic objectives · Tax rates · Posting accounts · Approval limits | setup/* | List | ☐ |
| General settings · Attendance · E-mail (SMTP) · Branches · Account settings | settings/*, account-settings | Form (settings) | ☐ |
| Team overview | dashboard | Dashboard | ☐ |

### On hold
- Expenses & petty cash finance pages (PettyCashRequests, PrePayments, EmployeePrePayments, Accounts, Cashmanagement): the flow is being moved to the server by the build session first; restyled after that.

### Not converted on purpose
- Sign-in and Forgot password: their own design (supplied by RALGA, `AuthShell`); they already use the tokens' colours.
- Not found page: one line and a link back.

### Legacy pages (still routed, not in the sidebar)
Classic employee portal, RequestCash, AddReason, leave-plan-2, employees/tasks, weeklyplane, clients, other/assets-allocation — converted last or listed as not converted.
