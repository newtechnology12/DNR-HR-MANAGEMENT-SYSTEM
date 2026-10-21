/**
 * Main navigation. Each item lists the permissions that make it visible (any one of them);
 * "*" means every signed-in user. The server enforces the same permissions on the data.
 */
import {
  AlignEndHorizontal, Banknote, BarChart3, Blocks, Boxes, Building2, CalendarClock, CalendarRange, CandlestickChart, CarFront, CircleDollarSign,
  ClipboardList, Clock, Container, FileSearch, FileSignature, FolderKanban, GitBranch, GitPullRequest, Inbox, Landmark, Layout, ListChecks,
  ListTree, LucideIcon, Network, Percent, PieChart, Receipt, Scale, ScrollText, ServerCog, Settings, ShieldCheck, ShoppingCart, SlidersHorizontal,
  Split, Table, Tags, Truck, Undo2, User, UserCog, Users, Wallet, WalletCards, Activity, Coins, LayoutGrid, UserCheck,
} from "lucide-react";

export interface NavItem {
  key: string;
  label: string;
  link: string;
  icon: LucideIcon;
  perms: string[] | "*";
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

export const NAVIGATION: NavGroup[] = [
  {
    key: "overview",
    label: "Overview",
    items: [
      { key: "dashboard", label: "Dashboard", link: "/dashboard", icon: LayoutGrid, perms: ["view_dashboard"] },
      { key: "approvals", label: "My approvals", link: "/dashboard/approvals", icon: Inbox, perms: [...APPROVER_PERMISSIONS, "create_purchase_requisition"] },
      { key: "portal", label: "My portal", link: "/dashboard/employee-portal", icon: User, perms: ["access_employee_portal"] },
      { key: "leavePlan", label: "My leave plan", link: "/dashboard/leave-plan", icon: CalendarRange, perms: ["access_employee_portal"] },
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
      { key: "requisitions", label: "Purchase requisitions", link: "/dashboard/procurement/requisitions", icon: ClipboardList, perms: ["view_purchase_requisitions", "create_purchase_requisition", "approve_purchase_requisitions"] },
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
      { key: "payments", label: "Payments", link: "/dashboard/finance/payments", icon: Banknote, perms: ["view_invoices", "record_payments"] },
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
      { key: "performance", label: "Performance & appraisals", link: "/dashboard/hr/performance", icon: UserCheck, perms: ["view_employee_perfomances", "evaluate_staff", "manage_appraisals"] },
      { key: "attendanceLogs", label: "Attendance logs", link: "/dashboard/attendance/attendance-logs", icon: ListChecks, perms: ["view_attendance_logs"] },
      { key: "attendanceReport", label: "Attendance report", link: "/dashboard/attendance/attendance-report", icon: AlignEndHorizontal, perms: ["view_attendace_report"] },
      { key: "timesheet", label: "Employee timesheet", link: "/dashboard/reports/employee-timesheet", icon: Table, perms: ["view_employee_timesheet"] },
      { key: "timesheetReport", label: "Timesheet report", link: "/dashboard/reports/timesheet-report", icon: Clock, perms: ["view_timesheet_report"] },
    ],
  },
  {
    key: "assets",
    label: "Assets",
    items: [
      { key: "assetInventory", label: "Equipment inventory", link: "/dashboard/assets", icon: Blocks, perms: ["view_assets"] },
      { key: "assetCategories", label: "Equipment categories", link: "/dashboard/assets/categories", icon: Tags, perms: ["view_assets_categories"] },
      { key: "assetTypes", label: "Equipment types", link: "/dashboard/assets/types", icon: Container, perms: ["view_assets_types"] },
      { key: "assetRequests", label: "Equipment requests", link: "/dashboard/assets/requests", icon: GitPullRequest, perms: ["view_assets_requests"] },
    ],
  },
  {
    key: "expenses",
    label: "Petty cash & expenses",
    items: [
      { key: "expenseRequests", label: "Expense requests", link: "/dashboard/hr/prepayments", icon: CircleDollarSign, perms: ["view_expenses"] },
      { key: "pettyCashAccounts", label: "Petty cash accounts", link: "/dashboard/finance/petty-cash-accounts", icon: Coins, perms: ["view_petty_cash_accounts"] },
      { key: "pettyCashRequests", label: "Petty cash requests", link: "/dashboard/finance/petty-cash-requests", icon: GitPullRequest, perms: ["view_petty_cash_requests"] },
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
      { key: "costCentres", label: "Cost centres", link: "/dashboard/setup/cost-centres", icon: Network, perms: ["view_master_data"] },
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
];

export const ICON_FALLBACK: LucideIcon = ServerCog;
