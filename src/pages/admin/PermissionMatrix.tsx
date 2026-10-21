/**
 * Administration → Permission matrix (IMS spec §2). Roles × permissions, grouped by module.
 * Administrators stage changes and submit them with a reason; a second administrator or the DAF
 * must confirm before anything changes (maker–checker, enforced on the server). Both are audited.
 */
import * as React from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "react-query";
import { formatDistanceToNow } from "date-fns";
import { toast } from "sonner";
import { AlertTriangle, Check, CheckCircle2, Clock, Minus, Plus, Search, ShieldCheck, Undo2, Users, X, XCircle } from "lucide-react";
import pocketbase from "@/lib/pocketbase";
import { useAuth, usePermissions } from "@/context/auth.context";
import { PERMISSION_GROUPS, PERMISSION_TITLES, imsApi, roleDef } from "@/lib/ims";
import { errorMessage } from "@/lib/procurement";
import { exportReport } from "@/lib/exporter";
import { Button } from "@/components/ui/button";
import { Badge, EmptyState, Initials, ListSkeleton, PageHeader, Panel } from "@/components/enterprise/ui";
import ExportMenu from "@/components/enterprise/ExportMenu";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/utils";

const SHORT: Record<string, string> = {
  SYS_ADMIN: "Admin", SG: "SG", DAF: "DAF", ACCOUNTANT: "Acct", BUDGET_OFFICER: "Budget", CASHIER: "Cashier", PROCUREMENT_OFFICER: "Proc.",
  HOD: "HoD", HR_PAYROLL: "HR", STORE_ASSET: "Store", STAFF: "Staff", INTERNAL_AUDITOR: "Audit", MGMT_VIEWER: "Board",
};
const NEVER_APPROVE = ["SYS_ADMIN", "INTERNAL_AUDITOR", "MGMT_VIEWER"];
type Tab = "matrix" | "requests" | "roles";
const key = (role: string, perm: string) => `${role}|${perm}`;

export default function PermissionMatrix() {
  const { user } = useAuth();
  const { can } = usePermissions();
  const canPropose = can("access_general_settings");
  const canConfirm = can("confirm_role_changes");
  const queryClient = useQueryClient();
  const [params, setParams] = useSearchParams();
  const tab = (params.get("tab") as Tab) || "matrix";
  const setTab = (t: Tab) => setParams((p) => { p.set("tab", t); return p; });

  const q = useQuery(["permission-matrix"], async () => {
    const [roles, requests, users] = await Promise.all([
      pocketbase.collection("roles").getFullList({ sort: "sort_order,name" }),
      pocketbase.collection("role_change_requests").getFullList({ sort: "-created", expand: "requested_by,decided_by" }),
      pocketbase.collection("users").getFullList({ fields: "id,role,extra_roles,status", filter: 'status = "Active"' }),
    ]);
    return { roles, requests, users };
  });
  const roles: any[] = q.data?.roles || [];
  const requests: any[] = q.data?.requests || [];
  const pending = requests.filter((r) => r.status === "pending");

  // ---------------------------------------------------------------- matrix state
  const [staged, setStaged] = React.useState<Record<string, boolean>>({});
  const [module, setModule] = React.useState("all");
  const [search, setSearch] = React.useState("");
  const [review, setReview] = React.useState(false);
  const [reason, setReason] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  const granted = React.useMemo(() => {
    const m: Record<string, boolean> = {};
    for (const r of roles) for (const p of r.permitions || []) if (p.access) m[key(r.id, p.name)] = true;
    return m;
  }, [roles]);
  const value = (roleId: string, perm: string) => (staged[key(roleId, perm)] !== undefined ? staged[key(roleId, perm)] : Boolean(granted[key(roleId, perm)]));
  const toggle = (roleId: string, perm: string) => {
    const k = key(roleId, perm);
    const next = !value(roleId, perm);
    setStaged((s) => {
      const copy = { ...s };
      if (next === Boolean(granted[k])) delete copy[k];
      else copy[k] = next;
      return copy;
    });
  };
  const stagedList = Object.entries(staged).map(([k, access]) => {
    const [role, permission] = k.split("|");
    return { role, permission, access, roleRec: roles.find((r) => r.id === role) };
  });
  const warnings = stagedList
    .filter((c) => c.access && NEVER_APPROVE.includes(c.roleRec?.code) && /^approve_|record_payments|override_budget|close_periods|reopen_periods/.test(c.permission))
    .map((c) => `${c.roleRec?.name} can never approve or execute payments — the approval engine ignores “${PERMISSION_TITLES[c.permission] || c.permission}”.`)
    .concat(stagedList.filter((c) => c.access && c.roleRec?.code === "INTERNAL_AUDITOR" && !/^(view_|export_)/.test(c.permission)).map((c) => `The Internal Auditor must stay read-only (“${PERMISSION_TITLES[c.permission] || c.permission}”).`));

  const term = search.trim().toLowerCase();
  const groups = PERMISSION_GROUPS.filter((g) => module === "all" || g.key === module)
    .map((g) => ({ ...g, permissions: g.permissions.filter((p) => !term || `${p.title} ${p.name}`.toLowerCase().includes(term)) }))
    .filter((g) => g.permissions.length);

  async function submit() {
    if (reason.trim().length < 10) return toast.error("Explain the change (at least 10 characters) — the confirmer reads this.");
    setBusy(true);
    try {
      const r = await imsApi.proposeChanges({ reason: reason.trim(), changes: stagedList.map((c) => ({ role: c.role, permission: c.permission, access: c.access })) });
      toast.success(`${r.changes} change(s) sent for confirmation by a second administrator or the DAF`);
      setStaged({});
      setReview(false);
      setReason("");
      queryClient.invalidateQueries(["permission-matrix"]);
      setTab("requests");
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  const doExport = (format: "xlsx" | "pdf" | "csv") => {
    const perms = PERMISSION_GROUPS.flatMap((g) => g.permissions.map((p) => ({ ...p, module: g.title })));
    return exportReport({
      title: "Permission matrix",
      subtitle: `${roles.length} roles · ${perms.length} permissions · current (confirmed) rights`,
      rows: perms,
      format,
      orientation: "landscape",
      what: "roles",
      columns: [
        { header: "Module", value: (p: any) => p.module, width: 22 },
        { header: "Permission", value: (p: any) => p.title, width: 48 },
        ...roles.map((r) => ({ header: SHORT[r.code] || r.name, value: (p: any) => (granted[key(r.id, p.name)] ? "✓" : ""), width: 7 })),
      ],
    });
  };

  // ---------------------------------------------------------------- requests
  const [deciding, setDeciding] = React.useState<{ req: any; decision: "approve" | "reject" } | null>(null);
  const [comment, setComment] = React.useState("");
  async function decide() {
    if (!deciding) return;
    if (deciding.decision === "reject" && !comment.trim()) return toast.error("Give a reason for rejecting.");
    setBusy(true);
    try {
      await imsApi.decideChange(deciding.req.id, deciding.decision, comment.trim());
      toast.success(deciding.decision === "approve" ? "Confirmed — the roles are updated" : "Change rejected");
      setDeciding(null);
      setComment("");
      queryClient.invalidateQueries(["permission-matrix"]);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  async function withdraw(id: string) {
    try {
      await imsApi.withdrawChange(id);
      toast.success("Request withdrawn");
      queryClient.invalidateQueries(["permission-matrix"]);
    } catch (e) {
      toast.error(errorMessage(e));
    }
  }

  const holders = (roleId: string) => (q.data?.users || []).filter((u: any) => u.role === roleId || (u.extra_roles || []).includes(roleId)).length;

  return (
    <div className="space-y-4 px-3 pb-24 sm:px-4">
      <PageHeader
        title="Permission matrix"
        description="Who may do what, per role. Changes need a second administrator or the Director of Finance to confirm; every change is audited."
        breadcrumbs={[{ title: "Administration", link: "#" }, { title: "Permission matrix", link: "/dashboard/admin/permissions" }]}
        actions={<ExportMenu onExport={doExport} permission={["view_security_admin", "export_audit_logs"]} disabled={!roles.length} />}
      />

      <div className="flex gap-1 overflow-x-auto border-b border-slate-200" role="tablist">
        {([["matrix", "Matrix"], ["requests", "Change requests"], ["roles", "Roles"]] as [Tab, string][]).map(([k, label]) => (
          <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => setTab(k)} className={cn("-mb-px inline-flex items-center gap-1.5 whitespace-nowrap border-b-2 px-3 py-2.5 text-[13px] font-medium", tab === k ? "border-primary text-primaryDark" : "border-transparent text-slate-500 hover:text-slate-800")}>
            {label}
            {k === "requests" && pending.length > 0 && <span className="rounded-full bg-amber-100 px-1.5 text-[11px] font-semibold text-amber-800">{pending.length}</span>}
          </button>
        ))}
      </div>

      {q.isLoading ? (
        <Panel><ListSkeleton rows={10} /></Panel>
      ) : tab === "matrix" ? (
        <>
          {!canPropose && (
            <p className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-[12.5px] text-slate-600">
              <ShieldCheck size={14} className="text-slate-400" /> Read-only view. Only System Administrators can propose changes.
            </p>
          )}
          <section className="rounded-lg border border-slate-200 bg-white shadow-card">
            <div className="flex flex-col gap-2 border-b border-slate-100 p-3 sm:flex-row sm:items-center">
              <label className="relative w-full sm:w-72">
                <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Find a permission…" aria-label="Find a permission" className="h-9 w-full rounded-md border border-slate-200 pl-9 pr-3 text-[13px] outline-none focus:border-primary focus:ring-2 focus:ring-primary/20" />
              </label>
              <select value={module} onChange={(e) => setModule(e.target.value)} aria-label="Module" className="h-9 rounded-md border border-slate-200 bg-white px-2.5 text-[13px] outline-none focus:border-primary">
                <option value="all">All modules</option>
                {PERMISSION_GROUPS.map((g) => <option key={g.key} value={g.key}>{g.module} · {g.title}</option>)}
              </select>
              <span className="text-[12px] text-slate-500 sm:ml-auto">
                <span className="mr-3 inline-flex items-center gap-1"><span className="inline-flex h-4 w-4 items-center justify-center rounded bg-emerald-100 text-emerald-700"><Check size={11} /></span> granted</span>
                <span className="inline-flex items-center gap-1"><span className="inline-block h-4 w-4 rounded bg-amber-100 ring-1 ring-amber-400" /> staged change</span>
              </span>
            </div>
            <div className="max-h-[70vh] overflow-auto">
              <table className="w-full min-w-[1080px] border-separate border-spacing-0 text-[12.5px]">
                <thead className="sticky top-0 z-20 bg-white">
                  <tr>
                    <th className="sticky left-0 z-30 w-[340px] border-b border-slate-200 bg-white px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500">Permission</th>
                    {roles.map((r) => (
                      <th key={r.id} title={`${r.name} — ${roleDef(r.code)?.description || ""}`} className="w-[64px] border-b border-slate-200 px-1 py-2 text-center text-[11px] font-semibold text-slate-700">
                        {SHORT[r.code] || r.name}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {groups.map((g) => (
                    <React.Fragment key={g.key}>
                      <tr>
                        <td colSpan={roles.length + 1} className="sticky left-0 border-b border-slate-100 bg-slate-50 px-3 py-1.5 text-[11.5px] font-semibold uppercase tracking-wider text-slate-500">
                          <span className="mr-2 rounded bg-slate-200 px-1.5 py-0.5 text-[10.5px] text-slate-600">{g.module}</span>
                          {g.title}
                        </td>
                      </tr>
                      {g.permissions.map((p) => (
                        <tr key={p.name} className="hover:bg-slate-50/70">
                          <td className="sticky left-0 z-10 border-b border-slate-100 bg-white px-3 py-1.5">
                            <span className="block text-slate-800">{p.title}</span>
                            <span className="block font-mono text-[10.5px] text-slate-400">{p.name}</span>
                          </td>
                          {roles.map((r) => {
                            const k = key(r.id, p.name);
                            const on = value(r.id, p.name);
                            const isStaged = staged[k] !== undefined;
                            return (
                              <td key={r.id} className="border-b border-slate-100 px-1 py-1 text-center">
                                <button
                                  type="button"
                                  disabled={!canPropose}
                                  onClick={() => toggle(r.id, p.name)}
                                  aria-pressed={on}
                                  aria-label={`${r.name}: ${p.title}`}
                                  className={cn(
                                    "inline-flex h-7 w-7 items-center justify-center rounded-md transition-colors disabled:cursor-default",
                                    isStaged ? "bg-amber-100 text-amber-800 ring-1 ring-amber-400" : on ? "bg-emerald-100 text-emerald-700" : "text-slate-300",
                                    canPropose && !isStaged && (on ? "hover:bg-emerald-200" : "hover:bg-slate-100 hover:text-slate-500")
                                  )}
                                >
                                  {on ? <Check size={14} strokeWidth={3} /> : isStaged ? <Minus size={14} /> : <span className="h-1.5 w-1.5 rounded-full bg-current" />}
                                </button>
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </React.Fragment>
                  ))}
                </tbody>
              </table>
              {!groups.length && <EmptyState icon={Search} title="No permission matches" text="Try another search or module." />}
            </div>
          </section>

          {stagedList.length > 0 && (
            <div className="fixed inset-x-0 bottom-0 z-40 border-t border-amber-200 bg-amber-50/95 px-4 py-3 backdrop-blur lg:left-[280px]">
              <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-3">
                <span className="text-[13px] font-medium text-amber-900">{stagedList.length} change{stagedList.length > 1 ? "s" : ""} staged — nothing changes until a second administrator or the DAF confirms.</span>
                <span className="ml-auto flex gap-2">
                  <Button variant="outline" onClick={() => setStaged({})}><Undo2 size={14} /> Discard</Button>
                  <Button onClick={() => setReview(true)}>Review & submit</Button>
                </span>
              </div>
            </div>
          )}
        </>
      ) : tab === "requests" ? (
        <div className="space-y-3">
          {!requests.length && <Panel><EmptyState icon={ShieldCheck} title="No change requests" text="Proposed permission changes appear here for confirmation." /></Panel>}
          {requests.map((r) => {
            const mine = r.requested_by === user?.id;
            const changes: any[] = r.changes || [];
            return (
              <Panel
                key={r.id}
                title={
                  <span className="flex flex-wrap items-center gap-2">
                    {r.role_name}
                    <Badge tone={r.status === "pending" ? "warning" : r.status === "approved" ? "success" : r.status === "rejected" ? "danger" : "neutral"}>
                      {r.status === "pending" ? "Waiting for confirmation" : r.status === "approved" ? "Confirmed" : r.status}
                    </Badge>
                  </span>
                }
                subtitle={`Proposed by ${r.expand?.requested_by?.name || "?"} · ${formatDistanceToNow(new Date(r.created.replace(" ", "T")), { addSuffix: true })}`}
                action={
                  r.status === "pending" ? (
                    <span className="flex gap-2">
                      {mine && <Button size="sm" variant="outline" onClick={() => withdraw(r.id)}>Withdraw</Button>}
                      {canConfirm && !mine && (
                        <>
                          <Button size="sm" variant="outline" onClick={() => setDeciding({ req: r, decision: "reject" })}><X size={13} /> Reject</Button>
                          <Button size="sm" onClick={() => setDeciding({ req: r, decision: "approve" })}><Check size={13} /> Confirm</Button>
                        </>
                      )}
                      {canConfirm && mine && <span className="text-[12px] text-slate-500">Another administrator or the DAF must confirm.</span>}
                    </span>
                  ) : undefined
                }
              >
                <p className="mb-3 rounded-md bg-slate-50 px-3 py-2 text-[13px] text-slate-700">“{r.reason}”</p>
                <ul className="divide-y divide-slate-100 rounded-md border border-slate-200">
                  {changes.map((c, i) => (
                    <li key={i} className="flex items-center gap-3 px-3 py-2 text-[13px]">
                      <span className={cn("flex h-6 w-6 shrink-0 items-center justify-center rounded-full", c.to ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700")}>{c.to ? <Plus size={13} /> : <Minus size={13} />}</span>
                      <span className="min-w-0 flex-1">
                        <span className="font-medium text-slate-900">{c.to ? "Grant" : "Remove"}</span> <span className="text-slate-700">{PERMISSION_TITLES[c.permission] || c.title}</span>
                        <span className="block font-mono text-[11px] text-slate-400">{c.permission}</span>
                      </span>
                      <Badge>{c.role_name}</Badge>
                    </li>
                  ))}
                  {(r.meta_changes || []).map((c: any, i: number) => (
                    <li key={`m${i}`} className="flex items-center gap-3 px-3 py-2 text-[13px]">
                      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-blue-100 text-blue-700"><Users size={12} /></span>
                      <span className="flex-1">{c.field.replace("_", " ")}: {c.from} → <strong>{c.to}</strong></span>
                      <Badge>{c.role_name}</Badge>
                    </li>
                  ))}
                </ul>
                {r.status !== "pending" && r.status !== "cancelled" && (
                  <p className="mt-3 flex items-center gap-2 text-[12.5px] text-slate-600">
                    {r.status === "approved" ? <CheckCircle2 size={14} className="text-emerald-600" /> : <XCircle size={14} className="text-red-600" />}
                    {r.status === "approved" ? "Confirmed" : "Rejected"} by {r.expand?.decided_by?.name}{r.decision_comment ? ` — “${r.decision_comment}”` : ""}
                  </p>
                )}
              </Panel>
            );
          })}
        </div>
      ) : (
        <ul className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {roles.map((r) => {
            const def = roleDef(r.code);
            const count = (r.permitions || []).filter((p: any) => p.access).length;
            return (
              <li key={r.id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-card">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h3 className="text-[14.5px] font-semibold text-slate-900">{r.name}</h3>
                    <p className="font-mono text-[11px] text-slate-400">{r.code || "custom role"}</p>
                  </div>
                  <span className="flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[11.5px] font-medium text-slate-600"><Users size={12} /> {holders(r.id)}</span>
                </div>
                <p className="mt-2 text-[12.5px] leading-relaxed text-slate-600">{def?.description || r.description}</p>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  <Badge tone="info">{count} permissions</Badge>
                  <Badge>Procurement: {r.procurement_scope || "own"}</Badge>
                  <Badge>HR: {r.hr_scope || "own"}</Badge>
                  {NEVER_APPROVE.includes(r.code) && <Badge tone="warning">Never approves</Badge>}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <Dialog open={review} onOpenChange={(o) => !o && setReview(false)}>
        <DialogContent className="max-w-xl bg-white">
          <DialogHeader>
            <DialogTitle>Submit {stagedList.length} permission change{stagedList.length > 1 ? "s" : ""}</DialogTitle>
            <DialogDescription>A second administrator or the Director of Finance must confirm before the roles change.</DialogDescription>
          </DialogHeader>
          <ul className="max-h-64 divide-y divide-slate-100 overflow-y-auto rounded-md border border-slate-200">
            {stagedList.map((c) => (
              <li key={key(c.role, c.permission)} className="flex items-center gap-2.5 px-3 py-2 text-[13px]">
                <span className={cn("flex h-5 w-5 shrink-0 items-center justify-center rounded-full", c.access ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700")}>{c.access ? <Plus size={12} /> : <Minus size={12} />}</span>
                <span className="min-w-0 flex-1 truncate">{PERMISSION_TITLES[c.permission] || c.permission}</span>
                <Badge>{c.roleRec?.name}</Badge>
              </li>
            ))}
          </ul>
          {warnings.length > 0 && (
            <div className="space-y-1 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[12.5px] text-amber-900">
              {warnings.map((w) => <p key={w} className="flex items-start gap-1.5"><AlertTriangle size={13} className="mt-0.5 shrink-0" /> {w}</p>)}
            </div>
          )}
          <label className="block">
            <span className="mb-1 block text-[12.5px] font-medium text-slate-700">Reason <span className="text-red-600">*</span></span>
            <textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Why do these roles need this change?" className="h-24 w-full rounded-md border border-slate-200 px-3 py-2 text-[13px] outline-none focus:border-primary focus:ring-2 focus:ring-primary/20" />
          </label>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setReview(false)}>Back</Button>
            <Button onClick={submit} disabled={busy}><Clock size={14} /> Send for confirmation</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(deciding)} onOpenChange={(o) => !o && setDeciding(null)}>
        <DialogContent className="max-w-md bg-white">
          <DialogHeader>
            <DialogTitle>{deciding?.decision === "approve" ? "Confirm permission change" : "Reject permission change"}</DialogTitle>
            <DialogDescription>
              {deciding?.decision === "approve" ? "The roles are updated immediately and the change is written to the audit log." : "The proposer is notified with your reason."}
            </DialogDescription>
          </DialogHeader>
          <div className="flex items-center gap-2 rounded-md bg-slate-50 px-3 py-2 text-[12.5px] text-slate-600">
            <Initials name={deciding?.req?.expand?.requested_by?.name} className="h-6 w-6 text-[10px]" />
            {deciding?.req?.expand?.requested_by?.name}: “{deciding?.req?.reason}”
          </div>
          <label className="block">
            <span className="mb-1 block text-[12.5px] font-medium text-slate-700">Comment{deciding?.decision === "reject" && <span className="text-red-600"> *</span>}</span>
            <textarea value={comment} onChange={(e) => setComment(e.target.value)} className="h-20 w-full rounded-md border border-slate-200 px-3 py-2 text-[13px] outline-none focus:border-primary focus:ring-2 focus:ring-primary/20" />
          </label>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setDeciding(null)}>Cancel</Button>
            <Button variant={deciding?.decision === "reject" ? "danger" : "default"} onClick={decide} disabled={busy}>{deciding?.decision === "approve" ? "Confirm change" : "Reject"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
