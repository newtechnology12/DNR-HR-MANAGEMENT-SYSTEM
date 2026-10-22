/**
 * Payables → Reports: supplier ageing, outstanding liabilities, payment register, payment summary and
 * the withholding tax schedule (all computed on the server from the live records).
 */
import * as React from "react";
import { useQuery } from "react-query";
import { useNavigate, useSearchParams } from "react-router-dom";
import { BarChart3, FileText, Printer, RefreshCw } from "lucide-react";
import pocketbase from "@/lib/pocketbase";
import { payablesApi } from "@/lib/payables";
import { useFiscalYears } from "@/lib/fiscal";
import { CellFormat, exportReport } from "@/lib/exporter";
import { INVOICE_STATUS, errorMessage } from "@/lib/procurement";
import { Skeleton } from "@/components/ui/skeleton";
import ExportMenu from "@/components/enterprise/ExportMenu";
import { StatusBadge } from "@/components/enterprise/ui";
import { cn } from "@/utils";
import {
  Button,
  Card,
  CardHeader,
  Column,
  DataTable,
  DateRangeFilter,
  EmptyState,
  FilterBar,
  FilterSelect,
  Page,
  PageHeader,
  Select,
  fmtDate,
  fmtDateTime,
  sentence,
} from "@/components/ims";

const GROUPS: { title: string; items: [string, string][] }[] = [
  { title: "What we owe", items: [["ageing", "Supplier ageing"], ["outstanding", "Outstanding liabilities"]] },
  { title: "What we paid", items: [["payment_register", "Payment register"], ["payment_summary", "Payment summary by payee"], ["wht_schedule", "Withholding tax schedule"]] },
];
const EXPORT_PERMISSION = ["export_invoices", "view_payment_vouchers", "manage_payment_vouchers"];
const NUMERIC = ["money", "number", "pct"];
/** Document numbers and references stay on one line. */
const DOC_KEYS = ["number", "voucher", "invoice", "reference", "tin", "code"];
const FORMAT: Record<string, CellFormat> = { money: "money", number: "number", pct: "percent", date: "date" };
const fmt = (type: string, v: any) => {
  if (v === null || v === undefined || v === "") return "—";
  if (type === "money") return Math.round(Number(v)).toLocaleString("en-US");
  if (type === "number") return Number(v).toLocaleString("en-US");
  if (type === "pct") return `${Number(v).toLocaleString("en-US")}%`;
  if (type === "date") return fmtDate(String(v));
  return String(v);
};
/** Money columns say the unit in the header; cells show numbers only. */
const headerOf = (c: { label: string; type: string }) => (c.type === "money" && !/RWF/i.test(c.label) ? `${c.label} (RWF)` : c.label);

export default function PayablesReports() {
  const years = useFiscalYears();
  const current = years.data?.find((y) => y.is_current);
  if (years.isLoading) {
    return (
      <Page>
        <Skeleton className="h-5 w-48" />
        <Skeleton className="h-12 w-full max-w-2xl" />
        <Skeleton className="h-64 w-full" />
      </Page>
    );
  }
  return <Reports defaultFrom={current ? `${current.year}-${String(current.startMonth).padStart(2, "0")}-01` : undefined} />;
}

function Reports({ defaultFrom }: { defaultFrom?: string }) {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const key = params.get("r") || GROUPS[0].items[0][0];
  const [f, setF] = React.useState({ from: defaultFrom || `${new Date().getFullYear()}-01-01`, to: new Date().toISOString().slice(0, 10), supplier: "", department: "" });
  const [search, setSearch] = React.useState("");
  const [sort, setSort] = React.useState("");
  const ref = useQuery(["payables-report-filters"], async () => {
    const [suppliers, departments] = await Promise.all([
      pocketbase.collection("suppliers").getFullList({ sort: "name", fields: "id,name" }),
      pocketbase.collection("departments").getFullList({ sort: "name", fields: "id,name" }),
    ]);
    return { suppliers, departments };
  });
  const q = useQuery(["payables-report", key, f], () => payablesApi.report(key, f), { keepPreviousData: true, enabled: Boolean(key) });
  const r = q.data;
  const title = GROUPS.flatMap((g) => g.items).find(([k]) => k === key)?.[1] || r?.title || "Report";
  const rows = React.useMemo(() => {
    const s = search.trim().toLowerCase();
    let out = (r?.rows || []).filter((row) => !s || Object.values(row).some((v) => String(v ?? "").toLowerCase().includes(s)));
    if (sort) {
      const k = sort.replace(/^-/, "");
      const dir = sort.startsWith("-") ? -1 : 1;
      out = [...out].sort((a, b) => (a[k] > b[k] ? 1 : a[k] < b[k] ? -1 : 0) * dir);
    }
    return out;
  }, [r, search, sort]);
  const nameOf = (list: any[] | undefined, id: string) => list?.find((x) => x.id === id)?.name;
  const filterText = [f.from && `from ${fmtDate(f.from)}`, f.to && `to ${fmtDate(f.to)}`, f.supplier && nameOf(ref.data?.suppliers, f.supplier), f.department && nameOf(ref.data?.departments, f.department)].filter(Boolean).join(" · ");
  const pick = (k: string) => {
    setParams({ r: k });
    setSort("");
    setSearch("");
  };

  const doExport = (format: "xlsx" | "pdf" | "csv") =>
    exportReport({
      title,
      subtitle: filterText,
      rows,
      format,
      what: `report:${key}`,
      orientation: (r?.columns.length || 0) > 6 ? "landscape" : "portrait",
      totals: (r?.columns || []).filter((c) => r?.totals[c.key] !== undefined && ["money", "number"].includes(c.type)).map((c) => headerOf(c)),
      columns: (r?.columns || []).map((c) => ({ header: headerOf(c), value: (row: any) => row[c.key], format: FORMAT[c.type] || "text", width: c.type === "text" || c.type === "status" ? 24 : 14 })),
    });

  const hasTotals = Boolean(r && Object.keys(r.totals || {}).length);
  const columns: Column<any>[] = (r?.columns || []).map((c, j) => ({
    key: c.key,
    header: headerOf(c),
    sortField: c.key,
    numeric: NUMERIC.includes(c.type),
    nowrap: c.type === "date" || DOC_KEYS.includes(c.key),
    className: cn(j === 0 && "font-semibold", j === 0 && !DOC_KEYS.includes(c.key) && "min-w-[180px]", ["payee", "supplier", "paid_by"].includes(c.key) && "min-w-[180px]", c.type === "date" && "text-ims-body"),
    total: hasTotals && j > 0 && r!.totals[c.key] !== undefined ? fmt(c.type, r!.totals[c.key]) : undefined,
    cell: (row) => (c.type === "status" ? <StatusBadge status={row[c.key]} map={INVOICE_STATUS} /> : c.key === "method" ? sentence(row[c.key]) || "—" : fmt(c.type, row[c.key])),
  }));

  const chips = [
    ...(f.supplier ? [{ key: "supplier", label: `Supplier: ${nameOf(ref.data?.suppliers, f.supplier) || "…"}`, onRemove: () => setF((x) => ({ ...x, supplier: "" })) }] : []),
    ...(f.department ? [{ key: "department", label: `Department: ${nameOf(ref.data?.departments, f.department) || "…"}`, onRemove: () => setF((x) => ({ ...x, department: "" })) }] : []),
  ];

  return (
    <Page className="print:p-0">
      <div className="print:hidden">
        <PageHeader
          breadcrumbs={[{ label: "Payables", to: "/dashboard/finance/invoices" }, { label: "Reports" }]}
          title="Payables reports"
          subtitle="Unpaid invoices by age, every payment made with the tax withheld, and the withholding tax schedule for RRA."
        />
      </div>
      <div className="grid gap-4 lg:grid-cols-[232px_minmax(0,1fr)]">
        <div className="lg:hidden print:hidden">
          <label htmlFor="report-pick" className="mb-1.5 block text-t-label text-ims-text">Report</label>
          <Select id="report-pick" value={key} onChange={(e) => pick(e.target.value)}>
            {GROUPS.map((g) => (
              <optgroup key={g.title} label={g.title}>
                {g.items.map(([k, label]) => <option key={k} value={k}>{label}</option>)}
              </optgroup>
            ))}
          </Select>
        </div>
        <Card as="div" padded={false} className="hidden self-start p-3 lg:block print:hidden">
          <nav className="space-y-4" aria-label="Reports">
            {GROUPS.map((g) => (
              <div key={g.title}>
                <p className="mb-1 px-2 text-t-small font-semibold text-ims-muted">{g.title}</p>
                {g.items.map(([k, label]) => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => pick(k)}
                    aria-current={key === k ? "page" : undefined}
                    className={cn("flex min-h-[36px] w-full items-center gap-2 rounded-control px-2 text-left text-t-body", key === k ? "bg-ims-info-bg font-semibold text-ims-primary" : "text-ims-body hover:bg-ims-hover")}
                  >
                    <FileText size={15} className="shrink-0 opacity-60" aria-hidden /> {label}
                  </button>
                ))}
              </div>
            ))}
          </nav>
        </Card>

        <Card padded={false} className="min-w-0 print:border-0">
          <div className="flex flex-wrap items-start justify-between gap-3 px-5 pt-5">
            <CardHeader className="mb-0" title={title} subtitle={`${filterText || "All records"} · ${rows.length} ${rows.length === 1 ? "row" : "rows"}${r ? ` · made ${fmtDateTime(r.generated_at)}` : ""}`} />
            <div className="flex flex-wrap gap-2 print:hidden">
              <Button variant="ghost" icon={RefreshCw} onClick={() => q.refetch()} loading={q.isFetching && !q.isLoading}>Refresh</Button>
              <Button icon={Printer} onClick={() => window.print()} disabled={!rows.length}>Print or PDF</Button>
              <ExportMenu onExport={doExport} permission={EXPORT_PERMISSION} disabled={!rows.length} />
            </div>
          </div>
          <FilterBar
            className="print:hidden"
            search={{ value: search, onChange: setSearch, placeholder: "Search in these results" }}
            chips={chips}
            onClear={() => setF((x) => ({ ...x, supplier: "", department: "" }))}
          >
            <DateRangeFilter label="Dates" from={f.from} to={f.to} onChange={(from, to) => setF((x) => ({ ...x, from, to }))} />
            <FilterSelect label="Supplier" value={f.supplier} onChange={(v) => setF((x) => ({ ...x, supplier: v }))} options={(ref.data?.suppliers || []).map((d: any) => ({ value: d.id, label: d.name }))} />
            <FilterSelect label="Department" value={f.department} onChange={(v) => setF((x) => ({ ...x, department: v }))} options={(ref.data?.departments || []).map((d: any) => ({ value: d.id, label: d.name }))} />
          </FilterBar>
          <div className="border-t border-ims-divider">
            <DataTable
              columns={columns}
              rows={rows}
              rowKey={(_, i) => String(i)}
              sort={sort}
              onSort={setSort}
              loading={q.isLoading}
              error={q.isError ? new Error(errorMessage(q.error, "You may not have access to this report.")) : undefined}
              onRetry={() => q.refetch()}
              fetching={q.isFetching}
              onRowClick={rows.some((row) => row.link) ? (row) => row.link && navigate(row.link) : undefined}
              minWidth={760}
              caption={title}
              empty={<EmptyState icon={BarChart3} text="No record matches these filters. Widen the dates or clear a filter." />}
            />
          </div>
          {r?.note && <p className="border-t border-ims-divider px-5 py-3 text-t-small text-ims-muted">{r.note}</p>}
        </Card>
      </div>
    </Page>
  );
}
