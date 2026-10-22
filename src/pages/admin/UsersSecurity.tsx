/**
 * Administration → Users & security: every account with its roles, 2FA, lockout and last sign-in.
 * System Administrators assign roles (main + extra), unlock accounts and reset 2FA — each action
 * needs a reason and is audited. Segregation-of-duties conflicts are flagged when roles combine.
 */
import * as React from "react";
import { useQuery, useQueryClient } from "react-query";
import { toast } from "sonner";
import { AlertTriangle, ShieldCheck, ShieldOff, Unlock, UserCog } from "lucide-react";
import pocketbase from "@/lib/pocketbase";
import { usePermissions } from "@/context/auth.context";
import { AccountSecurity, imsApi } from "@/lib/ims";
import { errorMessage } from "@/lib/procurement";
import { exportReport } from "@/lib/exporter";
import ExportMenu from "@/components/enterprise/ExportMenu";
import {
  Button,
  Card,
  Column,
  ConfirmDialog,
  DataTable,
  EmptyState,
  Field,
  FilterBar,
  KpiBand,
  Modal,
  Page,
  PageHeader,
  Pager,
  Person,
  Pill,
  Select,
  StatusPill,
  Tabs,
  checkboxClass,
  fmtDateTime,
  fmtNumber,
  fmtWhen,
} from "@/components/ims";
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
type FilterKey = "all" | "locked" | "no2fa" | "multi";

export default function UsersSecurity() {
  const { can } = usePermissions();
  const canManage = can("access_general_settings");
  const queryClient = useQueryClient();
  const [search, setSearch] = React.useState("");
  const [filter, setFilter] = React.useState<FilterKey>("all");
  const [editing, setEditing] = React.useState<{ user: any; role: string; extra: string[] } | null>(null);
  const [action, setAction] = React.useState<{ user: AccountSecurity; kind: "unlock" | "reset-2fa" } | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [page, setPage] = React.useState(1);
  const [perPage, setPerPage] = React.useState(15);

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
  React.useEffect(() => setPage(1), [search, filter, perPage]);
  const pageRows = items.slice((page - 1) * perPage, page * perPage);
  const counts = {
    active: all.filter((a) => a.status === "Active").length,
    with2fa: all.filter((a) => a.totp_enabled).length,
    no2fa: all.filter((a) => !a.totp_enabled && a.status === "Active").length,
    locked: all.filter((a) => a.locked_until).length,
    multi: all.filter((a) => a.roles.length > 1).length,
  };

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
  async function runAction(reason: string) {
    if (!action) return;
    if (reason.trim().length < 5) {
      toast.error("Give the reason (kept in the audit log).");
      throw new Error("reason");
    }
    try {
      await imsApi.accountAction(action.user.id, action.kind, reason.trim());
      toast.success(action.kind === "unlock" ? `${action.user.name} can sign in again` : `2FA reset for ${action.user.name}`);
      setAction(null);
      queryClient.invalidateQueries(["users-security"]);
    } catch (e) {
      toast.error(errorMessage(e));
      throw e;
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
  const editConflicts = conflictsFor(editCodes as string[]);
  const openRoles = (a: AccountSecurity) => {
    const u = usersById[a.id];
    if (u) setEditing({ user: { ...u, name: a.name }, role: u.role, extra: u.extra_roles || [] });
  };

  const columns: Column<AccountSecurity>[] = [
    {
      key: "person",
      header: "Person",
      className: "max-w-[280px]",
      cell: (a) => {
        const u = usersById[a.id];
        return <Person name={a.name} detail={`${a.email}${u?.expand?.department ? ` · ${u.expand.department.name}` : ""}`} />;
      },
    },
    {
      key: "roles",
      header: "Roles",
      cell: (a) => {
        const u = usersById[a.id];
        const codes = u ? [u.role, ...(u.extra_roles || [])].map((id: string) => roles.find((r) => r.id === id)?.code).filter(Boolean) : [];
        const conflicts = conflictsFor(codes as string[]);
        return (
          <span className="flex max-w-[300px] flex-wrap gap-1">
            {a.roles.map((r, i) => <Pill key={r} tone={i === 0 ? "info" : "neutral"}>{r}</Pill>)}
            {conflicts.length > 0 && (
              <Pill tone="danger" title={conflicts.join("\n")}>
                <AlertTriangle size={12} className="mr-1" aria-hidden /> Duties conflict
              </Pill>
            )}
          </span>
        );
      },
    },
    {
      key: "2fa",
      header: "2FA",
      nowrap: true,
      cell: (a) =>
        a.totp_enabled ? (
          <span className="inline-flex items-center gap-1.5 font-semibold text-ims-success"><ShieldCheck size={15} aria-hidden /> On</span>
        ) : (
          <span className="inline-flex items-center gap-1.5 text-ims-muted"><ShieldOff size={15} aria-hidden /> Off</span>
        ),
    },
    {
      key: "status",
      header: "Account",
      cell: (a) => (
        <StatusPill
          status={a.status === "Active" ? "Active" : "Inactive"}
          sub={
            a.locked_until ? (
              <span className="font-semibold text-ims-danger">Locked until {fmtDateTime(a.locked_until)}</span>
            ) : a.failed_logins > 0 ? (
              <span className="text-ims-warning">{a.failed_logins} failed sign-in{a.failed_logins === 1 ? "" : "s"}</span>
            ) : a.status !== "Active" && a.status ? (
              a.status
            ) : undefined
          }
        />
      ),
    },
    {
      key: "last",
      header: "Last sign-in",
      nowrap: true,
      cell: (a) => (a.last_login_at ? fmtWhen(a.last_login_at) : <span className="text-ims-muted">Never</span>),
      sub: (a) => (a.last_login_ip ? <span className="font-mono">{a.last_login_ip}</span> : null),
    },
  ];

  return (
    <Page>
      <PageHeader
        breadcrumbs={[{ label: "Administration" }, { label: "Users and security" }]}
        title="Users and security"
        subtitle="Accounts, role assignments, two-factor authentication and lockouts. Every change is audited."
        actions={<ExportMenu onExport={doExport} permission={["view_security_admin", "export_audit_logs"]} disabled={!items.length} />}
      />
      <KpiBand
        loading={q.isLoading}
        items={[
          { label: "Active accounts", value: fmtNumber(counts.active), onClick: () => setFilter("all") },
          { label: "With 2FA", value: fmtNumber(counts.with2fa), tone: "success", sub: `${fmtNumber(counts.no2fa)} without`, onClick: () => setFilter("no2fa") },
          { label: "Locked now", value: fmtNumber(counts.locked), tone: counts.locked ? "danger" : "default", onClick: () => setFilter("locked") },
          { label: "Hold several roles", value: fmtNumber(counts.multi), onClick: () => setFilter("multi") },
        ]}
      />
      <Card padded={false} className="overflow-hidden">
        <Tabs
          inset
          label="Accounts"
          active={filter}
          onChange={(k) => setFilter(k as FilterKey)}
          tabs={[
            { key: "all", label: "All accounts", count: q.data ? all.length : undefined },
            { key: "locked", label: "Locked", count: q.data ? counts.locked : undefined },
            { key: "no2fa", label: "Without 2FA", count: q.data ? counts.no2fa : undefined },
            { key: "multi", label: "Several roles", count: q.data ? counts.multi : undefined },
          ]}
        />
        <FilterBar search={{ value: search, onChange: setSearch, placeholder: "Search name, e-mail or role" }} />
        <DataTable
          columns={columns}
          rows={pageRows}
          rowKey={(a) => a.id}
          loading={q.isLoading}
          error={q.isError ? q.error : undefined}
          onRetry={() => q.refetch()}
          minWidth={900}
          caption="User accounts"
          rowClassName={(a) => a.status !== "Active" && "text-ims-muted opacity-70"}
          onRowClick={canManage ? (a) => openRoles(a) : undefined}
          rowActions={
            canManage
              ? (a) => [
                  ...(usersById[a.id] ? [{ label: "Change roles", icon: UserCog, onSelect: () => openRoles(a) }] : []),
                  ...(a.locked_until ? [{ label: "Unlock account", icon: Unlock, onSelect: () => setAction({ user: a, kind: "unlock" }) }] : []),
                  ...(a.totp_enabled ? [{ label: "Reset 2FA", icon: ShieldOff, onSelect: () => setAction({ user: a, kind: "reset-2fa" }) }] : []),
                ]
              : undefined
          }
          footer={items.length > 0 ? <Pager page={page} perPage={perPage} total={items.length} onPage={setPage} onPerPage={setPerPage} /> : null}
          empty={<EmptyState icon={UserCog} text={search || filter !== "all" ? "No account matches these filters. Change the search or choose another tab." : "No accounts yet."} />}
        />
      </Card>

      <Modal
        open={Boolean(editing)}
        onClose={() => setEditing(null)}
        title={`Roles of ${editing?.user?.name || ""}`}
        description="One person may hold several roles; segregation of duties applies to the person. Changes are audited."
        footer={
          <>
            <Button variant="secondary" onClick={() => setEditing(null)} disabled={busy}>Cancel</Button>
            <Button variant="primary" onClick={saveRoles} loading={busy}>Save roles</Button>
          </>
        }
      >
        {editing && (
          <>
            <Field label="Main role" required htmlFor="us-main-role" hint="Sets the person's default visibility scope.">
              <Select id="us-main-role" value={editing.role} onChange={(e) => setEditing({ ...editing, role: e.target.value })}>
                {roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
              </Select>
            </Field>
            <fieldset>
              <legend className="mb-1.5 text-t-label text-ims-text">Additional roles</legend>
              <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                {roles.filter((r) => r.id !== editing.role).map((r) => {
                  const on = editing.extra.includes(r.id);
                  return (
                    <label key={r.id} className={cn("flex min-h-[40px] cursor-pointer items-center gap-2.5 rounded-control border px-3 py-2 text-t-body", on ? "border-ims-link bg-ims-info-bg text-ims-text" : "border-ims-border text-ims-body hover:bg-ims-hover")}>
                      <input
                        type="checkbox"
                        className={cn(checkboxClass, "mt-0")}
                        checked={on}
                        onChange={(e) => setEditing({ ...editing, extra: e.target.checked ? [...editing.extra, r.id] : editing.extra.filter((x) => x !== r.id) })}
                      />
                      {r.name}
                    </label>
                  );
                })}
              </div>
            </fieldset>
            {editConflicts.length > 0 && (
              <div role="alert" className="space-y-1 rounded-control border border-ims-danger/30 bg-ims-danger-bg px-3.5 py-2.5 text-t-small text-ims-danger">
                {editConflicts.map((c) => <p key={c} className="flex items-start gap-1.5"><AlertTriangle size={14} className="mt-px shrink-0" aria-hidden /> {c}</p>)}
              </div>
            )}
          </>
        )}
      </Modal>

      <ConfirmDialog
        open={Boolean(action)}
        onClose={() => setAction(null)}
        title={action?.kind === "unlock" ? `Unlock ${action?.user.name}?` : `Reset 2FA for ${action?.user.name}?`}
        description={action?.kind === "unlock" ? "Confirm the person's identity first (call or in person). They can sign in again at once." : "Use when the person lost their phone. They set up 2FA again at their next sign-in."}
        confirmLabel={action?.kind === "unlock" ? "Unlock account" : "Reset 2FA"}
        danger={action?.kind === "reset-2fa"}
        reason={{ label: "Reason", placeholder: "Kept in the audit log", min: 5, required: true }}
        onConfirm={runAction}
      />
    </Page>
  );
}
