import { Outlet, createBrowserRouter } from "react-router-dom";
import App from "@/App";
import DashboardLayout from "@/layouts/DashboardLayout";
import PageNotFound from "@/pages/PageNotFound";
import { Login } from "./pages/Login";
import { ProtectedRoute } from "./components/ProtectedRoute";
import RootLayout from "./layouts/RootLayout";
import Dashboard from "./pages/dashboard/Dashboard";
import Roles from "./pages/dashboard/Roles";
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
import CreateOrUpdaterRole from "./pages/dashboard/CreateOrUpdaterRole";
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
import FileManager from "./pages/dashboard/FileManager";
import WeeklyPlans from "./pages/dashboard/WeeklyPlane";
import RequestCash from "./pages/dashboard/RequestCash";
import Tasks from "./pages/dashboard/Task";
import Reports from "./pages/dashboard/Report";
import ReasonFormModal from "./components/modals/ReasonFormModel";
import Reason from "./pages/dashboard/Reason";
import ClientManagement from "./pages/dashboard/clients";

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
                      path: "employees/tasks",
                      // element: <Tasks />,
                  },
                  {
                    path: "employees/reports",
                    // element: <Reports />,
                },
                {
                  path: "Dnr-Material",
                  element: <FileManager />,
              },
                  {
                    path: "weeklyplane",
                    element:<WeeklyPlans />                    
                  },

                  {
                    path: "clients",
                    element:<ClientManagement />                    
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
                          <ProtectedRoute entity="view_employee_perfomances">
                            <Performance />
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
                            <Payroll />
                          </ProtectedRoute>
                        ),
                      },
                      {
                        path: "create",
                        element: (
                          <ProtectedRoute entity="create_payroll">
                            <NewPayroll />
                          </ProtectedRoute>
                        ),
                      },
                     
                      {
                        path: ":payrollId",
                        element: (
                          <ProtectedRoute entity="view_payroll_details">
                            <PayrollDetails />
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
                ],
              },
              {
                path: "settings",
                children: [
                  {
                    path: "general-settings",
                    element: (
                      <ProtectedRoute entity="access_general_settings">
                        <Settings />
                      </ProtectedRoute>
                    ),
                    children: [
                      {
                        index: true,
                        element: <GeneralSettongs />,
                      },
                      {
                        path: "payroll",
                        element: <PayrollSettings />,
                      },
                      {
                        path: "attendance",
                        element: <AttendaceSettings />,
                      },
                      {
                        path: "smtp",
                        element: <SmtpSettings />,
                      },
                      {
                        path: "attendance",
                        element: <PayrollSettings />,
                      },
                      {
                        path: "branches",
                        element: <Branches />,
                      },
                      {
                        path: "leaves",
                        element: <LeavesSettings />,
                      },
                      {
                        path: "roles-permissions",
                        element: <Roles />,
                      },
                      {
                        path: "roles-permissions/new",
                        element: <CreateOrUpdaterRole />,
                      },
                      {
                        path: "roles-permissions/:roleId",
                        element: <CreateOrUpdaterRole />,
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