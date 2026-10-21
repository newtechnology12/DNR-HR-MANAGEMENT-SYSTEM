/**
 * HR & payroll → Staff loans: loans to staff repaid by monthly instalments deducted in the payroll.
 * HR records a loan, Finance approves it (never the person who recorded it, never the borrower), and the
 * balance goes down each time a payroll that deducted an instalment is paid.
 */
import * as React from "react";
import { useQuery } from "react-query";
import { useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { Check, Coins, Plus, X, XCircle } from "lucide-react";
import pocketbase from "@/lib/pocketbase";
import { useAuth, usePermissions } from "@/context/auth.context";
import { LOAN_STATUS, LOAN_TYPES, MONTHS, loansApi, rwf } from "@/lib/hr";
import { showDay } from "@/lib/ims";
import { errorMessage } from "@/lib/procurement";
import { cn } from "@/utils";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PageHeader, StatusBadge } from "@/components/enterprise/ui";
import RecordTable, { RecordView } from "@/components/enterprise/RecordTable";
import { Field, inputCls, textareaCls } from "@/components/portal/kit";
import { MoneyInput, ReasonDialog, Stat } from "@/components/treasury/TreasuryKit";

const monthLabel = (y: number, m: number) => `${MONTHS[(m - 1 + 12) % 12]} ${y}`;
/** Month the last instalment falls in. */
const endOf = (l: { start_year: number; start_month: number; installments: number }) => {
  const k = l.start_year * 12 + (l.start_month - 1) + Math.max(1, l.installments) - 1;
  return monthLabel(Math.floor(k / 12), (k % 12) + 1);
};

export default function StaffLoans() {
  const [params, setParams] = useSearchParams();
  const { can } = usePermissions();
  const [creating, setCreating] = React.useState(false);
  const [openId, setOpenId] = React.useState("");
  const [refresh, setRefresh] = React.useState(0);
  const approver = can("approve_payroll");
  const view = params.get("view") || (approver && !can("create_payroll") ? "pending" : "all");
  const views: RecordView[] = [
    { key: "all", label: "All" },
    { key: "pending", label: "Waiting for Finance", filter: 'status = "pending_approval"' },
    { key: "active", label: "Being repaid", filter: 'status = "active"' },
    { key: "closed", label: "Closed", filter: 'status = "repaid" || status = "rejected" || status = "cancelled"' },
  ];
  const stats = useQuery(["staff-loan-stats", refresh], () => pocketbase.collection("staff_loans").getFullList({ fields: "status,balance,installment,principal,repaid" }));
  const all = (stats.data || []) as any[];
  const active = all.filter((l) => l.status === "active");
  const done = () => {
    setRefresh((n) => n + 1);
  };
  return (
    <div className="space-y-4 px-3 sm:px-4">
      <PageHeader
        title="Staff loans"
        description="Loans to staff repaid by monthly instalments deducted in the payroll. HR records the loan, the DAF approves it, and the balance goes down when each payroll is paid."
        breadcrumbs={[{ title: "HR & payroll", link: "/dashboard/hr/payroll" }, { title: "Payroll", link: "/dashboard/hr/payroll" }, { title: "Staff loans", link: "/dashboard/hr/payroll/loans" }]}
        actions={can("create_payroll") && <Button onClick={() => setCreating(true)}><Plus size={15} /> Record a loan</Button>}
      />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Being repaid" value={active.length} sub={`${all.filter((l) => l.status === "repaid").length} repaid in full`} />
        <Stat label="Outstanding" value={`RWF ${rwf(active.reduce((a, l) => a + l.balance, 0))}`} sub={`of RWF ${rwf(active.reduce((a, l) => a + l.principal, 0))} lent`} />
        <Stat label="Recovered each month" value={`RWF ${rwf(active.reduce((a, l) => a + Math.min(l.installment, l.balance), 0))}`} sub="through the payroll" tone="success" />
        <Stat label="Waiting for Finance" value={all.filter((l) => l.status === "pending_approval").length} sub="to approve or reject" tone={all.some((l) => l.status === "pending_approval") ? "warning" : "default"} />
      </div>
      <RecordTable<any>
        collection="staff_loans"
        expand="employee,employee.department,recorded_by"
        views={views}
        activeView={view}
        onViewChange={(v) => setParams(v === "all" ? {} : { view: v })}
        searchFields={["number", "purpose", "employee.name"]}
        filters={[{ field: "loan_type", label: "Type", options: Object.entries(LOAN_TYPES).map(([value, label]) => ({ value, label })) }]}
        defaultSort="-created"
        refreshKey={refresh}
        exportName="staff-loans"
        exportTitle="Staff loans"
        exportPermission={["export_payroll", "approve_payroll"]}
        onRowClick={(r) => setOpenId(r.id)}
        empty={{ icon: Coins, title: "No staff loans", text: "HR records a loan with its monthly instalment; Finance approves it and the payroll deducts it." }}
        columns={[
          { key: "number", header: "Loan", sortField: "number", cell: (r) => <span className="whitespace-nowrap font-mono text-[12.5px] font-semibold text-slate-800">{r.number}</span> },
          {
            key: "employee", header: "Employee", csv: (r) => r.expand?.employee?.name || "",
            cell: (r) => (
              <span className="block min-w-[180px]">
                <span className="block font-medium text-slate-900">{r.expand?.employee?.name}</span>
                <span className="block text-[12px] text-slate-500">{r.expand?.employee?.expand?.department?.name || "—"}</span>
              </span>
            ),
          },
          {
            key: "purpose", header: "Type / purpose", csv: (r) => `${LOAN_TYPES[r.loan_type] || r.loan_type}: ${r.purpose}`,
            cell: (r) => (
              <span className="block min-w-[180px]">
                <span className="block text-[12.5px] font-medium text-slate-700">{LOAN_TYPES[r.loan_type] || r.loan_type}</span>
                <span className="block max-w-[260px] truncate text-[12px] text-slate-500">{r.purpose}</span>
              </span>
            ),
          },
          { key: "principal", header: "Amount", sortField: "principal", align: "right", format: "money", csv: (r) => r.principal, cell: (r) => <span className="whitespace-nowrap font-semibold tabular-nums">{rwf(r.principal)}</span> },
          {
            key: "installment", header: "Repayment", sortField: "installment", csv: (r) => `${r.installment} x ${r.installments} from ${monthLabel(r.start_year, r.start_month)}`,
            cell: (r) => (
              <span className="block whitespace-nowrap text-[12.5px]">
                <span className="block tabular-nums text-slate-800">{rwf(r.installment)} × {r.installments} months</span>
                <span className="block text-[12px] text-slate-500">{monthLabel(r.start_year, r.start_month)} – {endOf(r)}</span>
              </span>
            ),
          },
          {
            key: "balance", header: "Balance", sortField: "balance", align: "right", format: "money", csv: (r) => r.balance,
            cell: (r) => {
              const pct = r.principal ? Math.round((r.repaid / r.principal) * 100) : 0;
              return (
                <span className="block min-w-[120px] text-right">
                  <span className="block font-semibold tabular-nums text-slate-900">{rwf(r.balance)}</span>
                  <span className="mt-1 block h-1.5 w-full overflow-hidden rounded-full bg-slate-100" title={`${pct}% repaid`}><span className="block h-full rounded-full bg-emerald-500" style={{ width: `${pct}%` }} /></span>
                </span>
              );
            },
          },
          { key: "by", header: "Recorded by", exportOnly: true, csv: (r) => r.expand?.recorded_by?.name || "", cell: () => null },
          { key: "status", header: "Status", sortField: "status", csv: (r) => LOAN_STATUS[r.status]?.label || r.status, cell: (r) => <StatusBadge status={r.status} map={LOAN_STATUS} /> },
        ]}
      />
      {creating && <NewLoanDialog onClose={() => setCreating(false)} onSaved={(id) => { setCreating(false); done(); setOpenId(id); }} />}
      {openId && <LoanDialog id={openId} onClose={() => setOpenId("")} onChanged={done} />}
    </div>
  );
}

function NewLoanDialog({ onClose, onSaved }: { onClose: () => void; onSaved: (id: string) => void }) {
  const { user }: any = useAuth();
  const now = new Date();
  const months = Array.from({ length: 13 }, (_, i) => {
    const k = now.getFullYear() * 12 + now.getMonth() + i;
    return { y: Math.floor(k / 12), m: (k % 12) + 1 };
  });
  const [v, setV] = React.useState({ employee: "", loan_type: "staff_loan", purpose: "", principal: "" as number | "", installment: "" as number | "", start: `${months[1].y}-${months[1].m}` });
  const [busy, setBusy] = React.useState(false);
  const people = useQuery(["loan-people"], () => pocketbase.collection("users").getFullList({ filter: 'status = "Active"', sort: "name", fields: "id,name,department,expand.department.name", expand: "department" }), { staleTime: 300_000 });
  const context = useQuery(["loan-context", v.employee], async () => {
    const [slip, loans] = await Promise.all([
      pocketbase.collection("employees_payrolls").getList(1, 1, { filter: `employee = "${v.employee}"`, sort: "-created", fields: "net,loans,period_label" }).then((r) => r.items[0] as any).catch(() => null),
      pocketbase.collection("staff_loans").getFullList({ filter: `employee = "${v.employee}" && (status = "active" || status = "pending_approval")`, fields: "number,installment,balance,principal" }).catch(() => [] as any[]),
    ]);
    return { slip, running: (loans as any[]).reduce((a, l) => a + Math.min(l.installment, l.balance || l.principal), 0), loans: loans as any[] };
  }, { enabled: Boolean(v.employee) });
  const principal = Number(v.principal) || 0;
  const installment = Number(v.installment) || 0;
  const n = installment > 0 ? Math.ceil(principal / installment) : 0;
  const [sy, sm] = v.start.split("-").map(Number);
  const netBefore = context.data?.slip ? Math.round(context.data.slip.net + (context.data.slip.loans || 0)) : 0;
  const cap = netBefore ? Math.floor(netBefore / 2) - (context.data?.running || 0) : 0;
  const problems = [
    principal && principal < 1000 ? "Give the amount of the loan." : "",
    installment && (installment < 1000 || installment > principal) ? "The instalment must be between RWF 1,000 and the amount of the loan." : "",
    n > 60 ? `At this instalment the loan takes ${n} months; the limit is 60.` : "",
    netBefore && installment > cap ? `All instalments together would be more than half of the last net pay (RWF ${rwf(netBefore)}). At most RWF ${rwf(Math.max(0, cap))} a month.` : "",
  ].filter(Boolean);
  const ready = v.employee && principal >= 1000 && installment >= 1000 && v.purpose.trim().length >= 5 && !problems.length;
  const set = (k: keyof typeof v) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setV((x) => ({ ...x, [k]: e.target.value }));
  async function save() {
    setBusy(true);
    try {
      const r = await loansApi.create({ employee: v.employee, loan_type: v.loan_type, purpose: v.purpose.trim(), principal, installment, start_year: sy, start_month: sm });
      toast.success(`${r.number} recorded — Finance is notified to approve it`);
      onSaved(r.id);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-xl bg-white">
        <DialogHeader>
          <DialogTitle>Record a staff loan</DialogTitle>
          <DialogDescription>The instalment is deducted from the employee's payslip every month until the loan is repaid. Finance approves the loan before the first deduction.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <Field label="Employee" required hint={context.data?.slip ? `Last net pay RWF ${rwf(netBefore)} (${context.data.slip.period_label})${context.data.running ? ` · already repaying RWF ${rwf(context.data.running)} a month` : ""}` : v.employee ? "No payslip yet for this employee" : undefined}>
            <select className={inputCls} value={v.employee} onChange={set("employee")}>
              <option value="">Choose the employee…</option>
              {((people.data || []) as any[]).filter((p) => p.id !== user?.id).map((p) => <option key={p.id} value={p.id}>{p.name}{p.expand?.department?.name ? ` · ${p.expand.department.name}` : ""}</option>)}
            </select>
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Type of loan"><select className={inputCls} value={v.loan_type} onChange={set("loan_type")}>{Object.entries(LOAN_TYPES).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field>
            <Field label="First deduction" hint="Payroll month of the first instalment"><select className={inputCls} value={v.start} onChange={set("start")}>{months.map((x) => <option key={`${x.y}-${x.m}`} value={`${x.y}-${x.m}`}>{monthLabel(x.y, x.m)}</option>)}</select></Field>
          </div>
          <Field label="Purpose" required hint="What the loan is for, as approved under the staff loan policy"><textarea className={cn(textareaCls, "min-h-[64px]")} value={v.purpose} maxLength={500} onChange={set("purpose")} /></Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Amount lent" required><MoneyInput value={v.principal} onChange={(x) => setV((y) => ({ ...y, principal: x }))} /></Field>
            <Field label="Monthly instalment" required hint={cap > 0 ? `At most RWF ${rwf(cap)} for this employee` : undefined}><MoneyInput value={v.installment} onChange={(x) => setV((y) => ({ ...y, installment: x }))} /></Field>
          </div>
          {n > 0 && principal >= 1000 && (
            <p className="rounded-md bg-slate-50 px-3 py-2 text-[12.5px] text-slate-600">
              Repaid in <b>{n} month{n === 1 ? "" : "s"}</b>: {monthLabel(sy, sm)} – {endOf({ start_year: sy, start_month: sm, installments: n })}
              {principal % installment ? <>, the last instalment RWF {rwf(principal - installment * (n - 1))}</> : null}.
            </p>
          )}
          {problems.map((p) => <p key={p} className="text-[12.5px] text-red-600" role="alert">{p}</p>)}
        </div>
        <DialogFooter><Button variant="outline" onClick={onClose}>Cancel</Button><Button disabled={!ready || busy} onClick={save}>{busy ? "Saving…" : "Record and send to Finance"}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function LoanDialog({ id, onClose, onChanged }: { id: string; onClose: () => void; onChanged: () => void }) {
  const { user }: any = useAuth();
  const { can } = usePermissions();
  const [comment, setComment] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [cancelling, setCancelling] = React.useState(false);
  const q = useQuery(["staff-loan", id], () => pocketbase.collection("staff_loans").getOne(id, { expand: "employee,employee.department,recorded_by,decided_by" }));
  const l: any = q.data;
  const decide = async (decision: "approve" | "reject") => {
    setBusy(true);
    try {
      await loansApi.act(id, "decide", { decision, comment: comment.trim() });
      toast.success(decision === "approve" ? `${l.number} approved — the payroll deducts it from ${monthLabel(l.start_year, l.start_month)}` : `${l.number} rejected`);
      q.refetch();
      onChanged();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  const canDecide = l && l.status === "pending_approval" && can("approve_payroll") && l.recorded_by !== user?.id && l.employee !== user?.id;
  const canCancel = l && can("create_payroll") && (l.status === "pending_approval" || (l.status === "active" && !l.repaid));
  const pct = l?.principal ? Math.round((l.repaid / l.principal) * 100) : 0;
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[92vh] max-w-xl overflow-y-auto bg-white">
        {!l ? (
          <DialogHeader>
            <DialogTitle>Staff loan</DialogTitle>
            <DialogDescription>{q.isError ? errorMessage(q.error) : "Loading…"}</DialogDescription>
          </DialogHeader>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle className="flex flex-wrap items-center gap-2"><span className="font-mono">{l.number}</span> <StatusBadge status={l.status} map={LOAN_STATUS} /></DialogTitle>
              <DialogDescription>{l.expand?.employee?.name} · {l.expand?.employee?.expand?.department?.name || "—"} · {LOAN_TYPES[l.loan_type] || l.loan_type}</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 text-[13px]">
              <p className="rounded-md border border-slate-100 bg-slate-50/70 px-3 py-2 text-slate-700">{l.purpose}</p>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <div><p className="text-[11.5px] text-slate-500">Amount lent</p><p className="font-semibold tabular-nums">RWF {rwf(l.principal)}</p></div>
                <div><p className="text-[11.5px] text-slate-500">Instalment</p><p className="font-semibold tabular-nums">RWF {rwf(l.installment)}</p></div>
                <div><p className="text-[11.5px] text-slate-500">Repayment</p><p className="font-semibold">{monthLabel(l.start_year, l.start_month)} – {endOf(l)}</p></div>
                <div><p className="text-[11.5px] text-slate-500">Balance</p><p className="font-semibold tabular-nums">RWF {rwf(l.balance)}</p></div>
              </div>
              <div>
                <div className="mb-1 flex justify-between text-[12px] text-slate-500"><span>Repaid RWF {rwf(l.repaid)}</span><span>{pct}%</span></div>
                <div className="h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-emerald-500" style={{ width: `${pct}%` }} /></div>
              </div>
              <div>
                <h3 className="mb-1.5 text-[12.5px] font-semibold text-slate-800">Repayments through the payroll</h3>
                {(l.repayments || []).length ? (
                  <table className="w-full text-[12.5px]">
                    <thead><tr className="border-b border-slate-200 text-left text-[11px] uppercase tracking-wider text-slate-500"><th className="py-1.5 font-semibold">Payroll</th><th className="py-1.5 font-semibold">Paid on</th><th className="py-1.5 text-right font-semibold">Amount</th></tr></thead>
                    <tbody className="divide-y divide-slate-100">
                      {(l.repayments as any[]).map((x) => <tr key={x.payroll}><td className="py-1.5">{x.period} <span className="font-mono text-[11.5px] text-slate-500">{x.number}</span></td><td className="py-1.5">{showDay(x.date)}</td><td className="py-1.5 text-right tabular-nums">{rwf(x.amount)}</td></tr>)}
                    </tbody>
                  </table>
                ) : <p className="text-[12.5px] text-slate-500">{l.status === "active" ? `The first instalment is deducted in the ${monthLabel(l.start_year, l.start_month)} payroll and recorded when that payroll is paid.` : "None."}</p>}
              </div>
              <div className="grid gap-1 text-[12.5px] text-slate-600">
                <p>Recorded by <b>{l.expand?.recorded_by?.name || "—"}</b> on {showDay(l.created)}</p>
                {l.decided_at && <p>{l.status === "rejected" ? "Rejected" : "Approved"} by <b>{l.expand?.decided_by?.name || "—"}</b> on {showDay(l.decided_at)}{l.decision_comment ? ` — “${l.decision_comment}”` : ""}</p>}
                {l.status === "cancelled" && <p>Cancelled{l.decision_comment ? ` — “${l.decision_comment}”` : ""}</p>}
              </div>
              {canDecide && (
                <div className="rounded-lg border border-amber-200 bg-amber-50/60 p-3">
                  <p className="mb-2 text-[12.5px] font-medium text-amber-900">Your decision</p>
                  <textarea className={cn(textareaCls, "min-h-[60px] bg-white")} placeholder="Comment (required to reject)" value={comment} onChange={(e) => setComment(e.target.value)} />
                  <div className="mt-2 flex flex-wrap justify-end gap-2">
                    <Button size="sm" variant="outline" className="text-red-700" disabled={busy || comment.trim().length < 5} onClick={() => decide("reject")}><X size={14} /> Reject</Button>
                    <Button size="sm" disabled={busy} onClick={() => decide("approve")}><Check size={14} /> Approve</Button>
                  </div>
                </div>
              )}
              {l.status === "pending_approval" && !canDecide && can("approve_payroll") && <p className="text-[12px] text-slate-500">Separation of duties: the person who recorded the loan, and the borrower, cannot approve it.</p>}
            </div>
            <DialogFooter className="gap-2">
              {canCancel && <Button variant="ghost" className="mr-auto text-red-700" onClick={() => setCancelling(true)}><XCircle size={14} /> Cancel loan</Button>}
              <Button variant="outline" onClick={onClose}>Close</Button>
            </DialogFooter>
            <ReasonDialog
              open={cancelling}
              title={`Cancel ${l.number}?`}
              description="Nothing has been deducted yet; the loan is kept as cancelled."
              confirmLabel="Cancel loan"
              min={5}
              onClose={() => setCancelling(false)}
              onConfirm={async (reason) => {
                try {
                  await loansApi.act(id, "cancel", { reason });
                  toast.success(`${l.number} cancelled`);
                  setCancelling(false);
                  q.refetch();
                  onChanged();
                } catch (e) {
                  toast.error(errorMessage(e));
                }
              }}
            />
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
