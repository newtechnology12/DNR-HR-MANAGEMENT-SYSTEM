import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "react-query";
import { Link, useParams, useSearchParams } from "react-router-dom";
import * as XLSX from "xlsx";
import { format } from "date-fns";
import { toast } from "sonner";
import { ArrowUpRight, Ban, Banknote, BookOpen, Calculator, Check, Clock, CornerUpLeft, Download, FileDown, Landmark, MessageSquare, Send, UserPlus, Users, Wallet, XCircle } from "lucide-react";
import pocketbase from "@/lib/pocketbase";
import { useRoles } from "@/context/roles.context";
import { usePermissions } from "@/context/auth.context";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { EmptyState, Panel, StatusBadge } from "@/components/enterprise/ui";
import { ActionDialog, ActionKind, ApprovalTracker } from "@/components/enterprise/Approval";
import { Chatter, ControlBar, DocumentPage, FieldGrid, Notebook, Sheet, SheetTitle, SmartButtons, toChatter } from "@/components/enterprise/DocumentLayout";
import { compactMoney, errorMessage, procurementApi } from "@/lib/procurement";
import { CONTRIBUTION_BASES, PAYROLL_STATUS, payrollApi, rwf } from "@/lib/hr";
import { exportReport, ExportFormat } from "@/lib/exporter";
import ExportMenu from "@/components/enterprise/ExportMenu";
import useSettings from "@/hooks/useSettings";
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
  const { settings }: any = useSettings();

  const q = useQuery(["payroll", payrollId], async () => {
    const p: any = await pocketbase.collection("payrolls").getOne(payrollId!, { expand: "branch,prepared_by,paid_by,approval,payment_account,gl_journal,payment_journal" });
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

  const employerLine = [settings?.payroll_employer_tin ? `Employer TIN ${settings.payroll_employer_tin}` : "", settings?.payroll_rssb_number ? `RSSB employer number ${settings.payroll_rssb_number}` : ""].filter(Boolean).join(" · ");
  const sub = (what: string) => `${p.number} · ${p.period_label} · ${PAYROLL_STATUS[status]?.label || status}${employerLine ? ` · ${employerLine}` : ""}${what ? ` · ${what}` : ""}`;
  const exportRegister = (format: ExportFormat) => exportReport({
    title: `Payroll register — ${p.period_label}`, subtitle: sub(""), rows: slips as any[], format, what: `payroll_register:${p.number}`, orientation: "landscape", fileName: `${p.number}-register`,
    totals: ["Basic", "Allowances", "Gross", "PAYE", "Pension (EE)", "Maternity (EE)", "CBHI", "Other / advances / loans", "Total deductions", "Net pay", "Employer contributions", "Employer cost"],
    columns: [
      { header: "Employee", value: (x: any) => x.employee_name, width: 24 }, { header: "Department", value: (x: any) => x.department_name, width: 22 }, { header: "Grade", value: (x: any) => x.grade || "", width: 7 },
      { header: "Basic", value: (x: any) => x.basic, format: "money" }, { header: "Allowances", value: (x: any) => x.gross - x.basic, format: "money" }, { header: "Gross", value: (x: any) => x.gross, format: "money" },
      { header: "PAYE", value: (x: any) => x.paye, format: "money" }, { header: "Pension (EE)", value: (x: any) => x.pension_ee, format: "money" }, { header: "Maternity (EE)", value: (x: any) => x.maternity_ee, format: "money" },
      { header: "CBHI", value: (x: any) => x.cbhi, format: "money" },
      { header: "Other / advances / loans", value: (x: any) => (x.other_deductions || []).reduce((a: number, d: any) => a + d.amount, 0) + (x.advances || 0) + (x.loans || 0), format: "money" },
      { header: "Total deductions", value: (x: any) => x.total_deductions, format: "money" }, { header: "Net pay", value: (x: any) => x.net, format: "money" },
      { header: "Employer contributions", value: (x: any) => x.employer_cost - x.gross, format: "money" }, { header: "Employer cost", value: (x: any) => x.employer_cost, format: "money" },
    ],
  });
  const exportPaye = (format: ExportFormat) => exportReport({
    title: `PAYE declaration schedule (RRA) — ${p.period_label}`, subtitle: sub("Declare and pay by the 15th of the following month"), rows: slips as any[], format, what: `payroll_paye:${p.number}`, fileName: `${p.number}-paye-rra`,
    totals: ["Gross pay", "Taxable income", "PAYE"],
    columns: [
      { header: "Employee", value: (x: any) => x.employee_name, width: 26 }, { header: "TIN", value: (x: any) => x.tin || "", width: 12 }, { header: "Type", value: (x: any) => x.employment_type || "", width: 10 },
      { header: "Gross pay", value: (x: any) => x.gross, format: "money" }, { header: "Taxable income", value: (x: any) => x.taxable_income, format: "money" }, { header: "PAYE", value: (x: any) => x.paye, format: "money" },
    ],
  });
  const exportRssb = (format: ExportFormat) => exportReport({
    title: `RSSB contributions schedule — ${p.period_label}`, subtitle: sub("Pension, maternity leave, occupational hazards, CBHI and medical"), rows: slips as any[], format, what: `payroll_rssb:${p.number}`, orientation: "landscape", fileName: `${p.number}-rssb`,
    totals: ["Pension base", "Pension EE", "Pension ER", "Maternity EE", "Maternity ER", "Occupational hazards ER", "CBHI", "Medical EE", "Medical ER", "Total"],
    columns: [
      { header: "Employee", value: (x: any) => x.employee_name, width: 24 }, { header: "RSSB number", value: (x: any) => x.rssb_number || "", width: 12 },
      { header: "Pension base", value: (x: any) => x.pension_base, format: "money" }, { header: "Pension EE", value: (x: any) => x.pension_ee, format: "money" }, { header: "Pension ER", value: (x: any) => x.pension_er, format: "money" },
      { header: "Maternity EE", value: (x: any) => x.maternity_ee, format: "money" }, { header: "Maternity ER", value: (x: any) => x.maternity_er, format: "money" },
      { header: "Occupational hazards ER", value: (x: any) => x.occ_hazard_er, format: "money" }, { header: "CBHI", value: (x: any) => x.cbhi, format: "money" },
      { header: "Medical EE", value: (x: any) => x.medical_ee, format: "money" }, { header: "Medical ER", value: (x: any) => x.medical_er, format: "money" },
      { header: "Total", value: (x: any) => x.pension_ee + x.pension_er + x.maternity_ee + x.maternity_er + x.occ_hazard_er + x.cbhi + x.medical_ee + x.medical_er, format: "money" },
    ],
  });
  const bankRows = (slips as any[]).filter((x) => (x.payment_method || "bank") === "bank").sort((a, b) => `${a.bank_name}${a.employee_name}`.localeCompare(`${b.bank_name}${b.employee_name}`));
  const payRef = `SALARY ${String(p.period_label || "").toUpperCase()}`;
  const exportBank = (format: ExportFormat, bank?: string) => exportReport({
    title: `Salary transfers${bank ? ` — ${bank}` : ""} — ${p.period_label}`, subtitle: sub(`Reference "${payRef}"`), format, what: `payroll_bank_file:${p.number}`,
    rows: bank ? bankRows.filter((x) => (x.bank_name || "No bank recorded") === bank) : bankRows, fileName: `${p.number}-bank${bank ? `-${bank.toLowerCase().replace(/[^a-z0-9]+/g, "-")}` : ""}`, totals: ["Amount"],
    columns: [
      { header: "Beneficiary", value: (x: any) => x.employee_name, width: 26 }, { header: "Bank", value: (x: any) => x.bank_name || "", width: 20 }, { header: "Account number", value: (x: any) => x.bank_account || "", width: 18 },
      { header: "Amount", value: (x: any) => x.net, format: "money" }, { header: "Currency", value: () => "RWF", width: 7 }, { header: "Reference", value: () => payRef, width: 22 },
    ],
  });

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
      <Button size="sm" variant="outline" onClick={exportExcel} disabled={!slips.length}><Download size={14} /> Excel (all sheets)</Button>
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
            { label: "Paid", value: p.paid_at ? `${format(new Date(p.paid_at.replace(" ", "T")), "d MMM yyyy")} by ${p.expand?.paid_by?.name || "—"}` : "" , hint: [p.expand?.payment_account ? `from ${p.expand.payment_account.code}` : "", p.payment_reference ? `reference ${p.payment_reference}` : ""].filter(Boolean).join(" · ") || undefined },
            { label: "General ledger", value: p.expand?.gl_journal ? (["view_journals", "export_ledger", "approve_journals"].some((x) => canPerform(x)) ? <Link className="font-medium text-primaryDark hover:underline" to={`/dashboard/finance/journals/${p.gl_journal}`}>{p.expand.gl_journal.number}</Link> : p.expand.gl_journal.number) : <span className="text-slate-500">Posted when approved</span>, hint: p.expand?.payment_journal ? `Payment journal ${p.expand.payment_journal.number}` : undefined },
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
            ...((T.loans || 0) > 0 ? [{ key: "loans", label: "Loans", count: (slips as any[]).filter((x) => x.loans > 0).length }] : []),
            ...(p.posting ? [{ key: "posting", label: "GL & budget" }] : []),
            { key: "reconciliation", label: "Against last month" },
            ...(approval ? [{ key: "approval", label: "Approval" }] : []),
            { key: "rates", label: "Rates used" },
          ]}
        />
        <div className="pt-4">
          {tab === "register" && (
            <>
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <input type="search" className={cn(inputCls, "sm:w-72")} placeholder="Search employee or department" value={search} onChange={(e) => setSearch(e.target.value)} />
                <ExportMenu label="Payroll register" permission={["export_payroll", "view_payroll_details"]} disabled={!slips.length} onExport={exportRegister} />
              </div>
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
              <div className="flex flex-wrap gap-2 lg:col-span-2">
                <ExportMenu label="PAYE schedule (RRA)" permission={["export_payroll", "view_payroll_details"]} disabled={!slips.length} onExport={exportPaye} />
                <ExportMenu label="RSSB schedule" permission={["export_payroll", "view_payroll_details"]} disabled={!slips.length} onExport={exportRssb} />
              </div>
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
              <div className="flex flex-wrap items-center gap-2">
                <ExportMenu label="Bank file (all banks)" permission={["export_payroll", "view_payroll_details"]} disabled={!bankRows.length} onExport={(fmt) => exportBank(fmt)} />
                <span className="text-[12px] text-slate-500">Reference on every transfer: <b className="font-mono">{payRef}</b></span>
              </div>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {byBank.map(([bank, v]) => (
                  <div key={bank} className="rounded-lg border border-slate-200 px-3 py-2.5">
                    <p className="text-[12.5px] font-medium">{bank}</p>
                    <p className="text-[16px] font-semibold tabular-nums">RWF {rwf(v.total)}</p>
                    <p className="flex items-center justify-between text-[11.5px] text-slate-500">{v.n} transfer{v.n === 1 ? "" : "s"}
                      <button type="button" onClick={() => exportBank("csv", bank)} className="inline-flex items-center gap-1 font-medium text-primaryDark hover:underline"><FileDown size={12} /> CSV for this bank</button>
                    </p>
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

          {tab === "loans" && <LoansTab slips={slips as any[]} />}
          {tab === "posting" && <PostingTab payroll={p} />}
          {tab === "reconciliation" && <ReconciliationTab payrollId={p.id} />}
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

export function PayDialog({ payroll, onClose, onDone }: { payroll: { id: string; number: string; total_net: number; headcount: number }; onClose: () => void; onDone: () => void }) {
  const [reference, setReference] = React.useState("");
  const [account, setAccount] = React.useState("");
  const [date, setDate] = React.useState(format(new Date(), "yyyy-MM-dd"));
  const accounts = useQuery(["payroll-pay-accounts"], () => pocketbase.collection("bank_accounts").getFullList({ filter: 'kind = "bank" && status = "active" && funding_source = ""', sort: "-is_default,code" }));
  React.useEffect(() => {
    const list = (accounts.data || []) as any[];
    if (!account && list.length) setAccount(list[0].id);
  }, [accounts.data]); // eslint-disable-line react-hooks/exhaustive-deps
  const chosen = ((accounts.data || []) as any[]).find((x) => x.id === account);
  const short = chosen && chosen.book_balance < payroll.total_net;
  const pay = useMutation(() => payrollApi.action(payroll.id, "paid", { reference, account, payment_date: date }), {
    onSuccess: () => {
      toast.success("Payment recorded — the cash book and the GL are updated, employees can see their payslips");
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
          <DialogDescription>RWF {rwf(payroll.total_net)} net pay to {payroll.headcount} employees. Salary advances and loan instalments in this payroll are marked as recovered.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <Field label="Paid from" required hint={chosen ? `Cash book balance RWF ${rwf(chosen.book_balance)}` : "Unrestricted bank accounts only (donor accounts hold restricted money)"} error={short ? "Not enough money in this account for the whole payroll." : undefined}>
            <select className={inputCls} value={account} onChange={(e) => setAccount(e.target.value)}>
              {((accounts.data || []) as any[]).map((x) => <option key={x.id} value={x.id}>{x.code} · {x.name}</option>)}
            </select>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Payment date" required><input type="date" className={inputCls} value={date} max={format(new Date(), "yyyy-MM-dd")} onChange={(e) => setDate(e.target.value)} /></Field>
            <Field label="Bank reference" hint="Batch or order number"><input className={inputCls} value={reference} onChange={(e) => setReference(e.target.value)} /></Field>
          </div>
        </div>
        <p className="text-[12px] text-slate-500">Separation of duties: the person who prepared the payroll cannot record its payment.</p>
        <DialogFooter><Button variant="outline" onClick={onClose}>Cancel</Button><Button disabled={pay.isLoading || !account || !date || short} onClick={() => pay.mutate()}>Record payment</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function LoansTab({ slips }: { slips: any[] }) {
  const rows = slips.filter((x) => x.loans > 0);
  return (
    <div className="overflow-x-auto rounded-md border border-slate-200">
      <table className="dnr-grid w-full min-w-[560px] text-[12.5px]">
        <thead><tr className="bg-slate-50 text-left text-[10.5px] font-semibold uppercase tracking-wider text-slate-500"><th className={th}>Employee</th><th className={th}>Loan</th><th className={cn(th, "text-right")}>Instalment</th></tr></thead>
        <tbody className="divide-y divide-slate-100">
          {rows.flatMap((x) => (x.loan_deductions || []).map((d: any) => (
            <tr key={`${x.id}-${d.loan}`}><td className="px-2.5 py-1.5">{x.employee_name}</td><td className="px-2.5 py-1.5 font-mono">{d.number}</td><td className={td}>{rwf(d.amount)}</td></tr>
          )))}
        </tbody>
        <tfoot><tr className="bg-slate-50 font-semibold"><td className="px-2.5 py-1.5" colSpan={2}>Total recovered through this payroll</td><td className={td}>{rwf(rows.reduce((a, x) => a + x.loans, 0))}</td></tr></tfoot>
      </table>
      <p className="px-3 py-2 text-[12px] text-slate-500">Loan balances go down when the payment of this payroll is recorded. <Link className="font-medium text-primaryDark hover:underline" to="/dashboard/hr/payroll/loans">All staff loans</Link></p>
    </div>
  );
}

const SHORT: Record<string, string> = { "5101": "Basic", "5102": "Allowances", "5103": "Pension", "5104": "Maternity", "5105": "Occ. hazards", "5106": "Medical" };
const showDate = (d?: string) => (d ? format(new Date(`${d.slice(0, 10)}T12:00:00`), "d MMM yyyy") : "—");

function PostingTab({ payroll }: { payroll: any }) {
  const ps = payroll.posting || {};
  const { can } = usePermissions();
  const ledger = can(["view_journals", "export_ledger", "approve_journals"]);
  const budget = (ps.budget || []) as any[];
  const unbudgeted = (ps.unbudgeted || []) as any[];
  const charged = budget.reduce((t, x) => t + x.amount, 0);
  const grid = budget.length > 0 && budget.every((x) => x.account);
  const accounts = Array.from(new Set(budget.map((x) => x.account))).sort();
  const holders = Object.values(budget.reduce((g: Record<string, any>, x) => {
    const key = `${x.department}|${x.project}|${x.funding}`;
    const h = g[key] || (g[key] = { key, department: x.department || "All departments", source: x.project || (x.funding && x.funding !== "MC" ? x.funding : ""), cells: {} as Record<string, any>, total: 0, available: 0, over: false });
    h.cells[x.account] = x;
    h.total += x.amount;
    h.available += x.available;
    h.over = h.over || x.over;
    return g;
  }, {})).sort((p: any, q: any) => p.department.localeCompare(q.department) || p.source.localeCompare(q.source)) as any[];
  const byAccount = (ps.by_account || []) as any[];
  return (
    <div className="space-y-4">
      <div className="grid gap-2 sm:grid-cols-3">
        <div className="rounded-lg border border-slate-200 px-3 py-2.5"><p className="text-[11.5px] text-slate-500">Journal</p><p className="text-[16px] font-semibold">{ledger ? <Link className="text-primaryDark hover:underline" to={`/dashboard/finance/journals/${payroll.gl_journal}`}>{ps.journal}</Link> : ps.journal}</p><p className="text-[11.5px] text-slate-500">dated {showDate(ps.date)} · RWF {rwf(ps.total)}{ps.lines ? ` · ${ps.lines} lines` : ""}</p></div>
        <div className="rounded-lg border border-slate-200 px-3 py-2.5"><p className="text-[11.5px] text-slate-500">Charged to budget lines</p><p className="text-[16px] font-semibold tabular-nums">RWF {rwf(charged)}</p><p className="text-[11.5px] text-slate-500">{budget.length} lines{budget.some((x) => x.over) ? " · some over budget" : " · all within budget"}</p></div>
        <div className={cn("rounded-lg border px-3 py-2.5", unbudgeted.length ? "border-amber-300 bg-amber-50" : "border-slate-200")}><p className="text-[11.5px] text-slate-500">Not budgeted</p><p className="text-[16px] font-semibold tabular-nums">RWF {rwf(unbudgeted.reduce((t, x) => t + x.amount, 0))}</p><p className="text-[11.5px] text-slate-500">{unbudgeted.length ? "Add personnel lines in a budget revision" : "Every cost had a budget line"}</p></div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[12.5px] font-semibold text-slate-700">By funding source</span>
        {(ps.by_funding || []).map((x: any) => <span key={x.funding_source} className="rounded-md border border-slate-200 px-2.5 py-1 text-[12.5px]">{x.name}: <b className="tabular-nums">RWF {rwf(x.amount)}</b></span>)}
      </div>
      {unbudgeted.length > 0 && (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[12.5px] text-amber-900">
          No budget line for: {unbudgeted.map((u) => `${u.account_name} · ${u.department_name || "—"} · ${u.funding_name} (RWF ${rwf(u.amount)})`).join("; ")}.
        </div>
      )}
      {budget.length > 0 && (
        <div className="overflow-x-auto rounded-md border border-slate-200">
          {grid ? (
            <table className="dnr-grid w-full min-w-[860px] text-[12.5px]">
              <thead>
                <tr className="bg-slate-50 text-left text-[10.5px] font-semibold uppercase tracking-wider text-slate-500">
                  <th className={th}>Charged to</th>
                  {accounts.map((a) => <th key={a} className={cn(th, "text-right")} title={budget.find((x) => x.account === a)?.name}><span className="block font-mono normal-case tracking-normal text-slate-400">{a}</span>{SHORT[a] || a}</th>)}
                  <th className={cn(th, "text-right")}>This payroll</th><th className={cn(th, "text-right")}>Still available</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {holders.map((h) => (
                  <tr key={h.key} className={h.over ? "bg-red-50/60" : ""}>
                    <td className="px-2.5 py-1.5"><span className="font-medium text-slate-800">{h.department}</span>{h.source && <span className="ml-1.5 rounded bg-violet-50 px-1.5 py-px font-mono text-[11px] text-violet-700">{h.source}</span>}</td>
                    {accounts.map((a) => {
                      const c = h.cells[a];
                      return <td key={a} className={cn(td, c?.over && "font-semibold text-red-700")} title={c ? `${c.code} · still available RWF ${rwf(c.available)}` : undefined}>{c ? rwf(c.amount) : <span className="text-slate-300">—</span>}</td>;
                    })}
                    <td className={cn(td, "font-semibold")}>{rwf(h.total)}</td>
                    <td className={cn(td, h.available < 0 ? "font-semibold text-red-700" : "text-slate-600")}>{h.available < 0 ? `over by ${rwf(-h.available)}` : rwf(h.available)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-slate-50 font-semibold">
                  <td className="px-2.5 py-1.5">Total</td>
                  {accounts.map((a) => <td key={a} className={td}>{rwf(budget.filter((x) => x.account === a).reduce((t, x) => t + x.amount, 0))}</td>)}
                  <td className={td}>{rwf(charged)}</td>
                  <td className={td}>{rwf(budget.reduce((t, x) => t + x.available, 0))}</td>
                </tr>
              </tfoot>
            </table>
          ) : (
            <table className="dnr-grid w-full min-w-[620px] text-[12.5px]">
              <thead><tr className="bg-slate-50 text-left text-[10.5px] font-semibold uppercase tracking-wider text-slate-500"><th className={th}>Budget line charged</th><th className={cn(th, "text-right")}>This payroll</th><th className={cn(th, "text-right")}>Still available</th></tr></thead>
              <tbody className="divide-y divide-slate-100">
                {budget.map((x) => (
                  <tr key={x.line} className={x.over ? "bg-red-50/60" : ""}>
                    <td className="px-2.5 py-1.5"><span className="font-mono text-[11.5px]">{x.code}</span> {x.name}</td>
                    <td className={td}>{rwf(x.amount)}</td>
                    <td className={cn(td, x.over ? "font-semibold text-red-700" : "")}>{x.over ? `over by ${rwf(-x.available)}` : rwf(x.available)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <p className="px-3 py-2 text-[12px] text-slate-500">Salaries are never stopped by the budget; an overrun shows in red here and in the budget reports so that a revision can be prepared.</p>
        </div>
      )}
      {byAccount.length > 0 && (
        <div className="overflow-x-auto rounded-md border border-slate-200">
          <table className="dnr-grid w-full min-w-[560px] text-[12.5px]">
            <thead><tr className="bg-slate-50 text-left text-[10.5px] font-semibold uppercase tracking-wider text-slate-500"><th className={th}>Journal by account</th><th className={cn(th, "text-right")}>Debit</th><th className={cn(th, "text-right")}>Credit</th></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {byAccount.map((x) => <tr key={x.account}><td className="px-2.5 py-1.5"><span className="font-mono font-semibold">{x.code}</span> {x.name}</td><td className={td}>{x.debit ? rwf(x.debit) : ""}</td><td className={td}>{x.credit ? rwf(x.credit) : ""}</td></tr>)}
            </tbody>
            <tfoot><tr className="bg-slate-50 font-semibold"><td className="px-2.5 py-1.5">Total</td><td className={td}>{rwf(byAccount.reduce((t, x) => t + x.debit, 0))}</td><td className={td}>{rwf(byAccount.reduce((t, x) => t + x.credit, 0))}</td></tr></tfoot>
          </table>
        </div>
      )}
      <p className="flex flex-wrap items-center gap-1.5 text-[12px] text-slate-500">
        <BookOpen size={13} /> Salary costs are posted by department and funding source, with no personal pay data in the ledger; what is owed to staff, RRA and RSSB is cleared when it is paid.
        {ledger && payroll.gl_journal && <Link className="font-medium text-primaryDark hover:underline" to={`/dashboard/finance/journals/${payroll.gl_journal}`}>Open the journal lines →</Link>}
      </p>
    </div>
  );
}

function ReconciliationTab({ payrollId }: { payrollId: string }) {
  const q = useQuery(["payroll-reconciliation", payrollId], () => payrollApi.reconciliation(payrollId));
  if (q.isLoading) return <Skeleton className="h-48 w-full" />;
  if (q.isError) return <p className="text-[13px] text-red-700">{errorMessage(q.error)}</p>;
  const r = q.data;
  if (!r.previous) return <p className="text-[13px] text-slate-500">No earlier approved payroll to compare with.</p>;
  const KIND: Record<string, string> = { joiner: "Joined", leaver: "Left", changed: "Changed" };
  return (
    <div className="space-y-4">
      <p className="text-[13px] text-slate-600">Compared with <b>{r.previous.number}</b> ({r.previous.period_label}, {r.previous.headcount} employees): {r.joiners} joined, {r.leavers} left, {r.changed} with a different pay. Everyone else is paid the same.</p>
      <div className="overflow-x-auto rounded-md border border-slate-200">
        <table className="dnr-grid w-full min-w-[620px] text-[12.5px]">
          <thead><tr className="bg-slate-50 text-left text-[10.5px] font-semibold uppercase tracking-wider text-slate-500"><th className={th}>Component</th><th className={cn(th, "text-right")}>{r.previous.period_label}</th><th className={cn(th, "text-right")}>{r.current.period_label}</th><th className={cn(th, "text-right")}>Difference</th></tr></thead>
          <tbody className="divide-y divide-slate-100">
            {(r.components as any[]).map((c) => (
              <tr key={c.key} className={c.key === "net" || c.key === "gross" ? "font-semibold" : ""}><td className="px-2.5 py-1.5">{c.label}</td><td className={td}>{rwf(c.previous)}</td><td className={td}>{rwf(c.current)}</td><td className={cn(td, c.difference > 0 ? "text-emerald-700" : c.difference < 0 ? "text-red-700" : "text-slate-400")}>{c.difference > 0 ? "+" : ""}{rwf(c.difference)}</td></tr>
            ))}
          </tbody>
        </table>
      </div>
      {(r.rows as any[]).length > 0 && (
        <div className="overflow-x-auto rounded-md border border-slate-200">
          <table className="dnr-grid w-full min-w-[760px] text-[12.5px]">
            <thead><tr className="bg-slate-50 text-left text-[10.5px] font-semibold uppercase tracking-wider text-slate-500"><th className={th}>Employee</th><th className={th}>What changed</th><th className={cn(th, "text-right")}>Gross</th><th className={cn(th, "text-right")}>Net pay</th><th className={cn(th, "text-right")}>Net difference</th></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {(r.rows as any[]).map((x) => (
                <tr key={x.employee}>
                  <td className="px-2.5 py-1.5"><span className="block font-medium">{x.name}</span><span className="text-[11px] text-slate-500">{x.department}</span></td>
                  <td className="px-2.5 py-1.5"><span className="mr-1 rounded bg-slate-100 px-1.5 py-px text-[11px] font-semibold">{KIND[x.kind]}</span>{(x.reasons || []).join("; ")}</td>
                  <td className={td}>{x.current ? rwf(x.current.gross) : "—"}</td>
                  <td className={td}>{x.current ? rwf(x.current.net) : "—"}</td>
                  <td className={cn(td, x.diff_net > 0 ? "text-emerald-700" : x.diff_net < 0 ? "text-red-700" : "")}>{x.diff_net > 0 ? "+" : ""}{rwf(x.diff_net)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
