/**
 * RALGA IMS roles (spec §1), demo accounts and the seeded permission matrix (spec §2).
 *
 * The matrix is written permission → role codes so it can be checked line by line against the
 * spec table. Approvals ("A" in the spec) are permissions too: the approval engine only routes a
 * document to people whose roles hold the matching approve_* permission.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const readJson = (rel) => JSON.parse(fs.readFileSync(path.join(__dirname, rel), "utf8"));
export const CATALOG = readJson("../../src/lib/permission-catalog.json");
export const ALL_PERMISSIONS = CATALOG.groups.flatMap((g) => g.permissions);

// Roles and demo accounts are shared with the login page: src/lib/ims-roles.json.
const ROLE_FILE = readJson("../../src/lib/ims-roles.json");
/** code, display name, legacy role names it replaces (renamed in place), description, scopes. */
export const ROLES = [...ROLE_FILE.roles].sort((a, b) => a.sort - b.sort);
export const ROLE = Object.fromEntries(ROLES.map((r) => [r.code, r.name]));
/** Legacy roles that are retired: their holders become Staff / Requester. */
export const RETIRED_ROLES = ["Driver", "IT Support"];

export const DEMO_PASSWORD = ROLE_FILE.demo_password;
/** One demo login per role. dept / designation are applied by seed-org-ralga.mjs. */
export const DEMO_ACCOUNTS = ROLE_FILE.demo_accounts;

const ALL_STAFF = ["SYS_ADMIN", "SG", "DAF", "ACCOUNTANT", "BUDGET_OFFICER", "CASHIER", "PROCUREMENT_OFFICER", "HOD", "HR_PAYROLL", "STORE_ASSET", "STAFF", "INTERNAL_AUDITOR"];
const FINANCE_READERS = ["SG", "DAF", "ACCOUNTANT", "INTERNAL_AUDITOR"];

/** permission → role codes holding it. Anything not listed is granted to nobody. */
export const MATRIX = {
  // ---------------------------------------------------------------- administration (M10)
  view_dashboard: [...ALL_STAFF, "MGMT_VIEWER"],
  access_general_settings: ["SYS_ADMIN"],
  view_security_admin: ["SYS_ADMIN", "SG", "DAF", "INTERNAL_AUDITOR"],
  confirm_role_changes: ["SYS_ADMIN", "DAF"],
  manage_security_settings: ["SYS_ADMIN"],
  view_system_health: ["SYS_ADMIN"],
  manage_delegations: ["SYS_ADMIN"],
  import_data: ["SYS_ADMIN", "DAF", "HR_PAYROLL"],
  view_audit_logs: ["SYS_ADMIN", "SG", "DAF", "INTERNAL_AUDITOR"],
  export_audit_logs: ["INTERNAL_AUDITOR"],

  // ---------------------------------------------------------------- setup & master data (M1)
  view_master_data: ["SYS_ADMIN", "SG", "DAF", "ACCOUNTANT", "BUDGET_OFFICER", "CASHIER", "PROCUREMENT_OFFICER", "HOD", "STORE_ASSET", "INTERNAL_AUDITOR"],
  manage_chart_of_accounts: ["DAF"],
  manage_funding_sources: ["DAF"],
  manage_projects: ["DAF"],
  manage_fiscal_years: ["DAF"],
  manage_tax_rates: ["DAF"],
  confirm_tax_rates: ["DAF"],
  view_departments: ["SYS_ADMIN", "SG", "DAF", "ACCOUNTANT", "BUDGET_OFFICER", "CASHIER", "PROCUREMENT_OFFICER", "HOD", "HR_PAYROLL", "STORE_ASSET", "INTERNAL_AUDITOR"],
  create_department: ["DAF"],
  manage_approval_workflows: ["DAF"],
  manage_finance_settings: ["DAF"],
  manage_procurement_settings: ["DAF", "PROCUREMENT_OFFICER"],

  // ---------------------------------------------------------------- budgeting (M2)
  view_budgets: ["SG", "DAF", "ACCOUNTANT", "BUDGET_OFFICER", "PROCUREMENT_OFFICER", "HOD", "INTERNAL_AUDITOR", "MGMT_VIEWER"],
  manage_budgets: ["BUDGET_OFFICER"],
  approve_budgets: ["SG", "DAF"],
  override_budget: ["DAF"],
  export_budgets: ["DAF", "ACCOUNTANT", "BUDGET_OFFICER", "INTERNAL_AUDITOR"],

  // ---------------------------------------------------------------- procurement (M3)
  view_procurement_dashboard: ["SG", "DAF", "PROCUREMENT_OFFICER", "HOD", "INTERNAL_AUDITOR"],
  create_purchase_requisition: ["STAFF"],
  view_purchase_requisitions: ["SG", "DAF", "ACCOUNTANT", "BUDGET_OFFICER", "PROCUREMENT_OFFICER", "HOD", "INTERNAL_AUDITOR"],
  // The Budget Officer's "budget check" is a step in the default requisition flow (spec §4).
  approve_purchase_requisitions: ["SG", "DAF", "HOD", "BUDGET_OFFICER"],
  view_procurement_plans: ["SG", "DAF", "ACCOUNTANT", "BUDGET_OFFICER", "PROCUREMENT_OFFICER", "HOD", "INTERNAL_AUDITOR", "MGMT_VIEWER"],
  manage_procurement_plan: ["PROCUREMENT_OFFICER"],
  approve_procurement_plans: ["SG", "DAF"],
  view_suppliers: ["SG", "DAF", "ACCOUNTANT", "PROCUREMENT_OFFICER", "INTERNAL_AUDITOR"],
  manage_suppliers: ["PROCUREMENT_OFFICER"],
  approve_suppliers: ["DAF"],
  evaluate_suppliers: ["PROCUREMENT_OFFICER"],
  view_rfqs: ["SG", "DAF", "PROCUREMENT_OFFICER", "INTERNAL_AUDITOR"],
  manage_rfqs: ["PROCUREMENT_OFFICER"],
  award_rfqs: ["PROCUREMENT_OFFICER"],
  manage_contracts: ["PROCUREMENT_OFFICER"],
  approve_contracts: ["SG", "DAF"],
  view_purchase_orders: ["SG", "DAF", "ACCOUNTANT", "PROCUREMENT_OFFICER", "HOD", "STORE_ASSET", "INTERNAL_AUDITOR"],
  manage_purchase_orders: ["PROCUREMENT_OFFICER"],
  approve_purchase_orders: ["SG", "DAF"],
  amend_purchase_orders: ["PROCUREMENT_OFFICER"],
  receive_goods: ["STORE_ASSET"],
  authorize_over_receipt: ["STORE_ASSET"],
  approve_purchase_returns: ["DAF", "PROCUREMENT_OFFICER"],
  view_inventory: ["DAF", "PROCUREMENT_OFFICER", "STORE_ASSET", "INTERNAL_AUDITOR"],
  manage_inventory: ["STORE_ASSET"],
  view_procurement_reports: ["SG", "DAF", "PROCUREMENT_OFFICER", "HOD", "INTERNAL_AUDITOR", "MGMT_VIEWER"],
  export_procurement: ["PROCUREMENT_OFFICER", "INTERNAL_AUDITOR"],

  // ---------------------------------------------------------------- invoices & payment vouchers (M4)
  view_invoices: ["SG", "DAF", "ACCOUNTANT", "PROCUREMENT_OFFICER", "INTERNAL_AUDITOR"],
  manage_invoices: ["ACCOUNTANT"],
  resolve_invoice_exceptions: ["DAF"],
  approve_invoices: ["DAF"],
  view_payment_vouchers: ["SG", "DAF", "ACCOUNTANT", "CASHIER", "INTERNAL_AUDITOR"],
  manage_payment_vouchers: ["ACCOUNTANT"],
  approve_payment_vouchers: ["SG", "DAF"],
  export_invoices: ["ACCOUNTANT", "INTERNAL_AUDITOR"],

  // ---------------------------------------------------------------- bank & cash (M5)
  view_treasury: ["SG", "DAF", "ACCOUNTANT", "CASHIER", "INTERNAL_AUDITOR"],
  manage_bank_accounts: ["DAF"],
  manage_treasury: ["CASHIER"],
  approve_treasury: ["DAF"],
  record_payments: ["CASHIER"],
  approve_payment_execution: ["DAF"],
  prepare_bank_reconciliation: ["ACCOUNTANT"],
  approve_bank_reconciliation: ["DAF"],
  export_treasury: ["INTERNAL_AUDITOR"],

  // ---------------------------------------------------------------- payroll (M6)
  view_payrolls: ["SG", "DAF", "ACCOUNTANT", "HR_PAYROLL", "INTERNAL_AUDITOR"],
  view_payroll_details: ["SG", "DAF", "HR_PAYROLL", "INTERNAL_AUDITOR"],
  create_payroll: ["HR_PAYROLL"],
  approve_payroll: ["SG", "DAF"],
  manage_salaries: ["HR_PAYROLL"],
  manage_payroll_settings: ["HR_PAYROLL", "DAF"],
  mark_payroll_paid: ["CASHIER"],
  export_payroll: ["HR_PAYROLL", "INTERNAL_AUDITOR"],

  // ---------------------------------------------------------------- fixed assets (M7)
  view_fixed_assets: ["SG", "DAF", "ACCOUNTANT", "HOD", "STORE_ASSET", "INTERNAL_AUDITOR", "MGMT_VIEWER"],
  manage_fixed_assets: ["STORE_ASSET"],
  approve_fixed_assets: ["DAF"],
  request_asset_transfer: ["HOD"],
  approve_asset_disposals: ["SG", "DAF"],
  run_depreciation: ["ACCOUNTANT"],
  approve_depreciation: ["DAF"],
  export_assets: ["STORE_ASSET", "INTERNAL_AUDITOR"],

  // ---------------------------------------------------------------- general ledger (M8)
  view_journals: ["DAF", "ACCOUNTANT", "INTERNAL_AUDITOR"],
  manage_journals: ["ACCOUNTANT"],
  approve_journals: ["DAF"],
  close_periods: ["DAF"],
  reopen_periods: ["SG"],
  export_ledger: ["INTERNAL_AUDITOR"],

  // ---------------------------------------------------------------- reports (M9)
  view_financial_reports: ["SYS_ADMIN", "SG", "DAF", "ACCOUNTANT", "BUDGET_OFFICER", "CASHIER", "PROCUREMENT_OFFICER", "INTERNAL_AUDITOR", "MGMT_VIEWER"],
  view_department_reports: ["HOD"],
  view_payroll_reports: ["SG", "DAF", "HR_PAYROLL", "INTERNAL_AUDITOR"],
  view_asset_reports: ["SG", "DAF", "STORE_ASSET", "INTERNAL_AUDITOR", "MGMT_VIEWER"],
  view_executive_dashboard: ["SG", "DAF", "INTERNAL_AUDITOR", "MGMT_VIEWER"],
  export_reports: ["SG", "DAF", "ACCOUNTANT", "BUDGET_OFFICER", "INTERNAL_AUDITOR", "MGMT_VIEWER"],

  // ---------------------------------------------------------------- employees & HR (not in the spec table; HR-led)
  access_employee_portal: ALL_STAFF,
  view_employees: ["SG", "DAF", "HR_PAYROLL", "INTERNAL_AUDITOR"],
  view_employee_profile: ["SG", "DAF", "HR_PAYROLL", "INTERNAL_AUDITOR"],
  create_employee: ["HR_PAYROLL"],
  update_employee: ["HR_PAYROLL"],
  delete_employee_documents: ["HR_PAYROLL"],
  view_designations: ["HR_PAYROLL", "INTERNAL_AUDITOR"],
  create_designations: ["HR_PAYROLL"],
  update_designations: ["HR_PAYROLL"],
  view_leaves: ["SG", "HOD", "HR_PAYROLL", "INTERNAL_AUDITOR"],
  create_leave: ALL_STAFF,
  update_leave: ["SG", "HOD", "HR_PAYROLL"],
  manage_leave_policy: ["HR_PAYROLL"],
  view_attendance_logs: ["HR_PAYROLL", "HOD", "INTERNAL_AUDITOR"],
  create_attendance: ["HR_PAYROLL"],
  update_attendance: ["HR_PAYROLL"],
  view_attendace_report: ["HR_PAYROLL", "HOD", "INTERNAL_AUDITOR"],
  view_employee_timesheet: ["HR_PAYROLL", "HOD"],
  view_timesheet_report: ["HR_PAYROLL", "INTERNAL_AUDITOR"],
  view_employee_perfomances: ["SG", "HOD", "HR_PAYROLL", "INTERNAL_AUDITOR"],
  create_employee_perfomance: ["HOD", "HR_PAYROLL"],
  update_employee_perfomance: ["HOD", "HR_PAYROLL"],
  evaluate_staff: ["SG", "HOD", "DAF"],
  manage_appraisals: ["HR_PAYROLL"],

  // ---------------------------------------------------------------- petty cash & staff expenses
  view_expenses: [...FINANCE_READERS, "CASHIER"],
  create_expense: ALL_STAFF.filter((c) => c !== "INTERNAL_AUDITOR"),
  approve_or_reject_expense: ["DAF"],
  view_expense_reports: [...FINANCE_READERS, "CASHIER"],
  view_employee_prepayments: ["DAF", "ACCOUNTANT", "HR_PAYROLL", "INTERNAL_AUDITOR"],
  create_employee_prepayments: ["ACCOUNTANT"],
  update_employee_prepayments: ["ACCOUNTANT"],
  view_petty_cash_accounts: ["DAF", "CASHIER", "ACCOUNTANT", "INTERNAL_AUDITOR"],
  create_petty_cash_account: ["DAF"],
  update_petty_cash_account: ["DAF"],
  view_petty_cash_requests: ["DAF", "CASHIER", "ACCOUNTANT", "INTERNAL_AUDITOR"],
  approve_or_reject_request: ["DAF"],
  refill_accounts: ["CASHIER"],

  // ---------------------------------------------------------------- equipment (legacy asset module)
  view_assets: ["STORE_ASSET", "INTERNAL_AUDITOR"],
  create_assets: ["STORE_ASSET"],
  update_assets: ["STORE_ASSET"],
  view_assets_categories: ["STORE_ASSET", "INTERNAL_AUDITOR"],
  create_assets_category: ["STORE_ASSET"],
  update_assets_category: ["STORE_ASSET"],
  view_assets_types: ["STORE_ASSET", "INTERNAL_AUDITOR"],
  create_assets_type: ["STORE_ASSET"],
  update_assets_type: ["STORE_ASSET"],
  view_assets_requests: ALL_STAFF,
  view_all_assets_requests: ["STORE_ASSET", "INTERNAL_AUDITOR"],
  reject_or_approve_assets_requests: ["STORE_ASSET"],
  view_assets_allocations: ["STORE_ASSET", "INTERNAL_AUDITOR"],
  create_asset_allocation: ["STORE_ASSET"],
  view_asset_allocation_details: ["STORE_ASSET", "INTERNAL_AUDITOR"],
};

/** roles.permitions array for one role code, covering every permission in the catalogue. */
export function permitionsFor(code) {
  return ALL_PERMISSIONS.map((p) => ({ name: p.name, title: p.title, access: (MATRIX[p.name] || []).includes(code) }));
}

/** Sanity check: every matrix key exists in the catalogue and every code is a real role. */
export function checkMatrix() {
  const names = new Set(ALL_PERMISSIONS.map((p) => p.name));
  const codes = new Set(ROLES.map((r) => r.code));
  const problems = [];
  for (const [perm, holders] of Object.entries(MATRIX)) {
    if (!names.has(perm)) problems.push(`matrix permission "${perm}" is not in the catalogue`);
    for (const c of holders) if (!codes.has(c)) problems.push(`"${perm}" lists unknown role ${c}`);
  }
  // The internal auditor never changes anything: only read / export permissions (plus own leave).
  const AUDITOR_OK = /^(view_|export_|access_employee_portal$|create_leave$)/;
  for (const [perm, holders] of Object.entries(MATRIX)) if (holders.includes("INTERNAL_AUDITOR") && !AUDITOR_OK.test(perm)) problems.push(`Internal Auditor must be read-only but holds "${perm}"`);
  // System administrators never approve financial transactions.
  for (const [perm, holders] of Object.entries(MATRIX)) if (holders.includes("SYS_ADMIN") && /^approve_|record_payments|override_budget|close_periods|reopen_periods/.test(perm)) problems.push(`System Administrator must not hold "${perm}"`);
  return problems;
}
