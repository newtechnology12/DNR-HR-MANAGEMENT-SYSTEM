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
import PrePayments from "./pages/dashboard/PrePayments";
import Performance from "./pages/dashboard/Performance";
import PerfomanceForm from "./pages/dashboard/PerfomanceForm";
import Designations from "./pages/dashboard/Designations";
import Assets from "./pages/dashboard/Assets";
import AssetsTypes from "./pages/dashboard/AssetsTypes";
import AssetsCategories from "./pages/dashboard/AssetsCategories";
// import FileManager from "./pages/dashboard/FileManager";
import WeeklyPlans from "./pages/dashboard/WeeklyPlane";
import RequestCash from "./pages/dashboard/RequestCash";
import Reason from "./pages/dashboard/Reason";
import ClientManagement from "./pages/dashboard/clients";
import Accounts from "./pages/dashboard/Accounts";
import AccountTransactions from "./components/AccountTransactions";
import PettyCashRequests from "./pages/dashboard/PettyCashRequests";
import ExpensesReport from "./pages/dashboard/ExpensesReport";
import AssetsRequests from "./pages/dashboard/AssetsRequests";
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
                        <EmployeePortal />
                      </ProtectedRoute>
                    ),
                  },
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
                  {
                    path: "prepayments",
                    element: (
                      <ProtectedRoute entity="view_employee_prepayments">
                        <PrePayments />
                      </ProtectedRoute>
                    ),
                  },
                  
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
                  {
                    path: "petty-cash-accounts",
                    element: (
                      <ProtectedRoute entity="view_petty_cash_accounts">
                        <Accounts />
                      </ProtectedRoute>
                    ),
                  },
                  {
                    path: "petty-cash-accounts/:accountId",
                    element: (
                      <ProtectedRoute entity="view_petty_cash_requests">
                        <AccountTransactions />
                      </ProtectedRoute>
                    ),
                  },
                  {
                    path: "petty-cash-requests",
                    element: (
                      <ProtectedRoute entity="view_petty_cash_requests">
                        <PettyCashRequests />
                      </ProtectedRoute>
                    ),
                  },
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
                  {
                    path: "expense-reports",
                    element: (
                      <ProtectedRoute entity="view_expense_reports">
                        <ExpensesReport />
                      </ProtectedRoute>
                    ),
                  },
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
                      <ProtectedRoute entity={INVOICE_USERS}>
                        <Payments />
                      </ProtectedRoute>
                    ),
                  },
                  {
                    path: "budgets",
                    element: <Navigate to="/dashboard/budget" replace />,
                  },
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
                  {
                    index: true,
                    element: (
                      <ProtectedRoute entity="view_assets">
                        <Assets />
                      </ProtectedRoute>
                    ),
                  },
                  {
                    path: "types",
                    element: (
                      <ProtectedRoute entity="view_assets_types">
                        <AssetsTypes />
                      </ProtectedRoute>
                    ),
                  },
                  {
                    path: "categories",
                    element: (
                      <ProtectedRoute entity="view_assets_categories">
                        <AssetsCategories />
                      </ProtectedRoute>
                    ),
                  },
                  {
                    path: "requests",
                    element: (
                      <ProtectedRoute entity="view_assets_requests">
                        <AssetsRequests />
                      </ProtectedRoute>
                    ),
                  },
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
