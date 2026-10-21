/**
 * Budget → Overview: real-time utilisation (IMS M2). Budget, committed, actual and available for the
 * current fiscal year; utilisation by department, funding source and project with status
 * (green < amber ≤ red); the lines at risk; every line with a ledger drill-down.
 * Heads of department automatically see their own department only.
 */
import * as React from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "react-query";
import { BarChart3, FileText, Landmark, PieChart, Search } from "lucide-react";
import { usePermissions } from "@/context/auth.context";
import { BudgetLineUsage, KIND_LABEL, budgetApi } from "@/lib/budget";
import { rwf } from "@/lib/ims";
import { exportReport } from "@/lib/exporter";
import { Button } from "@/components/ui/button";
import { Badge, EmptyState, ListSkeleton, MetricGroup, PageHeader, Panel } from "@/components/enterprise/ui";
import ExportMenu from "@/components/enterprise/ExportMenu";
import { LineLedgerDialog, UseBadge, UseBar, UseChart, UseLegend, groupUsage } from "@/components/budget/BudgetKit";
import { cn } from "@/utils";

const M = (n: number) => (Math.abs(n) >= 1e9 ? `RWF ${(n / 1e9).toFixed(2)}B` : `RWF ${(n / 1e6).toFixed(1)}M`);

export default function BudgetOverview() {
  const navigate = useNavigate();
  const { can } = usePermissions();
  const [filters, setFilters] = React.useState<Record<string, string>>({});
  const [groupBy, setGroupBy] = React.useState<"department" | "funding" | "project" | "kind">("department");
  const [search, setSearch] = React.useState("");
  const [onlyRisk, setOnlyRisk] = React.useState(false);
  const [drill, setDrill] = React.useState<BudgetLineUsage | null>(null);
  const q = useQuery(["budget-usage", filters], () => budgetApi.usage(filters), { keepPreviousData: true });
  const u = q.data;
  const t = u?.thresholds || { amber: 75, red: 90 };
  const spend = (u?.items || []).filter((i) => i.kind !== "revenue");
  const revenue = (u?.items || []).filter((i) => i.kind === "revenue");
  const groups = groupUsage(spend, (i) => (groupBy === "department" ? i.department_name : groupBy === "funding" ? i.funding_code : groupBy === "project" ? i.project_code || "No project" : KIND_LABEL[i.kind]), t);
  const risk = spend.filter((i) => i.status !== "green").sort((a, b) => b.used_pct - a.used_pct);
  const term = search.trim().toLowerCase();
  const rows = spend.filter((i) => (!onlyRisk || i.status !== "green") && (!term || `${i.code} ${i.name} ${i.department_name} ${i.account}`.toLowerCase().includes(term)));
  const options = (key: keyof BudgetLineUsage, label: keyof BudgetLineUsage) => Array.from(new Map((u?.items || []).filter((i) => i[key]).map((i) => [i[key] as string, i[label] as string])).entries()).sort((a, b) => a[1].localeCompare(b[1]));

  const doExport = (format: "xlsx" | "pdf" | "csv") =>
    exportReport({
      title: "Budget utilisation", subtitle: `${u?.fiscal_year.name} · thresholds: amber ${t.amber}%, red ${t.red}%`, rows, format, orientation: "landscape", what: "budget_lines",
      totals: ["Budget", "Committed", "Actual", "Available"],
      columns: [
        { header: "Line", value: (i: BudgetLineUsage) => i.code, width: 16 },
        { header: "Account", value: (i: BudgetLineUsage) => i.account, width: 30 },
        { header: "Department", value: (i: BudgetLineUsage) => i.department_name, width: 26 },
        { header: "Funding", value: (i: BudgetLineUsage) => i.funding_code },
        { header: "Project", value: (i: BudgetLineUsage) => i.project_code },
        { header: "Budget", value: (i: BudgetLineUsage) => i.budget, format: "money" },
        { header: "Committed", value: (i: BudgetLineUsage) => i.committed, format: "money" },
        { header: "Actual", value: (i: BudgetLineUsage) => i.actual, format: "money" },
        { header: "Available", value: (i: BudgetLineUsage) => i.available, format: "money" },
        { header: "Used %", value: (i: BudgetLineUsage) => i.used_pct, format: "percent" },
        { header: "Status", value: (i: BudgetLineUsage) => ({ green: "On track", amber: "Watch", red: "Critical" })[i.status] },
        { header: "Overrides", value: (i: BudgetLineUsage) => i.overrides, format: "number" },
      ],
    });

  const sel = "h-9 rounded-md border border-slate-200 bg-white px-2.5 text-[12.5px] outline-none focus:border-primary";
  return (
    <div className="space-y-4 px-3 sm:px-4">
      <PageHeader
        title="Budget overview"
        description={u ? `${u.fiscal_year.name} · live utilisation: available = budget − commitments − actuals${u.scope === "department" ? " · your department" : ""}` : "Live budget utilisation"}
        breadcrumbs={[{ title: "Budget", link: "/dashboard/budget" }]}
        actions={
          <>
            <ExportMenu onExport={doExport} permission={["export_budgets", "export_reports"]} disabled={!rows.length} />
            <Button variant="outline" onClick={() => navigate("/dashboard/budget/reports")}><BarChart3 size={14} /> Reports</Button>
            {can("manage_budgets") && <Button onClick={() => navigate("/dashboard/budget/budgets")}><FileText size={14} /> Budgets</Button>}
          </>
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <select value={filters.department || ""} onChange={(e) => setFilters({ ...filters, department: e.target.value })} className={sel} aria-label="Department">
          <option value="">All departments</option>
          {options("department", "department_name").map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <select value={filters.funding_source || ""} onChange={(e) => setFilters({ ...filters, funding_source: e.target.value })} className={sel} aria-label="Funding source">
          <option value="">All funding sources</option>
          {options("funding_source", "funding_code").map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <select value={filters.project || ""} onChange={(e) => setFilters({ ...filters, project: e.target.value })} className={sel} aria-label="Project">
          <option value="">All projects</option>
          {options("project", "project_code").map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        {Object.values(filters).some(Boolean) && <button type="button" onClick={() => setFilters({})} className="text-[12.5px] font-medium text-slate-500 hover:text-slate-800">Clear</button>}
        {u && <span className="ml-auto text-[12px] text-slate-500">Budget control: <strong className="text-slate-700">{u.control === "block" ? "hard stop" : u.control === "warn" ? "warning only" : "off"}</strong></span>}
      </div>

      <MetricGroup
        title="Spending budget"
        icon={PieChart}
        loading={q.isLoading}
        columns={4}
        metrics={[
          { label: "Approved budget (revised)", value: u ? M(u.totals.budget) : "—", sub: `${spend.length} lines` },
          { label: "Committed (open orders)", value: u ? M(u.totals.committed) : "—", sub: u ? `${((u.totals.committed / (u.totals.budget || 1)) * 100).toFixed(1)}% of budget` : "" },
          { label: "Actual (spent)", value: u ? M(u.totals.actual) : "—", sub: u ? `${((u.totals.actual / (u.totals.budget || 1)) * 100).toFixed(1)}% of budget` : "" },
          { label: "Available", value: u ? M(u.totals.available) : "—", tone: u && u.totals.available < 0 ? "danger" : "success", sub: u ? `${u.totals.used_pct}% used` : "" },
        ]}
      />

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <Panel
          title="Utilisation"
          subtitle="Actual and committed against the budget — hover a bar for the figures"
          action={
            <div className="flex gap-1 rounded-md bg-slate-100 p-0.5" role="radiogroup" aria-label="Group by">
              {([["department", "Department"], ["funding", "Funding"], ["project", "Project"], ["kind", "Type"]] as const).map(([k, l]) => (
                <button key={k} type="button" role="radio" aria-checked={groupBy === k} onClick={() => setGroupBy(k)} className={cn("h-7 rounded px-2.5 text-[12px] font-medium", groupBy === k ? "bg-white text-slate-900 shadow-sm" : "text-slate-500")}>{l}</button>
              ))}
            </div>
          }
        >
          {q.isLoading ? <ListSkeleton rows={6} /> : !groups.length ? <EmptyState icon={PieChart} text="No approved budget lines for these filters." /> : (
            <>
              <UseChart rows={groups} labelWidth={groupBy === "department" ? 190 : 110} />
              <div className="mt-3 border-t border-slate-100 pt-3"><UseLegend thresholds={t} /></div>
            </>
          )}
        </Panel>
        <div className="space-y-4">
          <Panel title="Lines at risk" subtitle={`${t.amber}% used or more`}>
            {q.isLoading ? <ListSkeleton rows={4} /> : !risk.length ? (
              <p className="py-4 text-center text-[13px] text-slate-500">Every line is below {t.amber}%.</p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {risk.slice(0, 8).map((i) => (
                  <li key={i.id}>
                    <button type="button" onClick={() => setDrill(i)} className="flex w-full items-center gap-3 py-2 text-left hover:bg-slate-50">
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13px] font-medium text-slate-900">{i.code}</span>
                        <span className="block truncate text-[11.5px] text-slate-500">{i.department_name} · {rwf(i.available)} left</span>
                      </span>
                      <UseBadge status={i.status} pct={i.used_pct} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
          {revenue.length > 0 && (
            <Panel title={<span className="flex items-center gap-2"><Landmark size={15} className="text-slate-400" /> Revenue budget</span>} subtitle="Expected income by source">
              <ul className="space-y-1.5 text-[13px]">
                {revenue.map((r) => (
                  <li key={r.id} className="flex justify-between gap-3">
                    <span className="truncate text-slate-700">{r.account.replace(/^\d+\s/, "")} <span className="text-slate-400">· {r.funding_code}</span></span>
                    <span className="shrink-0 font-medium tabular-nums text-slate-900">{M(r.budget)}</span>
                  </li>
                ))}
              </ul>
            </Panel>
          )}
        </div>
      </div>

      <Panel title="Budget lines" subtitle="Click a line for its commitments and actuals" bodyClassName="px-0 pb-0">
        <div className="flex flex-col gap-2 border-b border-slate-100 px-4 pb-3 sm:flex-row sm:items-center">
          <label className="relative w-full sm:w-72">
            <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Line, account, department…" aria-label="Search lines" className="h-9 w-full rounded-md border border-slate-200 pl-9 pr-3 text-[13px] outline-none focus:border-primary focus:ring-2 focus:ring-primary/20" />
          </label>
          <label className="flex items-center gap-2 text-[12.5px] text-slate-600">
            <input type="checkbox" checked={onlyRisk} onChange={(e) => setOnlyRisk(e.target.checked)} className="h-4 w-4 rounded border-slate-300 text-primary" /> Only lines at risk
          </label>
          <span className="text-[12px] text-slate-500 sm:ml-auto">{rows.length} of {spend.length} lines</span>
        </div>
        {q.isLoading ? <div className="p-4"><ListSkeleton rows={8} /></div> : (
          <div className="max-h-[560px] overflow-auto">
            <table className="dnr-grid w-full min-w-[980px]">
              <thead className="sticky top-0 z-10 bg-white">
                <tr><th>Line</th><th>Department</th><th>Funding</th><th className="text-right">Budget</th><th className="text-right">Committed</th><th className="text-right">Actual</th><th className="text-right">Available</th><th>Utilisation</th></tr>
              </thead>
              <tbody>
                {rows.map((i) => (
                  <tr key={i.id} onClick={() => setDrill(i)} className="cursor-pointer hover:bg-slate-50">
                    <td>
                      <span className="block font-mono text-[12.5px] font-semibold text-slate-800">{i.code}</span>
                      <span className="block max-w-[260px] truncate text-[12px] text-slate-500">{i.account}{i.kind === "capital" ? " · capital" : ""}</span>
                    </td>
                    <td className="text-[12.5px] text-slate-700">{i.department_name}</td>
                    <td className="text-[12.5px]">{i.funding_code}{i.project_code && <span className="text-slate-400"> · {i.project_code}</span>}{i.overrides > 0 && <Badge tone="warning" className="ml-1.5">{i.overrides} override</Badge>}</td>
                    <td className="text-right tabular-nums">{rwf(i.budget)}</td>
                    <td className="text-right tabular-nums text-slate-600">{rwf(i.committed)}</td>
                    <td className="text-right tabular-nums text-slate-600">{rwf(i.actual)}</td>
                    <td className={cn("text-right font-medium tabular-nums", i.available < 0 ? "text-red-600" : "text-slate-900")}>{rwf(i.available)}</td>
                    <td><UseBar line={i} compact /></td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!rows.length && <EmptyState icon={Search} text="No line matches." />}
          </div>
        )}
      </Panel>
      <LineLedgerDialog line={drill} onClose={() => setDrill(null)} />
    </div>
  );
}
