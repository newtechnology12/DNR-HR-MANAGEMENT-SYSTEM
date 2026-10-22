/**
 * Main navigation. Each item lists the permissions that make it visible (any one of them);
 * "*" means every signed-in user. The server enforces the same permissions on the data.
 */
import {
  AlignEndHorizontal, ArrowRightLeft, Banknote, FileSpreadsheet, PiggyBank, BarChart3, FileCheck2, Blocks, Boxes, Building2, CalendarClock, CalendarRange, CandlestickChart, CarFront, CircleDollarSign,
  ClipboardList, Clock, FileSearch, FileSignature, FolderKanban, GitBranch, GitPullRequest, Inbox, Landmark, Layout, ListChecks,
  ListTree, LucideIcon, Network, Percent, PieChart, Receipt, Scale, ScrollText, ServerCog, Settings, ShieldCheck, ShoppingCart, SlidersHorizontal,
  Split, Table, Tags, Truck, Undo2, UserCog, Users, Wallet, WalletCards, Activity, Coins, LayoutGrid, UserCheck,
  ClipboardCheck, FileText, FolderOpen, HelpCircle, Laptop, MessageSquareText, Target, BookOpen, Link2, TrendingDown, Trash2, Repeat, CalendarCheck,
} from "lucide-react";

export interface NavItem {
  key: string;
  label: string;
  link: string;
  icon: LucideIcon;
  perms: string[] | "*";
  /** Hidden for people who also hold one of these (they reach the same page from a management group). */
  hideIf?: string[];
}
export interface NavGroup {
  key: string;
  label: string;
  items: NavItem[];
}

export const APPROVER_PERMISSIONS = [
  "approve_purchase_requisitions", "approve_purchase_orders", "approve_invoices", "approve_suppliers", "approve_contracts",
  "approve_procurement_plans", "approve_payroll", "approve_purchase_returns", "approve_budgets", "approve_payment_vouchers",
  "approve_journals", "approve_asset_disposals", "approve_bank_reconciliation", "approve_depreciation", "approve_treasury",
];

const ASSET_PERMISSIONS = ["view_fixed_assets", "manage_fixed_assets", "approve_fixed_assets", "approve_asset_disposals", "run_depreciation", "approve_depreciation", "view_asset_reports", "export_assets", "view_assets"];

const TREASURY_PERMISSIONS = ["view_treasury", "manage_treasury", "manage_bank_accounts", "approve_treasury", "record_payments", "prepare_bank_reconciliation", "approve_bank_reconciliation", "export_treasury"];

/** Everyone's own pages: attendance, leave, plans, pay, requests. */
const SELF = ["access_employee_portal"];

export const NAVIGATION: NavGroup[] = [
  {
    key: "workspace",
    label: "My workspace",
    items: [
      { key: "dashboard", label: "Dashboard", link: "/dashboard/my", icon: LayoutGrid, perms: ["access_employee_portal", "view_dashboard"] },
      { key: "teamOverview", label: "Team overview", link: "/dashboard", icon: BarChart3, perms: ["view_employees", "view_attendance_logs", "view_leaves"] },
      { key: "approvals", label: "My approvals", link: "/dashboard/approvals", icon: Inbox, perms: APPROVER_PERMISSIONS },
      { key: "myAttendance", label: "My attendance", link: "/dashboard/my/attendance", icon: Clock, perms: SELF },
      { key: "myLeave", label: "My leave", link: "/dashboard/my/leave", icon: CalendarRange, perms: SELF },
      { key: "myPlans", label: "My plans & reports", link: "/dashboard/my/plans", icon: Target, perms: SELF },
      { key: "myPayslips", label: "My payslips", link: "/dashboard/my/payslips", icon: FileText, perms: SELF },
      { key: "myRequests", label: "My requests", link: "/dashboard/my/requests", icon: MessageSquareText, perms: SELF },
      { key: "myPerformance", label: "My performance", link: "/dashboard/my/performance", icon: UserCheck, perms: SELF },
      { key: "myDocuments", label: "My documents", link: "/dashboard/my/documents", icon: FolderOpen, perms: SELF },
    ],
  },
  {
    key: "requests",
    label: "Requests",
    items: [
      { key: "myRequisitions", label: "Purchase requisitions", link: "/dashboard/procurement/requisitions", icon: ClipboardList, perms: ["create_purchase_requisition"], hideIf: ["view_purchase_requisitions", "approve_purchase_requisitions"] },
      { key: "myExpenses", label: "Expenses & advances", link: "/dashboard/my/expenses", icon: Banknote, perms: ["create_expense", "access_employee_portal"] },
      { key: "myEquipment", label: "Equipment requests", link: "/dashboard/my/equipment", icon: Laptop, perms: ["view_assets_requests", "access_employee_portal"] },
    ],
  },
  {
    key: "budget",
    label: "Budget",
    items: [
      { key: "budgetOverview", label: "Budget overview", link: "/dashboard/budget", icon: PieChart, perms: ["view_budgets", "manage_budgets"] },
      { key: "budgets", label: "Budgets", link: "/dashboard/budget/budgets", icon: ListTree, perms: ["view_budgets", "manage_budgets", "approve_budgets"] },
      { key: "budgetRevisions", label: "Budget revisions", link: "/dashboard/budget/revisions", icon: GitPullRequest, perms: ["view_budgets", "manage_budgets", "approve_budgets"] },
      { key: "budgetReports", label: "Budget reports", link: "/dashboard/budget/reports", icon: BarChart3, perms: ["view_budgets", "manage_budgets"] },
    ],
  },
  {
    key: "procurement",
    label: "Procurement",
    items: [
      { key: "procurementOverview", label: "Procurement overview", link: "/dashboard/procurement", icon: CandlestickChart, perms: ["view_procurement_dashboard"] },
      { key: "procurementPlans", label: "Procurement plans", link: "/dashboard/procurement/plans", icon: CalendarClock, perms: ["manage_procurement_plan", "view_procurement_plans", "approve_procurement_plans"] },
      { key: "requisitions", label: "Purchase requisitions", link: "/dashboard/procurement/requisitions", icon: ClipboardList, perms: ["view_purchase_requisitions", "approve_purchase_requisitions"] },
      { key: "rfqs", label: "RFQs & quotations", link: "/dashboard/procurement/rfqs", icon: FileSearch, perms: ["view_rfqs", "manage_rfqs", "award_rfqs"] },
      { key: "suppliers", label: "Suppliers", link: "/dashboard/procurement/suppliers", icon: Building2, perms: ["view_suppliers", "manage_suppliers", "approve_suppliers"] },
      { key: "contracts", label: "Contracts", link: "/dashboard/procurement/contracts", icon: FileSignature, perms: ["manage_contracts", "approve_contracts", "view_suppliers", "view_purchase_orders"] },
      { key: "purchaseOrders", label: "Purchase orders", link: "/dashboard/procurement/purchase-orders", icon: ShoppingCart, perms: ["view_purchase_orders", "manage_purchase_orders", "approve_purchase_orders", "receive_goods"] },
      { key: "goodsReceived", label: "Goods received", link: "/dashboard/procurement/receipts", icon: Truck, perms: ["view_purchase_orders", "receive_goods"] },
      { key: "returns", label: "Returns to supplier", link: "/dashboard/procurement/returns", icon: Undo2, perms: ["view_purchase_orders", "manage_purchase_orders", "receive_goods", "approve_purchase_returns"] },
      { key: "inventory", label: "Inventory", link: "/dashboard/procurement/inventory", icon: Boxes, perms: ["view_inventory", "manage_inventory"] },
      { key: "procurementReports", label: "Procurement reports", link: "/dashboard/procurement/reports", icon: BarChart3, perms: ["view_procurement_reports"] },
    ],
  },
  {
    key: "payables",
    label: "Payables",
    items: [
      { key: "invoices", label: "Supplier invoices", link: "/dashboard/finance/invoices", icon: Receipt, perms: ["view_invoices", "manage_invoices", "resolve_invoice_exceptions", "approve_invoices", "record_payments"] },
      { key: "vouchers", label: "Payment vouchers", link: "/dashboard/finance/vouchers", icon: FileCheck2, perms: ["view_payment_vouchers", "manage_payment_vouchers", "approve_payment_vouchers", "record_payments"] },
      { key: "payments", label: "Payments", link: "/dashboard/finance/payments", icon: Banknote, perms: ["view_invoices", "view_payment_vouchers", "record_payments"] },
      { key: "staffExpenses", label: "Staff expenses & advances", link: "/dashboard/finance/staff-expenses", icon: CircleDollarSign, perms: ["view_expenses", "view_employee_prepayments", "record_payments", "approve_or_reject_expense"] },
      { key: "payablesReports", label: "Payables reports", link: "/dashboard/finance/reports", icon: BarChart3, perms: ["view_payment_vouchers", "manage_payment_vouchers", "view_invoices", "export_invoices"] },
    ],
  },
  {
    key: "treasury",
    label: "Bank & cash",
    items: [
      { key: "cashPosition", label: "Cash position", link: "/dashboard/treasury", icon: Landmark, perms: TREASURY_PERMISSIONS },
      { key: "bankAccounts", label: "Bank & cash accounts", link: "/dashboard/treasury/accounts", icon: WalletCards, perms: TREASURY_PERMISSIONS },
      { key: "receipts", label: "Receipts", link: "/dashboard/treasury/receipts", icon: PiggyBank, perms: TREASURY_PERMISSIONS },
      { key: "transfers", label: "Transfers", link: "/dashboard/treasury/transfers", icon: ArrowRightLeft, perms: TREASURY_PERMISSIONS },
      { key: "salaryPayments", label: "Salary payments", link: "/dashboard/treasury/salaries", icon: Wallet, perms: ["mark_payroll_paid"] },
      { key: "bankStatements", label: "Bank statements", link: "/dashboard/treasury/statements", icon: FileSpreadsheet, perms: TREASURY_PERMISSIONS },
      { key: "reconciliations", label: "Reconciliations", link: "/dashboard/treasury/reconciliations", icon: Scale, perms: TREASURY_PERMISSIONS },
      { key: "treasuryReports", label: "Bank & cash reports", link: "/dashboard/treasury/reports", icon: BarChart3, perms: TREASURY_PERMISSIONS },
    ],
  },
  {
    key: "ledger",
    label: "General ledger",
    items: [
      { key: "journals", label: "Journal entries", link: "/dashboard/finance/journals", icon: BookOpen, perms: ["view_journals", "export_ledger", "approve_journals"] },
      { key: "recurringJournals", label: "Recurring journals", link: "/dashboard/finance/recurring-journals", icon: Repeat, perms: ["manage_journals", "approve_journals"] },
      { key: "trialBalance", label: "Trial balance", link: "/dashboard/finance/trial-balance", icon: Scale, perms: ["view_journals", "export_ledger", "approve_journals", "reopen_periods"] },
      { key: "periodClose", label: "Period close", link: "/dashboard/finance/periods", icon: CalendarCheck, perms: ["close_periods", "reopen_periods", "manage_journals"] },
    ],
  },
  {
    key: "hr",
    label: "HR & payroll",
    items: [
      { key: "employees", label: "Employees", link: "/dashboard/hr/employees", icon: Users, perms: ["view_employees"] },
      { key: "departments", label: "Departments", link: "/dashboard/hr/departments", icon: Layout, perms: ["view_departments"] },
      { key: "designations", label: "Designations", link: "/dashboard/hr/designations", icon: Split, perms: ["view_designations"] },
      { key: "leaves", label: "Leave & holidays", link: "/dashboard/hr/leaves", icon: CalendarRange, perms: ["view_leaves"] },
      { key: "leavePlanAll", label: "Leave plan (all staff)", link: "/dashboard/hr/leave-plan", icon: CalendarClock, perms: ["view_leaves"] },
      { key: "payroll", label: "Payroll", link: "/dashboard/hr/payroll", icon: Wallet, perms: ["view_payrolls"] },
      { key: "salaries", label: "Salary structures", link: "/dashboard/hr/payroll/salaries", icon: WalletCards, perms: ["manage_salaries"] },
      { key: "staffLoans", label: "Staff loans", link: "/dashboard/hr/payroll/loans", icon: Coins, perms: ["create_payroll", "approve_payroll"] },
      { key: "performance", label: "Performance & appraisals", link: "/dashboard/hr/performance", icon: UserCheck, perms: ["view_employee_perfomances", "evaluate_staff", "manage_appraisals"] },
      { key: "attendanceLogs", label: "Attendance logs", link: "/dashboard/attendance/attendance-logs", icon: ListChecks, perms: ["view_attendance_logs"] },
      { key: "attendanceCorrections", label: "Attendance corrections", link: "/dashboard/hr/attendance-corrections", icon: ClipboardCheck, perms: ["update_attendance"] },
      { key: "attendanceReport", label: "Attendance report", link: "/dashboard/attendance/attendance-report", icon: AlignEndHorizontal, perms: ["view_attendace_report"] },
      { key: "timesheet", label: "Employee timesheet", link: "/dashboard/reports/employee-timesheet", icon: Table, perms: ["view_employee_timesheet"] },
      { key: "timesheetReport", label: "Timesheet report", link: "/dashboard/reports/timesheet-report", icon: Clock, perms: ["view_timesheet_report"] },
    ],
  },
  {
    key: "assets",
    label: "Fixed assets",
    items: [
      { key: "assetOverview", label: "Assets overview", link: "/dashboard/assets", icon: PieChart, perms: ASSET_PERMISSIONS },
      { key: "assetRegister", label: "Asset register", link: "/dashboard/assets/register", icon: Blocks, perms: [...ASSET_PERMISSIONS, "request_asset_transfer"] },
      { key: "assetTransfers", label: "Transfers", link: "/dashboard/assets/transfers", icon: ArrowRightLeft, perms: [...ASSET_PERMISSIONS, "request_asset_transfer"] },
      { key: "depreciation", label: "Depreciation", link: "/dashboard/assets/depreciation", icon: TrendingDown, perms: ["run_depreciation", "approve_depreciation", "view_fixed_assets", "view_asset_reports"] },
      { key: "assetDisposals", label: "Disposals", link: "/dashboard/assets/disposals", icon: Trash2, perms: ["manage_fixed_assets", "approve_asset_disposals", "view_fixed_assets"] },
      { key: "assetCounts", label: "Asset counts", link: "/dashboard/assets/counts", icon: ClipboardCheck, perms: ["manage_fixed_assets", "view_fixed_assets"] },
      { key: "assetRequests", label: "Equipment requests", link: "/dashboard/assets/requests", icon: GitPullRequest, perms: ["manage_fixed_assets", "reject_or_approve_assets_requests", "view_all_assets_requests"] },
      { key: "assetReports", label: "Asset reports", link: "/dashboard/assets/reports", icon: BarChart3, perms: ["view_asset_reports", "view_fixed_assets", "export_assets"] },
      { key: "assetCategories", label: "Categories & depreciation", link: "/dashboard/assets/categories", icon: Tags, perms: ASSET_PERMISSIONS },
    ],
  },
  {
    key: "expenses",
    label: "Vehicles & expense reports",
    items: [
      { key: "carManagement", label: "Vehicle requests", link: "/dashboard/finance/carmanagement", icon: CarFront, perms: ["view_petty_cash_requests"] },
      { key: "expenseReports", label: "Expense reports", link: "/dashboard/reports/expense-reports", icon: BarChart3, perms: ["view_expense_reports"] },
    ],
  },
  {
    key: "setup",
    label: "Setup",
    items: [
      { key: "fiscalYears", label: "Fiscal years & periods", link: "/dashboard/setup/fiscal-years", icon: CalendarClock, perms: ["view_master_data"] },
      { key: "chartOfAccounts", label: "Chart of accounts", link: "/dashboard/setup/accounts", icon: ListTree, perms: ["view_master_data"] },
      { key: "fundingSources", label: "Funding sources", link: "/dashboard/setup/funding-sources", icon: Landmark, perms: ["view_master_data"] },
      { key: "projects", label: "Projects", link: "/dashboard/setup/projects", icon: FolderKanban, perms: ["view_master_data"] },
      { key: "strategicObjectives", label: "Strategic objectives", link: "/dashboard/setup/strategic-objectives", icon: Target, perms: ["view_master_data"] },
      { key: "costCentres", label: "Cost centres", link: "/dashboard/setup/cost-centres", icon: Network, perms: ["view_master_data"] },
      { key: "postingAccounts", label: "Posting accounts", link: "/dashboard/setup/posting-accounts", icon: Link2, perms: ["view_master_data", "manage_chart_of_accounts"] },
      { key: "taxRates", label: "Tax & statutory rates", link: "/dashboard/setup/tax-rates", icon: Percent, perms: ["view_master_data", "manage_payroll_settings"] },
      { key: "workflows", label: "Approval workflows", link: "/dashboard/settings/general-settings/approval-workflows", icon: GitBranch, perms: ["manage_approval_workflows", "view_security_admin"] },
      { key: "approvalLimits", label: "Approval limits", link: "/dashboard/setup/approval-limits", icon: Scale, perms: ["manage_approval_workflows", "view_master_data", "view_security_admin"] },
      { key: "procurementSettings", label: "Numbering & procurement", link: "/dashboard/settings/general-settings/procurement", icon: SlidersHorizontal, perms: ["manage_procurement_settings"] },
    ],
  },
  {
    key: "admin",
    label: "Administration",
    items: [
      { key: "users", label: "Users & security", link: "/dashboard/admin/users", icon: UserCog, perms: ["access_general_settings", "view_security_admin"] },
      { key: "permissions", label: "Permission matrix", link: "/dashboard/admin/permissions", icon: ShieldCheck, perms: ["access_general_settings", "confirm_role_changes", "view_security_admin"] },
      { key: "delegations", label: "Delegations", link: "/dashboard/admin/delegations", icon: Split, perms: [...APPROVER_PERMISSIONS, "manage_delegations"] },
      { key: "auditLog", label: "Audit log", link: "/dashboard/security/audit-log", icon: ScrollText, perms: ["view_audit_logs"] },
      { key: "health", label: "System health", link: "/dashboard/admin/health", icon: Activity, perms: ["view_system_health"] },
      { key: "generalSettings", label: "General settings", link: "/dashboard/settings/general-settings", icon: Settings, perms: ["access_general_settings"] },
    ],
  },
  {
    key: "support",
    label: "Support",
    items: [{ key: "help", label: "Help & HR policies", link: "/dashboard/help", icon: HelpCircle, perms: "*" }],
  },
];

export const ICON_FALLBACK: LucideIcon = ServerCog;
