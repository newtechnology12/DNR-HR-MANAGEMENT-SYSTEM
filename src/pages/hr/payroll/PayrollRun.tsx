import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "react-query";
import { Link, useParams, useSearchParams } from "react-router-dom";
import * as XLSX from "xlsx";
import { format } from "date-fns";
import { toast } from "sonner";
import { AlertTriangle, ArrowUpRight, Ban, Banknote, Calculator, Check, Clock, CornerUpLeft, Download, FileDown, MessageSquare, Send, UserPlus, Wallet, XCircle } from "lucide-react";
import pocketbase from "@/lib/pocketbase";
import { useRoles } from "@/context/roles.context";
import { usePermissions } from "@/context/auth.context";
import { Skeleton } from "@/components/ui/skeleton";
import { ActionDialog, ActionKind, Activity, ApprovalTracker } from "@/components/enterprise/Approval";
import {
  Button,
  ButtonLink,
  Card,
  CardHeader,
  Column,
  DataTable,
  DatePicker,
  DetailHeader,
  Details,
  DocNo,
  EmptyState,
  Field,
  Input,
  KpiBand,
  MenuItem,
  Modal,
  MoreMenu,
  Num,
  Page,
  Person,
  SearchBox,
  Select,
  Tabs,
  fmtDate,
  fmtDateTime,
  fmtMoney,
  fmtMoneyShort,
  fmtNumber,
  statusWord,
} from "@/components/ims";
import { errorMessage, procurementApi } from "@/lib/procurement";
import { CONTRIBUTION_BASES, PAYROLL_STATUS, payrollApi } from "@/lib/hr";
import { exportReport, ExportFormat } from "@/lib/exporter";
import ExportMenu from "@/components/enterprise/ExportMenu";
import useSettings from "@/hooks/useSettings";
import { cn } from "@/utils";
import { PayslipDialog } from "./Payslip";

type TabKey = "details" | "employees" | "statutory" | "approvals" | "activity";
const TAB_KEYS: TabKey[] = ["details", "employees", "statutory", "approvals", "activity"];
/** Links from before the tabs were grouped (?tab=register, ?tab=bank…) still land on the right tab. */
const OLD_TABS: Record<string, TabKey> = { register: "employees", bank: "statutory", loans: "statutory", posting: "details", reconciliation: "details", rates: "details", approval: "approvals" };
const LIST = "/dashboard/hr/payroll";

/** A money column header with a muted second line ("Employer", "Staff") where the same word appears twice. */
const twoLine = (label: string, who: string) => (
  <span className="inline-flex flex-col items-end leading-tight">
    <span>{label}</span>
    <span className="text-t-hint font-normal text-ims-faint">{who}</span>
  </span>
);
const sumOf = (xs: any[], f: (x: any) => number) => xs.reduce((a, x) => a + (Number(f(x)) || 0), 0);

function Notice({ tone, icon: Icon, children }: { tone: "warning" | "orange"; icon: typeof Clock; children: React.ReactNode }) {
  return (
    <p role="status" className={cn("flex items-start gap-2 rounded-card border px-4 py-3 text-t-body", tone === "warning" ? "border-ims-warning/30 bg-ims-warning-bg text-ims-warning" : "border-ims-orange/30 bg-ims-orange-bg text-ims-orange")}>
      <Icon size={16} className="mt-0.5 shrink-0" aria-hidden />
      <span>{children}</span>
    </p>
  );
}

export default function PayrollRun() {
  const { payrollId } = useParams();
  const [params, setParams] = useSearchParams();
  const rawTab = params.get("tab") || "details";
  const tab: TabKey = OLD_TABS[rawTab] || (TAB_KEYS.includes(rawTab as TabKey) ? (rawTab as TabKey) : "details");
  const setTab = (t: string) => setParams(t === "details" ? {} : { tab: t }, { replace: true });
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
      const number = q.data?.p?.number || "The payroll";
      toast.success(action === "compute" ? `${number} recalculated` : `${number} sent for approval`);
      refresh();
    },
    onError: (e) => {
      toast.error(errorMessage(e));
    },
  });

  if (q.isLoading) {
    return (
      <Page>
        <Skeleton className="h-5 w-48" />
        <Skeleton className="h-16 w-full max-w-2xl" />
        <Skeleton className="h-[480px] w-full" />
      </Page>
    );
  }
  if (!q.data) {
    return (
      <Page>
        <Card>
          <EmptyState icon={Wallet} text="This payroll is not available. It may be outside what your role can see." action={<ButtonLink to={LIST}>Back to payroll</ButtonLink>} />
        </Card>
      </Page>
    );
  }
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

  // ---------------------------------------------------------------- actions: the next step is the primary button
  const stepName = approval?.status === "pending" ? approval.steps?.[approval.current_level]?.name : null;
  const returnNote = [...((actions as any[]) || [])].reverse().find((a: any) => a.action === "return")?.comment;
  const canCalculate = canPrepare && ["draft", "computed", "returned"].includes(status);
  const canSubmit = canPrepare && ["computed", "returned"].includes(status);
  const canPay = canPerform("mark_payroll_paid") && status === "approved";
  const canCancel = canPrepare && !["paid", "cancelled", "approved"].includes(status);
  const excelButton = <Button key="excel" icon={Download} onClick={exportExcel} disabled={!slips.length}>Export to Excel</Button>;

  const primary = isApprover ? (
    <Button variant="primary" icon={Check} onClick={() => setDecision("approve")}>Approve</Button>
  ) : canSubmit ? (
    <Button variant="primary" icon={Send} loading={run.isLoading && run.variables === "submit"} disabled={run.isLoading} onClick={() => run.mutate("submit")}>Submit for approval</Button>
  ) : canCalculate ? (
    <Button variant="primary" icon={Calculator} loading={run.isLoading} onClick={() => run.mutate("compute")}>Calculate</Button>
  ) : canPay ? (
    <Button variant="primary" icon={Banknote} onClick={() => setPaying(true)}>Record payment</Button>
  ) : null;
  const secondary = isApprover ? (
    <>
      <Button icon={CornerUpLeft} onClick={() => setDecision("return")}>Return</Button>
      <Button icon={XCircle} onClick={() => setDecision("reject")}>Reject</Button>
    </>
  ) : canSubmit ? (
    <>
      <Button icon={Calculator} loading={run.isLoading && run.variables === "compute"} disabled={run.isLoading} onClick={() => run.mutate("compute")}>Recalculate</Button>
      {excelButton}
    </>
  ) : (
    excelButton
  );
  const more: MenuItem[] = [
    { label: "Export to Excel", icon: Download, onSelect: exportExcel, disabled: !slips.length, hidden: !isApprover },
    { label: "Delegate", icon: UserPlus, onSelect: () => setDecision("delegate"), hidden: !isApprover },
    { label: "Escalate", icon: ArrowUpRight, onSelect: () => setDecision("escalate"), hidden: !isApprover },
    { label: "Comment", icon: MessageSquare, onSelect: () => setDecision("comment"), hidden: !approval },
    { label: "Cancel payroll", icon: Ban, danger: true, onSelect: () => setDecision("cancel"), hidden: !canCancel },
  ];

  // ---------------------------------------------------------------- register columns
  const otherOf = (s: any) => (s.other_deductions || []).reduce((a: number, d: any) => a + d.amount, 0) + (s.advances || 0);
  const money = (key: string, header: React.ReactNode, value: (s: any) => number, total: number, opts: Partial<Column<any>> = {}): Column<any> => ({
    key, header, numeric: true, cell: (s) => <Num value={value(s)} />, total: <Num value={total} />, ...opts,
  });
  const registerColumns: Column<any>[] = [
    {
      key: "employee", header: "Employee",
      className: "sticky left-0 z-[1] min-w-[220px] bg-ims-card group-hover:bg-ims-hover [th&]:bg-ims-thead",
      cell: (s) => <Person name={s.employee_name} detail={`${s.department_name || ""}${s.employment_type === "casual" ? " · casual" : ""}`} />,
    },
    money("basic", "Basic (RWF)", (s) => s.basic, T.basic),
    money("allowances", "Allowances (RWF)", (s) => s.gross - s.basic, T.allowances),
    money("gross", "Gross (RWF)", (s) => s.gross, T.gross, { cell: (s) => <span className="font-semibold"><Num value={s.gross} /></span> }),
    money("paye", "PAYE (RWF)", (s) => s.paye, T.paye),
    money("pension_ee", twoLine("Pension (RWF)", "Staff"), (s) => s.pension_ee, T.pension_ee),
    money("maternity_ee", twoLine("Maternity (RWF)", "Staff"), (s) => s.maternity_ee, T.maternity_ee),
    money("cbhi", "CBHI (RWF)", (s) => s.cbhi, T.cbhi),
    money("medical_ee", "Medical (RWF)", (s) => s.medical_ee, T.medical_ee, { cell: (s) => (s.medical_ee ? <Num value={s.medical_ee} /> : <span className="text-ims-faint">—</span>) }),
    money("other", twoLine("Other (RWF)", "Incl. advances"), otherOf, (T.other_deductions || 0) + (T.advances || 0), { cell: (s) => (otherOf(s) ? <Num value={otherOf(s)} /> : <span className="text-ims-faint">—</span>) }),
    money("deductions", "Total deductions (RWF)", (s) => s.total_deductions, T.gross - T.net),
    money("net", "Net pay (RWF)", (s) => s.net, T.net, { cell: (s) => <span className="font-bold"><Num value={s.net} /></span> }),
    money("pension_er", twoLine("Pension (RWF)", "Employer"), (s) => s.pension_er, T.pension_er),
    money("maternity_er", twoLine("Maternity (RWF)", "Employer"), (s) => s.maternity_er, T.maternity_er),
    money("occ_hazard_er", twoLine("Hazards (RWF)", "Employer"), (s) => s.occ_hazard_er, T.occ_hazard_er),
    money("employer_cost", "Employer cost (RWF)", (s) => s.employer_cost, T.employer_cost, { cell: (s) => <span className="font-semibold"><Num value={s.employer_cost} /></span> }),
  ];

  const loanRows = (slips as any[]).filter((x) => x.loans > 0);
  const hasLoans = (T.loans || 0) > 0;
  const gl = p.expand?.gl_journal;

  return (
    <Page>
      <DetailHeader
        back={{ label: "Back to payroll", to: LIST }}
        number={p.number}
        type="Payroll"
        status={PAYROLL_STATUS[status]?.label || status}
        statusNote={stepName ? `At “${stepName}”` : PAYROLL_STATUS[status]?.note}
        title={p.period_label || p.number}
        facts={[
          p.expand?.branch?.name || "All offices",
          { label: "Prepared by", value: p.expand?.prepared_by?.name || "—" },
          p.computed_at ? { label: "Calculated", value: fmtDateTime(p.computed_at) } : null,
          p.paid_at ? { label: "Paid", value: fmtDate(p.paid_at) } : null,
        ]}
        actions={
          <>
            <MoreMenu items={more} />
            {secondary}
            {primary}
          </>
        }
      />

      {isApprover && (
        <Notice tone="warning" icon={Clock}>
          Waiting for your decision{stepName ? ` at step “${stepName}”` : ""}. Check the register and the RRA and RSSB totals, then approve it, return it for changes, or reject it.
        </Notice>
      )}
      {status === "returned" && canPrepare && (
        <Notice tone="orange" icon={CornerUpLeft}>
          Returned for changes{returnNote ? `: “${returnNote}”` : ""}. Recalculate it if needed and submit it again.
        </Notice>
      )}
      {(T.skipped || []).length > 0 && ["draft", "computed", "returned"].includes(status) && (
        <Notice tone="warning" icon={AlertTriangle}>
          {T.skipped.length} active employee{T.skipped.length > 1 ? "s were" : " was"} not included: {T.skipped.map((s: any) => `${s.name} (${s.reason})`).join(", ")}. Add their salary structure and recalculate.
        </Notice>
      )}

      <KpiBand
        items={[
          { label: "Employees", value: fmtNumber(p.headcount || 0) },
          { label: "Gross pay", value: fmtMoneyShort(p.total_gross) },
          { label: "Net pay", value: fmtMoneyShort(p.total_net) },
          { label: "Employer cost", value: fmtMoneyShort(p.total_employer_cost) },
        ]}
      />

      <Tabs
        label="Payroll sections"
        active={tab}
        onChange={setTab}
        tabs={[
          { key: "details", label: "Details" },
          { key: "employees", label: "Employees", count: slips.length },
          { key: "statutory", label: "RRA, RSSB and bank" },
          ...(approval ? [{ key: "approvals", label: "Approvals" }] : []),
          { key: "activity", label: "Activity" },
        ]}
      />

      {tab === "details" && (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
          <div className="min-w-0 space-y-4 xl:col-span-2">
            <Card>
              <CardHeader title="Payroll" />
              <Details
                items={[
                  { label: "Period", value: p.period_label },
                  { label: "Office", value: p.expand?.branch?.name || "All offices" },
                  { label: "Prepared by", value: p.expand?.prepared_by?.name, hint: p.computed_at ? `Calculated ${fmtDateTime(p.computed_at)}` : undefined },
                  { label: "Approval", value: approval ? approval.workflow_name : "Not submitted", hint: approval ? statusWord(approval.status) || approval.status : undefined },
                  {
                    label: "Paid",
                    value: p.paid_at ? `${fmtDate(p.paid_at)} by ${p.expand?.paid_by?.name || "—"}` : null,
                    hint: [p.expand?.payment_account ? `From ${p.expand.payment_account.code}` : "", p.payment_reference ? `reference ${p.payment_reference}` : ""].filter(Boolean).join(" · ") || undefined,
                  },
                  {
                    label: "General ledger",
                    value: gl ? (["view_journals", "export_ledger", "approve_journals"].some((x) => canPerform(x)) ? <Link className="whitespace-nowrap font-semibold text-ims-link hover:underline" to={`/dashboard/finance/journals/${p.gl_journal}`}>{gl.number}</Link> : <DocNo value={gl.number} />) : <span className="text-ims-muted">Posted when approved</span>,
                    hint: p.expand?.payment_journal ? `Payment journal ${p.expand.payment_journal.number}` : undefined,
                  },
                  ...(p.notes ? [{ label: "Notes", value: <span className="whitespace-pre-line">{p.notes}</span>, wide: true }] : []),
                ]}
              />
            </Card>
            <ReconciliationCard payrollId={p.id} />
            {p.posting && <PostingCards payroll={p} />}
          </div>
          <RatesCard snap={snap} />
        </div>
      )}

      {tab === "employees" && (
        <Card padded={false} className="overflow-hidden">
          <div className="flex flex-col gap-3 px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between sm:px-5">
            <SearchBox value={search} onChange={setSearch} placeholder="Search employee or department" />
            <ExportMenu label="Payroll register" permission={["export_payroll", "view_payroll_details"]} disabled={!slips.length} onExport={exportRegister} />
          </div>
          <DataTable
            columns={registerColumns}
            rows={shown}
            rowKey={(s) => s.id}
            onRowClick={(s) => setSlip(s)}
            rowClassName={() => "group"}
            minWidth={1860}
            caption="Payroll register"
            totalLabel={`Total (${slips.length})`}
            empty={<EmptyState compact text={search ? "No employee matches this search." : "No payslips yet. Calculate the payroll to create them."} />}
          />
          <p className="border-t border-ims-divider px-5 py-3 text-t-small text-ims-muted">Select an employee to open the payslip.</p>
        </Card>
      )}

      {tab === "statutory" && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader
                title="PAYE to the Rwanda Revenue Authority"
                subtitle="Declare and pay by the 15th of the following month."
                action={<ExportMenu label="PAYE schedule" permission={["export_payroll", "view_payroll_details"]} disabled={!slips.length} onExport={exportPaye} />}
              />
              <Details
                items={[
                  { label: "PAYE withheld", value: <span className="text-t-section">{fmtMoney(T.paye)}</span>, wide: true },
                  { label: "Employees", value: fmtNumber(slips.length) },
                  { label: "Taxable income", value: fmtMoney((slips as any[]).reduce((a, s) => a + s.taxable_income, 0)) },
                ]}
              />
            </Card>
            <Card padded={false} className="overflow-hidden">
              <div className="px-5 pt-5">
                <CardHeader
                  title="Contributions to RSSB"
                  subtitle={`${fmtMoney(T.rssb)} due, employee and employer parts.`}
                  action={<ExportMenu label="RSSB schedule" permission={["export_payroll", "view_payroll_details"]} disabled={!slips.length} onExport={exportRssb} />}
                />
              </div>
              <DataTable
                minWidth={480}
                rows={contribTotals}
                rowKey={(c: any) => c.code}
                caption="Contributions to RSSB"
                columns={[
                  { key: "name", header: "Scheme", cell: (c: any) => c.name, sub: (c: any) => `${c.ee}% + ${c.er}%` },
                  { key: "ee", header: "Employee (RWF)", numeric: true, cell: (c: any) => <Num value={c.eeTotal} />, total: <Num value={sumOf(contribTotals, (c) => c.eeTotal)} /> },
                  { key: "er", header: "Employer (RWF)", numeric: true, cell: (c: any) => <Num value={c.erTotal} />, total: <Num value={sumOf(contribTotals, (c) => c.erTotal)} /> },
                  { key: "total", header: "Total (RWF)", numeric: true, cell: (c: any) => <span className="font-semibold"><Num value={c.eeTotal + c.erTotal} /></span>, total: <Num value={sumOf(contribTotals, (c) => c.eeTotal + c.erTotal)} /> },
                ]}
                empty={<EmptyState compact text="No contribution rates were recorded with this payroll." />}
              />
            </Card>
          </div>

          <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
            <div className="min-w-0 space-y-4 self-start">
              <Card padded={false} className="overflow-hidden">
                <div className="px-5 pt-5">
                  <CardHeader title="By bank" subtitle={`Reference on every transfer: ${payRef}`} />
                </div>
                <DataTable
                  minWidth={0}
                  rows={byBank}
                  rowKey={([bank]) => bank}
                  caption="Transfers by bank"
                  rowActions={([bank]) => [{ label: "Download CSV for this bank", icon: FileDown, onSelect: () => exportBank("csv", bank) }]}
                  columns={[
                    { key: "bank", header: "Bank", cell: ([bank]) => bank, sub: ([, v]) => `${v.n} transfer${v.n === 1 ? "" : "s"}` },
                    { key: "total", header: "Amount (RWF)", numeric: true, cell: ([, v]) => <Num value={v.total} />, total: <Num value={sumOf(byBank, ([, v]) => v.total)} /> },
                  ]}
                />
              </Card>
              {hasLoans && (
                <Card padded={false} className="overflow-hidden">
                  <div className="px-5 pt-5">
                    <CardHeader title="Staff loan instalments" subtitle="Loan balances go down when the payment of this payroll is recorded." link={{ label: "All staff loans", to: `${LIST}/loans` }} />
                  </div>
                  <DataTable
                    minWidth={0}
                    rows={loanRows.flatMap((x) => (x.loan_deductions || []).map((d: any) => ({ ...d, employee_name: x.employee_name, key: `${x.id}-${d.loan}` })))}
                    rowKey={(d: any) => d.key}
                    caption="Staff loan instalments"
                    totalLabel="Total recovered"
                    columns={[
                      { key: "employee", header: "Employee", cell: (d: any) => <span className="font-semibold">{d.employee_name}</span>, sub: (d: any) => <DocNo value={d.number} /> },
                      { key: "amount", header: "Instalment (RWF)", numeric: true, cell: (d: any) => <Num value={d.amount} />, total: <Num value={loanRows.reduce((a, x) => a + x.loans, 0)} /> },
                    ]}
                  />
                </Card>
              )}
            </div>
            <Card padded={false} className="overflow-hidden xl:col-span-2">
              <div className="px-5 pt-5">
                <CardHeader
                  title="Bank transfers"
                  subtitle="Net pay of each employee, as it goes in the bank file."
                  action={<ExportMenu label="Bank file (all banks)" permission={["export_payroll", "view_payroll_details"]} disabled={!bankRows.length} onExport={(fmt) => exportBank(fmt)} />}
                />
              </div>
              <DataTable
                minWidth={600}
                rows={slips as any[]}
                rowKey={(s) => s.id}
                caption="Bank transfers"
                columns={[
                  { key: "employee", header: "Employee", cell: (s) => <span className="font-semibold">{s.employee_name}</span> },
                  { key: "bank", header: "Bank", cell: (s) => s.bank_name || <span className="font-semibold text-ims-danger">Missing</span> },
                  { key: "account", header: "Account", nowrap: true, cell: (s) => (s.bank_account ? <span className="tabular-nums">{s.bank_account}</span> : <span className="font-semibold text-ims-danger">Missing</span>) },
                  { key: "net", header: "Amount (RWF)", numeric: true, cell: (s) => <Num value={s.net} />, total: <Num value={sumOf(slips as any[], (s) => s.net)} /> },
                ]}
              />
            </Card>
          </div>
        </div>
      )}

      {tab === "approvals" && <ApprovalTracker approval={approval} actions={actions} />}
      {tab === "activity" && <Activity actions={actions as any[]} audit={audit as any[]} loading={false} />}

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
    </Page>
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
  const list = (accounts.data || []) as any[];
  const chosen = list.find((x) => x.id === account);
  const short = chosen && chosen.book_balance < payroll.total_net;
  const pay = useMutation(() => payrollApi.action(payroll.id, "paid", { reference, account, payment_date: date }), {
    onSuccess: () => {
      toast.success(`${payroll.number} recorded as paid. The cash book and the general ledger are updated and staff can see their payslips.`);
      onDone();
    },
    onError: (e) => {
      toast.error(errorMessage(e));
    },
  });
  return (
    <Modal
      open
      onClose={onClose}
      size="sm"
      title={`Record the payment of ${payroll.number}`}
      description={`${fmtMoney(payroll.total_net)} net pay to ${payroll.headcount} employees. Salary advances and loan instalments in this payroll are marked as recovered.`}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" icon={Banknote} loading={pay.isLoading} disabled={!account || !date || short} onClick={() => pay.mutate()}>Record payment</Button>
        </>
      }
    >
      <Field
        label="Paid from"
        required
        htmlFor="pay-account"
        hint={chosen ? `Cash book balance ${fmtMoney(chosen.book_balance)}` : "Unrestricted bank accounts only (donor accounts hold restricted money)."}
        error={short ? "Not enough money in this account for the whole payroll. Choose another account." : undefined}
      >
        <Select id="pay-account" invalid={Boolean(short)} value={account} onChange={(e) => setAccount(e.target.value)}>
          {!list.length && <option value="">{accounts.isLoading ? "Loading…" : "No unrestricted bank account"}</option>}
          {list.map((x) => <option key={x.id} value={x.id}>{x.code} · {x.name}</option>)}
        </Select>
      </Field>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Payment date" required htmlFor="pay-date">
          <DatePicker id="pay-date" value={date} max={format(new Date(), "yyyy-MM-dd")} onChange={setDate} />
        </Field>
        <Field label="Bank reference" htmlFor="pay-ref" hint="Batch or order number">
          <Input id="pay-ref" value={reference} onChange={(e) => setReference(e.target.value)} />
        </Field>
      </div>
      <p className="text-t-small text-ims-muted">Separation of duties: the person who prepared the payroll cannot record its payment.</p>
    </Modal>
  );
}

function RatesCard({ snap }: { snap: any }) {
  const types = (["regular", "casual"] as const).filter((t) => (snap.bands?.[t] || []).length > 0);
  return (
    <Card padded={false} className="h-fit overflow-hidden">
      <div className="px-5 pt-5">
        <CardHeader title="Rates used" subtitle={`Frozen when the payroll was calculated${snap.computed_by ? ` by ${snap.computed_by}` : ""}.`} />
      </div>
      {types.map((t) => (
        <DataTable
          key={t}
          minWidth={0}
          rows={snap.bands[t] as any[]}
          rowKey={(_, i) => `${t}-${i}`}
          caption={`PAYE bands, ${t === "regular" ? "employees" : "casual workers"}`}
          className="border-b border-ims-divider"
          columns={[
            { key: "band", header: `PAYE, ${t === "regular" ? "employees" : "casual workers"} (RWF)`, cell: (b: any) => <span className="tabular-nums">{fmtNumber(b.min)} – {b.max ? fmtNumber(b.max) : "and above"}</span> },
            { key: "rate", header: "Rate (%)", numeric: true, cell: (b: any) => <span className="font-semibold">{b.rate}</span> },
          ]}
        />
      ))}
      <DataTable
        minWidth={0}
        rows={(snap.contributions || []) as any[]}
        rowKey={(c: any) => c.code}
        caption="Contribution rates"
        columns={[
          { key: "name", header: "Contribution", cell: (c: any) => c.name, sub: (c: any) => CONTRIBUTION_BASES[c.base] || c.base },
          { key: "rate", header: "Staff + employer (%)", numeric: true, cell: (c: any) => `${c.ee} + ${c.er}` },
        ]}
        empty={<EmptyState compact text="No rates recorded yet. They are frozen when the payroll is calculated." />}
      />
    </Card>
  );
}

const SHORT: Record<string, string> = { "5101": "Basic", "5102": "Allowances", "5103": "Pension", "5104": "Maternity", "5105": "Occ. hazards", "5106": "Medical" };

function PostingCards({ payroll }: { payroll: any }) {
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
  const journalLink = ledger && payroll.gl_journal ? { label: "Open the journal lines", to: `/dashboard/finance/journals/${payroll.gl_journal}` } : undefined;
  const overCls = "font-semibold text-ims-danger";

  const gridColumns: Column<any>[] = [
    { key: "holder", header: "Charged to", className: "min-w-[210px]", cell: (h) => <span className="font-semibold">{h.department}</span>, sub: (h) => (h.source ? <span className="font-mono">{h.source}</span> : null) },
    ...accounts.map<Column<any>>((a) => ({
      key: a,
      header: <span title={budget.find((x) => x.account === a)?.name}>{SHORT[a] || a} (RWF)</span>,
      numeric: true,
      cell: (h) => {
        const c = h.cells[a];
        return c ? <span className={cn(c.over && overCls)} title={`${c.code} · still available ${fmtMoney(c.available)}`}><Num value={c.amount} /></span> : <span className="text-ims-faint">—</span>;
      },
      total: <Num value={budget.filter((x) => x.account === a).reduce((t, x) => t + x.amount, 0)} />,
    })),
    { key: "total", header: "This payroll (RWF)", numeric: true, cell: (h) => <span className="font-semibold"><Num value={h.total} /></span>, total: <Num value={charged} /> },
    { key: "available", header: "Still available (RWF)", numeric: true, cell: (h) => <span className={cn(h.available < 0 ? overCls : "text-ims-body")}><Num value={h.available} /></span>, total: <Num value={budget.reduce((t, x) => t + x.available, 0)} /> },
  ];
  const lineColumns: Column<any>[] = [
    { key: "line", header: "Budget line charged", cell: (x) => <><span className="font-mono text-t-small">{x.code}</span> {x.name}</> },
    { key: "amount", header: "This payroll (RWF)", numeric: true, cell: (x) => <Num value={x.amount} />, total: <Num value={charged} /> },
    { key: "available", header: "Still available (RWF)", numeric: true, cell: (x) => <span className={cn(x.over && overCls)}><Num value={x.available} /></span> },
  ];

  return (
    <>
      <Card padded={false} className="overflow-hidden">
        <div className="px-5 pt-5">
          <CardHeader title="Budget" subtitle="Salaries are never stopped by the budget; an overrun shows in red here and in the budget reports so that a revision can be prepared." />
          <Details
            columns={2}
            className="mb-4"
            items={[
              { label: "Charged to budget lines", value: <span className="font-semibold">{fmtMoney(charged)}</span>, hint: `${budget.length} lines${budget.some((x) => x.over) ? " · some over budget" : " · all within budget"}` },
              { label: "Not budgeted", value: <span className={cn("font-semibold", unbudgeted.length > 0 && "text-ims-warning")}>{fmtMoney(unbudgeted.reduce((t, x) => t + x.amount, 0))}</span>, hint: unbudgeted.length ? "Add personnel lines in a budget revision" : "Every cost had a budget line" },
              { label: "By funding source", wide: true, value: (ps.by_funding || []).length ? <span className="flex flex-col gap-0.5">{(ps.by_funding || []).map((x: any) => <span key={x.funding_source}>{x.name}: <span className="font-semibold tabular-nums">{fmtMoney(x.amount)}</span></span>)}</span> : null },
            ]}
          />
          {unbudgeted.length > 0 && (
            <p role="status" className="mb-4 flex items-start gap-2 rounded-card border border-ims-warning/30 bg-ims-warning-bg px-4 py-3 text-t-body text-ims-warning">
              <AlertTriangle size={16} className="mt-0.5 shrink-0" aria-hidden />
              <span>No budget line for: {unbudgeted.map((u) => `${u.account_name} · ${u.department_name || "—"} · ${u.funding_name} (${fmtMoney(u.amount)})`).join("; ")}.</span>
            </p>
          )}
        </div>
        {budget.length > 0 && (
          grid ? (
            <DataTable columns={gridColumns} rows={holders} rowKey={(h) => h.key} minWidth={860} caption="Budget lines charged" rowClassName={(h) => (h.over ? "bg-ims-danger-bg/60" : undefined)} />
          ) : (
            <DataTable columns={lineColumns} rows={budget} rowKey={(x) => x.line} minWidth={620} caption="Budget lines charged" rowClassName={(x) => (x.over ? "bg-ims-danger-bg/60" : undefined)} />
          )
        )}
      </Card>

      <Card padded={false} className="overflow-hidden">
        <div className="px-5 pt-5">
          <CardHeader
            title="General ledger"
            subtitle="Salary costs are posted by department and funding source, with no personal pay data in the ledger. What is owed to staff, RRA and RSSB is cleared when it is paid."
            link={journalLink}
          />
          <Details
            columns={3}
            className="mb-4"
            items={[
              { label: "Journal", value: ledger ? <Link className="whitespace-nowrap font-semibold text-ims-link hover:underline" to={`/dashboard/finance/journals/${payroll.gl_journal}`}>{ps.journal}</Link> : <DocNo value={ps.journal} /> },
              { label: "Dated", value: ps.date ? fmtDate(ps.date.slice(0, 10)) : null },
              { label: "Amount", value: fmtMoney(ps.total), hint: ps.lines ? `${ps.lines} lines` : undefined },
            ]}
          />
        </div>
        {byAccount.length > 0 && (
          <DataTable
            minWidth={560}
            rows={byAccount}
            rowKey={(x) => x.account}
            caption="Journal by account"
            columns={[
              { key: "account", header: "Account", cell: (x) => <><span className="font-mono font-semibold">{x.code}</span> {x.name}</> },
              { key: "debit", header: "Debit (RWF)", numeric: true, cell: (x) => (x.debit ? <Num value={x.debit} /> : ""), total: <Num value={byAccount.reduce((t, x) => t + x.debit, 0)} /> },
              { key: "credit", header: "Credit (RWF)", numeric: true, cell: (x) => (x.credit ? <Num value={x.credit} /> : ""), total: <Num value={byAccount.reduce((t, x) => t + x.credit, 0)} /> },
            ]}
          />
        )}
      </Card>
    </>
  );
}

function ReconciliationCard({ payrollId }: { payrollId: string }) {
  const q = useQuery(["payroll-reconciliation", payrollId], () => payrollApi.reconciliation(payrollId));
  const KIND: Record<string, string> = { joiner: "Joined", leaver: "Left", changed: "Changed" };
  const diff = (n: number) => (
    <span className={cn("tabular-nums", n > 0 ? "text-ims-success" : n < 0 ? "text-ims-danger" : "text-ims-faint")}>{n > 0 ? "+" : ""}{fmtNumber(n)}</span>
  );
  const r = q.data;
  return (
    <Card padded={false} className="overflow-hidden">
      <div className="px-5 pt-5">
        <CardHeader
          className={r?.previous ? undefined : "mb-0 pb-5"}
          title="Against last month"
          subtitle={
            q.isLoading ? "Comparing with the last approved payroll…" : q.isError ? <span className="text-ims-danger">{errorMessage(q.error)}</span> : !r?.previous ? "No earlier approved payroll to compare with." : (
              <>Compared with <span className="whitespace-nowrap font-semibold">{r.previous.number}</span> ({r.previous.period_label}, {r.previous.headcount} employees): {r.joiners} joined, {r.leavers} left, {r.changed} with a different pay. Everyone else is paid the same.</>
            )
          }
        />
      </div>
      {q.isLoading && <div className="px-5 pb-5"><Skeleton className="h-40 w-full" /></div>}
      {r?.previous && (
        <>
          <DataTable
            minWidth={620}
            rows={r.components as any[]}
            rowKey={(c: any) => c.key}
            caption="Totals against last month"
            rowClassName={(c: any) => (c.key === "net" || c.key === "gross" ? "font-semibold" : undefined)}
            columns={[
              { key: "label", header: "Component", cell: (c: any) => c.label },
              { key: "previous", header: `${r.previous.period_label} (RWF)`, numeric: true, cell: (c: any) => <Num value={c.previous} /> },
              { key: "current", header: `${r.current.period_label} (RWF)`, numeric: true, cell: (c: any) => <Num value={c.current} /> },
              { key: "difference", header: "Difference (RWF)", numeric: true, cell: (c: any) => diff(c.difference) },
            ]}
          />
          {(r.rows as any[]).length > 0 && (
            <>
              <h3 className="border-t border-ims-divider px-5 pb-3 pt-5 text-t-body font-bold text-ims-text">Employees with a change</h3>
              <DataTable
                minWidth={680}
                rows={r.rows as any[]}
                rowKey={(x: any) => x.employee}
                caption="Employees with a change"
                columns={[
                  { key: "name", header: "Employee", cell: (x: any) => <Person name={x.name} detail={x.department} /> },
                  { key: "kind", header: "What changed", clamp: true, cell: (x: any) => <span className="font-semibold">{KIND[x.kind]}</span>, sub: (x: any) => (x.reasons || []).join("; ") },
                  { key: "gross", header: "Gross (RWF)", numeric: true, cell: (x: any) => (x.current ? <Num value={x.current.gross} /> : "—") },
                  { key: "net", header: "Net pay (RWF)", numeric: true, cell: (x: any) => (x.current ? <Num value={x.current.net} /> : "—") },
                  { key: "diff", header: "Net difference (RWF)", numeric: true, cell: (x: any) => diff(x.diff_net) },
                ]}
              />
            </>
          )}
        </>
      )}
    </Card>
  );
}
