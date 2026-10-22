/**
 * Budget → Reports: budget vs actual for any month range (grouped by line, department, funding source,
 * project, account or type), open commitments per line, and the register of DAF budget overrides.
 */
import * as React from "react";
import { useQuery } from "react-query";
import { BarChart3, Hourglass, RefreshCw, ShieldAlert } from "lucide-react";
import pocketbase from "@/lib/pocketbase";
import { BudgetLineUsage, BvaRow, MONTHS_FY, budgetApi } from "@/lib/budget";
import { errorMessage } from "@/lib/procurement";
import { exportReport } from "@/lib/exporter";
import { StatusBadge } from "@/components/enterprise/ui";
import ExportMenu from "@/components/enterprise/ExportMenu";
import RecordTable, { RecordColumn } from "@/components/enterprise/RecordTable";
import {
  Button,
  Card,
  CardHeader,
  Column,
  DataTable,
  DocNo,
  EmptyState,
  FilterBar,
  FilterSelect,
  Num,
  Page,
  PageHeader,
  Person,
  Tabs,
  fmtDate,
  fmtNumber,
  statusText,
} from "@/components/ims";
import { LineLedgerDialog, SpendBar, USE_SERIES, UseBadge } from "@/components/budget/BudgetKit";

const TABS = [
  { key: "bva", label: "Budget vs actual" },
  { key: "commitments", label: "Open commitments" },
  { key: "overrides", label: "Budget overrides" },
];
const GROUPS = [
  { value: "department", label: "Department", option: "By department" },
  { value: "line", label: "Budget line", option: "By budget line" },
  { value: "funding_source", label: "Funding source", option: "By funding source" },
  { value: "project", label: "Project", option: "By project" },
  { value: "account", label: "GL account", option: "By GL account" },
];

/** Client-side sort of report rows ("-field" = descending). */
function sortRows<T>(rows: T[], sort: string) {
  if (!sort) return rows;
  const k = sort.replace(/^-/, "") as keyof T;
  const dir = sort.startsWith("-") ? -1 : 1;
  return [...rows].sort((a, b) => (a[k] > b[k] ? 1 : a[k] < b[k] ? -1 : 0) * dir);
}

function Legend() {
  return (
    <span className="flex items-center gap-3 text-t-small text-ims-muted">
      <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: USE_SERIES.actual }} aria-hidden /> Actual</span>
      <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: USE_SERIES.committed }} aria-hidden /> Committed</span>
    </span>
  );
}

export default function BudgetReports() {
  const [tab, setTab] = React.useState("bva");
  const years = useQuery(["fiscal-years-all"], () => pocketbase.collection("fiscal_years").getFullList({ sort: "-start_date" }));
  const [fy, setFy] = React.useState("");
  React.useEffect(() => {
    if (!fy && years.data?.length) setFy((years.data.find((y: any) => y.is_current) || years.data[0]).id);
  }, [years.data, fy]);
  return (
    <Page>
      <PageHeader
        breadcrumbs={[{ label: "Budget", to: "/dashboard/budget" }, { label: "Reports" }]}
        title="Budget reports"
        subtitle="Execution against the phased budget, money tied up in open orders, and every override of budget control."
        actions={
          <FilterSelect
            label="Fiscal year"
            all={false}
            value={fy}
            onChange={setFy}
            options={(years.data || []).map((y: any) => ({ value: y.id, label: `${y.name}${y.is_current ? " (current)" : ""}` }))}
            className="[&_select]:w-[230px]"
          />
        }
      />
      <Tabs label="Reports" active={tab} onChange={setTab} tabs={TABS} />
      {fy && tab === "bva" && <BvaReport fy={fy} />}
      {fy && tab === "commitments" && <Commitments fy={fy} />}
      {fy && tab === "overrides" && <Overrides fy={fy} />}
    </Page>
  );
}

function BvaReport({ fy }: { fy: string }) {
  const [groupBy, setGroupBy] = React.useState("department");
  const [from, setFrom] = React.useState(1);
  const [to, setTo] = React.useState(12);
  const [kind, setKind] = React.useState("");
  const [sort, setSort] = React.useState("");
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
        { header: "Execution %", value: (r) => r.execution_pct, format: "percent" },
        { header: "Overrides", value: (r) => r.overrides, format: "number" },
      ],
    });
  const rows = sortRows(d?.rows || [], sort);
  const executed = d?.totals.budget ? Math.round((d.totals.actual / d.totals.budget) * 1000) / 10 : 0;
  const columns: Column<BvaRow>[] = [
    {
      key: "label",
      header: groupLabel,
      sortField: "label",
      className: "min-w-[220px]",
      cell: (r) => <span className="font-semibold text-ims-text">{r.label}</span>,
      sub: (r) => (r.overrides > 0 ? <span className="inline-flex items-center gap-1 font-semibold text-ims-warning" title="Budget control was overridden by the DAF"><ShieldAlert size={13} aria-hidden /> {r.overrides} override{r.overrides > 1 ? "s" : ""}</span> : null),
    },
    { key: "annual", header: "Annual budget (RWF)", sortField: "annual_budget", numeric: true, cell: (r) => <span className="text-ims-body"><Num value={r.annual_budget} /></span>, total: d ? <Num value={d.totals.annual_budget} /> : undefined },
    { key: "budget", header: "Budget for period (RWF)", sortField: "budget", numeric: true, cell: (r) => <Num value={r.budget} />, total: d ? <Num value={d.totals.budget} /> : undefined },
    { key: "actual", header: "Actual (RWF)", sortField: "actual", numeric: true, cell: (r) => <span className="font-semibold"><Num value={r.actual} /></span>, total: d ? <Num value={d.totals.actual} /> : undefined },
    { key: "committed", header: "Committed (RWF)", sortField: "committed", numeric: true, cell: (r) => <Num value={r.committed} />, total: d ? <Num value={d.totals.committed} /> : undefined },
    { key: "variance", header: "Variance (RWF)", sortField: "variance", numeric: true, cell: (r) => <span className="font-semibold"><Num value={r.variance} negativeRed /></span>, total: d ? <Num value={d.totals.variance} negativeRed /> : undefined },
    {
      key: "execution",
      header: "Execution",
      sortField: "execution_pct",
      width: "200px",
      cell: (r) => (
        <div className="flex items-center gap-2">
          <SpendBar budget={r.budget} actual={r.actual} committed={r.committed} className="min-w-[90px]" />
          <span className="w-12 text-right text-t-small tabular-nums text-ims-body">{r.execution_pct}%</span>
        </div>
      ),
      total: <span className="text-t-small tabular-nums">{executed}% executed</span>,
    },
  ];
  const monthOptions = (prefix: string, min = 1) => MONTHS_FY.map((m, i) => ({ value: String(i + 1), label: `${prefix} ${m}` })).filter((o) => Number(o.value) >= min);
  return (
    <Card padded={false}>
      <div className="flex flex-wrap items-start justify-between gap-3 px-5 pt-5">
        <CardHeader
          className="mb-0"
          title="Budget vs actual"
          subtitle={d ? `${d.fiscal_year.name} · ${d.period_label} · the budget for the period is the phased amount of those months.` : "Execution against the phased budget."}
        />
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="ghost" icon={RefreshCw} onClick={() => q.refetch()} loading={q.isFetching && !q.isLoading}>Refresh</Button>
          <ExportMenu onExport={doExport} permission={["export_budgets", "export_reports"]} disabled={!d?.rows.length} size="default" />
        </div>
      </div>
      <FilterBar right={<Legend />}>
        <FilterSelect label="Group by" all={false} value={groupBy} onChange={setGroupBy} options={GROUPS.map((g) => ({ value: g.value, label: g.option }))} />
        <FilterSelect label="From month" all={false} value={String(from)} onChange={(v) => { const n = Number(v); setFrom(n); if (to < n) setTo(n); }} options={monthOptions("From")} className="[&_select]:w-[130px]" />
        <FilterSelect label="To month" all={false} value={String(to)} onChange={(v) => setTo(Number(v))} options={monthOptions("To", from)} className="[&_select]:w-[130px]" />
        <FilterSelect
          label="Lines"
          all={false}
          value={kind}
          onChange={setKind}
          options={[{ value: "", label: "Spending (expense + capital)" }, { value: "expense", label: "Expense only" }, { value: "capital", label: "Capital only" }, { value: "revenue", label: "Revenue" }]}
          className="[&_select]:w-[240px]"
        />
      </FilterBar>
      <div className="border-t border-ims-divider">
        <DataTable
          columns={columns}
          rows={rows}
          rowKey={(r) => r.key}
          sort={sort}
          onSort={setSort}
          loading={q.isLoading}
          error={q.isError ? new Error(errorMessage(q.error)) : undefined}
          onRetry={() => q.refetch()}
          fetching={q.isFetching}
          minWidth={1040}
          caption="Budget vs actual"
          empty={<EmptyState icon={BarChart3} text="No approved budget lines match these filters. Widen the months or choose other lines." />}
        />
      </div>
    </Card>
  );
}

function Commitments({ fy }: { fy: string }) {
  const q = useQuery(["budget-usage-commitments", fy], () => budgetApi.usage({ fiscal_year: fy }));
  const [drill, setDrill] = React.useState<BudgetLineUsage | null>(null);
  const [sort, setSort] = React.useState("");
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
  const sum = (k: "budget" | "actual" | "available") => rows.reduce((a, r) => a + r[k], 0);
  const columns: Column<BudgetLineUsage>[] = [
    { key: "code", header: "Line", sortField: "code", clamp: true, width: "260px", cell: (r) => <DocNo value={r.code} className="font-semibold text-ims-text" />, sub: (r) => `${r.account} · ${r.funding_code}${r.project_code ? ` · ${r.project_code}` : ""}` },
    { key: "department", header: "Department", sortField: "department_name", width: "170px", cell: (r) => r.department_name },
    { key: "budget", header: "Budget (RWF)", sortField: "budget", numeric: true, cell: (r) => <span className="text-ims-body"><Num value={r.budget} /></span>, total: <Num value={sum("budget")} /> },
    { key: "committed", header: "Committed (RWF)", sortField: "committed", numeric: true, cell: (r) => <span className="font-semibold"><Num value={r.committed} /></span>, total: <Num value={total} /> },
    { key: "actual", header: "Actual (RWF)", sortField: "actual", numeric: true, cell: (r) => <span className="text-ims-body"><Num value={r.actual} /></span>, total: <Num value={sum("actual")} /> },
    { key: "available", header: "Available (RWF)", sortField: "available", numeric: true, cell: (r) => <Num value={r.available} negativeRed />, total: <Num value={sum("available")} negativeRed /> },
    { key: "use", header: "Use", sortField: "used_pct", nowrap: true, cell: (r) => <UseBadge status={r.status} pct={r.used_pct} /> },
  ];
  return (
    <Card padded={false}>
      <div className="flex flex-wrap items-start justify-between gap-3 px-5 pt-5">
        <CardHeader
          className="mb-0"
          title="Open commitments"
          subtitle={`${fmtNumber(rows.length)} line${rows.length === 1 ? "" : "s"} with approved purchase orders not yet invoiced. Open a line to see the orders behind it.`}
        />
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="ghost" icon={RefreshCw} onClick={() => q.refetch()} loading={q.isFetching && !q.isLoading}>Refresh</Button>
          <ExportMenu onExport={doExport} permission={["export_budgets", "export_reports"]} disabled={!rows.length} size="default" />
        </div>
      </div>
      <div className="mt-4 border-t border-ims-divider">
        <DataTable
          columns={columns}
          rows={sortRows(rows, sort)}
          rowKey={(r) => r.id}
          sort={sort}
          onSort={setSort}
          loading={q.isLoading}
          error={q.isError ? new Error(errorMessage(q.error)) : undefined}
          onRetry={() => q.refetch()}
          onRowClick={(r) => setDrill(r)}
          minWidth={900}
          caption="Open commitments"
          empty={<EmptyState icon={Hourglass} text="No open commitments. Approved purchase orders that are not yet invoiced show here." />}
        />
      </div>
      <LineLedgerDialog line={drill} onClose={() => setDrill(null)} />
    </Card>
  );
}

/** Overrides are permanent records; their state in the status glossary. */
const OVERRIDE_STATUS: Record<string, { label: string; tone: "success" | "danger"; note?: string }> = {
  active: { label: "Approved", tone: "success", note: "Granted, not yet used" },
  used: { label: "Completed", tone: "success", note: "Used" },
  cancelled: { label: "Cancelled", tone: "danger" },
};

function Overrides({ fy }: { fy: string }) {
  const columns: RecordColumn<any>[] = [
    { key: "date", header: "Granted", sortField: "created", nowrap: true, format: "date", csv: (r) => (r.created ? r.created.slice(0, 10) : ""), cell: (r) => fmtDate(r.created) },
    { key: "doc", header: "Document", sortField: "document_number", nowrap: true, cell: (r) => <DocNo value={r.document_number} />, sub: (r) => (r.expand?.budget_line?.code ? <span className="whitespace-nowrap font-mono">{r.expand.budget_line.code}</span> : null), csv: (r) => r.document_number },
    { key: "line", header: "Budget line", exportOnly: true, csv: (r) => r.expand?.budget_line?.code || "", cell: (r) => <DocNo value={r.expand?.budget_line?.code} /> },
    { key: "req", header: "Requested (RWF)", sortField: "amount_requested", align: "right", format: "money", sum: "amount_requested", cell: (r) => <Num value={r.amount_requested} />, csv: (r) => r.amount_requested },
    { key: "avail", header: "Available (RWF)", sortField: "available", align: "right", format: "money", exportOnly: true, cell: (r) => <Num value={r.available} />, csv: (r) => r.available },
    { key: "short", header: "Shortfall (RWF)", sortField: "shortfall", align: "right", format: "money", sum: "shortfall", cell: (r) => <span className="font-semibold text-ims-danger"><Num value={r.shortfall} /></span>, csv: (r) => r.shortfall },
    { key: "by", header: "Approved by", className: "max-w-[180px]", csv: (r) => r.expand?.approved_by?.name || "", cell: (r) => <Person name={r.expand?.approved_by?.name} /> },
    { key: "reason", header: "Reason", sortField: "reason", clamp: true, cell: (r) => r.reason, csv: (r) => r.reason },
    { key: "status", header: "Status", sortField: "status", csv: (r) => statusText(OVERRIDE_STATUS[r.status], r.status), cell: (r) => <StatusBadge status={r.status} map={OVERRIDE_STATUS} /> },
  ];
  return (
    <div className="space-y-3">
      <p className="text-t-body text-ims-muted">Every time the DAF allowed a document past budget control. Overrides are permanent records and cannot be edited.</p>
      <RecordTable<any>
        collection="budget_overrides"
        expand="budget_line,approved_by"
        baseFilter={`budget_line.fiscal_year = "${fy}"`}
        searchFields={["document_number", "reason"]}
        searchPlaceholder="Search document or reason"
        filters={[{ field: "status", label: "Status", options: Object.entries(OVERRIDE_STATUS).map(([value, m]) => ({ value, label: statusText(m) })) }]}
        dateField="created"
        dateLabel="Granted"
        exportName="budget-overrides"
        exportTitle="Budget overrides"
        exportPermission={["export_budgets", "export_reports"]}
        empty={{ icon: ShieldAlert, title: "No overrides.", text: "Budget control has not been overridden in this fiscal year." }}
        columns={columns}
      />
    </div>
  );
}
