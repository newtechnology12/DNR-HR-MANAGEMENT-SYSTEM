/**
 * Administration → Permission matrix (IMS spec §2). Roles × permissions, grouped by module.
 * Administrators stage changes and submit them with a reason; a second administrator or the DAF
 * must confirm before anything changes (maker–checker, enforced on the server). Both are audited.
 */
import * as React from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "react-query";
import { toast } from "sonner";
import { AlertTriangle, Check, CheckCircle2, Clock, Minus, Plus, Search, ShieldCheck, Undo2, Users, X, XCircle } from "lucide-react";
import pocketbase from "@/lib/pocketbase";
import { useAuth, usePermissions } from "@/context/auth.context";
import { PERMISSION_GROUPS, PERMISSION_TITLES, imsApi, roleDef } from "@/lib/ims";
import { errorMessage } from "@/lib/procurement";
import { exportReport } from "@/lib/exporter";
import ExportMenu from "@/components/enterprise/ExportMenu";
import { ListSkeleton } from "@/components/enterprise/ui";
import {
  Button,
  Card,
  CardHeader,
  Column,
  DataTable,
  EmptyState,
  Field,
  FilterBar,
  FilterSelect,
  Modal,
  Page,
  PageHeader,
  Person,
  Pill,
  StatusPill,
  Tabs,
  Textarea,
  fmtWhen,
} from "@/components/ims";
import { cn } from "@/utils";

const SHORT: Record<string, string> = {
  SYS_ADMIN: "Admin", SG: "SG", DAF: "DAF", ACCOUNTANT: "Acct", BUDGET_OFFICER: "Budget", CASHIER: "Cashier", PROCUREMENT_OFFICER: "Proc.",
  HOD: "HoD", HR_PAYROLL: "HR", STORE_ASSET: "Store", STAFF: "Staff", INTERNAL_AUDITOR: "Audit", MGMT_VIEWER: "Board",
};
const NEVER_APPROVE = ["SYS_ADMIN", "INTERNAL_AUDITOR", "MGMT_VIEWER"];
type Tab = "matrix" | "requests" | "roles";
const key = (role: string, perm: string) => `${role}|${perm}`;

/** Change requests in the glossary: pending → Pending approval, approved → Approved (confirmed)… */
const REQUEST_STATUS: Record<string, { word: string; note?: string }> = {
  pending: { word: "Pending approval", note: "Waiting for a second administrator or the DAF" },
  approved: { word: "Approved", note: "Confirmed and applied" },
  rejected: { word: "Rejected" },
  cancelled: { word: "Cancelled", note: "Withdrawn by the proposer" },
};

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
  const [tried, setTried] = React.useState(false);

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
    setTried(true);
    if (reason.trim().length < 10) return toast.error("Explain the change (at least 10 characters) — the confirmer reads this.");
    setBusy(true);
    try {
      const r = await imsApi.proposeChanges({ reason: reason.trim(), changes: stagedList.map((c) => ({ role: c.role, permission: c.permission, access: c.access })) });
      toast.success(`${r.changes} change(s) sent for confirmation by a second administrator or the DAF`);
      setStaged({});
      setReview(false);
      setReason("");
      setTried(false);
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
  const [decideTried, setDecideTried] = React.useState(false);
  async function decide() {
    if (!deciding) return;
    setDecideTried(true);
    if (deciding.decision === "reject" && !comment.trim()) return toast.error("Give a reason for rejecting.");
    setBusy(true);
    try {
      await imsApi.decideChange(deciding.req.id, deciding.decision, comment.trim());
      toast.success(deciding.decision === "approve" ? "Confirmed — the roles are updated" : "Change rejected");
      setDeciding(null);
      setComment("");
      setDecideTried(false);
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

  type ChangeRow = { k: string; grant?: boolean; meta?: boolean; title: string; name?: string; role: string };
  const changeColumns: Column<ChangeRow>[] = [
    {
      key: "change",
      header: "Change",
      width: "120px",
      nowrap: true,
      cell: (c) =>
        c.meta ? (
          <span className="inline-flex items-center gap-1.5 font-semibold text-ims-info"><Users size={14} aria-hidden /> Setting</span>
        ) : c.grant ? (
          <span className="inline-flex items-center gap-1.5 font-semibold text-ims-success"><Plus size={14} aria-hidden /> Grant</span>
        ) : (
          <span className="inline-flex items-center gap-1.5 font-semibold text-ims-danger"><Minus size={14} aria-hidden /> Remove</span>
        ),
    },
    { key: "permission", header: "Permission", clamp: true, cell: (c) => c.title, sub: (c) => (c.name ? <span className="font-mono">{c.name}</span> : null) },
    { key: "role", header: "Role", nowrap: true, cell: (c) => <Pill>{c.role}</Pill> },
  ];

  const tabs = [
    { key: "matrix", label: "Matrix" },
    { key: "requests", label: "Change requests", count: q.data ? pending.length : undefined },
    { key: "roles", label: "Roles", count: q.data ? roles.length : undefined },
  ];

  return (
    <Page className={cn(stagedList.length > 0 && tab === "matrix" && "pb-28")}>
      <PageHeader
        breadcrumbs={[{ label: "Administration" }, { label: "Permission matrix" }]}
        title="Permission matrix"
        subtitle="Who may do what, per role. A second administrator or the Director of Finance confirms every change."
        actions={<ExportMenu onExport={doExport} permission={["view_security_admin", "export_audit_logs"]} disabled={!roles.length} />}
      />

      <Tabs label="Permission matrix sections" tabs={tabs} active={tab} onChange={(k) => setTab(k as Tab)} />

      {q.isLoading ? (
        <Card><ListSkeleton rows={10} /></Card>
      ) : tab === "matrix" ? (
        <>
          {!canPropose && (
            <p className="flex items-center gap-2 rounded-control border border-ims-border bg-ims-card px-3.5 py-2.5 text-t-small text-ims-body">
              <ShieldCheck size={15} className="shrink-0 text-ims-muted" aria-hidden /> Read-only view. Only System Administrators can propose changes.
            </p>
          )}
          <Card padded={false} className="overflow-hidden">
            <FilterBar
              search={{ value: search, onChange: setSearch, placeholder: "Search permission name or code" }}
              right={
                <span className="flex flex-wrap items-center gap-3 text-t-small text-ims-muted">
                  <span className="inline-flex items-center gap-1.5"><span className="inline-flex h-5 w-5 items-center justify-center rounded-md bg-ims-success-bg text-ims-success"><Check size={12} strokeWidth={3} aria-hidden /></span> Granted</span>
                  <span className="inline-flex items-center gap-1.5"><span className="inline-block h-5 w-5 rounded-md bg-ims-warning-bg ring-1 ring-inset ring-ims-priority-high" /> Change not yet sent</span>
                </span>
              }
            >
              <FilterSelect
                label="Module"
                value={module === "all" ? "" : module}
                onChange={(v) => setModule(v || "all")}
                options={PERMISSION_GROUPS.map((g) => ({ value: g.key, label: `${g.module} · ${g.title}` }))}
                className="[&_select]:w-[240px]"
              />
            </FilterBar>
            {/* A grid of toggles with a sticky header row and first column: the kit's DataTable has neither, so this stays a table built on the tokens. */}
            <div className="max-h-[70vh] overflow-auto border-t border-ims-divider">
              <table className="w-full min-w-[1080px] border-separate border-spacing-0 text-t-body text-ims-text">
                <caption className="sr-only">Permissions per role</caption>
                <thead className="sticky top-0 z-20">
                  <tr>
                    <th scope="col" className="sticky left-0 z-30 h-11 w-[340px] border-b border-r border-ims-divider bg-ims-thead px-3.5 text-left text-t-small font-semibold text-ims-muted">Permission</th>
                    {roles.map((r) => (
                      <th key={r.id} scope="col" title={`${r.name} — ${roleDef(r.code)?.description || ""}`} className="h-11 w-[64px] border-b border-ims-divider bg-ims-thead px-1 text-center text-t-small font-semibold text-ims-body">
                        {SHORT[r.code] || r.name}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {groups.map((g) => (
                    <React.Fragment key={g.key}>
                      <tr>
                        <th scope="colgroup" colSpan={roles.length + 1} className="sticky left-0 border-b border-ims-divider bg-ims-subtle px-3.5 py-2 text-left text-t-small font-bold text-ims-text">
                          <span className="mr-2 rounded-md bg-ims-card px-1.5 py-0.5 text-t-hint font-semibold text-ims-muted ring-1 ring-inset ring-ims-border">{g.module}</span>
                          {g.title}
                        </th>
                      </tr>
                      {g.permissions.map((p) => (
                        <tr key={p.name} className="group">
                          <th scope="row" className="sticky left-0 z-10 border-b border-r border-ims-divider bg-ims-card px-3.5 py-2 text-left font-normal group-hover:bg-ims-hover">
                            <span className="block text-t-body text-ims-text">{p.title}</span>
                            <span className="block font-mono text-t-hint text-ims-faint">{p.name}</span>
                          </th>
                          {roles.map((r) => {
                            const k = key(r.id, p.name);
                            const on = value(r.id, p.name);
                            const isStaged = staged[k] !== undefined;
                            return (
                              <td key={r.id} className="border-b border-ims-divider px-1 py-1 text-center group-hover:bg-ims-hover">
                                <button
                                  type="button"
                                  disabled={!canPropose}
                                  onClick={() => toggle(r.id, p.name)}
                                  aria-pressed={on}
                                  aria-label={`${r.name}: ${p.title}`}
                                  className={cn(
                                    "inline-flex h-8 w-8 items-center justify-center rounded-md transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ims-focus disabled:cursor-default",
                                    isStaged ? "bg-ims-warning-bg text-ims-warning ring-1 ring-inset ring-ims-priority-high" : on ? "bg-ims-success-bg text-ims-success" : "text-ims-priority-low",
                                    canPropose && !isStaged && (on ? "hover:bg-ims-success/20" : "hover:bg-ims-subtle hover:text-ims-muted")
                                  )}
                                >
                                  {on ? <Check size={14} strokeWidth={3} aria-hidden /> : isStaged ? <Minus size={14} aria-hidden /> : <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden />}
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
              {!groups.length && <EmptyState icon={Search} text="No permission matches. Try another search or module." />}
            </div>
          </Card>

          {stagedList.length > 0 && (
            <div className="fixed inset-x-0 bottom-0 z-40 border-t border-ims-priority-high/50 bg-ims-warning-bg/95 px-4 py-3 backdrop-blur lg:left-[280px]">
              <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-3">
                <span className="text-t-body font-semibold text-ims-warning">
                  {stagedList.length} change{stagedList.length > 1 ? "s" : ""} not yet sent. Nothing changes until a second administrator or the DAF confirms.
                </span>
                <span className="ml-auto flex gap-2">
                  <Button icon={Undo2} onClick={() => setStaged({})}>Discard</Button>
                  <Button variant="primary" onClick={() => { setTried(false); setReview(true); }}>Review and send</Button>
                </span>
              </div>
            </div>
          )}
        </>
      ) : tab === "requests" ? (
        <div className="flex flex-col gap-4">
          {!requests.length && <Card><EmptyState icon={ShieldCheck} text="No change requests yet. Proposed permission changes appear here for confirmation." /></Card>}
          {requests.map((r) => {
            const mine = r.requested_by === user?.id;
            const changes: any[] = r.changes || [];
            const st = REQUEST_STATUS[r.status];
            const rows: ChangeRow[] = [
              ...changes.map((c, i) => ({ k: `c${i}`, grant: Boolean(c.to), title: PERMISSION_TITLES[c.permission] || c.title, name: c.permission, role: c.role_name })),
              ...(r.meta_changes || []).map((c: any, i: number) => ({ k: `m${i}`, meta: true, title: `${String(c.field).replace("_", " ")}: ${c.from} → ${c.to}`, role: c.role_name })),
            ];
            return (
              <Card key={r.id} padded={false} className="overflow-hidden">
                <div className="px-5 pt-5">
                  <CardHeader
                    title={
                      <span className="flex flex-wrap items-center gap-2">
                        {r.role_name}
                        <StatusPill status={st?.word || r.status} />
                      </span>
                    }
                    subtitle={`Proposed by ${r.expand?.requested_by?.name || "?"} · ${fmtWhen(r.created)}${st?.note ? ` · ${st.note}` : ""}`}
                    action={
                      r.status === "pending" ? (
                        <span className="flex flex-wrap items-center gap-2">
                          {mine && <Button size="sm" onClick={() => withdraw(r.id)}>Withdraw</Button>}
                          {canConfirm && !mine && (
                            <>
                              <Button size="sm" icon={X} onClick={() => { setComment(""); setDecideTried(false); setDeciding({ req: r, decision: "reject" }); }}>Reject</Button>
                              <Button size="sm" variant="primary" icon={Check} onClick={() => { setComment(""); setDecideTried(false); setDeciding({ req: r, decision: "approve" }); }}>Confirm</Button>
                            </>
                          )}
                          {canConfirm && mine && <span className="text-t-small text-ims-muted">Another administrator or the DAF must confirm.</span>}
                        </span>
                      ) : undefined
                    }
                  />
                  <blockquote className="mb-4 rounded-control bg-ims-thead px-3.5 py-2.5 text-t-body text-ims-body">“{r.reason}”</blockquote>
                </div>
                <div className="border-t border-ims-divider">
                  <DataTable columns={changeColumns} rows={rows} rowKey={(c) => c.k} minWidth={560} caption={`Changes for ${r.role_name}`} empty={<EmptyState compact text="No change listed." />} />
                </div>
                {r.status !== "pending" && r.status !== "cancelled" && (
                  <p className="flex items-center gap-2 border-t border-ims-divider px-5 py-3 text-t-small text-ims-body">
                    {r.status === "approved" ? <CheckCircle2 size={15} className="shrink-0 text-ims-success" aria-hidden /> : <XCircle size={15} className="shrink-0 text-ims-danger" aria-hidden />}
                    {r.status === "approved" ? "Confirmed" : "Rejected"} by {r.expand?.decided_by?.name}{r.decision_comment ? ` — “${r.decision_comment}”` : ""}
                  </p>
                )}
              </Card>
            );
          })}
        </div>
      ) : (
        <ul className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {roles.map((r) => {
            const def = roleDef(r.code);
            const count = (r.permitions || []).filter((p: any) => p.access).length;
            return (
              <li key={r.id}>
                <Card className="h-full">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <h2 className="text-t-section text-ims-text">{r.name}</h2>
                      <p className="font-mono text-t-hint text-ims-faint">{r.code || "Custom role"}</p>
                    </div>
                    <span className="inline-flex shrink-0 items-center gap-1 rounded-pill bg-ims-neutral-bg px-2.5 py-1 text-t-small font-semibold text-ims-neutral" title="Active people holding this role">
                      <Users size={13} aria-hidden /> {holders(r.id)}
                    </span>
                  </div>
                  <p className="mt-2 text-t-body text-ims-body">{def?.description || r.description}</p>
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    <Pill tone="info">{count} permissions</Pill>
                    <Pill>Procurement: {r.procurement_scope || "own"}</Pill>
                    <Pill>HR: {r.hr_scope || "own"}</Pill>
                    {NEVER_APPROVE.includes(r.code) && <Pill tone="warning">Never approves</Pill>}
                  </div>
                </Card>
              </li>
            );
          })}
        </ul>
      )}

      <Modal
        open={review}
        onClose={() => setReview(false)}
        title={`Send ${stagedList.length} permission change${stagedList.length > 1 ? "s" : ""} for confirmation`}
        description="A second administrator or the Director of Finance must confirm before the roles change."
        footer={
          <>
            <Button variant="secondary" onClick={() => setReview(false)} disabled={busy}>Back</Button>
            <Button variant="primary" icon={Clock} onClick={submit} loading={busy}>Send for confirmation</Button>
          </>
        }
      >
        <ul className="max-h-64 divide-y divide-ims-divider overflow-y-auto rounded-control border border-ims-border">
          {stagedList.map((c) => (
            <li key={key(c.role, c.permission)} className="flex items-center gap-2.5 px-3 py-2.5 text-t-body">
              <span className={cn("flex h-6 w-6 shrink-0 items-center justify-center rounded-full", c.access ? "bg-ims-success-bg text-ims-success" : "bg-ims-danger-bg text-ims-danger")} aria-label={c.access ? "Grant" : "Remove"}>
                {c.access ? <Plus size={13} aria-hidden /> : <Minus size={13} aria-hidden />}
              </span>
              <span className="min-w-0 flex-1 truncate">{PERMISSION_TITLES[c.permission] || c.permission}</span>
              <Pill>{c.roleRec?.name}</Pill>
            </li>
          ))}
        </ul>
        {warnings.length > 0 && (
          <div role="alert" className="space-y-1 rounded-control border border-ims-priority-high/50 bg-ims-warning-bg px-3.5 py-2.5 text-t-small text-ims-warning">
            {warnings.map((w) => <p key={w} className="flex items-start gap-1.5"><AlertTriangle size={14} className="mt-px shrink-0" aria-hidden /> {w}</p>)}
          </div>
        )}
        <Field label="Reason" required htmlFor="pm-reason" hint="The confirmer reads this. At least 10 characters." error={tried && reason.trim().length < 10 ? "Explain why these roles need this change (at least 10 characters)." : null}>
          <Textarea id="pm-reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Why do these roles need this change?" invalid={tried && reason.trim().length < 10} />
        </Field>
      </Modal>

      <Modal
        open={Boolean(deciding)}
        onClose={() => setDeciding(null)}
        size="sm"
        title={deciding?.decision === "approve" ? "Confirm this permission change?" : "Reject this permission change?"}
        description={deciding?.decision === "approve" ? "The roles are updated at once and the change is written to the audit log." : "The proposer is notified with your reason."}
        footer={
          <>
            <Button variant="secondary" onClick={() => setDeciding(null)} disabled={busy}>Cancel</Button>
            <Button variant={deciding?.decision === "reject" ? "danger" : "primary"} onClick={decide} loading={busy}>{deciding?.decision === "approve" ? "Confirm change" : "Reject"}</Button>
          </>
        }
      >
        <div className="rounded-control bg-ims-thead px-3.5 py-2.5 text-t-body">
          <Person name={deciding?.req?.expand?.requested_by?.name} detail="Proposed the change" />
          <p className="mt-1.5 text-ims-body">“{deciding?.req?.reason}”</p>
        </div>
        <Field
          label={deciding?.decision === "reject" ? "Reason" : "Comment (optional)"}
          required={deciding?.decision === "reject"}
          htmlFor="pm-comment"
          error={decideTried && deciding?.decision === "reject" && !comment.trim() ? "Write why you reject the change so the proposer knows what to fix." : null}
        >
          <Textarea id="pm-comment" value={comment} onChange={(e) => setComment(e.target.value)} invalid={decideTried && deciding?.decision === "reject" && !comment.trim()} />
        </Field>
      </Modal>
    </Page>
  );
}
