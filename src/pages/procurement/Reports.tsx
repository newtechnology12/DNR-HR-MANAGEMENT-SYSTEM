import * as React from "react";
import { useQuery } from "react-query";
import { useNavigate, useSearchParams } from "react-router-dom";
import * as XLSX from "xlsx";
import { ArrowDown, ArrowUp, BarChart3, Download, FileText, Printer, RefreshCw } from "lucide-react";
import pocketbase from "@/lib/pocketbase";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState, PageHeader, StatusBadge } from "@/components/enterprise/ui";
import { CONTRACT_STATUS, DOC_STATUS, INVOICE_STATUS, PO_STATUS, RETURN_STATUS, RFQ_STATUS, compactMoney, errorMessage, phase5Api } from "@/lib/procurement";
import { inputCls, showDate } from "@/components/portal/kit";
import { cn } from "@/utils";

const GROUPS: { title: string; items: [string, string][] }[] = [
  { title: "Spend", items: [["spend", "Spend by month"], ["supplier_spend", "Spend by supplier"], ["category_spend", "Spend by category"], ["department_spend", "Spend by department"], ["budget", "Budget vs actual"]] },
  { title: "Documents", items: [["requisitions", "Purchase requisitions"], ["rfqs", "Requests for quotation"], ["quotations", "Supplier quotations"], ["purchase_orders", "Purchase orders"], ["goods_receipts", "Goods received"], ["returns", "Purchase returns"], ["contracts", "Contracts"]] },
  { title: "Follow-up", items: [["pending_approvals", "Pending approvals"], ["outstanding_pos", "Outstanding purchase orders"], ["overdue_deliveries", "Overdue deliveries"], ["invoice_matching", "Invoice matching"]] },
  { title: "Suppliers and control", items: [["supplier_performance", "Supplier performance"], ["audit", "Procurement audit trail"]] },
];
const STATUS_MAPS = { ...DOC_STATUS, ...RFQ_STATUS, ...PO_STATUS, ...INVOICE_STATUS, ...RETURN_STATUS, ...CONTRACT_STATUS, matched: { label: "Matched", tone: "success" }, partial: { label: "Partial match", tone: "warning" }, exception: { label: "Exception", tone: "danger" } } as any;
const fmt = (type: string, v: any) => {
  if (v === null || v === undefined || v === "") return "—";
  if (type === "money") return Math.round(Number(v)).toLocaleString("en-US");
  if (type === "number") return Number(v).toLocaleString("en-US");
  if (type === "pct") return `${Number(v).toLocaleString("en-US")}%`;
  if (type === "date") return showDate(String(v));
  return String(v);
};

export default function Reports() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const key = params.get("r") || "supplier_spend";
  const y = new Date().getFullYear();
  const [f, setF] = React.useState({ from: `${y}-01-01`, to: new Date().toISOString().slice(0, 10), department: "", supplier: "", category: "" });
  const [search, setSearch] = React.useState("");
  const [sort, setSort] = React.useState<{ key: string; dir: 1 | -1 } | null>(null);
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
    if (sort) out = [...out].sort((a, b) => (a[sort.key] > b[sort.key] ? 1 : a[sort.key] < b[sort.key] ? -1 : 0) * sort.dir);
    return out;
  }, [r, search, sort]);
  const nameOf = (list: any[] | undefined, id: string) => list?.find((x) => x.id === id)?.name;
  const filterText = [f.from && `from ${showDate(f.from)}`, f.to && `to ${showDate(f.to)}`, f.department && nameOf(ref.data?.departments, f.department), f.supplier && nameOf(ref.data?.suppliers, f.supplier), f.category && nameOf(ref.data?.categories, f.category)].filter(Boolean).join(" · ");

  function exportExcel() {
    if (!r) return;
    const header = r.columns.map((c) => c.label);
    const body = rows.map((row) => r.columns.map((c) => (["money", "number", "pct"].includes(c.type) ? Number(row[c.key]) || 0 : row[c.key] ?? "")));
    const totals = r.columns.map((c, i) => (i === 0 ? "Total" : r.totals[c.key] ?? ""));
    const ws = XLSX.utils.aoa_to_sheet([[`${title}`], [filterText], [], header, ...body, ...(Object.keys(r.totals).length ? [totals] : [])]);
    ws["!cols"] = r.columns.map((c) => ({ wch: c.type === "text" ? 28 : 14 }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, title.slice(0, 30));
    XLSX.writeFile(wb, `${key}-${new Date().toISOString().slice(0, 10)}.xlsx`);
  }

  return (
    <div className="space-y-4 px-4 py-4 sm:px-6 print:p-0">
      <div className="print:hidden">
        <PageHeader
          title="Procurement reports"
          description="All figures are calculated on the server from the live records, with the filters below. Export to Excel, save as PDF or print."
          breadcrumbs={[{ title: "Procurement", link: "/dashboard/procurement" }, { title: "Reports", link: "/dashboard/procurement/reports" }]}
        />
      </div>
      <div className="grid gap-4 lg:grid-cols-[240px_minmax(0,1fr)]">
        <label className="block text-[12.5px] font-medium text-slate-700 lg:hidden print:hidden">
          Report
          <select className="mt-1 h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-[13.5px]" value={key} onChange={(e) => { setParams({ r: e.target.value }); setSort(null); setSearch(""); }}>
            {GROUPS.map((g) => (
              <optgroup key={g.title} label={g.title}>
                {g.items.map(([k, label]) => <option key={k} value={k}>{label}</option>)}
              </optgroup>
            ))}
          </select>
        </label>
        <nav className="hidden space-y-4 lg:block print:hidden" aria-label="Reports">
          {GROUPS.map((g) => (
            <div key={g.title}>
              <p className="mb-1 px-2 text-[11px] font-semibold uppercase tracking-wider text-slate-500">{g.title}</p>
              {g.items.map(([k, label]) => (
                <button key={k} type="button" onClick={() => { setParams({ r: k }); setSort(null); setSearch(""); }} className={cn("flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px]", key === k ? "bg-primary/10 font-medium text-primaryDark" : "text-slate-700 hover:bg-slate-100")}>
                  <FileText size={14} className="shrink-0 opacity-60" /> {label}
                </button>
              ))}
            </div>
          ))}
        </nav>

        <section className="min-w-0 space-y-3">
          <div className="grid grid-cols-2 gap-2 rounded-lg border border-slate-200 bg-white p-3 shadow-card sm:grid-cols-3 xl:grid-cols-6 print:hidden">
            <label className="text-[12px] text-slate-600">From<input type="date" className={cn(inputCls, "mt-1 h-9")} value={f.from} onChange={(e) => setF((x) => ({ ...x, from: e.target.value }))} /></label>
            <label className="text-[12px] text-slate-600">To<input type="date" className={cn(inputCls, "mt-1 h-9")} value={f.to} onChange={(e) => setF((x) => ({ ...x, to: e.target.value }))} /></label>
            <label className="text-[12px] text-slate-600">Department<select className={cn(inputCls, "mt-1 h-9")} value={f.department} onChange={(e) => setF((x) => ({ ...x, department: e.target.value }))}><option value="">All</option>{(ref.data?.departments || []).map((d: any) => <option key={d.id} value={d.id}>{d.name}</option>)}</select></label>
            <label className="text-[12px] text-slate-600">Supplier<select className={cn(inputCls, "mt-1 h-9")} value={f.supplier} onChange={(e) => setF((x) => ({ ...x, supplier: e.target.value }))}><option value="">All</option>{(ref.data?.suppliers || []).map((d: any) => <option key={d.id} value={d.id}>{d.name}</option>)}</select></label>
            <label className="text-[12px] text-slate-600">Category<select className={cn(inputCls, "mt-1 h-9")} value={f.category} onChange={(e) => setF((x) => ({ ...x, category: e.target.value }))}><option value="">All</option>{(ref.data?.categories || []).map((d: any) => <option key={d.id} value={d.id}>{d.name}</option>)}</select></label>
            <label className="text-[12px] text-slate-600">Search in results<input type="search" className={cn(inputCls, "mt-1 h-9")} value={search} onChange={(e) => setSearch(e.target.value)} /></label>
          </div>

          <div className="rounded-lg border border-slate-200 bg-white shadow-card print:border-0 print:shadow-none">
            <header className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 px-4 py-3">
              <div>
                <h2 className="flex items-center gap-2 text-[16px] font-semibold text-slate-900"><BarChart3 size={17} className="text-primaryDark print:hidden" /> {title}</h2>
                <p className="text-[12px] text-slate-500">{filterText || "All records"} · {rows.length} row{rows.length === 1 ? "" : "s"}{r ? ` · generated ${showDate(r.generated_at, "d MMM yyyy, HH:mm")}` : ""}</p>
              </div>
              <div className="flex flex-wrap gap-1.5 print:hidden">
                <Button size="sm" variant="ghost" onClick={() => q.refetch()} disabled={q.isFetching}><RefreshCw size={14} className={cn(q.isFetching && "animate-spin")} /> Refresh</Button>
                <Button size="sm" variant="outline" onClick={exportExcel} disabled={!rows.length}><Download size={14} /> Excel</Button>
                <Button size="sm" variant="outline" onClick={() => window.print()} disabled={!rows.length}><FileText size={14} /> PDF</Button>
                <Button size="sm" variant="outline" onClick={() => window.print()} disabled={!rows.length}><Printer size={14} /> Print</Button>
              </div>
            </header>
            {q.isError ? (
              <p className="px-4 py-8 text-center text-[13px] text-red-600">{errorMessage(q.error)}</p>
            ) : q.isLoading ? (
              <div className="p-4"><Skeleton className="h-64 w-full" /></div>
            ) : !rows.length ? (
              <EmptyState icon={BarChart3} title="Nothing to show" text="No record matches these filters. Widen the dates or clear a filter." />
            ) : (
              <div className="overflow-x-auto">
                <table className="dnr-grid w-full min-w-[760px] text-[13px]">
                  <thead>
                    <tr className="bg-slate-50 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                      {r!.columns.map((c) => (
                        <th key={c.key} className={cn("px-3 py-2", ["money", "number", "pct"].includes(c.type) && "text-right")}>
                          <button type="button" className="inline-flex items-center gap-1 uppercase hover:text-slate-800" onClick={() => setSort((s) => (s?.key === c.key ? { key: c.key, dir: (s.dir * -1) as 1 | -1 } : { key: c.key, dir: ["money", "number", "pct"].includes(c.type) ? -1 : 1 }))}>
                            {c.label}
                            {sort?.key === c.key && (sort.dir === 1 ? <ArrowUp size={11} /> : <ArrowDown size={11} />)}
                          </button>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {rows.map((row, i) => (
                      <tr key={i} className={cn(row.link && "cursor-pointer hover:bg-slate-50")} onClick={() => row.link && navigate(row.link)}>
                        {r!.columns.map((c, j) => (
                          <td key={c.key} className={cn("px-3 py-2", ["money", "number", "pct"].includes(c.type) ? "whitespace-nowrap text-right tabular-nums" : c.type === "date" ? "whitespace-nowrap text-slate-600" : "", j === 0 && "font-medium text-slate-900")}>
                            {c.type === "status" ? <StatusBadge status={row[c.key]} map={STATUS_MAPS} /> : c.type === "pct" && row[c.key] !== null && row[c.key] !== undefined ? (
                              <span className={cn(c.key.includes("score") || c.key.includes("time") || c.key.includes("quality") || c.key.includes("accuracy") ? (Number(row[c.key]) >= 80 ? "text-emerald-700" : Number(row[c.key]) >= 60 ? "text-amber-700" : "text-red-600") : c.key === "used_pct" && Number(row[c.key]) > 100 ? "font-semibold text-red-600" : "")}>{fmt(c.type, row[c.key])}</span>
                            ) : fmt(c.type, row[c.key])}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                  {Object.keys(r!.totals).length > 0 && (
                    <tfoot>
                      <tr className="border-t-2 border-slate-300 bg-slate-50 font-semibold">
                        {r!.columns.map((c, i) => (
                          <td key={c.key} className={cn("px-3 py-2", ["money", "number", "pct"].includes(c.type) && "whitespace-nowrap text-right tabular-nums")}>{i === 0 ? "Total" : r!.totals[c.key] !== undefined ? fmt(c.type, r!.totals[c.key]) : ""}</td>
                        ))}
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            )}
            {r?.note && <p className="border-t border-slate-100 px-4 py-2 text-[12px] text-slate-500">{r.note}</p>}
            {r && r.totals.value !== undefined && <p className="px-4 pb-3 text-[12px] text-slate-500 print:hidden">Total ordered in this report: {compactMoney(r.totals.value)}</p>}
          </div>
        </section>
      </div>
    </div>
  );
}
