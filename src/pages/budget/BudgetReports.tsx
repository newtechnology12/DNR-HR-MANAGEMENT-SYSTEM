/**
 * Budget → Reports: budget vs actual for any month range (grouped by line, department, funding source,
 * project, account or type), open commitments per line, and the register of DAF budget overrides.
 */
import * as React from "react";
import { useQuery } from "react-query";
import { BarChart3, FileWarning, Hourglass, ShieldAlert } from "lucide-react";
import pocketbase from "@/lib/pocketbase";
import { BudgetLineUsage, MONTHS_FY, SERIES, budgetApi } from "@/lib/budget";
import { rwf, showDay } from "@/lib/ims";
import { exportReport } from "@/lib/exporter";
import { EmptyState, ListSkeleton, PageHeader } from "@/components/enterprise/ui";
import ExportMenu from "@/components/enterprise/ExportMenu";
import RecordTable from "@/components/enterprise/RecordTable";
import { LineLedgerDialog, UseBadge } from "@/components/budget/BudgetKit";
import { cn } from "@/utils";

const TABS = [
  { key: "bva", label: "Budget vs actual", icon: BarChart3 },
  { key: "commitments", label: "Open commitments", icon: Hourglass },
  { key: "overrides", label: "Budget overrides", icon: ShieldAlert },
];
const GROUPS = [
  { value: "department", label: "Department" },
  { value: "line", label: "Budget line" },
  { value: "funding_source", label: "Funding source" },
  { value: "project", label: "Project" },
  { value: "account", label: "GL account" },
];
const selectCls = "h-9 rounded-md border border-slate-200 bg-white px-2.5 text-[13px] text-slate-800 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20";

export default function BudgetReports() {
  const [tab, setTab] = React.useState("bva");
  const years = useQuery(["fiscal-years-all"], () => pocketbase.collection("fiscal_years").getFullList({ sort: "-start_date" }));
  const [fy, setFy] = React.useState("");
  React.useEffect(() => {
    if (!fy && years.data?.length) setFy((years.data.find((y: any) => y.is_current) || years.data[0]).id);
  }, [years.data, fy]);
  return (
    <div className="space-y-4 px-3 sm:px-4">
      <PageHeader
        title="Budget reports"
        description="Execution against the phased budget, money tied up in open orders, and every override of budget control."
        breadcrumbs={[{ title: "Budget", link: "/dashboard/budget" }, { title: "Reports", link: "/dashboard/budget/reports" }]}
        actions={
          <select value={fy} onChange={(e) => setFy(e.target.value)} className={selectCls} aria-label="Fiscal year">
            {(years.data || []).map((y: any) => <option key={y.id} value={y.id}>{y.name}{y.is_current ? " (current)" : ""}</option>)}
          </select>
        }
      />
      <div className="flex gap-1 overflow-x-auto border-b border-slate-200" role="tablist">
        {TABS.map((t) => (
          <button key={t.key} type="button" role="tab" aria-selected={tab === t.key} onClick={() => setTab(t.key)}
            className={cn("-mb-px flex items-center gap-2 whitespace-nowrap border-b-2 px-3.5 py-2.5 text-[13px] font-medium", tab === t.key ? "border-primary text-primaryDark" : "border-transparent text-slate-500 hover:text-slate-800")}>
            <t.icon size={15} /> {t.label}
          </button>
        ))}
      </div>
      {fy && tab === "bva" && <BvaReport fy={fy} />}
      {fy && tab === "commitments" && <Commitments fy={fy} />}
      {fy && tab === "overrides" && <Overrides fy={fy} />}
    </div>
  );
}

function BvaReport({ fy }: { fy: string }) {
  const [groupBy, setGroupBy] = React.useState("department");
  const [from, setFrom] = React.useState(1);
  const [to, setTo] = React.useState(12);
  const [kind, setKind] = React.useState("");
  const q = useQuery(["budget-bva", fy, groupBy, from, to, kind], () => budgetApi.bva({ fiscal_year: fy, group_by: groupBy, from_period: from, to_period: to, kind }), { keepPreviousData: true });
  const d = q.data;
  const groupLabel = GROUPS.find((g) => g.value === groupBy)?.label || "Group";
  const doExport = (format: "xlsx" | "pdf" | "csv") =>
    exportReport({
      title: "Budget vs actual", subtitle: `${d!.fiscal_year.name} · ${d!.period_label} · by ${groupLabel.toLowerCase()}${kind ? ` · ${kind}` : ""}`, rows: d!.rows, format, orientation: "landscape", what: "budget_vs_actual",
      totals: ["Annual budget", "Budget for period", "Actual", "Committed", "Variance"],
      columns: [
        { header: groupLabel, value: (r) => r.label, width: 34 },
        { header: "Annual budget", value: (r) => r.annual_budget, format: "money" },
        { header: "Budget for period", value: (r) => r.budget, format: "money" },
        { header: "Actual", value: (r) => r.actual, format: "money" },
        { header: "Committed", value: (r) => r.committed, format: "money" },
        { header: "Variance", value: (r) => r.variance, format: "money" },
        { header: "Execution %", value: (r) => r.execution_pct / 100, format: "percent" },
        { header: "Overrides", value: (r) => r.overrides, format: "number" },
      ],
    });
  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-end gap-2 rounded-lg border border-slate-200 bg-white p-3 shadow-card">
        <label className="text-[12px] font-medium text-slate-600">Group by<select value={groupBy} onChange={(e) => setGroupBy(e.target.value)} className={cn(selectCls, "mt-1 block")}>{GROUPS.map((g) => <option key={g.value} value={g.value}>{g.label}</option>)}</select></label>
        <label className="text-[12px] font-medium text-slate-600">From<select value={from} onChange={(e) => { const v = Number(e.target.value); setFrom(v); if (to < v) setTo(v); }} className={cn(selectCls, "mt-1 block")}>{MONTHS_FY.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}</select></label>
        <label className="text-[12px] font-medium text-slate-600">To<select value={to} onChange={(e) => setTo(Number(e.target.value))} className={cn(selectCls, "mt-1 block")}>{MONTHS_FY.map((m, i) => <option key={m} value={i + 1} disabled={i + 1 < from}>{m}</option>)}</select></label>
        <label className="text-[12px] font-medium text-slate-600">Lines<select value={kind} onChange={(e) => setKind(e.target.value)} className={cn(selectCls, "mt-1 block")}><option value="">Spending (expense + capital)</option><option value="expense">Expense only</option><option value="capital">Capital only</option><option value="revenue">Revenue</option></select></label>
        <div className="ml-auto"><ExportMenu onExport={doExport} permission={["export_budgets", "export_reports"]} disabled={!d?.rows.length} /></div>
      </div>
      {q.isLoading ? <ListSkeleton rows={8} /> : !d?.rows.length ? (
        <EmptyState icon={BarChart3} title="Nothing to report" text="No approved budget lines match these filters." />
      ) : (
        <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-card">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-2.5 text-[12.5px] text-slate-600">
            <span><strong className="text-slate-900">{d.fiscal_year.name}</strong> · {d.period_label} · budget for the period is the phased amount of those months</span>
            <span className="flex items-center gap-3">
              <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: SERIES.actual }} /> Actual</span>
              <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: SERIES.committed }} /> Committed</span>
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="dnr-grid w-full min-w-[980px]">
              <thead>
                <tr><th>{groupLabel}</th><th className="text-right">Annual budget</th><th className="text-right">Budget for period</th><th className="text-right">Actual</th><th className="text-right">Committed</th><th className="text-right">Variance</th><th className="w-[200px]">Execution</th></tr>
              </thead>
              <tbody>
                {d.rows.map((r) => {
                  const a = r.budget ? Math.min((r.actual / r.budget) * 100, 100) : 0;
                  const c = r.budget ? Math.min((r.committed / r.budget) * 100, 100 - a) : 0;
                  return (
                    <tr key={r.key}>
                      <td className="font-medium text-slate-900">{r.label}{r.overrides > 0 && <span className="ml-2 inline-flex items-center gap-1 rounded bg-amber-50 px-1.5 py-0.5 text-[11px] font-medium text-amber-800" title="Budget control was overridden by the DAF"><FileWarning size={11} /> {r.overrides} override{r.overrides > 1 ? "s" : ""}</span>}</td>
                      <td className="text-right tabular-nums text-slate-600">{rwf(r.annual_budget)}</td>
                      <td className="text-right tabular-nums">{rwf(r.budget)}</td>
                      <td className="text-right font-medium tabular-nums">{rwf(r.actual)}</td>
                      <td className="text-right tabular-nums text-slate-600">{rwf(r.committed)}</td>
                      <td className={cn("text-right font-medium tabular-nums", r.variance < 0 && "text-red-700")}>{rwf(r.variance)}</td>
                      <td>
                        <div className="flex items-center gap-2" title={`Actual ${rwf(r.actual)} · committed ${rwf(r.committed)} of ${rwf(r.budget)}`}>
                          <div className="flex h-2 flex-1 overflow-hidden rounded-full" style={{ background: SERIES.track }}>
                            <div style={{ width: `${a}%`, background: SERIES.actual }} />
                            {c > 0 && <div style={{ width: `${c}%`, background: SERIES.committed, marginLeft: a ? 2 : 0 }} />}
                          </div>
                          <span className="w-12 text-right text-[12px] tabular-nums text-slate-700">{r.execution_pct}%</span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-slate-200 font-semibold">
                  <td>Total</td>
                  <td className="text-right tabular-nums">{rwf(d.totals.annual_budget)}</td>
                  <td className="text-right tabular-nums">{rwf(d.totals.budget)}</td>
                  <td className="text-right tabular-nums">{rwf(d.totals.actual)}</td>
                  <td className="text-right tabular-nums">{rwf(d.totals.committed)}</td>
                  <td className={cn("text-right tabular-nums", d.totals.variance < 0 && "text-red-700")}>{rwf(d.totals.variance)}</td>
                  <td className="text-[12px] tabular-nums text-slate-700">{d.totals.budget ? Math.round((d.totals.actual / d.totals.budget) * 1000) / 10 : 0}% executed</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}
    </section>
  );
}

function Commitments({ fy }: { fy: string }) {
  const q = useQuery(["budget-usage-commitments", fy], () => budgetApi.usage({ fiscal_year: fy }));
  const [drill, setDrill] = React.useState<BudgetLineUsage | null>(null);
  const rows = (q.data?.items || []).filter((i) => i.committed > 0).sort((a, b) => b.committed - a.committed);
  const total = rows.reduce((a, r) => a + r.committed, 0);
  const doExport = (format: "xlsx" | "pdf" | "csv") =>
    exportReport({
      title: "Open commitments", subtitle: `${q.data!.fiscal_year.name} · approved purchase orders not yet invoiced`, rows, format, orientation: "landscape", what: "budget_commitments",
      totals: ["Budget", "Committed", "Actual", "Available"],
      columns: [
        { header: "Line", value: (r) => r.code, width: 16 },
        { header: "Account", value: (r) => r.account, width: 28 },
        { header: "Department", value: (r) => r.department_name },
        { header: "Funding", value: (r) => r.funding_code },
        { header: "Budget", value: (r) => r.budget, format: "money" },
        { header: "Committed", value: (r) => r.committed, format: "money" },
        { header: "Actual", value: (r) => r.actual, format: "money" },
        { header: "Available", value: (r) => r.available, format: "money" },
      ],
    });
  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[13px] text-slate-600">{rows.length} lines with open commitments · <strong className="text-slate-900">{rwf(total)}</strong> committed. Open a line to see the orders behind it.</p>
        <ExportMenu onExport={doExport} permission={["export_budgets", "export_reports"]} disabled={!rows.length} />
      </div>
      {q.isLoading ? <ListSkeleton rows={6} /> : !rows.length ? (
        <EmptyState icon={Hourglass} title="No open commitments" text="Approved purchase orders that are not yet invoiced show here." />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white shadow-card">
          <table className="dnr-grid w-full min-w-[860px]">
            <thead><tr><th>Line</th><th>Department</th><th className="text-right">Budget</th><th className="text-right">Committed</th><th className="text-right">Actual</th><th className="text-right">Available</th><th>Status</th></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="cursor-pointer hover:bg-slate-50" onClick={() => setDrill(r)}>
                  <td><span className="block font-mono text-[12.5px] font-semibold text-slate-800">{r.code}</span><span className="block text-[12px] text-slate-500">{r.account} · {r.funding_code}{r.project_code ? ` · ${r.project_code}` : ""}</span></td>
                  <td className="text-[12.5px]">{r.department_name}</td>
                  <td className="text-right tabular-nums text-slate-600">{rwf(r.budget)}</td>
                  <td className="text-right font-semibold tabular-nums">{rwf(r.committed)}</td>
                  <td className="text-right tabular-nums text-slate-600">{rwf(r.actual)}</td>
                  <td className={cn("text-right tabular-nums", r.available < 0 && "text-red-700")}>{rwf(r.available)}</td>
                  <td><UseBadge status={r.status} pct={r.used_pct} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <LineLedgerDialog line={drill} onClose={() => setDrill(null)} />
    </section>
  );
}

const OVERRIDE_STATUS: Record<string, string> = { active: "Granted — not yet used", used: "Used", cancelled: "Cancelled" };

function Overrides({ fy }: { fy: string }) {
  return (
    <section className="space-y-3">
      <p className="text-[13px] text-slate-600">Every time the DAF allowed a document past budget control. Overrides are permanent records and cannot be edited.</p>
      <RecordTable<any>
        collection="budget_overrides"
        expand="budget_line,approved_by"
        baseFilter={`budget_line.fiscal_year = "${fy}"`}
        searchFields={["document_number", "reason"]}
        filters={[{ field: "status", label: "Status", options: Object.entries(OVERRIDE_STATUS).map(([value, label]) => ({ value, label })) }]}
        dateField="created"
        exportName="budget-overrides"
        exportTitle="Budget overrides"
        exportPermission={["export_budgets", "export_reports"]}
        empty={{ icon: ShieldAlert, title: "No overrides", text: "Budget control has not been overridden in this fiscal year." }}
        columns={[
          { key: "date", header: "Granted", sortField: "created", format: "date", csv: (r) => showDay(r.created), cell: (r) => <span className="text-[12.5px] text-slate-600">{showDay(r.created)}</span> },
          { key: "doc", header: "Document", sortField: "document_number", cell: (r) => <span className="font-mono text-[12.5px] font-semibold">{r.document_number}</span> },
          { key: "line", header: "Budget line", csv: (r) => r.expand?.budget_line?.code || "", cell: (r) => <span className="font-mono text-[12.5px]">{r.expand?.budget_line?.code}</span> },
          { key: "req", header: "Requested", sortField: "amount_requested", align: "right", format: "money", cell: (r) => <span className="tabular-nums">{rwf(r.amount_requested)}</span> },
          { key: "avail", header: "Available", sortField: "available", align: "right", format: "money", cell: (r) => <span className="tabular-nums text-slate-600">{rwf(r.available)}</span> },
          { key: "short", header: "Shortfall", sortField: "shortfall", align: "right", format: "money", cell: (r) => <span className="font-medium tabular-nums text-red-700">{rwf(r.shortfall)}</span> },
          { key: "by", header: "Approved by", csv: (r) => r.expand?.approved_by?.name || "", cell: (r) => <span className="text-[12.5px]">{r.expand?.approved_by?.name}</span> },
          { key: "reason", header: "Reason", sortField: "reason", cell: (r) => <span className="line-clamp-2 max-w-[320px] text-[12.5px] text-slate-600">{r.reason}</span> },
          { key: "status", header: "Status", sortField: "status", csv: (r) => OVERRIDE_STATUS[r.status] || r.status, cell: (r) => <span className="text-[12.5px]">{OVERRIDE_STATUS[r.status] || r.status}</span> },
        ]}
      />
    </section>
  );
}
