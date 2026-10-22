/**
 * Settings shell: page header, a list of sections on the left (a picker on phones) and the chosen
 * settings page on the right. Each section shows only to the roles that may open it; roles that only
 * manage procurement settings land on their first section instead of "access denied".
 */
import { Link, Navigate, Outlet, useLocation, useNavigate } from "react-router-dom";
import { ArrowUpRight, Building2, CalendarDays, Clock, Cog, GitBranch, KeyRound, Mail, ShoppingCart, Wallet } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { usePermissions } from "@/context/auth.context";
import { Card, Page, PageHeader, Select } from "@/components/ims";
import { cn } from "@/utils";

type Section = { title: string; description: string; path: string; permission: string | string[]; icon: LucideIcon; group: string };

export default function Settings() {
  const pathname = useLocation().pathname;
  const navigate = useNavigate();
  const { can } = usePermissions();
  const GENERAL = "access_general_settings";
  const sections: Section[] = [
    { group: "Organisation", title: "General", description: "Company name and contact details shown on documents and e-mails.", path: "/dashboard/settings/general-settings", permission: GENERAL, icon: Cog },
    { group: "Organisation", title: "Branches", description: "Offices of the organisation and who manages each one.", path: "/dashboard/settings/general-settings/branches", permission: GENERAL, icon: Building2 },
    { group: "Organisation", title: "E-mail", description: "The mail server for notifications, a test e-mail and the e-mail log.", path: "/dashboard/settings/general-settings/smtp", permission: GENERAL, icon: Mail },
    { group: "People", title: "Attendance", description: "Working hours, lunch break and working days.", path: "/dashboard/settings/general-settings/attendance", permission: GENERAL, icon: Clock },
    { group: "People", title: "Leave policy", description: "Leave entitlement, leave types and public holidays.", path: "/dashboard/settings/general-settings/leaves", permission: ["manage_leave_policy", GENERAL], icon: CalendarDays },
    { group: "People", title: "Payroll and taxes", description: "PAYE bands and statutory contributions used by payroll.", path: "/dashboard/settings/general-settings/payroll", permission: ["manage_payroll_settings", GENERAL], icon: Wallet },
    { group: "Access and approvals", title: "Roles and permissions", description: "Opens the permission matrix (changes need a second administrator).", path: "/dashboard/admin/permissions", permission: [GENERAL, "view_security_admin", "confirm_role_changes"], icon: KeyRound },
    { group: "Access and approvals", title: "Approval workflows", description: "Who approves what, for each document type, amount and department.", path: "/dashboard/settings/general-settings/approval-workflows", permission: ["manage_approval_workflows", "view_security_admin"], icon: GitBranch },
    { group: "Access and approvals", title: "Procurement", description: "Purchase categories, units of measure and other procurement lists.", path: "/dashboard/settings/general-settings/procurement", permission: "manage_procurement_settings", icon: ShoppingCart },
  ].filter((t) => can(t.permission));

  // Roles that only manage procurement settings land on their first tab instead of "access denied"
  // (in the order the tabs always had: general, attendance, leave, payroll, roles, branches, e-mail, procurement, workflows).
  const ORDER = ["", "/attendance", "/leaves", "/payroll", "admin", "/branches", "/smtp", "/procurement", "/approval-workflows"];
  const rank = (s: Section) => ORDER.indexOf(s.path === "/dashboard/admin/permissions" ? "admin" : s.path.replace("/dashboard/settings/general-settings", ""));
  const first = [...sections].sort((a, b) => rank(a) - rank(b))[0];
  if (pathname.replace(/\/$/, "") === "/dashboard/settings/general-settings" && !can(GENERAL) && first) {
    return <Navigate to={first.path} replace />;
  }

  const base = pathname.split("/").slice(0, 5).join("/");
  const active = sections.find((s) => s.path === base);
  const groups = sections.reduce<{ title: string; items: Section[] }[]>((acc, s) => {
    const g = acc.find((x) => x.title === s.group);
    if (g) g.items.push(s);
    else acc.push({ title: s.group, items: [s] });
    return acc;
  }, []);
  const outside = (s: Section) => !s.path.startsWith("/dashboard/settings/general-settings");

  return (
    <Page>
      <PageHeader
        breadcrumbs={[{ label: "Settings" }]}
        title="Settings"
        subtitle="Organisation details, working time, leave, payroll, e-mail and approval rules."
      />
      <div className="grid gap-4 lg:grid-cols-[240px_minmax(0,1fr)]">
        <div className="lg:hidden">
          <label htmlFor="settings-section" className="mb-1.5 block text-t-label text-ims-text">Section</label>
          <Select id="settings-section" value={active?.path || ""} onChange={(e) => navigate(e.target.value)}>
            {!active && <option value="">Choose a section…</option>}
            {groups.map((g) => (
              <optgroup key={g.title} label={g.title}>
                {g.items.map((s) => <option key={s.path} value={s.path}>{s.title}</option>)}
              </optgroup>
            ))}
          </Select>
        </div>

        <Card as="div" padded={false} className="hidden self-start p-3 lg:block">
          <nav className="space-y-4" aria-label="Settings sections">
            {groups.map((g) => (
              <div key={g.title}>
                <p className="mb-1 px-2 text-t-small font-semibold text-ims-muted">{g.title}</p>
                {g.items.map((s) => {
                  const on = active?.path === s.path;
                  return (
                    <Link
                      key={s.path}
                      to={s.path}
                      aria-current={on ? "page" : undefined}
                      className={cn(
                        "flex min-h-[38px] w-full items-center gap-2 rounded-control px-2 text-left text-t-body focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ims-focus",
                        on ? "bg-ims-info-bg font-semibold text-ims-primary" : "text-ims-body hover:bg-ims-hover"
                      )}
                    >
                      <s.icon size={16} className="shrink-0 opacity-70" aria-hidden />
                      <span className="min-w-0 flex-1 truncate">{s.title}</span>
                      {outside(s) && <ArrowUpRight size={14} className="shrink-0 text-ims-faint" aria-label="Opens another page" />}
                    </Link>
                  );
                })}
              </div>
            ))}
          </nav>
        </Card>

        <section className="min-w-0" aria-labelledby={active ? "settings-section-title" : undefined}>
          {active && (
            <header className="mb-4">
              <h2 id="settings-section-title" className="text-t-section text-ims-text">{active.title}</h2>
              <p className="mt-0.5 text-t-small text-ims-muted">{active.description}</p>
            </header>
          )}
          {/* The settings pages bring their own cards; their outer padding is dropped so they line up with the section list. */}
          <div className="min-w-0 [&>*]:!p-0">
            <Outlet />
          </div>
        </section>
      </div>
    </Page>
  );
}
