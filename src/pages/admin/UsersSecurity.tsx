/**
 * Administration → Users & security: every account with its roles, 2FA, lockout and last sign-in.
 * System Administrators assign roles (main + extra), unlock accounts and reset 2FA — each action
 * needs a reason and is audited. Segregation-of-duties conflicts are flagged when roles combine.
 */
import * as React from "react";
import { useQuery, useQueryClient } from "react-query";
import { formatDistanceToNow } from "date-fns";
import { toast } from "sonner";
import { AlertTriangle, KeyRound, Lock, Unlock, Search, ShieldCheck, ShieldOff, UserCog, Users } from "lucide-react";
import pocketbase from "@/lib/pocketbase";
import { usePermissions } from "@/context/auth.context";
import { AccountSecurity, imsApi } from "@/lib/ims";
import { errorMessage } from "@/lib/procurement";
import { exportReport } from "@/lib/exporter";
import { Button } from "@/components/ui/button";
import { Badge, EmptyState, Initials, ListSkeleton, MetricGroup, PageHeader, Panel } from "@/components/enterprise/ui";
import ExportMenu from "@/components/enterprise/ExportMenu";
import { Field, FormBlock, FormDialog, inputCls } from "@/components/portal/kit";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/utils";

/** Role combinations that break segregation of duties for one person. */
const CONFLICTS: [string, string, string][] = [
  ["SYS_ADMIN", "DAF", "A System Administrator should not also approve finance (DAF)."],
  ["SYS_ADMIN", "SG", "A System Administrator should not also be the final approver (SG)."],
  ["SYS_ADMIN", "CASHIER", "A System Administrator should not execute payments."],
  ["ACCOUNTANT", "CASHIER", "The person who prepares vouchers must not execute payments."],
  ["HR_PAYROLL", "CASHIER", "The payroll preparer should not pay salaries."],
  ["INTERNAL_AUDITOR", "", "The Internal Auditor must be independent: no other role."],
  ["PROCUREMENT_OFFICER", "STORE_ASSET", "Ordering and receiving goods should be separate."],
];
const ago = (v?: string) => (v ? formatDistanceToNow(new Date(v.replace(" ", "T")), { addSuffix: true }) : "never");

export default function UsersSecurity() {
  const { can } = usePermissions();
  const canManage = can("access_general_settings");
  const queryClient = useQueryClient();
  const [search, setSearch] = React.useState("");
  const [filter, setFilter] = React.useState<"all" | "locked" | "no2fa" | "multi">("all");
  const [editing, setEditing] = React.useState<{ user: any; role: string; extra: string[] } | null>(null);
  const [action, setAction] = React.useState<{ user: AccountSecurity; kind: "unlock" | "reset-2fa" } | null>(null);
  const [reason, setReason] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  const q = useQuery(["users-security"], async () => {
    const [sec, users, roles] = await Promise.all([
      imsApi.securityUsers(),
      pocketbase.collection("users").getFullList({ fields: "id,name,email,role,extra_roles,status,department", expand: "department", sort: "name", batch: 1000 }),
      pocketbase.collection("roles").getFullList({ sort: "sort_order,name", fields: "id,name,code" }),
    ]);
    return { sec: sec.items, users, roles };
  });
  const roles: any[] = q.data?.roles || [];
  const usersById = Object.fromEntries((q.data?.users || []).map((u: any) => [u.id, u]));
  const items = (q.data?.sec || []).filter((a) => {
    const t = search.trim().toLowerCase();
    if (t && !`${a.name} ${a.email} ${a.roles.join(" ")}`.toLowerCase().includes(t)) return false;
    if (filter === "locked") return Boolean(a.locked_until);
    if (filter === "no2fa") return !a.totp_enabled && a.status === "Active";
    if (filter === "multi") return a.roles.length > 1;
    return true;
  });
  const all = q.data?.sec || [];

  const conflictsFor = (codes: string[]) =>
    CONFLICTS.filter(([a, b]) => codes.includes(a) && (b ? codes.includes(b) : codes.length > 1)).map((c) => c[2]);

  async function saveRoles() {
    if (!editing) return;
    setBusy(true);
    try {
      await pocketbase.collection("users").update(editing.user.id, { role: editing.role, extra_roles: editing.extra.filter((x) => x !== editing.role) });
      toast.success(`Roles of ${editing.user.name} updated (audited)`);
      setEditing(null);
      queryClient.invalidateQueries(["users-security"]);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  async function runAction() {
    if (!action) return;
    if (reason.trim().length < 5) return toast.error("Give the reason (kept in the audit log).");
    setBusy(true);
    try {
      await imsApi.accountAction(action.user.id, action.kind, reason.trim());
      toast.success(action.kind === "unlock" ? `${action.user.name} can sign in again` : `2FA reset for ${action.user.name}`);
      setAction(null);
      setReason("");
      queryClient.invalidateQueries(["users-security"]);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  const doExport = (format: "xlsx" | "pdf" | "csv") =>
    exportReport({
      title: "User accounts and security", rows: items, format, what: "users", orientation: "landscape",
      columns: [
        { header: "Name", value: (a: AccountSecurity) => a.name },
        { header: "E-mail", value: (a: AccountSecurity) => a.email },
        { header: "Roles", value: (a: AccountSecurity) => a.roles.join(", ") },
        { header: "Status", value: (a: AccountSecurity) => a.status },
        { header: "2FA", value: (a: AccountSecurity) => (a.totp_enabled ? "On" : "Off") },
        { header: "Locked until", value: (a: AccountSecurity) => a.locked_until, format: "datetime" },
        { header: "Last sign-in", value: (a: AccountSecurity) => a.last_login_at, format: "datetime" },
        { header: "Last IP", value: (a: AccountSecurity) => a.last_login_ip },
      ],
    });

  const editCodes = editing ? [editing.role, ...editing.extra].map((id) => roles.find((r) => r.id === id)?.code).filter(Boolean) : [];

  return (
    <div className="space-y-4 px-3 sm:px-4">
      <PageHeader
        title="Users & security"
        description="Accounts, role assignments, two-factor authentication and lockouts. Role changes and unlocks are audited."
        breadcrumbs={[{ title: "Administration", link: "#" }, { title: "Users & security", link: "/dashboard/admin/users" }]}
        actions={<ExportMenu onExport={doExport} permission={["view_security_admin", "export_audit_logs"]} disabled={!items.length} />}
      />
      <MetricGroup
        title="Accounts"
        icon={Users}
        loading={q.isLoading}
        columns={4}
        metrics={[
          { label: "Active accounts", value: all.filter((a) => a.status === "Active").length, onClick: () => setFilter("all") },
          { label: "With 2FA", value: all.filter((a) => a.totp_enabled).length, tone: "success", onClick: () => setFilter("no2fa"), sub: `${all.filter((a) => !a.totp_enabled && a.status === "Active").length} without` },
          { label: "Locked now", value: all.filter((a) => a.locked_until).length, tone: all.some((a) => a.locked_until) ? "danger" : "default", onClick: () => setFilter("locked") },
          { label: "Hold several roles", value: all.filter((a) => a.roles.length > 1).length, onClick: () => setFilter("multi") },
        ]}
      />
      <Panel bodyClassName="px-0 pb-0">
        <div className="flex flex-col gap-2 border-b border-slate-100 px-4 pb-3 sm:flex-row sm:items-center">
          <label className="relative w-full sm:w-72">
            <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Name, e-mail or role…" aria-label="Search accounts" className="h-9 w-full rounded-md border border-slate-200 pl-9 pr-3 text-[13px] outline-none focus:border-primary focus:ring-2 focus:ring-primary/20" />
          </label>
          <div className="flex gap-1 overflow-x-auto">
            {([["all", "All"], ["locked", "Locked"], ["no2fa", "Without 2FA"], ["multi", "Several roles"]] as const).map(([k, l]) => (
              <button key={k} type="button" onClick={() => setFilter(k)} aria-pressed={filter === k} className={cn("h-8 shrink-0 rounded-full border px-3 text-[12.5px] font-medium", filter === k ? "border-primary bg-primary text-white" : "border-slate-200 bg-white text-slate-600 hover:border-slate-300")}>{l}</button>
            ))}
          </div>
        </div>
        {q.isLoading ? (
          <div className="p-4"><ListSkeleton rows={8} /></div>
        ) : !items.length ? (
          <EmptyState icon={UserCog} title="No accounts" text="No account matches these filters." />
        ) : (
          <div className="overflow-x-auto">
            <table className="dnr-grid w-full min-w-[900px]">
              <thead><tr><th>Person</th><th>Roles</th><th>2FA</th><th>Sign-in</th><th>Last sign-in</th>{canManage && <th className="text-right">Actions</th>}</tr></thead>
              <tbody>
                {items.map((a) => {
                  const u = usersById[a.id];
                  const codes = u ? [u.role, ...(u.extra_roles || [])].map((id: string) => roles.find((r) => r.id === id)?.code).filter(Boolean) : [];
                  const conflicts = conflictsFor(codes as string[]);
                  return (
                    <tr key={a.id} className={cn(a.status !== "Active" && "opacity-60")}>
                      <td>
                        <span className="flex items-center gap-2.5">
                          <Initials name={a.name} />
                          <span className="min-w-0">
                            <span className="block truncate font-medium text-slate-900">{a.name}</span>
                            <span className="block truncate text-[12px] text-slate-500">{a.email}{u?.expand?.department ? ` · ${u.expand.department.name}` : ""}</span>
                          </span>
                        </span>
                      </td>
                      <td>
                        <span className="flex max-w-[280px] flex-wrap gap-1">
                          {a.roles.map((r, i) => <Badge key={r} tone={i === 0 ? "info" : "neutral"}>{r}</Badge>)}
                          {conflicts.length > 0 && <span title={conflicts.join("\n")}><Badge tone="danger"><AlertTriangle size={11} className="mr-1" /> SoD</Badge></span>}
                        </span>
                      </td>
                      <td>{a.totp_enabled ? <Badge tone="success"><ShieldCheck size={11} className="mr-1" /> On</Badge> : <Badge>Off</Badge>}</td>
                      <td>
                        {a.locked_until ? (
                          <Badge tone="danger"><Lock size={11} className="mr-1" /> Locked</Badge>
                        ) : a.status !== "Active" ? (
                          <Badge>{a.status || "Inactive"}</Badge>
                        ) : a.failed_logins > 0 ? (
                          <Badge tone="warning">{a.failed_logins} failed</Badge>
                        ) : (
                          <Badge tone="success">OK</Badge>
                        )}
                      </td>
                      <td className="text-[12.5px] text-slate-600">
                        {ago(a.last_login_at)}
                        {a.last_login_ip && <span className="block font-mono text-[11px] text-slate-400">{a.last_login_ip}</span>}
                      </td>
                      {canManage && (
                        <td className="text-right">
                          <span className="inline-flex gap-1">
                            {u && <Button size="sm" variant="ghost" onClick={() => setEditing({ user: { ...u, name: a.name }, role: u.role, extra: u.extra_roles || [] })}><UserCog size={13} /> Roles</Button>}
                            {a.locked_until && <Button size="sm" variant="outline" onClick={() => setAction({ user: a, kind: "unlock" })}><Unlock size={13} /> Unlock</Button>}
                            {a.totp_enabled && <Button size="sm" variant="ghost" onClick={() => setAction({ user: a, kind: "reset-2fa" })}><ShieldOff size={13} /> Reset 2FA</Button>}
                          </span>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <FormDialog open={Boolean(editing)} onClose={() => setEditing(null)} icon={KeyRound} title={`Roles of ${editing?.user?.name || ""}`} description="One person may hold several roles; segregation of duties always applies to the person. Changes are audited." submitLabel="Save roles" busy={busy} onSubmit={saveRoles}>
        {editing && (
          <FormBlock icon={UserCog} title="Role assignment">
            <Field label="Main role" required hint="Sets the person's default visibility scope.">
              <select value={editing.role} onChange={(e) => setEditing({ ...editing, role: e.target.value })} className={inputCls}>
                {roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
              </select>
            </Field>
            <div>
              <p className="mb-1.5 text-[13px] font-medium text-slate-700">Additional roles</p>
              <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                {roles.filter((r) => r.id !== editing.role).map((r) => (
                  <label key={r.id} className={cn("flex items-center gap-2 rounded-md border px-2.5 py-2 text-[13px]", editing.extra.includes(r.id) ? "border-primary bg-primary/5" : "border-slate-200")}>
                    <input type="checkbox" checked={editing.extra.includes(r.id)} onChange={(e) => setEditing({ ...editing, extra: e.target.checked ? [...editing.extra, r.id] : editing.extra.filter((x) => x !== r.id) })} className="h-4 w-4 rounded border-slate-300 text-primary" />
                    {r.name}
                  </label>
                ))}
              </div>
            </div>
            {conflictsFor(editCodes as string[]).length > 0 && (
              <div className="space-y-1 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-[12.5px] text-red-800">
                {conflictsFor(editCodes as string[]).map((c) => <p key={c} className="flex items-start gap-1.5"><AlertTriangle size={13} className="mt-0.5 shrink-0" /> {c}</p>)}
              </div>
            )}
          </FormBlock>
        )}
      </FormDialog>

      <Dialog open={Boolean(action)} onOpenChange={(o) => !o && setAction(null)}>
        <DialogContent className="max-w-md bg-white">
          <DialogHeader>
            <DialogTitle>{action?.kind === "unlock" ? `Unlock ${action?.user.name}` : `Reset 2FA for ${action?.user.name}`}</DialogTitle>
            <DialogDescription>
              {action?.kind === "unlock" ? "Confirm the person's identity first (call or in person)." : "Use when the person lost their phone. They set up 2FA again at next sign-in."}
            </DialogDescription>
          </DialogHeader>
          <label className="block">
            <span className="mb-1 block text-[12.5px] font-medium text-slate-700">Reason <span className="text-red-600">*</span></span>
            <textarea value={reason} onChange={(e) => setReason(e.target.value)} className="h-20 w-full rounded-md border border-slate-200 px-3 py-2 text-[13px] outline-none focus:border-primary focus:ring-2 focus:ring-primary/20" />
          </label>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setAction(null)}>Cancel</Button>
            <Button onClick={runAction} disabled={busy}>{action?.kind === "unlock" ? "Unlock account" : "Reset 2FA"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
