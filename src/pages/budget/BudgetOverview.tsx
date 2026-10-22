/**
 * Budget → Overview: real-time utilisation (IMS M2). Budget, committed, actual and available for the
 * current fiscal year; utilisation by department, funding source and project with status
 * (green < amber ≤ red); the lines at risk; every line with a ledger drill-down.
 * Heads of department automatically see their own department only.
 */
import * as React from "react";
import { useQuery } from "react-query";
import { BarChart3, FileText, PieChart, Search, ShieldAlert } from "lucide-react";
import { usePermissions } from "@/context/auth.context";
import { BudgetLineUsage, KIND_LABEL, budgetApi } from "@/lib/budget";
import { errorMessage } from "@/lib/procurement";
import { exportReport } from "@/lib/exporter";
import { Skeleton } from "@/components/ui/skeleton";
import { ListSkeleton } from "@/components/enterprise/ui";
import ExportMenu from "@/components/enterprise/ExportMenu";
import { Segmented } from "@/components/portal/kit";
import {
  Card,
  CardHeader,
  Checkbox,
  Column,
  DataTable,
  DocNo,
  EmptyState,
  FilterBar,
  FilterSelect,
  KpiBand,
  Num,
  Page,
  PageHeader,
  Pager,
  fmtMoney,
  fmtMoneyShort,
  fmtNumber,
} from "@/components/ims";
import { LineLedgerDialog, UseBadge, UseBar, UseChart, UseLegend, groupUsage } from "@/components/budget/BudgetKit";

const CONTROL_LABEL: Record<string, string> = { block: "hard stop", warn: "warning only", none: "off" };
const pctOf = (part: number, whole: number) => `${((part / (whole || 1)) * 100).toFixed(1)}% of the budget`;

export default function BudgetOverview() {
  const { can } = usePermissions();
  const [filters, setFilters] = React.useState<Record<string, string>>({});
  const [groupBy, setGroupBy] = React.useState<"department" | "funding" | "project" | "kind">("department");
  const [search, setSearch] = React.useState("");
  const [onlyRisk, setOnlyRisk] = React.useState(false);
  const [drill, setDrill] = React.useState<BudgetLineUsage | null>(null);
  const [page, setPage] = React.useState(1);
  const [perPage, setPerPage] = React.useState(15);
  const linesRef = React.useRef<HTMLDivElement>(null);
  // Phones: narrower chart labels so the bars keep their room.
  const [narrow, setNarrow] = React.useState(() => typeof window !== "undefined" && window.matchMedia("(max-width: 639px)").matches);
  React.useEffect(() => {
    const m = window.matchMedia("(max-width: 639px)");
    const on = () => setNarrow(m.matches);
    m.addEventListener("change", on);
    return () => m.removeEventListener("change", on);
  }, []);
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

  // Client-side pages over the filtered lines; back to page 1 when the filters change.
  React.useEffect(() => setPage(1), [term, onlyRisk, filters]);
  const pageRows = rows.slice((page - 1) * perPage, page * perPage);
  const sum = (k: "budget" | "committed" | "actual" | "available") => rows.reduce((a, i) => a + i[k], 0);

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

  const nameOf = (key: keyof BudgetLineUsage, label: keyof BudgetLineUsage, id?: string) => options(key, label).find(([k]) => k === id)?.[1] || "…";
  const chips = [
    ...(filters.department ? [{ key: "department", label: `Department: ${nameOf("department", "department_name", filters.department)}`, onRemove: () => setFilters({ ...filters, department: "" }) }] : []),
    ...(filters.funding_source ? [{ key: "funding", label: `Funding: ${nameOf("funding_source", "funding_code", filters.funding_source)}`, onRemove: () => setFilters({ ...filters, funding_source: "" }) }] : []),
    ...(filters.project ? [{ key: "project", label: `Project: ${nameOf("project", "project_code", filters.project)}`, onRemove: () => setFilters({ ...filters, project: "" }) }] : []),
  ];

  const showRisk = () => {
    setOnlyRisk(true);
    linesRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const columns: Column<BudgetLineUsage>[] = [
    {
      key: "code",
      header: "Line",
      clamp: true,
      width: "260px",
      cell: (i) => <DocNo value={i.code} className="font-semibold text-ims-text" />,
      sub: (i) => `${i.account} · ${i.funding_code}${i.project_code ? ` · ${i.project_code}` : ""}${i.kind === "capital" ? " · capital" : ""}`,
    },
    { key: "department", header: "Department", width: "170px", cell: (i) => i.department_name },
    { key: "budget", header: "Budget (RWF)", numeric: true, cell: (i) => <Num value={i.budget} />, total: <Num value={sum("budget")} /> },
    { key: "committed", header: "Committed (RWF)", numeric: true, cell: (i) => <Num value={i.committed} />, total: <Num value={sum("committed")} /> },
    { key: "actual", header: "Actual (RWF)", numeric: true, cell: (i) => <Num value={i.actual} />, total: <Num value={sum("actual")} /> },
    { key: "available", header: "Available (RWF)", numeric: true, cell: (i) => <span className="font-semibold"><Num value={i.available} negativeRed /></span>, total: <Num value={sum("available")} negativeRed /> },
    {
      key: "use",
      header: "Use",
      cell: (i) => <UseBar line={i} compact />,
      sub: (i) => (i.overrides > 0 ? <span className="inline-flex items-center gap-1 font-semibold text-ims-warning"><ShieldAlert size={13} aria-hidden /> {i.overrides} DAF override{i.overrides > 1 ? "s" : ""}</span> : null),
    },
  ];

  return (
    <Page>
      <PageHeader
        breadcrumbs={[{ label: "Budget" }]}
        title="Budget overview"
        subtitle="What is committed, spent and still available on every budget line, live."
        meta={u ? `${u.fiscal_year.name}${u.scope === "department" ? " · your department only" : ""} · available = budget − commitments − actuals` : undefined}
        primary={can("manage_budgets") ? { label: "Budgets", icon: FileText, to: "/dashboard/budget/budgets" } : undefined}
        secondary={[{ label: "Reports", icon: BarChart3, to: "/dashboard/budget/reports" }]}
        actions={<ExportMenu onExport={doExport} permission={["export_budgets", "export_reports"]} disabled={!rows.length} size="default" />}
      />

      <Card padded={false}>
        <FilterBar
          chips={chips}
          onClear={() => setFilters({})}
          right={u ? <span className="text-t-small text-ims-muted">Budget control: <strong className="font-semibold text-ims-text">{CONTROL_LABEL[u.control] || u.control}</strong></span> : undefined}
        >
          <FilterSelect label="Department" value={filters.department || ""} onChange={(v) => setFilters({ ...filters, department: v })} options={options("department", "department_name").map(([value, label]) => ({ value, label }))} className="[&_select]:w-[220px]" />
          <FilterSelect label="Funding source" value={filters.funding_source || ""} onChange={(v) => setFilters({ ...filters, funding_source: v })} options={options("funding_source", "funding_code").map(([value, label]) => ({ value, label }))} />
          <FilterSelect label="Project" value={filters.project || ""} onChange={(v) => setFilters({ ...filters, project: v })} options={options("project", "project_code").map(([value, label]) => ({ value, label }))} />
        </FilterBar>
      </Card>

      <KpiBand
        loading={q.isLoading}
        items={[
          { label: "Approved budget (revised)", value: u ? fmtMoneyShort(u.totals.budget) : "—", sub: `${fmtNumber(spend.length)} spending lines` },
          { label: "Committed (open orders)", value: u ? fmtMoneyShort(u.totals.committed) : "—", sub: u ? pctOf(u.totals.committed, u.totals.budget) : "" },
          { label: "Actual (spent)", value: u ? fmtMoneyShort(u.totals.actual) : "—", sub: u ? pctOf(u.totals.actual, u.totals.budget) : "" },
          { label: "Available", value: u ? fmtMoneyShort(u.totals.available) : "—", tone: u && u.totals.available < 0 ? "danger" : "success", sub: u ? `${u.totals.used_pct}% used` : "" },
          { label: "Lines at risk", value: fmtNumber(risk.length), tone: risk.some((i) => i.status === "red") ? "danger" : risk.length ? "warning" : "default", sub: `${t.amber}% used or more`, onClick: risk.length ? showRisk : undefined },
        ]}
      />

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader
            title="Budget use"
            subtitle="Actual and committed against the budget. Point at a bar for the figures."
            action={
              <Segmented
                ariaLabel="Group by"
                className="w-full sm:w-auto"
                value={groupBy}
                onChange={(v) => setGroupBy(v as typeof groupBy)}
                options={[{ value: "department", label: "Department" }, { value: "funding", label: "Funding" }, { value: "project", label: "Project" }, { value: "kind", label: "Type" }]}
              />
            }
          />
          {q.isLoading ? <Skeleton className="h-[260px] w-full" /> : !groups.length ? <EmptyState icon={PieChart} text="No approved budget lines for these filters." /> : (
            <>
              <UseChart rows={groups} labelWidth={narrow ? (groupBy === "department" ? 150 : 80) : groupBy === "department" ? 190 : 110} />
              <div className="mt-3 border-t border-ims-divider pt-3"><UseLegend thresholds={t} /></div>
            </>
          )}
        </Card>
        <div className="min-w-0 space-y-4">
          <Card>
            <CardHeader title="Lines at risk" subtitle={`${t.amber}% used or more, highest first.`} link={risk.length > 8 ? { label: "Show all", onClick: showRisk } : undefined} />
            {q.isLoading ? <ListSkeleton rows={4} /> : !risk.length ? (
              <EmptyState compact icon={PieChart} text={`Every line is below ${t.amber}% used.`} />
            ) : (
              <ul className="-mx-2 divide-y divide-ims-divider">
                {risk.slice(0, 8).map((i) => (
                  <li key={i.id}>
                    <button type="button" onClick={() => setDrill(i)} className="flex w-full items-center gap-3 rounded-control px-2 py-2.5 text-left hover:bg-ims-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ims-focus">
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-mono text-t-small font-semibold text-ims-text">{i.code}</span>
                        <span className="block truncate text-t-small text-ims-muted">{i.department_name} · {fmtMoney(i.available)} left</span>
                      </span>
                      <UseBadge status={i.status} pct={i.used_pct} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          {revenue.length > 0 && (
            <Card>
              <CardHeader title="Revenue budget" subtitle="Expected income by source." />
              <ul className="space-y-2 text-t-body">
                {revenue.map((r) => (
                  <li key={r.id} className="flex items-baseline justify-between gap-3">
                    <span className="min-w-0 truncate text-ims-body">{r.account.replace(/^\d+\s/, "")} <span className="text-ims-faint">· {r.funding_code}</span></span>
                    <span className="shrink-0 font-semibold tabular-nums text-ims-text">{fmtMoneyShort(r.budget)}</span>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>
      </div>

      <div ref={linesRef} className="scroll-mt-4">
        <Card padded={false}>
          <div className="px-5 pt-5">
            <CardHeader className="mb-0" title="Budget lines" subtitle="Open a line for its commitments and actuals." />
          </div>
          <FilterBar
            search={{ value: search, onChange: setSearch, placeholder: "Search line, account or department" }}
            right={<span className="text-t-small tabular-nums text-ims-muted">{fmtNumber(rows.length)} of {fmtNumber(spend.length)} lines</span>}
          >
            <Checkbox label="Only lines at risk" checked={onlyRisk} onChange={setOnlyRisk} className="items-center" />
          </FilterBar>
          <div className="border-t border-ims-divider">
            <DataTable
              columns={columns}
              rows={pageRows}
              rowKey={(i) => i.id}
              loading={q.isLoading}
              error={q.isError ? new Error(errorMessage(q.error)) : undefined}
              onRetry={() => q.refetch()}
              fetching={q.isFetching}
              onRowClick={(i) => setDrill(i)}
              totalLabel={rows.length > pageRows.length ? `Total of ${fmtNumber(rows.length)} lines` : "Total"}
              minWidth={1000}
              caption="Budget lines"
              empty={<EmptyState icon={Search} text={spend.length ? "No line matches. Clear the search or the risk filter." : "No approved budget lines for these filters."} />}
              footer={rows.length > 15 ? <Pager page={page} perPage={perPage} total={rows.length} onPage={setPage} onPerPage={(n) => { setPerPage(n); setPage(1); }} /> : undefined}
            />
          </div>
        </Card>
      </div>
      <LineLedgerDialog line={drill} onClose={() => setDrill(null)} />
    </Page>
  );
}
