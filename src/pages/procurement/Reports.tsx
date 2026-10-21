import * as React from "react";
import { useQuery } from "react-query";
import { useNavigate, useSearchParams } from "react-router-dom";
import * as XLSX from "xlsx";
import { BarChart3, Download, FileText, Printer, RefreshCw } from "lucide-react";
import pocketbase from "@/lib/pocketbase";
import { StatusBadge } from "@/components/enterprise/ui";
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
} from "@/components/ims";
import { CONTRACT_STATUS, DOC_STATUS, INVOICE_STATUS, PO_STATUS, RETURN_STATUS, RFQ_STATUS, compactMoney, errorMessage, phase5Api } from "@/lib/procurement";
import { cn } from "@/utils";

const GROUPS: { title: string; items: [string, string][] }[] = [
  { title: "Spend", items: [["spend", "Spend by month"], ["supplier_spend", "Spend by supplier"], ["category_spend", "Spend by category"], ["department_spend", "Spend by department"], ["budget", "Budget vs actual"]] },
  { title: "Documents", items: [["requisitions", "Purchase requisitions"], ["rfqs", "Requests for quotation"], ["quotations", "Supplier quotations"], ["purchase_orders", "Purchase orders"], ["goods_receipts", "Goods received"], ["returns", "Purchase returns"], ["contracts", "Contracts"]] },
  { title: "Follow-up", items: [["pending_approvals", "Pending approvals"], ["outstanding_pos", "Outstanding purchase orders"], ["overdue_deliveries", "Overdue deliveries"], ["invoice_matching", "Invoice matching"], ["plan_execution", "Procurement plan execution"]] },
  { title: "Suppliers and control", items: [["supplier_balances", "Supplier balances"], ["supplier_performance", "Supplier performance"], ["audit", "Procurement audit trail"]] },
];
const STATUS_MAPS = {
  ...DOC_STATUS, ...RFQ_STATUS, ...PO_STATUS, ...INVOICE_STATUS, ...RETURN_STATUS, ...CONTRACT_STATUS,
  matched: { label: "Completed", tone: "success", note: "Matched" },
  partial: { label: "In progress", tone: "info", note: "Partial match" },
  exception: { label: "Returned", tone: "violet", note: "Match exception" },
} as any;
const NUMERIC = ["money", "number", "pct"];
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
const scoreTone = (key: string, v: number) =>
  key.includes("score") || key.includes("time") || key.includes("quality") || key.includes("accuracy")
    ? v >= 80 ? "text-ims-success" : v >= 60 ? "text-ims-warning" : "text-ims-danger"
    : key === "used_pct" && v > 100 ? "font-semibold text-ims-danger" : "";

export default function Reports() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const key = params.get("r") || "supplier_spend";
  const y = new Date().getFullYear();
  const initial = { from: `${y}-01-01`, to: new Date().toISOString().slice(0, 10), department: "", supplier: "", category: "" };
  const [f, setF] = React.useState(initial);
  const [search, setSearch] = React.useState("");
  const [sort, setSort] = React.useState<string>("");
  const ref = useQuery(["report-filters"], async () => {
    const [departments, suppliers, categories] = await Promise.all([
      pocketbase.collection("departments").getFullList({ sort: "name", fields: "id,name" }),
      pocketbase.collection("suppliers").getFullList({ sort: "name", fields: "id,name" }),
      pocketbase.collection("procurement_categories").getFullList({ sort: "name", fields: "id,name" }),
    ]);
    return { departments, suppliers, categories };
  });
  const q = useQuery(["procurement-report", key, f], () => phase5Api.report(key, f), { keepPreviousData: true });
  const r = q.data;
  const title = GROUPS.flatMap((g) => g.items).find(([k]) => k === key)?.[1] || "Report";
  const rows = React.useMemo(() => {
    let out = (r?.rows || []).filter((row) => !search.trim() || Object.values(row).some((v) => String(v ?? "").toLowerCase().includes(search.trim().toLowerCase())));
    if (sort) {
      const k = sort.replace(/^-/, "");
      const dir = sort.startsWith("-") ? -1 : 1;
      out = [...out].sort((a, b) => (a[k] > b[k] ? 1 : a[k] < b[k] ? -1 : 0) * dir);
    }
    return out;
  }, [r, search, sort]);
  const nameOf = (list: any[] | undefined, id: string) => list?.find((x) => x.id === id)?.name;
  const filterText = [f.from && `from ${fmtDate(f.from)}`, f.to && `to ${fmtDate(f.to)}`, f.department && nameOf(ref.data?.departments, f.department), f.supplier && nameOf(ref.data?.suppliers, f.supplier), f.category && nameOf(ref.data?.categories, f.category)].filter(Boolean).join(" · ");
  const pick = (k: string) => {
    setParams({ r: k });
    setSort("");
    setSearch("");
  };

  function exportExcel() {
    if (!r) return;
    const header = r.columns.map((c) => headerOf(c));
    const body = rows.map((row) => r.columns.map((c) => (NUMERIC.includes(c.type) ? Number(row[c.key]) || 0 : row[c.key] ?? "")));
    const totals = r.columns.map((c, i) => (i === 0 ? "Total" : r.totals[c.key] ?? ""));
    const ws = XLSX.utils.aoa_to_sheet([[`${title}`], [filterText], [], header, ...body, ...(Object.keys(r.totals).length ? [totals] : [])]);
    ws["!cols"] = r.columns.map((c) => ({ wch: c.type === "text" ? 28 : 14 }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, title.slice(0, 30));
    XLSX.writeFile(wb, `${key}-${new Date().toISOString().slice(0, 10)}.xlsx`);
  }

  const hasTotals = Boolean(r && Object.keys(r.totals).length);
  const columns: Column<any>[] = (r?.columns || []).map((c, j) => ({
    key: c.key,
    header: headerOf(c),
    sortField: c.key,
    numeric: NUMERIC.includes(c.type),
    nowrap: c.type === "date",
    className: cn(j === 0 && "min-w-[200px] font-semibold", c.type === "date" && "text-ims-body"),
    total: hasTotals && j > 0 && r!.totals[c.key] !== undefined ? fmt(c.type, r!.totals[c.key]) : undefined,
    cell: (row) =>
      c.type === "status" ? (
        <StatusBadge status={row[c.key]} map={STATUS_MAPS} />
      ) : c.type === "pct" && row[c.key] !== null && row[c.key] !== undefined ? (
        <span className={scoreTone(c.key, Number(row[c.key]))}>{fmt(c.type, row[c.key])}</span>
      ) : (
        fmt(c.type, row[c.key])
      ),
  }));
  // The first column carries the "Total" label when the report has totals.
  if (hasTotals && columns[0]) columns[0].total = undefined;

  const chips = [
    ...(f.department ? [{ key: "department", label: `Department: ${nameOf(ref.data?.departments, f.department) || "…"}`, onRemove: () => setF((x) => ({ ...x, department: "" })) }] : []),
    ...(f.supplier ? [{ key: "supplier", label: `Supplier: ${nameOf(ref.data?.suppliers, f.supplier) || "…"}`, onRemove: () => setF((x) => ({ ...x, supplier: "" })) }] : []),
    ...(f.category ? [{ key: "category", label: `Category: ${nameOf(ref.data?.categories, f.category) || "…"}`, onRemove: () => setF((x) => ({ ...x, category: "" })) }] : []),
  ];

  return (
    <Page className="print:p-0">
      <div className="print:hidden">
        <PageHeader
          breadcrumbs={[{ label: "Procurement", to: "/dashboard/procurement" }, { label: "Reports" }]}
          title="Procurement reports"
          subtitle="Figures worked out on the server from live records. Export to Excel, or print and save as PDF."
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
              <Button icon={Download} onClick={exportExcel} disabled={!rows.length}>Export to Excel</Button>
            </div>
          </div>
          <FilterBar
            className="print:hidden"
            search={{ value: search, onChange: setSearch, placeholder: "Search in these results" }}
            chips={chips}
            onClear={() => setF((x) => ({ ...x, department: "", supplier: "", category: "" }))}
          >
            <DateRangeFilter label="Dates" from={f.from} to={f.to} onChange={(from, to) => setF((x) => ({ ...x, from, to }))} />
            <FilterSelect label="Department" value={f.department} onChange={(v) => setF((x) => ({ ...x, department: v }))} options={(ref.data?.departments || []).map((d: any) => ({ value: d.id, label: d.name }))} />
            <FilterSelect label="Supplier" value={f.supplier} onChange={(v) => setF((x) => ({ ...x, supplier: v }))} options={(ref.data?.suppliers || []).map((d: any) => ({ value: d.id, label: d.name }))} />
            <FilterSelect label="Category" value={f.category} onChange={(v) => setF((x) => ({ ...x, category: v }))} options={(ref.data?.categories || []).map((d: any) => ({ value: d.id, label: d.name }))} />
          </FilterBar>
          <div className="border-t border-ims-divider">
            <DataTable
              columns={columns}
              rows={rows}
              rowKey={(_, i) => String(i)}
              sort={sort}
              onSort={setSort}
              loading={q.isLoading}
              error={q.isError ? new Error(errorMessage(q.error)) : undefined}
              onRetry={() => q.refetch()}
              fetching={q.isFetching}
              onRowClick={rows.some((row) => row.link) ? (row) => row.link && navigate(row.link) : undefined}
              minWidth={760}
              caption={title}
              empty={<EmptyState icon={BarChart3} text="No record matches these filters. Widen the dates or clear a filter." />}
            />
          </div>
          {r?.note && <p className="border-t border-ims-divider px-5 py-3 text-t-small text-ims-muted">{r.note}</p>}
          {r && r.totals.value !== undefined && <p className="px-5 pb-4 text-t-small text-ims-muted print:hidden">Total ordered in this report: {compactMoney(r.totals.value)}</p>}
        </Card>
      </div>
    </Page>
  );
}
