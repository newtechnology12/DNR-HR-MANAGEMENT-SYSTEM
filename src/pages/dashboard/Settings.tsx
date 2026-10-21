import BreadCrumb from "@/components/breadcrumb";
import { Card } from "@/components/ui/card";
import { cn } from "@/utils";
import { Link, Navigate, Outlet, useLocation } from "react-router-dom";
import { usePermissions } from "@/context/auth.context";

export default function Settings() {
  const pathname = useLocation().pathname;
  const { can } = usePermissions();
  const GENERAL = "access_general_settings";
  const tabs = [
    { title: "general Settings", path: "/dashboard/settings/general-settings", permission: GENERAL },
    { title: "attendance settings", path: "/dashboard/settings/general-settings/attendance", permission: GENERAL },
    { title: "leave policy", path: "/dashboard/settings/general-settings/leaves", permission: ["manage_leave_policy", GENERAL] },
    { title: "payroll & taxes", path: "/dashboard/settings/general-settings/payroll", permission: ["manage_payroll_settings", GENERAL] },
    { title: "roles & permissions", path: "/dashboard/admin/permissions", permission: [GENERAL, "view_security_admin", "confirm_role_changes"] },
    { title: "branches", path: "/dashboard/settings/general-settings/branches", permission: GENERAL },
    { title: "SMTP settings", path: "/dashboard/settings/general-settings/smtp", permission: GENERAL },
    { title: "procurement", path: "/dashboard/settings/general-settings/procurement", permission: "manage_procurement_settings" },
    { title: "approval workflows", path: "/dashboard/settings/general-settings/approval-workflows", permission: ["manage_approval_workflows", "view_security_admin"] },
  ].filter((t) => can(t.permission));

  // Roles that only manage procurement settings land on their first tab instead of "access denied".
  if (pathname.replace(/\/$/, "") === "/dashboard/settings/general-settings" && !can(GENERAL) && tabs[0]) {
    return <Navigate to={tabs[0].path} replace />;
  }

  return (
    <div className="px-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-2 flex-col">
          <h2 className="text-lg font-semibold tracking-tight">
            General Settings
          </h2>
          <BreadCrumb
            items={[{ title: "General Settings", link: "/dashboard" }]}
          />
        </div>
      </div>

      <div className="mt-3">
        <Card>
          <div className="flex w-full items-center justify-start gap-2 overflow-x-auto border-b px-2">
            {tabs.map((e, i) => {
              const base = pathname.split("/").slice(0, 5).join("/");

              const isActive = base === e.path;
              return (
                <Link
                  to={e.path}
                  key={i}
                  className={cn(
                    "relative shrink-0 whitespace-nowrap cursor-pointer px-6 py-3 text-center text-[13px] font-medium capitalize text-slate-500 sm:text-sm",
                    {
                      "text-primary": isActive,
                    }
                  )}
                >
                  {isActive && (
                    <div className="h-[3px] left-0 rounded-t-md bg-primary absolute bottom-0 w-full"></div>
                  )}
                  <span>{e.title}</span>
                </Link>
              );
            })}
          </div>
          <div>
            <Outlet />
          </div>
        </Card>
      </div>
    </div>
  );
}
