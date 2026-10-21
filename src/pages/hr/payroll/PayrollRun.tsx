import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "react-query";
import { useParams, useSearchParams } from "react-router-dom";
import * as XLSX from "xlsx";
import { format } from "date-fns";
import { toast } from "sonner";
import { ArrowUpRight, Ban, Banknote, Calculator, Check, Clock, CornerUpLeft, Download, Landmark, MessageSquare, Send, UserPlus, Users, Wallet, XCircle } from "lucide-react";
import pocketbase from "@/lib/pocketbase";
import { useRoles } from "@/context/roles.context";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { EmptyState, Panel, StatusBadge } from "@/components/enterprise/ui";
import { ActionDialog, ActionKind, ApprovalTracker } from "@/components/enterprise/Approval";
import { Chatter, ControlBar, DocumentPage, FieldGrid, Notebook, Sheet, SheetTitle, SmartButtons, toChatter } from "@/components/enterprise/DocumentLayout";
import { compactMoney, errorMessage, procurementApi } from "@/lib/procurement";
import { CONTRIBUTION_BASES, PAYROLL_STATUS, payrollApi, rwf } from "@/lib/hr";
import { cn } from "@/utils";
import { Field, inputCls } from "@/components/portal/kit";
import { PayslipDialog } from "./Payslip";

const STEPS = [
  { key: "draft", label: "Draft" },
  { key: "computed", label: "Calculated" },
  { key: "pending_approval", label: "In approval" },
  { key: "approved", label: "Approved" },
  { key: "paid", label: "Paid" },
];
const stepOf = (s: string) => (s === "returned" ? "computed" : ["rejected", "cancelled"].includes(s) ? "draft" : s);
const th = "whitespace-nowrap px-2.5 py-2";
const td = "whitespace-nowrap px-2.5 py-2 text-right tabular-nums";

export default function PayrollRun() {
  const { payrollId } = useParams();
  const [params, setParams] = useSearchParams();
  const tab = params.get("tab") || "register";
  const setTab = (t: string) => setParams(t === "register" ? {} : { tab: t }, { replace: true });
  const queryClient = useQueryClient();
  const { canPerform } = useRoles();
  const me = pocketbase.authStore.model as any;
  const [decision, setDecision] = React.useState<ActionKind | null>(null);
  const [paying, setPaying] = React.useState(false);
  const [slip, setSlip] = React.useState<any>(null);
  const [search, setSearch] = React.useState("");

  const q = useQuery(["payroll", payrollId], async () => {
    const p: any = await pocketbase.collection("payrolls").getOne(payrollId!, { expand: "branch,prepared_by,paid_by,approval" });
    const [slips, actions, audit] = await Promise.all([
      pocketbase.collection("employees_payrolls").getFullList({ filter: `payroll = "${payrollId}"`, sort: "department_name,employee_name" }),
      pocketbase.collection("approval_actions").getFullList({ filter: `document_type = "payroll" && document_id = "${payrollId}"`, sort: "created", expand: "actor,target_user" }).catch(() => [] as any[]),
      procurementApi.audit({ collection: "payrolls", record: payrollId, perPage: 100 }).then((r) => r.items).catch(() => []),
    ]);
    return { p, slips, actions, audit };
  });
  const refresh = () => {
    queryClient.invalidateQueries(["payroll", payrollId]);
    queryClient.invalidateQueries(["record-table"]);
    queryClient.invalidateQueries(["payroll-summary"]);
  };
  const run = useMutation((action: "compute" | "submit") => payrollApi.action(payrollId!, action), {
    onSuccess: (_, action) => {
      toast.success(action === "compute" ? "Payroll recalculated" : "Sent for approval");
      refresh();
    },
    onError: (e) => {
      toast.error(errorMessage(e));
    },
  });

  if (q.isLoading) return <div className="space-y-4 px-4 py-4 sm:px-6"><Skeleton className="h-12 w-80" /><Skeleton className="h-[480px] w-full" /></div>;
  if (!q.data) return <div className="p-4"><Panel><EmptyState icon={Wallet} title="Payroll not available" text="It may be outside what your role can see." /></Panel></div>;
  const { p, slips, actions, audit } = q.data;
  const T = p.totals || {};
  const approval = p.expand?.approval;
  const status = p.status || "draft";
  const isApprover = approval?.status === "pending" && (approval.pending_approvers || "").split(",").includes(me?.id);
  const canPrepare = canPerform("create_payroll");
  const snap = p.config_snapshot || {};
  const shown = (slips as any[]).filter((s) => `${s.employee_name} ${s.department_name}`.toLowerCase().includes(search.trim().toLowerCase()));
  const contribTotals = (snap.contributions || []).map((c: any) => {
    const ee = (slips as any[]).reduce((a, s) => a + ((s.contributions || []).find((x: any) => x.code === c.code)?.ee || 0), 0);
    const er = (slips as any[]).reduce((a, s) => a + ((s.contributions || []).find((x: any) => x.code === c.code)?.er || 0), 0);
    return { ...c, eeTotal: ee, erTotal: er };
  });
  const byBank: [string, { n: number; total: number }][] = Object.entries(
    (slips as any[]).reduce((acc: Record<string, { n: number; total: number }>, s) => {
      const k = s.bank_name || "No bank recorded";
      acc[k] = acc[k] || { n: 0, total: 0 };
      acc[k].n++;
      acc[k].total += s.net;
      return acc;
    }, {}) as Record<string, { n: number; total: number }>
  );

  function exportExcel() {
    const wb = XLSX.utils.book_new();
    const reg = [["Employee", "Department", "Type", "Basic", "Transport", "Housing", "Communication", "Other allowances", "Gross", "Taxable", "PAYE", "Pension (EE)", "Maternity (EE)", "CBHI", "Medical (EE)", "Other deductions", "Advances", "Total deductions", "Net pay", "Pension (ER)", "Maternity (ER)", "Occupational hazards (ER)", "Medical (ER)", "Employer cost"]];
    for (const s of slips as any[]) reg.push([s.employee_name, s.department_name, s.employment_type, s.basic, s.transport, s.housing, s.communication, s.other_allowances_total, s.gross, s.taxable_income, s.paye, s.pension_ee, s.maternity_ee, s.cbhi, s.medical_ee, (s.other_deductions || []).reduce((a: number, d: any) => a + d.amount, 0), s.advances, s.total_deductions, s.net, s.pension_er, s.maternity_er, s.occ_hazard_er, s.medical_er, s.employer_cost]);
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(reg), "Payroll register");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([["Employee", "TIN", "Gross", "Taxable income", "PAYE"], ...(slips as any[]).map((s) => [s.employee_name, s.tin, s.gross, s.taxable_income, s.paye])]), "PAYE (RRA)");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([["Employee", "RSSB number", "Contribution base", "Pension EE", "Pension ER", "Maternity EE", "Maternity ER", "Occupational hazards ER", "CBHI", "Medical EE", "Medical ER"], ...(slips as any[]).map((s) => [s.employee_name, s.rssb_number, s.pension_base, s.pension_ee, s.pension_er, s.maternity_ee, s.maternity_er, s.occ_hazard_er, s.cbhi, s.medical_ee, s.medical_er])]), "RSSB");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([["Employee", "Bank", "Account", "Net pay"], ...(slips as any[]).map((s) => [s.employee_name, s.bank_name, s.bank_account, s.net])]), "Bank transfers");
    XLSX.writeFile(wb, `${p.number}-payroll.xlsx`);
  }

  const actionsBar = (
    <>
      {isApprover && (
        <>
          <Button size="sm" onClick={() => setDecision("approve")}><Check size={14} /> Approve</Button>
          <Button size="sm" variant="outline" onClick={() => setDecision("return")}><CornerUpLeft size={14} /> Send back</Button>
          <Button size="sm" variant="outline" className="text-red-700" onClick={() => setDecision("reject")}><XCircle size={14} /> Reject</Button>
          <Button size="sm" variant="ghost" onClick={() => setDecision("delegate")}><UserPlus size={14} /> Delegate</Button>
          <Button size="sm" variant="ghost" onClick={() => setDecision("escalate")}><ArrowUpRight size={14} /> Escalate</Button>
        </>
      )}
      {canPrepare && ["draft", "computed", "returned"].includes(status) && <Button size="sm" variant={status === "draft" ? "default" : "outline"} disabled={run.isLoading} onClick={() => run.mutate("compute")}><Calculator size={14} /> {status === "draft" ? "Calculate" : "Recalculate"}</Button>}
      {canPrepare && ["computed", "returned"].includes(status) && <Button size="sm" disabled={run.isLoading} onClick={() => run.mutate("submit")}><Send size={14} /> Submit for approval</Button>}
      {canPerform("mark_payroll_paid") && status === "approved" && <Button size="sm" onClick={() => setPaying(true)}><Banknote size={14} /> Record payment</Button>}
      <Button size="sm" variant="outline" onClick={exportExcel} disabled={!slips.length}><Download size={14} /> Excel</Button>
      {canPrepare && !["paid", "cancelled", "approved"].includes(status) && <Button size="sm" variant="ghost" onClick={() => setDecision("cancel")}><Ban size={14} /> Cancel</Button>}
      {approval && <Button size="sm" variant="ghost" onClick={() => setDecision("comment")}><MessageSquare size={14} /> Comment</Button>}
    </>
  );

  return (
    <DocumentPage chatter={<Chatter items={toChatter(actions, audit)} />}>
      <ControlBar breadcrumbs={[{ title: "Payroll", link: "/dashboard/hr/payroll" }, { title: p.number || "Payroll" }]} actions={actionsBar} steps={STEPS} current={stepOf(status)} />
      {isApprover && (
        <div className="flex items-center gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2.5 text-[13px] text-amber-900">
          <Clock size={15} /> Waiting for your approval at step “{approval.steps?.[approval.current_level]?.name}”. Check the register and the statutory totals below.
        </div>
      )}
      {(T.skipped || []).length > 0 && ["draft", "computed", "returned"].includes(status) && (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2.5 text-[12.5px] text-amber-900">
          {T.skipped.length} active employee{T.skipped.length > 1 ? "s were" : " was"} not included: {T.skipped.map((s: any) => `${s.name} (${s.reason})`).join(", ")}. Add their salary structure and recalculate.
        </div>
      )}

      <SmartButtons
        items={[
          { icon: Users, label: "Employees", value: p.headcount || 0 },
          { icon: Wallet, label: "Gross", value: compactMoney(p.total_gross) },
          { icon: Banknote, label: "Net pay", value: compactMoney(p.total_net) },
          { icon: Landmark, label: "Employer cost", value: compactMoney(p.total_employer_cost) },
        ]}
      />

      <Sheet ribbon={status === "paid" ? { label: "Paid", tone: "success" } : status === "cancelled" ? { label: "Cancelled", tone: "neutral" } : status === "rejected" ? { label: "Rejected", tone: "danger" } : undefined}>
        <SheetTitle kicker="Payroll" title={p.period_label || p.number} badges={<StatusBadge status={status} map={PAYROLL_STATUS} />} />
        <FieldGrid
          left={[
            { label: "Reference", value: p.number },
            { label: "Office", value: p.expand?.branch?.name || "All offices" },
            { label: "Prepared by", value: p.expand?.prepared_by?.name, hint: p.computed_at ? `Calculated ${format(new Date(p.computed_at.replace(" ", "T")), "d MMM yyyy, HH:mm")}` : undefined },
            { label: "Notes", value: p.notes },
          ]}
          right={[
            { label: "Approval", value: approval ? `${approval.workflow_name} — ${approval.status}` : "Not submitted" },
            { label: "Paid", value: p.paid_at ? `${format(new Date(p.paid_at.replace(" ", "T")), "d MMM yyyy")} by ${p.expand?.paid_by?.name || "—"}` : "" , hint: p.payment_reference ? `Reference ${p.payment_reference}` : undefined },
            { label: "PAYE due to RRA", value: <span className="font-semibold">RWF {rwf(T.paye)}</span> },
            { label: "Due to RSSB", value: <span className="font-semibold">RWF {rwf(T.rssb)}</span>, hint: "Employee and employer contributions" },
          ]}
        />

        <Notebook
          active={tab}
          onChange={setTab}
          tabs={[
            { key: "register", label: "Payroll register", count: slips.length },
            { key: "statutory", label: "RRA & RSSB" },
            { key: "bank", label: "Bank transfers" },
            ...(approval ? [{ key: "approval", label: "Approval" }] : []),
            { key: "rates", label: "Rates used" },
          ]}
        />
        <div className="pt-4">
          {tab === "register" && (
            <>
              <input type="search" className={cn(inputCls, "mb-3 sm:w-72")} placeholder="Search employee or department" value={search} onChange={(e) => setSearch(e.target.value)} />
              <div className="overflow-x-auto rounded-md border border-slate-200">
                <table className="dnr-grid w-full min-w-[1500px] border-separate border-spacing-0 text-[12.5px]">
                  <thead>
                    <tr className="bg-slate-100 text-center text-[10.5px] font-semibold uppercase tracking-wider text-slate-500">
                      <th className="sticky left-0 z-10 bg-slate-100 px-2.5 py-1.5" />
                      <th colSpan={3} className="px-2.5 py-1.5">Earnings</th>
                      <th colSpan={7} className="bg-red-50/70 px-2.5 py-1.5 text-red-800">Employee deductions</th>
                      <th className="bg-emerald-50 px-2.5 py-1.5 text-emerald-800">Pay</th>
                      <th colSpan={4} className="bg-sky-50 px-2.5 py-1.5 text-sky-800">Employer contributions</th>
                    </tr>
                    <tr className="bg-slate-50 text-left text-[10.5px] font-semibold uppercase tracking-wider text-slate-500">
                      <th className={cn(th, "sticky left-0 z-10 min-w-[200px] bg-slate-50")}>Employee</th>
                      <th className={cn(th, "text-right")}>Basic</th>
                      <th className={cn(th, "text-right")}>Allowances</th>
                      <th className={cn(th, "text-right")}>Gross</th>
                      <th className={cn(th, "text-right")}>PAYE</th>
                      <th className={cn(th, "text-right")}>Pension</th>
                      <th className={cn(th, "text-right")}>Maternity</th>
                      <th className={cn(th, "text-right")}>CBHI</th>
                      <th className={cn(th, "text-right")}>Medical</th>
                      <th className={cn(th, "text-right")}>Other / adv.</th>
                      <th className={cn(th, "text-right")}>Total</th>
                      <th className={cn(th, "text-right")}>Net pay</th>
                      <th className={cn(th, "text-right")}>Pension</th>
                      <th className={cn(th, "text-right")}>Maternity</th>
                      <th className={cn(th, "text-right")}>Occ. hazards</th>
                      <th className={cn(th, "text-right")}>Total cost</th>
                    </tr>
                  </thead>
                  <tbody>
                    {shown.map((s: any) => {
                      const other = (s.other_deductions || []).reduce((a: number, d: any) => a + d.amount, 0) + (s.advances || 0);
                      return (
                        <tr key={s.id} onClick={() => setSlip(s)} className="group cursor-pointer hover:bg-slate-50">
                          <td className="sticky left-0 z-[1] border-b border-slate-100 bg-white px-2.5 py-2 group-hover:bg-slate-50">
                            <span className="block font-medium text-slate-900">{s.employee_name}</span>
                            <span className="block text-[11px] text-slate-500">{s.department_name}{s.employment_type === "casual" ? " · casual" : ""}</span>
                          </td>
                          <td className={cn(td, "border-b border-slate-100")}>{rwf(s.basic)}</td>
                          <td className={cn(td, "border-b border-slate-100")}>{rwf(s.gross - s.basic)}</td>
                          <td className={cn(td, "border-b border-slate-100 font-semibold")}>{rwf(s.gross)}</td>
                          <td className={cn(td, "border-b border-slate-100")}>{rwf(s.paye)}</td>
                          <td className={cn(td, "border-b border-slate-100")}>{rwf(s.pension_ee)}</td>
                          <td className={cn(td, "border-b border-slate-100")}>{rwf(s.maternity_ee)}</td>
                          <td className={cn(td, "border-b border-slate-100")}>{rwf(s.cbhi)}</td>
                          <td className={cn(td, "border-b border-slate-100 text-slate-400")}>{s.medical_ee ? rwf(s.medical_ee) : "—"}</td>
                          <td className={cn(td, "border-b border-slate-100")}>{other ? rwf(other) : "—"}</td>
                          <td className={cn(td, "border-b border-slate-100 font-medium text-red-700")}>{rwf(s.total_deductions)}</td>
                          <td className={cn(td, "border-b border-slate-100 bg-emerald-50/40 font-bold text-emerald-900")}>{rwf(s.net)}</td>
                          <td className={cn(td, "border-b border-slate-100")}>{rwf(s.pension_er)}</td>
                          <td className={cn(td, "border-b border-slate-100")}>{rwf(s.maternity_er)}</td>
                          <td className={cn(td, "border-b border-slate-100")}>{rwf(s.occ_hazard_er)}</td>
                          <td className={cn(td, "border-b border-slate-100 font-semibold")}>{rwf(s.employer_cost)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="bg-ralga-ink text-[12px] font-semibold text-white">
                      <td className="sticky left-0 bg-ralga-ink px-2.5 py-2">Total ({slips.length})</td>
                      {[T.basic, T.allowances, T.gross, T.paye, T.pension_ee, T.maternity_ee, T.cbhi, T.medical_ee, (T.other_deductions || 0) + (T.advances || 0), T.gross - T.net, T.net, T.pension_er, T.maternity_er, T.occ_hazard_er, T.employer_cost].map((v, i) => (
                        <td key={i} className={td}>{rwf(v)}</td>
                      ))}
                    </tr>
                  </tfoot>
                </table>
              </div>
              <p className="mt-2 text-[12px] text-slate-500">Click an employee to open the payslip.</p>
            </>
          )}

          {tab === "statutory" && (
            <div className="grid gap-4 lg:grid-cols-2">
              <div className="rounded-lg border border-slate-200 p-4">
                <p className="text-[11.5px] font-semibold uppercase tracking-wider text-slate-500">Rwanda Revenue Authority</p>
                <p className="mt-1 text-[24px] font-bold tabular-nums">RWF {rwf(T.paye)}</p>
                <p className="text-[12.5px] text-slate-600">PAYE withheld from {slips.length} employees on a taxable total of RWF {rwf((slips as any[]).reduce((a, s) => a + s.taxable_income, 0))}. Declare and pay by the 15th of the following month.</p>
              </div>
              <div className="rounded-lg border border-slate-200 p-4">
                <p className="text-[11.5px] font-semibold uppercase tracking-wider text-slate-500">Rwanda Social Security Board</p>
                <p className="mt-1 text-[24px] font-bold tabular-nums">RWF {rwf(T.rssb)}</p>
                <table className="mt-2 w-full text-[12.5px]">
                  <thead><tr className="text-left text-[11px] uppercase tracking-wide text-slate-500"><th className="py-1">Scheme</th><th className="py-1 text-right">Employee</th><th className="py-1 text-right">Employer</th><th className="py-1 text-right">Total</th></tr></thead>
                  <tbody className="divide-y divide-slate-100">
                    {contribTotals.map((c: any) => (
                      <tr key={c.code}><td className="py-1.5">{c.name}<span className="block text-[11px] text-slate-500">{c.ee}% + {c.er}%</span></td><td className="py-1.5 text-right tabular-nums">{rwf(c.eeTotal)}</td><td className="py-1.5 text-right tabular-nums">{rwf(c.erTotal)}</td><td className="py-1.5 text-right font-medium tabular-nums">{rwf(c.eeTotal + c.erTotal)}</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {tab === "bank" && (
            <div className="space-y-4">
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {byBank.map(([bank, v]) => (
                  <div key={bank} className="rounded-lg border border-slate-200 px-3 py-2.5">
                    <p className="text-[12.5px] font-medium">{bank}</p>
                    <p className="text-[16px] font-semibold tabular-nums">RWF {rwf(v.total)}</p>
                    <p className="text-[11.5px] text-slate-500">{v.n} transfer{v.n === 1 ? "" : "s"}</p>
                  </div>
                ))}
              </div>
              <div className="overflow-x-auto rounded-md border border-slate-200">
                <table className="dnr-grid w-full min-w-[640px] text-[12.5px]">
                  <thead><tr className="bg-slate-50 text-left text-[10.5px] font-semibold uppercase tracking-wider text-slate-500"><th className={th}>Employee</th><th className={th}>Bank</th><th className={th}>Account</th><th className={cn(th, "text-right")}>Amount</th></tr></thead>
                  <tbody className="divide-y divide-slate-100">
                    {(slips as any[]).map((s) => (
                      <tr key={s.id}><td className="px-2.5 py-1.5">{s.employee_name}</td><td className="px-2.5 py-1.5">{s.bank_name || <span className="text-red-600">missing</span>}</td><td className="px-2.5 py-1.5 tabular-nums">{s.bank_account || <span className="text-red-600">missing</span>}</td><td className={td}>{rwf(s.net)}</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {tab === "approval" && <ApprovalTracker approval={approval} actions={actions} />}

          {tab === "rates" && (
            <div className="grid gap-4 lg:grid-cols-2">
              <div>
                <h3 className="mb-2 text-[13px] font-semibold">PAYE bands (monthly)</h3>
                {(["regular", "casual"] as const).map((t) => (snap.bands?.[t] || []).length > 0 && (
                  <table key={t} className="mb-3 w-full text-[12.5px]">
                    <caption className="pb-1 text-left text-[11.5px] font-medium capitalize text-slate-500">{t === "regular" ? "Employees" : "Casual workers"}</caption>
                    <tbody className="divide-y divide-slate-100">
                      {snap.bands[t].map((b: any, i: number) => <tr key={i}><td className="py-1">{rwf(b.min)} – {b.max ? rwf(b.max) : "and above"}</td><td className="py-1 text-right font-medium">{b.rate}%</td></tr>)}
                    </tbody>
                  </table>
                ))}
              </div>
              <div>
                <h3 className="mb-2 text-[13px] font-semibold">Contributions</h3>
                <table className="w-full text-[12.5px]">
                  <tbody className="divide-y divide-slate-100">
                    {(snap.contributions || []).map((c: any) => <tr key={c.code}><td className="py-1">{c.name}<span className="block text-[11px] text-slate-500">{CONTRIBUTION_BASES[c.base] || c.base}</span></td><td className="py-1 text-right">{c.ee}% + {c.er}%</td></tr>)}
                  </tbody>
                </table>
                <p className="mt-2 text-[12px] text-slate-500">These rates were frozen when the payroll was calculated{snap.computed_by ? ` by ${snap.computed_by}` : ""}.</p>
              </div>
            </div>
          )}
        </div>
      </Sheet>

      <ActionDialog
        kind={decision}
        number={p.number}
        onClose={() => setDecision(null)}
        run={(kind, { comment, user }) => {
          if (kind === "cancel") return payrollApi.action(p.id, "cancel", { reason: comment });
          return procurementApi.act(approval.id, { action: kind, comment, user });
        }}
        onDone={() => {
          setDecision(null);
          refresh();
        }}
      />
      {paying && <PayDialog payroll={p} onClose={() => setPaying(false)} onDone={() => { setPaying(false); refresh(); }} />}
      <PayslipDialog slip={slip} payroll={p} onClose={() => setSlip(null)} />
    </DocumentPage>
  );
}

function PayDialog({ payroll, onClose, onDone }: { payroll: any; onClose: () => void; onDone: () => void }) {
  const [reference, setReference] = React.useState("");
  const pay = useMutation(() => payrollApi.action(payroll.id, "paid", { reference }), {
    onSuccess: () => {
      toast.success("Payment recorded — employees can now see their payslips");
      onDone();
    },
    onError: (e) => {
      toast.error(errorMessage(e));
    },
  });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md bg-white">
        <DialogHeader>
          <DialogTitle>Record payment of {payroll.number}</DialogTitle>
          <DialogDescription>RWF {rwf(payroll.total_net)} to {payroll.headcount} employees. Salary advances included in this payroll are marked as recovered.</DialogDescription>
        </DialogHeader>
        <Field label="Bank transfer reference" hint="Batch or order number from the bank">
          <input className={inputCls} value={reference} onChange={(e) => setReference(e.target.value)} />
        </Field>
        <p className="text-[12px] text-slate-500">Separation of duties: the person who prepared the payroll cannot record its payment.</p>
        <DialogFooter><Button variant="outline" onClick={onClose}>Cancel</Button><Button disabled={pay.isLoading} onClick={() => pay.mutate()}>Record payment</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
