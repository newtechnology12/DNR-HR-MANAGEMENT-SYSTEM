import BreadCrumb from "@/components/breadcrumb";
import { Card } from "@/components/ui/card";
import { cn } from "@/utils";
import { Link, Outlet, useLocation } from "react-router-dom";

export default function Settings() {
  const pathname = useLocation().pathname;

  return (
    <div className="px-3">
      <div className="flex items-start justify-between space-y-2">
        <div className="flex items-start gap-2 flex-col">
          <h2 className="text-lg font-semibold tracking-tight">
            General Settings
          </h2>
          <BreadCrumb
            items={[{ title: "Employee Portal", link: "/dashboard" }]}
          />
        </div>
      </div>

      <div className="mt-3-">
        <Card>
          <div className="flex px-2 gap-2 w-full border-b items-center justify-start">
            {[
              {
                title: "general Settings",
                path: "/dashboard/settings/general-settings",
              },
              {
                title: "attendance settings",
                path: "/dashboard/settings/general-settings/attendance",
              },
              {
                title: "leave settings",
                path: "/dashboard/settings/general-settings/leaves",
              },
              {
                title: "payroll settings",
                path: "/dashboard/settings/general-settings/payroll",
              },
              {
                title: "roles & permitions",
                path: "/dashboard/settings/general-settings/roles-permissions",
              },
              {
                title: "branches",
                path: "/dashboard/settings/general-settings/branches",
              },
              {
                title: "SMTP settings",
                path: "/dashboard/settings/general-settings/smtp",
              },
            ].map((e, i) => {
              const base = pathname.split("/").slice(0, 5).join("/");

              const isActive = base === e.path;
              return (
                <Link
                  to={e.path}
                  key={i}
                  className={cn(
                    "cursor-pointer px-6 capitalize text-center relative w-full- text-slate-700 text-[13px] sm:text-sm py-3  font-medium",
                    {
                      "text-primary ": isActive,
                    }
                  )}
                >
                  {isActive && (
                    <div className="h-[3px] left-0 rounded-t-md bg-primary absolute bottom-0 w-full"></div>
                  )}
                  <span className="">{e.title}</span>
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
