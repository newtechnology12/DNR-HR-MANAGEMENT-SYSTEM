import { useAuth } from "@/context/auth.context";
import { cn } from "@/utils/cn";
import { Users, LogOut, PenTool } from "react-feather";
import { AiOutlineShop } from "react-icons/ai";
import { Link, useLocation } from "react-router-dom";
import { Fragment, useMemo, useState } from "react";
import Avatar from "./shared/Avatar";
import { IoWalletOutline } from "react-icons/io5";
import { ScrollArea } from "@/components/ui/scroll-area";
import { LuLayoutGrid } from "react-icons/lu";
import ProfileDropdown from "./ProfileDropdown";
import LogoutModal from "./modals/LogoutModal";
import useModalState from "@/hooks/useModalState";
import {
  AlignEndHorizontal,
  Blocks,
  CandlestickChart,
  CircleDollarSign,
  Container,
  Layout,
  ListChecks,
  Settings,
  Split,
  UserCog,
} from "lucide-react";
import { useRoles } from "@/context/roles.context";
import { BiPurchaseTagAlt } from "react-icons/bi";
import { AiOutlineFileText, AiOutlineFileDone } from "react-icons/ai";




const getRoles = (entity, roles = []) => {
  console.log(`Checking roles for entity: ${entity}`);
  if (entity === "view_fileManager") {
    // Temporarily allow all roles to access view_fileManager for development purposes
    return roles;
  }
  const filteredRoles = roles.filter((e) =>
    e?.permitions?.find((perm) => perm.name === entity && perm.access === true)
  );
  console.log(`Filtered roles for entity ${entity}:`, filteredRoles);
  return filteredRoles;
};

export default function DashboardSidebar() {
  const { user }: any = useAuth();
  const { roles = [] }: any = useRoles(); // Provide a default empty array for roles
  console.log('User:', user);
  console.log('Roles:', roles);

  const groupLinks: any = useMemo(
    () =>
      roles && user
        ? [
            {
              name: "Menu",
              children: [
                {
                  name: "Dashboard Overview",
                  icon: LuLayoutGrid,
                  link: "/dashboard",
                  roles: getRoles("view_dashboard", roles),
                },
                // {
                //   name: "Weekly Plan",
                //   icon: AiOutlineShop,
                //   link: "/dashboard/weeklyplane",
                //   roles: ["*"],
                // },
                // {
                //   name: "Dnr-Clients",
                //   icon: AiOutlineShop,
                //   link: "/dashboard/clients",
                //   roles: ["*"],
                // },            
                
              ],
            },
            {
              name: "Portals",
              children: [
                {
                  name: "Employee portal",
                  icon: AiOutlineShop,
                  link: "/dashboard/employee-portal",
                  roles: getRoles("access_employee_portal", roles),
                },

                {
                  name: "DNR File Management",
                  icon: AiOutlineShop,
                  link: "Dnr-Material",
                  roles: getRoles("view_fileManager", roles),
                },
                // {
                //   name: "Request Cash",
                //   icon: AiOutlineShop,
                //   link: "/dashboard/RequestCash",
                //   roles: getRoles("access_employee_portal", roles),
                // },
                {
                  name: "Leave Management",
                  icon: AiOutlineShop,
                  link: "/dashboard/AddReason",
                  roles: getRoles("access_employee_portal", roles),
                },
                // {
                //   name: "Add Reason",
                //   icon: AiOutlineShop,
                //   link: "/dashboard/AddReason",
                //   roles: getRoles("access_employee_portal", roles),
                // },
                                    
              ],
            },
            {
              name: "HR Management",
              children: [
                {
                  name: "Employees",
                  icon: Users,
                  link: "/dashboard/hr/employees",
                  roles: getRoles("view_employees", roles),
                },
                {
                  name: "Departments",
                  icon: Layout,
                  link: "/dashboard/hr/departments",
                  roles: getRoles("view_departments", roles),
                },
                {
                  name: "Designations",
                  icon: Split,
                  link: "/dashboard/hr/designations",
                  roles: getRoles("view_designations", roles),
                },
                {
                  name: "Leaves & Holidays",
                  icon: LogOut,
                  link: "/dashboard/hr/leaves",
                  roles: getRoles("view_leaves", roles),
                },
                {
                  name: "Payroll",
                  icon: IoWalletOutline,
                  link: "/dashboard/hr/payroll",
                  roles: getRoles("view_payrolls", roles),
                },
                {
                  name: "Expense Request",
                  icon: CircleDollarSign,
                  link: "/dashboard/hr/prepayments",
                  roles: getRoles("view_employee_prepayments", roles),
                },
                {
                  name: "Performance & Appraisals",
                  icon: CandlestickChart,
                  link: "/dashboard/hr/performance",
                  roles: getRoles("view_employee_perfomances", roles),
                },
              ],
            },
            {
              name: "attendance",
              children: [
                {
                  name: "Attendance Daily logs",
                  icon: ListChecks,
                  link: "/dashboard/attendance/attendance-logs",
                  roles: getRoles("view_attendance_logs", roles),
                },
                {
                  name: "Attendance Report",
                  icon: AlignEndHorizontal,
                  link: "/dashboard/attendance/attendance-report",
                  roles: getRoles("view_attendace_report", roles),
                },
              ],
            },

            {
              name: "Finance",
              children: [
                {
                  name: "Petty Cash Requisition",
                  icon: BiPurchaseTagAlt,
                  link: "/dashboard/finance/petty-cash-requisition",
                  roles: getRoles("view_petty_cash_requisition", roles),
                  
                },
                {
                  name: "Petty Cash Account",
                  icon: Container,
                  link: "/dashboard/finance/petty-cash-account",
                  roles: getRoles("view_petty_cash_account", roles),
                 
                },
                {
                  name: "Expense Reports",
                  icon: Blocks,
                  link: "/dashboard/finance/expense-reports",
                  roles: getRoles("view_expense_reports", roles),
                  
                },
                {
                  name: "Budget Management",
                  icon: Blocks,
                  link: "/dashboard/finance/budget-management",
                  roles: getRoles("view_budget_management", roles),
                  
                },
                {
                  name: "Financial Statements",
                  icon: Blocks,
                  link: "/dashboard/finance/financial-statements",
                  roles: getRoles("view_financial_statements", roles),
                  
                },
              ],
            },

            {
              name: "Company Activities",
              children: [
                {
                  name: "Weekly Plan",
                  icon: AiOutlineShop,
                  link: "weeklyplane",
                  roles: getRoles("weeklyplane", roles),
                },
                // {
                //   name: "Audit Department",
                //   icon: Users,
                //   children: [
                //     {
                //       name: "Tasks",
                //       icon: AiOutlineFileText,
                //       link: "tasks",
                //       roles: getRoles("view_tasks", roles),
                //     },
                //     {
                //       name: "Reports",
                //       icon: AiOutlineFileDone,
                //       link: "reports",
                //       roles: getRoles("view_reports", roles),
                //     },
                //   ],
                //   roles: getRoles("view_employees", roles),
                // },
                // {
                //   name: "Tax Advisory",
                //   icon: Layout,
                //   children: [
                //     {
                //       name: "Tasks",
                //       icon: AiOutlineFileText,
                //       link: "/dashboard/hr/departments/tasks",
                //       roles: getRoles("view_tasks", roles),
                //     },
                //     {
                //       name: "Reports",
                //       icon: AiOutlineFileDone,
                //       link: "/dashboard/hr/departments/reports",
                //       roles: getRoles("view_reports", roles),
                //     },
                //   ],
                //   roles: getRoles("view_departments", roles),
                // },
                // {
                //   name: "Consultancy",
                //   icon: Split,
                //   children: [
                //     {
                //       name: "Tasks",
                //       icon: AiOutlineFileText,
                //       link: "/dashboard/hr/designations/tasks",
                //       roles: getRoles("view_tasks", roles),
                //     },
                //     {
                //       name: "Reports",
                //       icon: AiOutlineFileDone,
                //       link: "/dashboard/hr/designations/reports",
                //       roles: getRoles("view_reports", roles),
                //     },
                //   ],
                //   roles: getRoles("view_designations", roles),
                // },
              ],
            },
            {
              name: "Assets Management",
              children: [
                {
                  name: "Assets categories",
                  icon: BiPurchaseTagAlt,
                  link: "/dashboard/assets/categories",
                  roles: getRoles("view_assets_categories", roles),
                },
                {
                  name: "Assets types",
                  icon: Container,
                  link: "/dashboard/assets/types",
                  roles: getRoles("view_assets_types", roles),
                },
              ],
            },
           
            {
              name: "Settings",
              children: [
                {
                  name: "General settings",
                  icon: Settings,
                  link: "/dashboard/settings/general-settings",
                  roles: getRoles("access_general_settings", roles),
                },
                {
                  name: "Account Settings",
                  icon: UserCog,
                  link: "/dashboard/settings/account-settings",
                  roles: ["*"],
                },
              ],
            },
          ].map((e) => {
            return {
              ...e,
              children: Array.isArray(e.children)
                ? e.children.filter(
                    (child) =>
                      child.roles?.find((role) => role?.id === user?.role?.id) ||
                      child.roles[0] === "*"
                  )
                : [],
            };
          })
        : [],
    [roles, user]
  );

  const location = useLocation();

  const [showProfile, setshowProfile] = useState(false);

  const logoutModal = useModalState();
  return (
    <Fragment>
      {user && (
        <div className="fixed z-50 flex flex-col border-r border-slate-200 h-dvh w-[280px] bg-white ">
          <div className="px-4 py-1">
            <Link to={"/dashboard"}>
              <img className="h-9 mb-2" src="/dnr_log.png" alt="" />
            </Link>
          </div>

          <ScrollArea className="h-full w-full border-t pt-1 border-slate-200 max-h-[90vh]">
            {groupLinks
              .filter((e) => {
                return e.children?.length;
              })
              .map((group, index) => {
                return (
                  <div key={index}>
                    <h1 className="px-3 tracking-wide py-2 text-[11.5px] font-medium text-slate-500 uppercase">
                      {group.name}
                    </h1>
                    <div className="border-t- mx-2 border-slate-200">
                      {group.children.map((link, index) => {
                        const linkToUse = link.link;
                        const baseSidebarPath = location.pathname
                          .split("/")
                          .slice(0, 4)
                          .join("/");
                        return (
                          <Link
                            to={linkToUse}
                            key={index}
                            {...link.props}
                            className={cn(
                              "px-3 py-3 my-1 cursor-pointer text-[13.5px] border-transparent border font-medium text-slate-700 capitalize flex items-center gap-4 ",
                              {
                                "bg-primary border text-white rounded-sm border-primary border-opacity-20":
                                  baseSidebarPath === linkToUse,
                                "hover:bg-slate-100":
                                  baseSidebarPath !== linkToUse,
                              }
                            )}
                          >
                            <link.icon className="text-base" size={18} />
                            <span>{link.name}</span>
                          </Link>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
          </ScrollArea>

          <div className="border-t  relative border-slate-200 shadow-md">
            <ProfileDropdown
              onLogout={() => {
                logoutModal.open();
              }}
              close={() => setshowProfile(false)}
              open={showProfile}
            />
            <div className="flex px-[6px] py-[6px] gap-2">
              <div
                onClick={() => {
                  setshowProfile(true);
                }}
                className="hover:bg-slate-100 px-[6px] hover:bg-opacity-60 cursor-pointer hover:border-slate-200 rounded-sm border border-transparent py-[6px] items-center justify-between w-full flex "
              >
                <div className="flex items-center gap-2">
                  <Avatar name={user?.names || ""} path={user?.photo} />
                  <div className="space-y-[2px]">
                    <h4 className="text-[13px] font-semibold capitalize text-slate-700">
                      {user?.names}
                    </h4>
                    <p className="text-[12px]  text-slate-500 capitalize font-medium">
                      {user?.role?.name}
                    </p>
                  </div>
                </div>
                <a
                  onClick={(e) => {
                    e.preventDefault();
                    setshowProfile(!showProfile);
                  }}
                  className="h-8 w-8 border border-transparent hover:border-slate-200 cursor-pointer hover:bg-slate-100 rounded-sm flex justify-center items-center"
                >
                  <svg
                    width="20"
                    height="20"
                    viewBox="0 0 20 20"
                    fill="none"
                    className="text-slate-400 fill-current"
                    xmlns="http://www.w3.org/2000/svg"
                  >
                    <path d="M15.1029 7.30379C15.3208 7.5974 15.2966 8.01406 15.0303 8.28033C14.7374 8.57322 14.2626 8.57322 13.9697 8.28033L10 4.31066L6.03033 8.28033L5.94621 8.35295C5.6526 8.5708 5.23594 8.5466 4.96967 8.28033C4.67678 7.98744 4.67678 7.51256 4.96967 7.21967L9.46967 2.71967L9.55379 2.64705C9.8474 2.4292 10.2641 2.4534 10.5303 2.71967L15.0303 7.21967L15.1029 7.30379ZM4.89705 12.6962C4.6792 12.4026 4.7034 11.9859 4.96967 11.7197C5.26256 11.4268 5.73744 11.4268 6.03033 11.7197L10 15.6893L13.9697 11.7197L14.0538 11.6471C14.3474 11.4292 14.7641 11.4534 15.0303 11.7197C15.3232 12.0126 15.3232 12.4874 15.0303 12.7803L10.5303 17.2803L10.4462 17.3529C10.1526 17.5708 9.73594 17.5466 9.46967 17.2803L4.96967 12.7803L4.89705 12.6962Z" />
                  </svg>
                </a>
              </div>
            </div>
          </div>
        </div>
      )}

      <LogoutModal
        onClose={() => logoutModal.close()}
        open={logoutModal.isOpen}
      />
    </Fragment>
  );
}