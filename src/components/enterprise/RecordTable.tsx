/**
 * Reusable server-side table for PocketBase collections.
 *
 * - saved views (tabs) that each add a filter, e.g. "My requests", "Awaiting me"
 * - debounced search across the given fields, filter-injection safe
 * - filter bar: dropdowns (static options or loaded from a collection, e.g. department, funding source,
 *   project, status) and a date range on a date field (period)
 * - column sorting, pagination, and Excel / PDF / CSV export of exactly what the user can see,
 *   with the organisation header (exports are written to the audit trail)
 * Only the current page is fetched; filtering and sorting happen on the server.
 */
import * as React from "react";
import { useQuery } from "react-query";
import { useDebounce } from "use-debounce";
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, Search, X } from "lucide-react";
import pocketbase from "@/lib/pocketbase";
import { pbQuote } from "@/lib/procurement";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { cn } from "@/utils";
import { EmptyState } from "./ui";
import ExportMenu from "./ExportMenu";
import { ImportButton, ImportConfig } from "./ExcelImport";
import { CellFormat, exportReport } from "@/lib/exporter";
import { Inbox, LucideIcon } from "lucide-react";

export interface RecordColumn<T = any> {
  key: string;
  header: string;
  /** PocketBase field to sort by; omit to make the column unsortable. */
  sortField?: string;
  cell: (row: T) => React.ReactNode;
  /** Plain value for exports; defaults to the sort field value. */
  csv?: (row: T) => string | number;
  /** How the value is formatted in Excel / PDF exports. */
  format?: CellFormat;
  className?: string;
  align?: "left" | "right";
  /** Export-only column: included in exports but not shown, to keep the table narrow. */
  exportOnly?: boolean;
}

export interface RecordView {
  key: string;
  label: string;
  filter?: string;
}

export interface RecordFilter {
  /** PocketBase field the filter applies to, e.g. "department" or "status". */
  field: string;
  label: string;
  /** Static options… */
  options?: { value: string; label: string }[];
  /** …or options loaded from a collection (value = id). */
  collection?: string;
  optionLabel?: (r: any) => string;
  optionFilter?: string;
}

interface Props<T> {
  collection: string;
  columns: RecordColumn<T>[];
  views?: RecordView[];
  activeView?: string;
  onViewChange?: (key: string) => void;
  searchFields?: string[];
  baseFilter?: string;
  expand?: string;
  defaultSort?: string;
  onRowClick?: (row: T) => void;
  exportName?: string;
  /** Title of exported reports (defaults to exportName). */
  exportTitle?: string;
  /** Show the export button only to roles holding this permission (permission matrix "X"). */
  exportPermission?: string | string[];
  filters?: RecordFilter[];
  /** Adds a from / to date filter on this field (period). */
  dateField?: string;
  dateLabel?: string;
  toolbar?: React.ReactNode;
  empty?: { icon?: LucideIcon; title: string; text: string; action?: React.ReactNode };
  pageSize?: number;
  /** Bumps to refetch after a change made outside the table. */
  refreshKey?: unknown;
  /** Adds an Excel import (template, validation, import through the API). */
  importConfig?: ImportConfig;
}

function FilterSelect({ f, value, onChange }: { f: RecordFilter; value: string; onChange: (v: string) => void }) {
  const opts = useQuery(
    ["record-filter-options", f.collection, f.optionFilter],
    () => pocketbase.collection(f.collection!).getFullList({ sort: "name", filter: f.optionFilter || "", batch: 500 }),
    { enabled: Boolean(f.collection), staleTime: 5 * 60_000 }
  );
  const options = f.options || (opts.data || []).map((r: any) => ({ value: r.id, label: f.optionLabel ? f.optionLabel(r) : r.name || r.code || r.id }));
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      aria-label={f.label}
      className={cn("h-9 max-w-[200px] rounded-md border bg-white px-2.5 text-[12.5px] outline-none focus:border-primary focus:ring-2 focus:ring-primary/20", value ? "border-primary/60 text-slate-900" : "border-slate-200 text-slate-600")}
    >
      <option value="">{f.label}: all</option>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

export default function RecordTable<T extends { id: string }>({
  collection,
  columns,
  views = [],
  activeView,
  onViewChange,
  searchFields = [],
  baseFilter,
  expand,
  defaultSort = "-created",
  onRowClick,
  exportName,
  exportTitle,
  exportPermission,
  filters = [],
  dateField,
  dateLabel = "Date",
  toolbar,
  empty,
  pageSize = 15,
  refreshKey,
  importConfig,
}: Props<T>) {
  const [search, setSearch] = React.useState("");
  const [debounced] = useDebounce(search, 300);
  const [sort, setSort] = React.useState(defaultSort);
  const [page, setPage] = React.useState(1);
  const [values, setValues] = React.useState<Record<string, string>>({});
  const [from, setFrom] = React.useState("");
  const [to, setTo] = React.useState("");

  const view = views.find((v) => v.key === activeView) || views[0];
  const filter = React.useMemo(() => {
    const parts = [baseFilter, view?.filter];
    if (debounced.trim() && searchFields.length) {
      const q = pbQuote(debounced.trim());
      parts.push(`(${searchFields.map((f) => `${f} ~ ${q}`).join(" || ")})`);
    }
    for (const f of filters) if (values[f.field]) parts.push(`${f.field} = ${pbQuote(values[f.field])}`);
    if (dateField && from) parts.push(`${dateField} >= ${pbQuote(`${from} 00:00:00.000Z`)}`);
    if (dateField && to) parts.push(`${dateField} <= ${pbQuote(`${to} 23:59:59.999Z`)}`);
    return parts.filter(Boolean).map((p) => `(${p})`).join(" && ");
  }, [baseFilter, view?.filter, debounced, searchFields.join(), JSON.stringify(values), from, to, dateField, filters.length]);

  React.useEffect(() => setPage(1), [filter, sort]);

  const query = useQuery(
    ["record-table", collection, filter, sort, page, expand, refreshKey],
    () => pocketbase.collection(collection).getList<T>(page, pageSize, { filter, sort, expand }),
    { keepPreviousData: true }
  );

  const toggleSort = (field?: string) => {
    if (!field) return;
    setSort((s) => (s === field ? `-${field}` : s === `-${field}` ? field : `-${field}`));
  };

  const activeFilterText = () => {
    const bits: string[] = [];
    if (view?.label && views.length > 1) bits.push(view.label);
    if (debounced.trim()) bits.push(`Search: “${debounced.trim()}”`);
    for (const f of filters) if (values[f.field]) {
      const label = f.options?.find((o) => o.value === values[f.field])?.label;
      bits.push(`${f.label}: ${label || "selected"}`);
    }
    if (from || to) bits.push(`${dateLabel}: ${from || "…"} – ${to || "…"}`);
    return bits.join(" · ");
  };

  const doExport = async (format: "xlsx" | "pdf" | "csv") => {
    const rows = await pocketbase.collection(collection).getFullList<T>({ filter, sort, expand, batch: 500 });
    const cols = columns.filter((c) => c.csv || c.sortField);
    await exportReport({
      title: exportTitle || exportName || collection,
      subtitle: activeFilterText() || undefined,
      columns: cols.map((c) => ({ header: c.header, format: c.format, value: (r: any) => (c.csv ? c.csv(r) : r[c.sortField!]) })),
      rows,
      format,
      fileName: exportName || collection,
      what: collection,
    });
  };

  const data = query.data;
  const shown = columns.filter((c) => !c.exportOnly);
  const EmptyIcon = empty?.icon || Inbox;
  const anyFilter = Object.values(values).some(Boolean) || from || to;

  return (
    <div className="rounded-lg border border-slate-200 bg-white shadow-card">
      {views.length > 0 && (
        <div className="flex gap-1 overflow-x-auto border-b border-slate-200 px-3" role="tablist">
          {views.map((v) => (
            <button
              key={v.key}
              type="button"
              role="tab"
              aria-selected={v.key === view?.key}
              onClick={() => onViewChange?.(v.key)}
              className={cn(
                "-mb-px whitespace-nowrap border-b-2 px-3 py-2.5 text-[13px] font-medium transition-colors",
                v.key === view?.key ? "border-primary text-primaryDark" : "border-transparent text-slate-500 hover:text-slate-800"
              )}
            >
              {v.label}
            </button>
          ))}
        </div>
      )}

      <div className="flex flex-col gap-2 p-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-1 flex-wrap items-center gap-2">
          {searchFields.length > 0 && (
            <label className="relative w-full sm:w-64">
              <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search…"
                aria-label="Search"
                className="h-9 w-full rounded-md border border-slate-200 bg-white pl-9 pr-3 text-[13px] outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
              />
            </label>
          )}
          {filters.map((f) => (
            <FilterSelect key={f.field} f={f} value={values[f.field] || ""} onChange={(v) => setValues((s) => ({ ...s, [f.field]: v }))} />
          ))}
          {dateField && (
            <span className="flex items-center gap-1 text-[12.5px] text-slate-500">
              <span className="hidden sm:inline">{dateLabel}</span>
              <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} aria-label={`${dateLabel} from`} className="h-9 rounded-md border border-slate-200 px-2 text-[12.5px] outline-none focus:border-primary" />
              <span>–</span>
              <input type="date" value={to} onChange={(e) => setTo(e.target.value)} aria-label={`${dateLabel} to`} className="h-9 rounded-md border border-slate-200 px-2 text-[12.5px] outline-none focus:border-primary" />
            </span>
          )}
          {anyFilter && (
            <button type="button" onClick={() => { setValues({}); setFrom(""); setTo(""); }} className="inline-flex h-8 items-center gap-1 rounded-md px-2 text-[12.5px] font-medium text-slate-500 hover:bg-slate-100 hover:text-slate-800">
              <X size={13} /> Clear filters
            </button>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {toolbar}
          {importConfig && <ImportButton config={{ collection, ...importConfig }} onDone={() => query.refetch()} />}
          <ExportMenu onExport={doExport} permission={exportPermission} disabled={!data?.totalItems} />
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="dnr-grid w-full min-w-[640px]">
          <thead>
            <tr>
              {shown.map((c) => {
                const active = sort === c.sortField || sort === `-${c.sortField}`;
                return (
                  <th key={c.key} className={cn(c.align === "right" && "text-right", c.className)}>
                    {c.sortField ? (
                      <button
                        type="button"
                        onClick={() => toggleSort(c.sortField)}
                        className={cn("inline-flex items-center gap-1 uppercase hover:text-slate-800", c.align === "right" && "ml-auto", active && "text-slate-800")}
                      >
                        {c.header}
                        {active && (sort.startsWith("-") ? <ArrowDown size={12} /> : <ArrowUp size={12} />)}
                      </button>
                    ) : (
                      c.header
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody className={cn(query.isFetching && data && "opacity-60")}>
            {query.isLoading &&
              Array.from({ length: 6 }, (_, i) => (
                <tr key={i}>
                  {shown.map((c) => (
                    <td key={c.key}>
                      <Skeleton className="h-4 w-full" />
                    </td>
                  ))}
                </tr>
              ))}
            {data?.items.map((row) => (
              <tr
                key={row.id}
                onClick={() => onRowClick?.(row)}
                className={cn(onRowClick && "cursor-pointer hover:bg-slate-50")}
              >
                {shown.map((c) => (
                  <td key={c.key} className={cn(c.align === "right" && "text-right", c.className)}>
                    {c.cell(row)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        {query.isError && (
          <EmptyState icon={EmptyIcon} title="Could not load records" text={(query.error as any)?.message || "Please try again."} />
        )}
        {data && data.items.length === 0 && (
          <EmptyState
            icon={EmptyIcon}
            title={empty?.title || "Nothing here yet"}
            text={debounced || anyFilter ? "No results for these filters. Try a different search or clear the filters." : empty?.text || "Try another view."}
            action={!debounced && !anyFilter ? empty?.action : undefined}
          />
        )}
      </div>

      {data && data.totalItems > 0 && (
        <div className="flex items-center justify-between gap-3 border-t border-slate-100 px-4 py-2.5 text-[12.5px] text-slate-500">
          <span>
            {(data.page - 1) * data.perPage + 1}–{Math.min(data.page * data.perPage, data.totalItems)} of {data.totalItems}
          </span>
          <div className="flex items-center gap-1">
            <Button type="button" variant="outline" size="icon" className="h-8 w-8" disabled={page <= 1} onClick={() => setPage((p) => p - 1)} aria-label="Previous page">
              <ChevronLeft size={15} />
            </Button>
            <span className="px-2 tabular-nums">
              {data.page} / {data.totalPages}
            </span>
            <Button type="button" variant="outline" size="icon" className="h-8 w-8" disabled={page >= data.totalPages} onClick={() => setPage((p) => p + 1)} aria-label="Next page">
              <ChevronRight size={15} />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
