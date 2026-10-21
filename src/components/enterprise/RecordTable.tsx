/**
 * Reusable server-side table for PocketBase collections, built from the ims kit
 * (Card → Tabs → FilterBar → DataTable → Pager):
 *
 * - saved views (tabs, at most 5) that each add a filter, e.g. "My requests", "Awaiting me"
 * - debounced search across the given fields, filter-injection safe, with a placeholder that says
 *   what is searched
 * - filter bar: dropdowns (static options or loaded from a collection), a date range on one field,
 *   chips for the active filters and "Clear filters"
 * - sortable sentence-case headers, rows that open the record, an optional "⋯" menu per row,
 *   a total row for money columns (summed over every row that matches, not just this page)
 * - pager with rows per page, and Excel / PDF / CSV export of exactly what the user can see
 *   (exports are written to the audit trail)
 * Only the current page is fetched; filtering and sorting happen on the server.
 */
import * as React from "react";
import { useQuery } from "react-query";
import { useDebounce } from "use-debounce";
import { Inbox, LucideIcon } from "lucide-react";
import pocketbase from "@/lib/pocketbase";
import { pbQuote } from "@/lib/procurement";
import { Card, Column, DataTable, DateRangeFilter, EmptyState, FilterBar, FilterChip, FilterSelect, Num, Pager, RowAction, Tabs, fmtDate } from "@/components/ims";
import ExportMenu from "./ExportMenu";
import { ImportButton, ImportConfig } from "./ExcelImport";
import { CellFormat, exportReport } from "@/lib/exporter";

export interface RecordColumn<T = any> {
  key: string;
  header: string;
  /** PocketBase field to sort by; omit to make the column unsortable. */
  sortField?: string;
  cell: (row: T) => React.ReactNode;
  /** Optional second line (12.5px muted), e.g. the department under a name. */
  sub?: (row: T) => React.ReactNode;
  /** Long text: two lines, then "…" with the full text on hover. */
  clamp?: boolean;
  nowrap?: boolean;
  /** Plain value for exports; defaults to the sort field value. */
  csv?: (row: T) => string | number;
  /** How the value is formatted in Excel / PDF exports. */
  format?: CellFormat;
  className?: string;
  align?: "left" | "right";
  /** Export-only column: included in exports but not shown, to keep the table narrow. */
  exportOnly?: boolean;
  /** Field to add up over every matching row for the total row (money columns). */
  sum?: string;
  width?: string;
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
  /** Custom filter expression for a chosen value (e.g. "high" → "total > 5000000"); default: field = value. */
  filterFor?: (value: string) => string;
}

interface Props<T> {
  collection: string;
  columns: RecordColumn<T>[];
  views?: RecordView[];
  activeView?: string;
  onViewChange?: (key: string) => void;
  searchFields?: string[];
  /** What the search box searches, e.g. "Search number, title or requester". */
  searchPlaceholder?: string;
  baseFilter?: string;
  expand?: string;
  defaultSort?: string;
  onRowClick?: (row: T) => void;
  /** Items of the "⋯" menu in the last column. */
  rowActions?: (row: T) => RowAction<T>[];
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
  /** Counts shown on the tabs, keyed by view (e.g. { awaiting: 3 }). */
  viewCounts?: Record<string, number | undefined>;
}

/** "number, title, requester.name" → "Search number, title or requester". */
function placeholderFor(fields: string[]) {
  const words = [...new Set(fields.map((f) => f.split(".")[0].replace(/_/g, " ").replace(/\bid\b/, "").trim()).filter(Boolean))];
  if (!words.length) return "Search";
  return `Search ${words.length > 1 ? `${words.slice(0, -1).join(", ")} or ${words[words.length - 1]}` : words[0]}`;
}

function useFilterOptions(f: RecordFilter) {
  const opts = useQuery(
    ["record-filter-options", f.collection, f.optionFilter],
    () => pocketbase.collection(f.collection!).getFullList({ sort: "name", filter: f.optionFilter || "", batch: 500 }),
    { enabled: Boolean(f.collection), staleTime: 5 * 60_000 }
  );
  return f.options || (opts.data || []).map((r: any) => ({ value: r.id, label: f.optionLabel ? f.optionLabel(r) : r.name || r.code || r.id }));
}

function FilterControl({ f, value, onChange, onOptions }: { f: RecordFilter; value: string; onChange: (v: string) => void; onOptions: (field: string, o: { value: string; label: string }[]) => void }) {
  const options = useFilterOptions(f);
  React.useEffect(() => {
    onOptions(f.field, options);
  }, [options.length]); // eslint-disable-line react-hooks/exhaustive-deps
  return <FilterSelect label={f.label} value={value} onChange={onChange} options={options} />;
}

export default function RecordTable<T extends { id: string }>({
  collection,
  columns,
  views = [],
  activeView,
  onViewChange,
  searchFields = [],
  searchPlaceholder,
  baseFilter,
  expand,
  defaultSort = "-created",
  onRowClick,
  rowActions,
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
  viewCounts,
}: Props<T>) {
  const [search, setSearch] = React.useState("");
  const [debounced] = useDebounce(search, 300);
  const [sort, setSort] = React.useState(defaultSort);
  const [page, setPage] = React.useState(1);
  const [perPage, setPerPage] = React.useState(pageSize);
  const [values, setValues] = React.useState<Record<string, string>>({});
  const [from, setFrom] = React.useState("");
  const [to, setTo] = React.useState("");
  const optionLabels = React.useRef<Record<string, { value: string; label: string }[]>>({});

  const view = views.find((v) => v.key === activeView) || views[0];
  const filter = React.useMemo(() => {
    const parts = [baseFilter, view?.filter];
    if (debounced.trim() && searchFields.length) {
      const q = pbQuote(debounced.trim());
      parts.push(`(${searchFields.map((f) => `${f} ~ ${q}`).join(" || ")})`);
    }
    for (const f of filters) if (values[f.field]) parts.push(f.filterFor ? f.filterFor(values[f.field]) : `${f.field} = ${pbQuote(values[f.field])}`);
    if (dateField && from) parts.push(`${dateField} >= ${pbQuote(`${from} 00:00:00.000Z`)}`);
    if (dateField && to) parts.push(`${dateField} <= ${pbQuote(`${to} 23:59:59.999Z`)}`);
    return parts.filter(Boolean).map((p) => `(${p})`).join(" && ");
  }, [baseFilter, view?.filter, debounced, searchFields.join(), JSON.stringify(values), from, to, dateField, filters.length]); // eslint-disable-line react-hooks/exhaustive-deps

  React.useEffect(() => setPage(1), [filter, sort, perPage]);

  const query = useQuery(
    ["record-table", collection, filter, sort, page, perPage, expand, refreshKey],
    () => pocketbase.collection(collection).getList<T>(page, perPage, { filter, sort, expand }),
    { keepPreviousData: true }
  );

  // Totals over every matching row (money columns), fetched with only the summed fields.
  const sumFields = columns.filter((c) => c.sum && !c.exportOnly).map((c) => c.sum!) as string[];
  const totals = useQuery(
    ["record-table-sums", collection, filter, sumFields.join(), refreshKey],
    async () => {
      const rows = await pocketbase.collection(collection).getFullList({ filter, fields: ["id", ...new Set(sumFields)].join(","), batch: 1000 });
      return Object.fromEntries(sumFields.map((f) => [f, rows.reduce((s, r: any) => s + (Number(r[f]) || 0), 0)]));
    },
    { enabled: sumFields.length > 0, keepPreviousData: true }
  );

  const labelFor = (f: RecordFilter, v: string) => (f.options || optionLabels.current[f.field] || []).find((o) => o.value === v)?.label || "selected";
  const activeFilterText = () => {
    const bits: string[] = [];
    if (view?.label && views.length > 1) bits.push(view.label);
    if (debounced.trim()) bits.push(`Search: “${debounced.trim()}”`);
    for (const f of filters) if (values[f.field]) bits.push(`${f.label}: ${labelFor(f, values[f.field])}`);
    if (from || to) bits.push(`${dateLabel}: ${from ? fmtDate(from) : "…"} – ${to ? fmtDate(to) : "…"}`);
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

  const chips: FilterChip[] = [
    ...filters.filter((f) => values[f.field]).map((f) => ({ key: f.field, label: `${f.label}: ${labelFor(f, values[f.field])}`, onRemove: () => setValues((s) => ({ ...s, [f.field]: "" })) })),
    ...(from || to ? [{ key: "date", label: `${dateLabel}: ${from ? fmtDate(from) : "…"} – ${to ? fmtDate(to) : "…"}`, onRemove: () => { setFrom(""); setTo(""); } }] : []),
  ];

  const data = query.data;
  const EmptyIcon = empty?.icon || Inbox;
  const filtered = Boolean(debounced || chips.length);
  const tableColumns: Column<T>[] = columns
    .filter((c) => !c.exportOnly)
    .map((c) => ({
      key: c.key,
      header: c.header,
      cell: (row: T) => c.cell(row),
      sub: c.sub,
      sortField: c.sortField,
      align: c.align,
      numeric: c.align === "right",
      clamp: c.clamp,
      nowrap: c.nowrap,
      width: c.width,
      className: c.className,
      total: c.sum ? (totals.data ? <Num value={totals.data[c.sum]} /> : "…") : undefined,
    }));

  return (
    <Card padded={false} className="overflow-hidden">
      {views.length > 0 && (
        <Tabs
          inset
          active={view?.key || ""}
          onChange={(k) => onViewChange?.(k)}
          tabs={views.map((v) => ({ key: v.key, label: v.label, count: viewCounts?.[v.key] ?? undefined }))}
        />
      )}
      <FilterBar
        search={searchFields.length ? { value: search, onChange: setSearch, placeholder: searchPlaceholder || placeholderFor(searchFields) } : undefined}
        chips={chips}
        onClear={() => { setValues({}); setFrom(""); setTo(""); }}
        right={
          <>
            {toolbar}
            {importConfig && <ImportButton config={{ collection, ...importConfig }} onDone={() => query.refetch()} />}
            <ExportMenu onExport={doExport} permission={exportPermission} disabled={!data?.totalItems} />
          </>
        }
      >
        {filters.map((f) => (
          <FilterControl
            key={f.field}
            f={f}
            value={values[f.field] || ""}
            onChange={(v) => setValues((s) => ({ ...s, [f.field]: v }))}
            onOptions={(field, o) => {
              optionLabels.current[field] = o;
            }}
          />
        ))}
        {dateField && <DateRangeFilter label={dateLabel} from={from} to={to} onChange={(a, b) => { setFrom(a); setTo(b); }} />}
      </FilterBar>
      <DataTable
        columns={tableColumns}
        rows={data?.items || []}
        rowKey={(r) => r.id}
        onRowClick={onRowClick}
        rowActions={rowActions}
        sort={sort}
        onSort={setSort}
        loading={query.isLoading}
        fetching={query.isFetching}
        error={query.isError ? query.error : undefined}
        onRetry={() => query.refetch()}
        empty={
          <EmptyState
            icon={EmptyIcon}
            text={filtered ? "Nothing matches these filters. Change the search or clear the filters." : empty?.text || empty?.title || "Nothing here yet."}
            action={!filtered ? empty?.action : undefined}
          />
        }
        footer={data && data.totalItems > 0 ? <Pager page={data.page} perPage={perPage} total={data.totalItems} onPage={setPage} onPerPage={setPerPage} /> : null}
      />
    </Card>
  );
}
