import { createBrowserRouter } from "react-router-dom";
import App from "@/App";
import DashboardLayout from "@/layouts/DashboardLayout";
import PageNotFound from "@/pages/PageNotFound";
import { Login } from "./pages/Login";
import { ProtectedRoute } from "./components/ProtectedRoute";
import RootLayout from "./layouts/RootLayout";
import Dashboard from "./pages/dashboard/Dashboard";
import Leaves from "./pages/dashboard/Leaves";
import Payroll from "./pages/dashboard/Payroll";
import NewPayroll from "./pages/dashboard/NewPayroll";
import PayrollDetails from "./pages/dashboard/PayrollDetails";
import { ForgotPassword } from "./pages/ForgotPassword";
import EmployeesPage from "./pages/dashboard/Employees";
import EmployeePortal from "./pages/dashboard/EmployeePortal";
import Settings from "./pages/dashboard/Settings";
import AccountSettings from "./pages/dashboard/AccountSettings";
import Departments from "./pages/dashboard/Departments";
import AssetsAllocation from "./pages/dashboard/AssetsAllocation";
import AttendaceLogs from "./pages/dashboard/AttendanceLogs";
import AttendanceReport from "./pages/dashboard/AttendanceReport";
import GeneralSettongs from "./pages/dashboard/GeneralSetting";
import PayrollSettings from "./pages/dashboard/PayrollSettings";
import LeavesSettings from "./pages/dashboard/LeavesSettings";
import SmtpSettings from "./pages/dashboard/SmtpSettings";
import AttendaceSettings from "./pages/dashboard/AttendaceSettings";
import Branches from "./pages/dashboard/Branches";
import EmployeeProfile from "./pages/dashboard/EmployeeProfile";
import Performance from "./pages/dashboard/Performance";
import PerfomanceForm from "./pages/dashboard/PerfomanceForm";
import Designations from "./pages/dashboard/Designations";
// import FileManager from "./pages/dashboard/FileManager";
import WeeklyPlans from "./pages/dashboard/WeeklyPlane";
import RequestCash from "./pages/dashboard/RequestCash";
import Reason from "./pages/dashboard/Reason";
import ClientManagement from "./pages/dashboard/clients";
import EmployeeTimesheet from "./pages/dashboard/EmployeeTimesheet";
import TimesheetReport from "./pages/dashboard/TimesheetReport";
// import CarManagement from "./pages/dashboard/CarManagement";
import { ReportGenerator } from "./components/Carmodel/ReportGenerator";
import CarManagement from "./pages/dashboard/CarManagement";
import CountInventorySession from "./pages/dashboard/CountInventorySession";
import ExcelStyleLeavePlan from "./pages/dashboard/CountInventorySession";
// import { DepartmentDashboard } from "./components/DepartmentFile/department-dashboard";

import { lazy, Suspense } from "react";
import { Navigate } from "react-router-dom";
import { APPROVER_PERMISSIONS } from "./lib/navigation";

// Procurement is code-split: loaded only when a user opens it.
const ProcurementDashboard = lazy(() => import("./pages/procurement/ProcurementDashboard"));
const Requisitions = lazy(() => import("./pages/procurement/Requisitions"));
const RequisitionForm = lazy(() => import("./pages/procurement/RequisitionForm"));
const RequisitionDetail = lazy(() => import("./pages/procurement/RequisitionDetail"));
const ApprovalWorkflows = lazy(() => import("./pages/procurement/ApprovalWorkflows"));
const ProcurementSettings = lazy(() => import("./pages/procurement/ProcurementSettings"));
const AuditLog = lazy(() => import("./pages/procurement/AuditLog"));
const Suppliers = lazy(() => import("./pages/procurement/Suppliers"));
const SupplierDetail = lazy(() => import("./pages/procurement/SupplierDetail"));
const BankChangeDetail = lazy(() => import("./pages/procurement/BankChangeDetail"));
const Rfqs = lazy(() => import("./pages/procurement/Rfqs"));
const RfqDetail = lazy(() => import("./pages/procurement/RfqDetail"));
const RfqPrint = lazy(() => import("./pages/procurement/RfqPrint"));
const PurchaseOrders = lazy(() => import("./pages/procurement/PurchaseOrders"));
const PurchaseOrderDetail = lazy(() => import("./pages/procurement/PurchaseOrderDetail"));
const ReceiveDelivery = lazy(() => import("./pages/procurement/ReceiveDelivery"));
const GoodsReceipts = lazy(() => import("./pages/procurement/GoodsReceipts"));
const Inventory = lazy(() => import("./pages/procurement/Inventory"));
const PoPrint = lazy(() => import("./pages/procurement/PurchasingPrint").then((m) => ({ default: m.PoPrint })));
const Returns = lazy(() => import("./pages/procurement/Returns"));
const ReturnDetail = lazy(() => import("./pages/procurement/ReturnDetail"));
const Contracts = lazy(() => import("./pages/procurement/Contracts"));
const ContractDetail = lazy(() => import("./pages/procurement/ContractDetail"));
const Plans = lazy(() => import("./pages/procurement/Plans"));
const PlanDetail = lazy(() => import("./pages/procurement/PlanDetail"));
const ProcurementReports = lazy(() => import("./pages/procurement/Reports"));
const GrnPrint = lazy(() => import("./pages/procurement/PurchasingPrint").then((m) => ({ default: m.GrnPrint })));
const ActionPlanForm = lazy(() => import("./pages/portal/ActionPlanForm"));
const ActionPlanDetail = lazy(() => import("./pages/portal/ActionPlanDetail"));
const ReportForm = lazy(() => import("./pages/portal/ReportForm"));
const ReportDetail = lazy(() => import("./pages/portal/ReportDetail"));
const LeavePlan = lazy(() => import("./pages/hr/LeavePlan"));
const LeavePolicySettings = lazy(() => import("./pages/hr/LeavePolicySettings"));
const PayrollRuns = lazy(() => import("./pages/hr/payroll/PayrollRuns"));
const PayrollRun = lazy(() => import("./pages/hr/payroll/PayrollRun"));
const SalaryStructures = lazy(() => import("./pages/hr/payroll/SalaryStructures"));
const StaffLoans = lazy(() => import("./pages/hr/payroll/StaffLoans"));
const Journals = lazy(() => import("./pages/ledger/Journals"));
const JournalDetail = lazy(() => import("./pages/ledger/JournalDetail"));
const JournalEditor = lazy(() => import("./pages/ledger/JournalEditor"));
const RecurringJournals = lazy(() => import("./pages/ledger/RecurringJournals"));
const TrialBalance = lazy(() => import("./pages/ledger/TrialBalance"));
const AccountLedger = lazy(() => import("./pages/ledger/AccountLedger"));
const PeriodClose = lazy(() => import("./pages/ledger/PeriodClose"));
const PostingAccounts = lazy(() => import("./pages/setup/PostingAccounts"));
// Staff expenses and advances (paid from the cash books, posted to the ledger); replace the old petty-cash pages.
const StaffExpenses = lazy(() => import("./pages/finance/StaffExpenses"));
const StaffExpenseDetail = lazy(() => import("./pages/finance/StaffExpenseDetail"));
const EXPENSE_USERS = ["view_expenses", "view_employee_prepayments", "record_payments", "approve_or_reject_expense", "view_expense_reports"];
// Step 9: statements and management reporting from the general ledger.
const FinancialStatements = lazy(() => import("./pages/reports/FinancialStatements"));
const DonorReport = lazy(() => import("./pages/reports/DonorReport"));
const ExecutiveDashboard = lazy(() => import("./pages/reports/ExecutiveDashboard"));
const STATEMENT_USERS = ["view_financial_reports", "view_journals", "approve_journals", "close_periods", "export_ledger"];
const SalaryPayments = lazy(() => import("./pages/treasury/SalaryPayments"));
const AssetsOverview = lazy(() => import("./pages/assets/AssetsOverview"));
const AssetRegister = lazy(() => import("./pages/assets/AssetRegister"));
const AssetDetail = lazy(() => import("./pages/assets/AssetDetail"));
const AssetTransfers = lazy(() => import("./pages/assets/AssetTransfers"));
const AssetDisposals = lazy(() => import("./pages/assets/AssetDisposals"));
const DisposalDetail = lazy(() => import("./pages/assets/DisposalDetail"));
const DepreciationRuns = lazy(() => import("./pages/assets/DepreciationRuns"));
const DepreciationRunDetail = lazy(() => import("./pages/assets/DepreciationRunDetail"));
const AssetCounts = lazy(() => import("./pages/assets/AssetCounts"));
const AssetCountDetail = lazy(() => import("./pages/assets/AssetCountDetail"));
const AssetCategories = lazy(() => import("./pages/assets/AssetCategories"));
const AssetReports = lazy(() => import("./pages/assets/AssetReports"));
const EquipmentRequests = lazy(() => import("./pages/assets/EquipmentRequests"));
const PayrollTaxSettings = lazy(() => import("./pages/hr/payroll/PayrollTaxSettings"));
const PerformanceOverview = lazy(() => import("./pages/hr/performance/PerformanceOverview"));
const AppraisalPage = lazy(() => import("./pages/hr/performance/AppraisalPage"));
const TemplateEditor = lazy(() => import("./pages/hr/performance/TemplateEditor"));
const PERFORMANCE_USERS = ["view_employee_perfomances", "evaluate_staff", "manage_appraisals"];
const Invoices = lazy(() => import("./pages/finance/Invoices"));
const Payments = lazy(() => import("./pages/finance/Invoices").then((m) => ({ default: m.Payments })));
const InvoiceDetail = lazy(() => import("./pages/finance/InvoiceDetail"));
// RALGA IMS — budgeting (Step 2).
const BudgetOverview = lazy(() => import("./pages/budget/BudgetOverview"));
const BudgetList = lazy(() => import("./pages/budget/Budgets"));
const BudgetDetail = lazy(() => import("./pages/budget/BudgetDetail"));
const BudgetRevisions = lazy(() => import("./pages/budget/BudgetRevisions"));
const RevisionDetail = lazy(() => import("./pages/budget/RevisionDetail"));
const BudgetReports = lazy(() => import("./pages/budget/BudgetReports"));
const BUDGET_USERS = ["view_budgets", "manage_budgets", "approve_budgets"];
// RALGA IMS — payables (Step 4).
const Vouchers = lazy(() => import("./pages/finance/Vouchers"));
const VoucherForm = lazy(() => import("./pages/finance/VoucherForm"));
const VoucherDetail = lazy(() => import("./pages/finance/VoucherDetail"));
const PayablesReports = lazy(() => import("./pages/finance/PayablesReports"));
const LEDGER_USERS = ["view_journals", "export_ledger", "approve_journals"];
// trial balance, account ledger and period close: also the Secretary General, who re-opens months
const LEDGER_REPORT_USERS = [...LEDGER_USERS, "manage_journals", "close_periods", "reopen_periods"];
const ASSET_USERS = ["view_fixed_assets", "manage_fixed_assets", "approve_fixed_assets", "approve_asset_disposals", "run_depreciation", "approve_depreciation", "view_asset_reports", "export_assets", "view_assets"];
const ASSET_DEPT_USERS = [...ASSET_USERS, "request_asset_transfer"];
const VOUCHER_USERS = ["view_payment_vouchers", "manage_payment_vouchers", "approve_payment_vouchers", "record_payments"];
// RALGA IMS — bank and cash (Step 5).
const TreasuryOverview = lazy(() => import("./pages/treasury/TreasuryOverview"));
const BankAccounts = lazy(() => import("./pages/treasury/BankAccounts"));
const AccountDetail = lazy(() => import("./pages/treasury/AccountDetail"));
const Receipts = lazy(() => import("./pages/treasury/Receipts"));
const ReceiptDetail = lazy(() => import("./pages/treasury/ReceiptDetail"));
const Transfers = lazy(() => import("./pages/treasury/Transfers"));
const TransferDetail = lazy(() => import("./pages/treasury/TransferDetail"));
const Statements = lazy(() => import("./pages/treasury/Statements"));
const StatementDetail = lazy(() => import("./pages/treasury/StatementDetail"));
const Reconcile = lazy(() => import("./pages/treasury/Reconcile"));
const Reconciliations = lazy(() => import("./pages/treasury/Reconciliations"));
const ReconciliationDetail = lazy(() => import("./pages/treasury/ReconciliationDetail"));
const TreasuryReports = lazy(() => import("./pages/treasury/TreasuryReports"));
const TREASURY_USERS = ["view_treasury", "manage_treasury", "manage_bank_accounts", "approve_treasury", "record_payments", "prepare_bank_reconciliation", "approve_bank_reconciliation", "export_treasury"];
const INVOICE_USERS = ["view_invoices", "manage_invoices", "resolve_invoice_exceptions", "approve_invoices", "record_payments"];
const PO_USERS = ["view_purchase_orders", "manage_purchase_orders", "approve_purchase_orders", "receive_goods"];
const INVENTORY_USERS = ["view_inventory", "manage_inventory"];
const SETTINGS_USERS = ["access_general_settings", "manage_procurement_settings", "manage_approval_workflows", "view_security_admin", "manage_payroll_settings", "manage_leave_policy"];
// RALGA IMS — foundation screens (Step 1).
const ApprovalsInbox = lazy(() => import("./pages/approvals/ApprovalsInbox"));
const PermissionMatrix = lazy(() => import("./pages/admin/PermissionMatrix"));
const UsersSecurity = lazy(() => import("./pages/admin/UsersSecurity"));
const Delegations = lazy(() => import("./pages/admin/Delegations"));
const SystemHealth = lazy(() => import("./pages/admin/SystemHealth"));
const FiscalYears = lazy(() => import("./pages/setup/FiscalYears"));
const ChartOfAccounts = lazy(() => import("./pages/setup/ChartOfAccounts"));
const FundingSources = lazy(() => import("./pages/setup/MasterData").then((m) => ({ default: m.FundingSources })));
const SetupProjects = lazy(() => import("./pages/setup/MasterData").then((m) => ({ default: m.Projects })));
const CostCentres = lazy(() => import("./pages/setup/MasterData").then((m) => ({ default: m.CostCentres })));
const TaxRates = lazy(() => import("./pages/setup/TaxRates"));
const ApprovalLimits = lazy(() => import("./pages/setup/ApprovalLimits"));
const StrategicObjectives = lazy(() => import("./pages/setup/MasterData").then((m) => ({ default: m.StrategicObjectives })));
// My workspace: every staff member's own pages.
const MyDashboard = lazy(() => import("./pages/dashboard/MyDashboard"));
const MyAttendance = lazy(() => import("./pages/my/MyPages").then((m) => ({ default: m.MyAttendance })));
const MyLeave = lazy(() => import("./pages/my/MyPages").then((m) => ({ default: m.MyLeave })));
const MyPayslipsPage = lazy(() => import("./pages/my/MyPages").then((m) => ({ default: m.MyPayslipsPage })));
const MyRequests = lazy(() => import("./pages/my/MyPages").then((m) => ({ default: m.MyRequests })));
const MyPerformance = lazy(() => import("./pages/my/MyPages").then((m) => ({ default: m.MyPerformance })));
const MyDocuments = lazy(() => import("./pages/my/MyPages").then((m) => ({ default: m.MyDocuments })));
const MyExpenses = lazy(() => import("./pages/my/MyPages").then((m) => ({ default: m.MyExpenses })));
const MyEquipment = lazy(() => import("./pages/my/MyPages").then((m) => ({ default: m.MyEquipment })));
const MyPlans = lazy(() => import("./pages/my/MyPlans"));
const PlanEditor = lazy(() => import("./pages/my/PlanEditor"));
const WorkPlanDetail = lazy(() => import("./pages/my/PlanDetail"));
const Help = lazy(() => import("./pages/my/Help"));
const UiKit = lazy(() => import("./pages/UiKit"));
const AttendanceCorrections = lazy(() => import("./pages/hr/AttendanceCorrections"));
const APPROVAL_USERS = [...APPROVER_PERMISSIONS, "create_purchase_requisition"];
const DELEGATION_USERS = [...APPROVER_PERMISSIONS, "manage_delegations"];
const ADMIN_USERS = ["access_general_settings", "view_security_admin"];
const MATRIX_USERS = ["access_general_settings", "confirm_role_changes", "view_security_admin"];
const MASTER_DATA_USERS = ["view_master_data"];
const EmployeeImport = lazy(() => import("./pages/dashboard/EmployeeImport"));
const PROCUREMENT_USERS = ["view_purchase_requisitions", "create_purchase_requisition", "approve_purchase_requisitions"];
const SUPPLIER_USERS = ["view_suppliers", "manage_suppliers", "approve_suppliers"];
const RFQ_USERS = ["view_rfqs", "manage_rfqs", "award_rfqs"];
const CONTRACT_USERS = ["manage_contracts", "approve_contracts", "view_suppliers", "manage_suppliers", "view_purchase_orders"];
const PLAN_USERS = ["manage_procurement_plan", "view_procurement_plans", "approve_procurement_plans", "view_procurement_dashboard", "create_purchase_requisition"];
const REPORT_USERS = ["view_procurement_reports", "view_procurement_dashboard"];

/** The old employee portal's tabs now have their own pages; old links (notifications, bookmarks) land there. */
const PORTAL_TABS: Record<string, string> = {
  "Attendance Log": "/dashboard/my/attendance",
  Documents: "/dashboard/my/documents",
  Leaves: "/dashboard/my/leave",
  "Action Plans": "/dashboard/my/plans?tab=department",
  Reports: "/dashboard/my/plans?tab=reports",
  "Expense Request": "/dashboard/my/expenses",
  Payslips: "/dashboard/my/payslips",
  Performance: "/dashboard/my/performance",
  Assets: "/dashboard/my/equipment?tab=assigned",
};
function PortalRedirect() {
  const tab = new URLSearchParams(window.location.search).get("tab") || "";
  return <Navigate to={PORTAL_TABS[tab] || "/dashboard/my"} replace />;
}

const router = createBrowserRouter([
  {
    element: <App />,
    children: [
      {
        element: <RootLayout />,
        children: [
          {
            path: "/",
            element: <Login />,
          },
          {
            path: "/forgot-password",
            element: <ForgotPassword />,
          },
        ],
      },
      {
        element: <RootLayout />,
        children: [
          {
            path: "print/rfq/:rfqId/:supplierId",
            element: (
              <ProtectedRoute entity={RFQ_USERS}>
                <Suspense fallback={null}>
                  <RfqPrint />
                </Suspense>
              </ProtectedRoute>
            ),
          },
          {
            path: "print/po/:poId",
            element: (
              <ProtectedRoute entity={PO_USERS}>
                <Suspense fallback={null}>
                  <PoPrint />
                </Suspense>
              </ProtectedRoute>
            ),
          },
          {
            path: "print/grn/:grnId",
            element: (
              <ProtectedRoute entity={PO_USERS}>
                <Suspense fallback={null}>
                  <GrnPrint />
                </Suspense>
              </ProtectedRoute>
            ),
          },
          {
            path: "dashboard",
            element: <DashboardLayout />,
            children: [
              {
                children: [
                  {
                    index: true,
                    element: (
                      <ProtectedRoute entity="view_dashboard">
                        <Dashboard />
                      </ProtectedRoute>
                    ),
                  },
                  {
                    path: "employee-portal",
                    element: (
                      <ProtectedRoute entity="access_employee_portal">
                        <PortalRedirect />
                      </ProtectedRoute>
                    ),
                  },
                  {
                    path: "employee-portal/classic",
                    element: (
                      <ProtectedRoute entity="access_employee_portal">
                        <EmployeePortal />
                      </ProtectedRoute>
                    ),
                  },
                  { path: "my", element: <ProtectedRoute entity={["access_employee_portal", "view_dashboard"]}><MyDashboard /></ProtectedRoute> },
                  ...([
                    ["my/attendance", <MyAttendance />],
                    ["my/leave", <MyLeave />],
                    ["my/plans", <MyPlans />],
                    ["my/plans/new", <PlanEditor />],
                    ["my/plans/:planId", <WorkPlanDetail />],
                    ["my/plans/:planId/edit", <PlanEditor />],
                    ["my/payslips", <MyPayslipsPage />],
                    ["my/requests", <MyRequests />],
                    ["my/performance", <MyPerformance />],
                    ["my/documents", <MyDocuments />],
                    ["my/expenses", <MyExpenses />],
                    ["my/expenses/:expenseId", <StaffExpenseDetail />],
                    ["my/equipment", <MyEquipment />],
                  ] as [string, JSX.Element][]).map(([path, page]) => ({
                    path,
                    element: <ProtectedRoute entity="access_employee_portal">{page}</ProtectedRoute>,
                  })),
                  { path: "help", element: <Help /> },
                  { path: "ui-kit", element: <UiKit /> },
                  ...[
                    ["employee-portal/plans/new", <ActionPlanForm />],
                    ["employee-portal/plans/:planId", <ActionPlanDetail />],
                    ["employee-portal/plans/:planId/edit", <ActionPlanForm />],
                    ["employee-portal/reports/new", <ReportForm />],
                    ["employee-portal/reports/:reportId", <ReportDetail />],
                    ["employee-portal/reports/:reportId/edit", <ReportForm />],
                  ].map(([path, page]) => ({
                    path: path as string,
                    element: <ProtectedRoute entity="access_employee_portal">{page}</ProtectedRoute>,
                  })),
                  {
                    path: "leave-plan",
                    element: (
                      <ProtectedRoute entity="access_employee_portal">
                        <Suspense fallback={null}><LeavePlan /></Suspense>
                      </ProtectedRoute>
                    ),
                  },
                  {
                    path: "RequestCash",
                    element: (
                      <ProtectedRoute entity="access_employee_portal">
                        <RequestCash />
                      </ProtectedRoute>
                    ),
                  },
                  {
                    path: "AddReason",
                    element: (
                      <ProtectedRoute entity="access_employee_portal">
                        <Reason />
                      </ProtectedRoute>
                    ),
                  },
                  {
                    path: "leave-plan-2",
                    element: <CountInventorySession />,
                  },

                  {
                    path: "employees/tasks",
                    // element: <Tasks />,
                  },
                  {
                    path: "employees/reports",
                    // element: <Reports />,
                  },
                  // {
                  //   path: "file-management",
                  //   element: <DepartmentDashboard />,
                  // },
                  {
                    path: "weeklyplane",
                    element: <WeeklyPlans />,
                  },

                  {
                    path: "clients",
                    element: <ClientManagement />,
                  },
                ],
              },

              {
                path: "hr",
                children: [
                  { path: "attendance-corrections", element: <ProtectedRoute entity="update_attendance"><AttendanceCorrections /></ProtectedRoute> },
                  {
                    path: "employees",
                    element: (
                      <ProtectedRoute entity="view_employees">
                        <EmployeesPage />
                      </ProtectedRoute>
                    ),
                  },
                  {
                    path: "employees/import",
                    element: (
                      <ProtectedRoute entity="create_employee">
                        <EmployeeImport />
                      </ProtectedRoute>
                    ),
                  },
                  {
                    path: "employees/:employeeId",
                    element: (
                      <ProtectedRoute entity="view_employee_profile">
                        <EmployeeProfile />
                      </ProtectedRoute>
                    ),
                  },
                  {
                    path: "designations",
                    element: (
                      <ProtectedRoute entity="view_designations">
                        <Designations />
                      </ProtectedRoute>
                    ),
                  },
                  {
                    path: "leave-plan",
                    element: (
                      <ProtectedRoute entity="view_leaves">
                        <Suspense fallback={null}><LeavePlan /></Suspense>
                      </ProtectedRoute>
                    ),
                  },
                 
                  {
                    path: "leaves",
                    element: (
                      <ProtectedRoute entity="view_leaves">
                        <Leaves />
                      </ProtectedRoute>
                    ),
                  },
                  { path: "prepayments", element: <Navigate to="/dashboard/finance/staff-expenses" replace /> },
                  
                  {
                    path: "departments",
                    element: (
                      <ProtectedRoute entity="view_departments">
                        <Departments />
                      </ProtectedRoute>
                    ),
                  },

                  {
                    path: "performance",
                    children: [
                      {
                        index: true,
                        element: (
                          <ProtectedRoute entity={PERFORMANCE_USERS}>
                            <Suspense fallback={null}><PerformanceOverview /></Suspense>
                          </ProtectedRoute>
                        ),
                      },
                      {
                        path: "templates",
                        element: (
                          <ProtectedRoute entity="manage_appraisals">
                            <Suspense fallback={null}><TemplateEditor /></Suspense>
                          </ProtectedRoute>
                        ),
                      },
                      {
                        path: "appraisals/:appraisalId",
                        element: (
                          <ProtectedRoute entity={PERFORMANCE_USERS}>
                            <Suspense fallback={null}><AppraisalPage /></Suspense>
                          </ProtectedRoute>
                        ),
                      },
                      {
                        path: "new",
                        element: (
                          <ProtectedRoute entity="create_employee_perfomance">
                            <PerfomanceForm />
                          </ProtectedRoute>
                        ),
                      },
                      {
                        path: ":performanceId",
                        element: (
                          <ProtectedRoute entity="update_employee_perfomance">
                            <PerfomanceForm />
                          </ProtectedRoute>
                        ),
                      },
                    ],
                  },
                  {
                    path: "payroll",
                    children: [
                      {
                        index: true,
                        element: (
                          <ProtectedRoute entity="view_payrolls">
                            <Suspense fallback={null}><PayrollRuns /></Suspense>
                          </ProtectedRoute>
                        ),
                      },
                      {
                        path: "create",
                        element: (
                          <ProtectedRoute entity="create_payroll">
                            <Suspense fallback={null}><PayrollRuns /></Suspense>
                          </ProtectedRoute>
                        ),
                      },

                      {
                        path: "salaries",
                        element: (
                          <ProtectedRoute entity={["manage_salaries", "create_payroll"]}>
                            <Suspense fallback={null}><SalaryStructures /></Suspense>
                          </ProtectedRoute>
                        ),
                      },
                      {
                        path: "loans",
                        element: (
                          <ProtectedRoute entity={["create_payroll", "approve_payroll"]}>
                            <Suspense fallback={null}><StaffLoans /></Suspense>
                          </ProtectedRoute>
                        ),
                      },
                      {
                        path: ":payrollId",
                        element: (
                          <ProtectedRoute entity="view_payroll_details">
                            <Suspense fallback={null}><PayrollRun /></Suspense>
                          </ProtectedRoute>
                        ),
                      },
                    ],
                  },
                ],
              },
              {
                path: "attendance",
                children: [
                  {
                    path: "attendance-logs",
                    element: (
                      <ProtectedRoute entity="view_attendance_logs">
                        <AttendaceLogs />
                      </ProtectedRoute>
                    ),
                  },
                  {
                    path: "attendance-report",
                    element: (
                      <ProtectedRoute entity="view_attendace_report">
                        <AttendanceReport />
                      </ProtectedRoute>
                    ),
                  },
                ],
              },

              {
                path: "finance",
                children: [
                  // the old floats are now cash books (Bank & cash); petty cash requests are staff expenses
                  { path: "petty-cash-accounts", element: <Navigate to="/dashboard/treasury/accounts" replace /> },
                  { path: "petty-cash-accounts/:accountId", element: <Navigate to="/dashboard/treasury/accounts" replace /> },
                  { path: "petty-cash-requests", element: <Navigate to="/dashboard/finance/staff-expenses" replace /> },
                  { path: "staff-expenses", element: <ProtectedRoute entity={EXPENSE_USERS}><StaffExpenses /></ProtectedRoute> },
                  { path: "staff-expenses/:expenseId", element: <ProtectedRoute entity={EXPENSE_USERS}><StaffExpenseDetail /></ProtectedRoute> },
                  {
                    path: "carmanagement",
                    element: (
                      <ProtectedRoute entity="view_petty_cash_requests">
                        <CarManagement />
                      </ProtectedRoute>
                    ),
                  },
                ],
              },
              {
                path: "reports",
                children: [
                  { path: "statements", element: <ProtectedRoute entity={STATEMENT_USERS}><FinancialStatements /></ProtectedRoute> },
                  { path: "donor", element: <ProtectedRoute entity={STATEMENT_USERS}><DonorReport /></ProtectedRoute> },
                  { path: "executive", element: <ProtectedRoute entity={STATEMENT_USERS}><ExecutiveDashboard /></ProtectedRoute> },
                  { path: "expense-reports", element: <Navigate to="/dashboard/finance/staff-expenses?view=categories" replace /> },
                  {
                    path: "employee-timesheet",
                    element: (
                      <ProtectedRoute entity="view_employee_timesheet">
                        <EmployeeTimesheet />
                      </ProtectedRoute>
                    ),
                  },
                  {
                    path: "timesheet-report",
                    element: (
                      <ProtectedRoute entity="view_timesheet_report">
                        <TimesheetReport />
                      </ProtectedRoute>
                    ),
                  },
                ],
              },
              {
                path: "other",
                children: [
                  {
                    path: "assets-allocation",
                    element: (
                      <ProtectedRoute entity="view_assets_allocations">
                        <AssetsAllocation />
                      </ProtectedRoute>
                    ),
                  },
                ],
              },
              {
                path: "procurement",
                children: [
                  {
                    index: true,
                    element: (
                      <ProtectedRoute entity="view_procurement_dashboard">
                        <ProcurementDashboard />
                      </ProtectedRoute>
                    ),
                  },
                  {
                    path: "requisitions",
                    element: (
                      <ProtectedRoute entity={PROCUREMENT_USERS}>
                        <Requisitions />
                      </ProtectedRoute>
                    ),
                  },
                  {
                    path: "requisitions/new",
                    element: (
                      <ProtectedRoute entity="create_purchase_requisition">
                        <RequisitionForm />
                      </ProtectedRoute>
                    ),
                  },
                  {
                    path: "requisitions/:requisitionId",
                    element: (
                      <ProtectedRoute entity={PROCUREMENT_USERS}>
                        <RequisitionDetail />
                      </ProtectedRoute>
                    ),
                  },
                  {
                    path: "requisitions/:requisitionId/edit",
                    element: (
                      <ProtectedRoute entity="create_purchase_requisition">
                        <RequisitionForm />
                      </ProtectedRoute>
                    ),
                  },
                  {
                    path: "approvals",
                    element: (
                      <ProtectedRoute entity={PROCUREMENT_USERS}>
                        <Requisitions defaultView="awaiting" />
                      </ProtectedRoute>
                    ),
                  },
                  {
                    path: "suppliers",
                    element: (
                      <ProtectedRoute entity={SUPPLIER_USERS}>
                        <Suppliers />
                      </ProtectedRoute>
                    ),
                  },
                  {
                    path: "suppliers/:supplierId",
                    element: (
                      <ProtectedRoute entity={SUPPLIER_USERS}>
                        <SupplierDetail />
                      </ProtectedRoute>
                    ),
                  },
                  {
                    path: "bank-changes/:changeId",
                    element: (
                      <ProtectedRoute entity={[...SUPPLIER_USERS, "approve_suppliers"]}>
                        <BankChangeDetail />
                      </ProtectedRoute>
                    ),
                  },
                  {
                    path: "rfqs",
                    element: (
                      <ProtectedRoute entity={RFQ_USERS}>
                        <Rfqs />
                      </ProtectedRoute>
                    ),
                  },
                  {
                    path: "rfqs/:rfqId",
                    element: (
                      <ProtectedRoute entity={RFQ_USERS}>
                        <RfqDetail />
                      </ProtectedRoute>
                    ),
                  },
                  {
                    path: "purchase-orders",
                    element: (
                      <ProtectedRoute entity={PO_USERS}>
                        <PurchaseOrders />
                      </ProtectedRoute>
                    ),
                  },
                  {
                    path: "purchase-orders/:poId",
                    element: (
                      <ProtectedRoute entity={PO_USERS}>
                        <PurchaseOrderDetail />
                      </ProtectedRoute>
                    ),
                  },
                  {
                    path: "purchase-orders/:poId/receive",
                    element: (
                      <ProtectedRoute entity="receive_goods">
                        <ReceiveDelivery />
                      </ProtectedRoute>
                    ),
                  },
                  {
                    path: "receipts",
                    element: (
                      <ProtectedRoute entity={PO_USERS}>
                        <GoodsReceipts />
                      </ProtectedRoute>
                    ),
                  },
                  {
                    path: "inventory",
                    element: (
                      <ProtectedRoute entity={INVENTORY_USERS}>
                        <Inventory />
                      </ProtectedRoute>
                    ),
                  },
                  {
                    path: "returns",
                    element: (
                      <ProtectedRoute entity={PO_USERS}>
                        <Returns />
                      </ProtectedRoute>
                    ),
                  },
                  {
                    path: "returns/:returnId",
                    element: (
                      <ProtectedRoute entity={PO_USERS}>
                        <ReturnDetail />
                      </ProtectedRoute>
                    ),
                  },
                  {
                    path: "contracts",
                    element: (
                      <ProtectedRoute entity={CONTRACT_USERS}>
                        <Contracts />
                      </ProtectedRoute>
                    ),
                  },
                  {
                    path: "contracts/:contractId",
                    element: (
                      <ProtectedRoute entity={CONTRACT_USERS}>
                        <ContractDetail />
                      </ProtectedRoute>
                    ),
                  },
                  {
                    path: "plans",
                    element: (
                      <ProtectedRoute entity={PLAN_USERS}>
                        <Plans />
                      </ProtectedRoute>
                    ),
                  },
                  {
                    path: "plans/:planId",
                    element: (
                      <ProtectedRoute entity={PLAN_USERS}>
                        <PlanDetail />
                      </ProtectedRoute>
                    ),
                  },
                  {
                    path: "reports",
                    element: (
                      <ProtectedRoute entity={REPORT_USERS}>
                        <ProcurementReports />
                      </ProtectedRoute>
                    ),
                  },
                  {
                    path: "workflows",
                    element: (
                      <ProtectedRoute entity="manage_approval_workflows">
                        <ApprovalWorkflows />
                      </ProtectedRoute>
                    ),
                  },
                  {
                    path: "settings",
                    element: (
                      <ProtectedRoute entity="manage_procurement_settings">
                        <ProcurementSettings />
                      </ProtectedRoute>
                    ),
                  },
                ],
              },
              {
                path: "finance",
                children: [
                  {
                    path: "invoices",
                    element: (
                      <ProtectedRoute entity={INVOICE_USERS}>
                        <Invoices />
                      </ProtectedRoute>
                    ),
                  },
                  {
                    path: "invoices/:invoiceId",
                    element: (
                      <ProtectedRoute entity={INVOICE_USERS}>
                        <InvoiceDetail />
                      </ProtectedRoute>
                    ),
                  },
                  {
                    path: "payments",
                    element: (
                      <ProtectedRoute entity={[...INVOICE_USERS, "view_payment_vouchers"]}>
                        <Payments />
                      </ProtectedRoute>
                    ),
                  },
                  { path: "journals", element: <ProtectedRoute entity={LEDGER_USERS}><Journals /></ProtectedRoute> },
                  { path: "journals/new", element: <ProtectedRoute entity="manage_journals"><JournalEditor /></ProtectedRoute> },
                  { path: "journals/:journalId", element: <ProtectedRoute entity={LEDGER_USERS}><JournalDetail /></ProtectedRoute> },
                  { path: "journals/:journalId/edit", element: <ProtectedRoute entity="manage_journals"><JournalEditor /></ProtectedRoute> },
                  { path: "recurring-journals", element: <ProtectedRoute entity={LEDGER_USERS}><RecurringJournals /></ProtectedRoute> },
                  { path: "trial-balance", element: <ProtectedRoute entity={LEDGER_REPORT_USERS}><TrialBalance /></ProtectedRoute> },
                  { path: "trial-balance/:accountId", element: <ProtectedRoute entity={LEDGER_REPORT_USERS}><AccountLedger /></ProtectedRoute> },
                  { path: "periods", element: <ProtectedRoute entity={LEDGER_REPORT_USERS}><PeriodClose /></ProtectedRoute> },
                  { path: "vouchers", element: <ProtectedRoute entity={VOUCHER_USERS}><Vouchers /></ProtectedRoute> },
                  { path: "vouchers/new", element: <ProtectedRoute entity="manage_payment_vouchers"><VoucherForm /></ProtectedRoute> },
                  { path: "vouchers/:voucherId", element: <ProtectedRoute entity={VOUCHER_USERS}><VoucherDetail /></ProtectedRoute> },
                  { path: "vouchers/:voucherId/edit", element: <ProtectedRoute entity="manage_payment_vouchers"><VoucherForm /></ProtectedRoute> },
                  { path: "reports", element: <ProtectedRoute entity={["view_payment_vouchers", "manage_payment_vouchers", "view_invoices", "export_invoices"]}><PayablesReports /></ProtectedRoute> },
                  {
                    path: "budgets",
                    element: <Navigate to="/dashboard/budget" replace />,
                  },
                ],
              },
              {
                path: "treasury",
                children: [
                  { index: true, element: <ProtectedRoute entity={TREASURY_USERS}><TreasuryOverview /></ProtectedRoute> },
                  { path: "accounts", element: <ProtectedRoute entity={TREASURY_USERS}><BankAccounts /></ProtectedRoute> },
                  { path: "accounts/:accountId", element: <ProtectedRoute entity={TREASURY_USERS}><AccountDetail /></ProtectedRoute> },
                  { path: "receipts", element: <ProtectedRoute entity={TREASURY_USERS}><Receipts /></ProtectedRoute> },
                  { path: "receipts/:receiptId", element: <ProtectedRoute entity={TREASURY_USERS}><ReceiptDetail /></ProtectedRoute> },
                  { path: "transfers", element: <ProtectedRoute entity={TREASURY_USERS}><Transfers /></ProtectedRoute> },
                  { path: "salaries", element: <ProtectedRoute entity={["mark_payroll_paid"]}><SalaryPayments /></ProtectedRoute> },
                  { path: "transfers/:transferId", element: <ProtectedRoute entity={TREASURY_USERS}><TransferDetail /></ProtectedRoute> },
                  { path: "statements", element: <ProtectedRoute entity={TREASURY_USERS}><Statements /></ProtectedRoute> },
                  { path: "statements/:statementId", element: <ProtectedRoute entity={TREASURY_USERS}><StatementDetail /></ProtectedRoute> },
                  { path: "reconcile/:accountId", element: <ProtectedRoute entity={TREASURY_USERS}><Reconcile /></ProtectedRoute> },
                  { path: "reconciliations", element: <ProtectedRoute entity={TREASURY_USERS}><Reconciliations /></ProtectedRoute> },
                  { path: "reconciliations/:recId", element: <ProtectedRoute entity={TREASURY_USERS}><ReconciliationDetail /></ProtectedRoute> },
                  { path: "reports", element: <ProtectedRoute entity={TREASURY_USERS}><TreasuryReports /></ProtectedRoute> },
                ],
              },
              {
                path: "security/audit-log",
                element: (
                  <ProtectedRoute entity="view_audit_logs">
                    <AuditLog />
                  </ProtectedRoute>
                ),
              },
              {
                path: "budget",
                children: [
                  { path: "", element: <ProtectedRoute entity={["view_budgets", "manage_budgets"]}><BudgetOverview /></ProtectedRoute> },
                  { path: "budgets", element: <ProtectedRoute entity={BUDGET_USERS}><BudgetList /></ProtectedRoute> },
                  { path: "budgets/:budgetId", element: <ProtectedRoute entity={BUDGET_USERS}><BudgetDetail /></ProtectedRoute> },
                  { path: "revisions", element: <ProtectedRoute entity={BUDGET_USERS}><BudgetRevisions /></ProtectedRoute> },
                  { path: "revisions/:revisionId", element: <ProtectedRoute entity={BUDGET_USERS}><RevisionDetail /></ProtectedRoute> },
                  { path: "reports", element: <ProtectedRoute entity={["view_budgets", "manage_budgets"]}><BudgetReports /></ProtectedRoute> },
                ],
              },
              {
                path: "approvals",
                element: (
                  <ProtectedRoute entity={APPROVAL_USERS}>
                    <ApprovalsInbox />
                  </ProtectedRoute>
                ),
              },
              {
                path: "admin",
                children: [
                  {
                    path: "users",
                    element: (
                      <ProtectedRoute entity={ADMIN_USERS}>
                        <UsersSecurity />
                      </ProtectedRoute>
                    ),
                  },
                  {
                    path: "permissions",
                    element: (
                      <ProtectedRoute entity={MATRIX_USERS}>
                        <PermissionMatrix />
                      </ProtectedRoute>
                    ),
                  },
                  {
                    path: "delegations",
                    element: (
                      <ProtectedRoute entity={DELEGATION_USERS}>
                        <Delegations />
                      </ProtectedRoute>
                    ),
                  },
                  {
                    path: "health",
                    element: (
                      <ProtectedRoute entity={"view_system_health"}>
                        <SystemHealth />
                      </ProtectedRoute>
                    ),
                  },
                ],
              },
              {
                path: "setup",
                children: [
                  {
                    path: "fiscal-years",
                    element: (
                      <ProtectedRoute entity={MASTER_DATA_USERS}>
                        <FiscalYears />
                      </ProtectedRoute>
                    ),
                  },
                  {
                    path: "accounts",
                    element: (
                      <ProtectedRoute entity={MASTER_DATA_USERS}>
                        <ChartOfAccounts />
                      </ProtectedRoute>
                    ),
                  },
                  {
                    path: "funding-sources",
                    element: (
                      <ProtectedRoute entity={MASTER_DATA_USERS}>
                        <FundingSources />
                      </ProtectedRoute>
                    ),
                  },
                  {
                    path: "projects",
                    element: (
                      <ProtectedRoute entity={MASTER_DATA_USERS}>
                        <SetupProjects />
                      </ProtectedRoute>
                    ),
                  },
                  {
                    path: "cost-centres",
                    element: (
                      <ProtectedRoute entity={MASTER_DATA_USERS}>
                        <CostCentres />
                      </ProtectedRoute>
                    ),
                  },
                  {
                    path: "tax-rates",
                    element: (
                      <ProtectedRoute entity={["view_master_data", "manage_payroll_settings"]}>
                        <TaxRates />
                      </ProtectedRoute>
                    ),
                  },
                  {
                    path: "posting-accounts",
                    element: (
                      <ProtectedRoute entity={[...MASTER_DATA_USERS, "manage_chart_of_accounts"]}>
                        <PostingAccounts />
                      </ProtectedRoute>
                    ),
                  },
                  {
                    path: "strategic-objectives",
                    element: (
                      <ProtectedRoute entity={MASTER_DATA_USERS}>
                        <StrategicObjectives />
                      </ProtectedRoute>
                    ),
                  },
                  {
                    path: "approval-limits",
                    element: (
                      <ProtectedRoute entity={["manage_approval_workflows", "view_master_data", "view_security_admin"]}>
                        <ApprovalLimits />
                      </ProtectedRoute>
                    ),
                  },
                ],
              },
              {
                path: "assets",
                children: [
                  { index: true, element: <ProtectedRoute entity={ASSET_USERS}><AssetsOverview /></ProtectedRoute> },
                  { path: "register", element: <ProtectedRoute entity={ASSET_DEPT_USERS}><AssetRegister /></ProtectedRoute> },
                  { path: "register/:assetId", element: <ProtectedRoute entity={ASSET_DEPT_USERS}><AssetDetail /></ProtectedRoute> },
                  { path: "transfers", element: <ProtectedRoute entity={ASSET_DEPT_USERS}><AssetTransfers /></ProtectedRoute> },
                  { path: "disposals", element: <ProtectedRoute entity={ASSET_USERS}><AssetDisposals /></ProtectedRoute> },
                  { path: "disposals/:disposalId", element: <ProtectedRoute entity={ASSET_USERS}><DisposalDetail /></ProtectedRoute> },
                  { path: "depreciation", element: <ProtectedRoute entity={ASSET_USERS}><DepreciationRuns /></ProtectedRoute> },
                  { path: "depreciation/:runId", element: <ProtectedRoute entity={ASSET_USERS}><DepreciationRunDetail /></ProtectedRoute> },
                  { path: "counts", element: <ProtectedRoute entity={ASSET_USERS}><AssetCounts /></ProtectedRoute> },
                  { path: "counts/:countId", element: <ProtectedRoute entity={ASSET_USERS}><AssetCountDetail /></ProtectedRoute> },
                  { path: "categories", element: <ProtectedRoute entity={ASSET_USERS}><AssetCategories /></ProtectedRoute> },
                  { path: "types", element: <Navigate to="/dashboard/assets/categories" replace /> },
                  { path: "reports", element: <ProtectedRoute entity={ASSET_USERS}><AssetReports /></ProtectedRoute> },
                  { path: "requests", element: <ProtectedRoute entity={["manage_fixed_assets", "reject_or_approve_assets_requests", "view_all_assets_requests"]}><EquipmentRequests /></ProtectedRoute> },
                ],
              },
              {
                path: "settings",
                children: [
                  {
                    path: "general-settings",
                    element: (
                      <ProtectedRoute entity={SETTINGS_USERS}>
                        <Settings />
                      </ProtectedRoute>
                    ),
                    children: [
                      {
                        index: true,
                        element: (
                          <ProtectedRoute entity="access_general_settings">
                            <GeneralSettongs />
                          </ProtectedRoute>
                        ),
                      },
                      {
                        path: "payroll",
                        element: (
                          <ProtectedRoute entity={["manage_payroll_settings", "access_general_settings"]}>
                            <Suspense fallback={null}><PayrollTaxSettings /></Suspense>
                          </ProtectedRoute>
                        ),
                      },
                      {
                        path: "attendance",
                        element: (
                          <ProtectedRoute entity="access_general_settings">
                            <AttendaceSettings />
                          </ProtectedRoute>
                        ),
                      },
                      {
                        path: "smtp",
                        element: (
                          <ProtectedRoute entity="access_general_settings">
                            <SmtpSettings />
                          </ProtectedRoute>
                        ),
                      },
                      {
                        path: "branches",
                        element: (
                          <ProtectedRoute entity="access_general_settings">
                            <Branches />
                          </ProtectedRoute>
                        ),
                      },
                      {
                        path: "leaves",
                        element: (
                          <ProtectedRoute entity={["manage_leave_policy", "access_general_settings"]}>
                            <Suspense fallback={null}><LeavePolicySettings /></Suspense>
                          </ProtectedRoute>
                        ),
                      },
                      {
                        // Roles are now changed through the permission matrix (two-person confirmation).
                        path: "roles-permissions/*",
                        element: <Navigate to="/dashboard/admin/permissions" replace />,
                      },
                    {
                        path: "procurement",
                        element: (
                          <ProtectedRoute entity="manage_procurement_settings">
                            <ProcurementSettings embedded />
                          </ProtectedRoute>
                        ),
                      },
                      {
                        path: "approval-workflows",
                        element: (
                          <ProtectedRoute entity={["manage_approval_workflows", "view_security_admin"]}>
                            <ApprovalWorkflows embedded />
                          </ProtectedRoute>
                        ),
                      },
                    ],
                  },
                  {
                    path: "account-settings",
                    element: <AccountSettings />,
                  },
                ],
              },
              {
                path: "*",
                element: <PageNotFound />,
              },
            ],
          },
        ],
      },
      {
        path: "*",
        element: <PageNotFound />,
      },
    ],
  },
]);

export default router;
