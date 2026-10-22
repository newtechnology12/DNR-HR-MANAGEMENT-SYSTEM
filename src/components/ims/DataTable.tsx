/**
 * DataTable: header #F8FAFC 12.5px/600 muted in sentence case with sort arrows; a line between
 * columns; rows ~56px; main text 14px with an optional 12.5px muted second line; text left, numbers
 * and money right and tabular; long text 2 lines then "…" with a tooltip. The whole row opens the
 * record; the last column holds a "⋯" menu of row actions. Money headers carry the unit
 * ("Total (RWF)") and cells show numbers only, with a total row. Footer: "1–15 of 30" · page size · pager.
 */
import * as React from "react";
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, ChevronsUpDown, LucideIcon, MoreHorizontal } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { cn } from "@/utils";
import { EmptyState, ErrorState } from "./Feedback";
import { fmtNumber } from "./format";

export type Column<T> = {
  key: string;
  header: React.ReactNode;
  /** Main text (14px). */
  cell: (row: T, index: number) => React.ReactNode;
  /** Optional second line (12.5px muted): department under a name, category under a title. */
  sub?: (row: T) => React.ReactNode;
  align?: "left" | "right" | "center";
  /** Numbers and money: right-aligned with tabular figures. */
  numeric?: boolean;
  /** Field the server sorts on; omit for unsortable columns. */
  sortField?: string;
  /** Long text: at most two lines, then "…" (the full text shows on hover). */
  clamp?: boolean;
  /** Keep on one line (document numbers, dates, money). */
  nowrap?: boolean;
  width?: string;
  className?: string;
  /** Value shown in the total row for this column. */
  total?: React.ReactNode;
};

export type RowAction<T> = {
  label: string;
  icon?: LucideIcon;
  onSelect: (row: T) => void;
  danger?: boolean;
  disabled?: boolean;
};

const INTERACTIVE = "a,button,input,select,textarea,label,[role=menuitem],[role=checkbox],[data-no-row-click]";

function textOf(node: React.ReactNode): string | undefined {
  if (typeof node === "string" || typeof node === "number") return String(node);
  return undefined;
}

export function SortHeader({ label, field, sort, onSort, align }: { label: React.ReactNode; field: string; sort?: string; onSort?: (s: string) => void; align?: "left" | "right" | "center" }) {
  const active = sort === field || sort === `-${field}`;
  const desc = sort === `-${field}`;
  return (
    <button
      type="button"
      onClick={() => onSort?.(active && !desc ? `-${field}` : active && desc ? field : `-${field}`)}
      className={cn("inline-flex items-center gap-1 rounded-sm hover:text-ims-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ims-focus", align === "right" && "flex-row-reverse", active && "text-ims-text")}
      aria-label={`Sort by ${textOf(label) || field}${active ? (desc ? ", currently newest or largest first" : ", currently oldest or smallest first") : ""}`}
    >
      {label}
      {active ? desc ? <ArrowDown size={13} aria-hidden /> : <ArrowUp size={13} aria-hidden /> : <ChevronsUpDown size={13} className="text-ims-faint" aria-hidden />}
    </button>
  );
}

export function DataTable<T>({
  columns,
  rows,
  rowKey,
  onRowClick,
  rowActions,
  sort,
  onSort,
  loading,
  error,
  onRetry,
  empty,
  totalLabel = "Total",
  footer,
  minWidth = 720,
  caption,
  fetching,
  className,
  rowClassName,
}: {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T, index: number) => string;
  onRowClick?: (row: T) => void;
  /** Items of the "⋯" menu in the last column. */
  rowActions?: (row: T) => RowAction<T>[];
  sort?: string;
  onSort?: (sort: string) => void;
  loading?: boolean;
  error?: unknown;
  onRetry?: () => void;
  /** Empty state: what is missing + one action. */
  empty?: React.ReactNode;
  totalLabel?: string;
  footer?: React.ReactNode;
  minWidth?: number;
  caption?: string;
  /** Refreshing in the background: dims the rows. */
  fetching?: boolean;
  className?: string;
  /** Extra classes for one row, e.g. muted text for a cancelled line or a highlight for a changed one. */
  rowClassName?: (row: T) => string | undefined | false;
}) {
  const hasTotals = columns.some((c) => c.total !== undefined);
  const span = columns.length + (rowActions ? 1 : 0);
  const alignOf = (c: Column<T>) => c.align || (c.numeric ? "right" : "left");

  const clickRow = (e: React.MouseEvent | React.KeyboardEvent, row: T) => {
    if (!onRowClick) return;
    const target = e.target as HTMLElement;
    const inside = target.closest(INTERACTIVE);
    if (inside && inside !== e.currentTarget) return;
    onRowClick(row);
  };

  return (
    <div className={cn("min-w-0", className)}>
      <div className="relative overflow-x-auto">
        <table className="w-full border-collapse text-left text-t-body text-ims-text" style={{ minWidth: !loading && (Boolean(error) || rows.length === 0) ? undefined : minWidth }}>
          {caption && <caption className="sr-only">{caption}</caption>}
          <thead>
            <tr className="bg-ims-thead">
              {columns.map((c) => (
                <th
                  key={c.key}
                  scope="col"
                  style={c.width ? { width: c.width } : undefined}
                  className={cn(
                    "h-11 whitespace-nowrap border-b border-r border-ims-divider px-3.5 text-[12.5px] font-semibold text-ims-muted last:border-r-0",
                    alignOf(c) === "right" && "text-right",
                    alignOf(c) === "center" && "text-center",
                    c.clamp && !c.width && "min-w-[220px]",
                    c.className
                  )}
                >
                  {c.sortField && onSort ? <SortHeader label={c.header} field={c.sortField} sort={sort} onSort={onSort} align={alignOf(c)} /> : c.header}
                </th>
              ))}
              {rowActions && <th scope="col" className="h-11 w-12 border-b border-ims-divider px-2"><span className="sr-only">Actions</span></th>}
            </tr>
          </thead>
          <tbody className={cn(fetching && !loading && "opacity-60 transition-opacity")}>
            {loading &&
              Array.from({ length: 6 }, (_, i) => (
                <tr key={`sk-${i}`} className="border-b border-ims-divider last:border-b-0">
                  {Array.from({ length: span }, (__, j) => (
                    <td key={j} className="h-row border-r border-ims-divider px-3.5 last:border-r-0">
                      <Skeleton className={cn("h-4", j === 0 ? "w-3/4" : "w-1/2")} />
                    </td>
                  ))}
                </tr>
              ))}
            {!loading && Boolean(error) && (
              <tr>
                <td colSpan={span}>
                  <ErrorState detail={(error as { message?: string })?.message} onRetry={onRetry} />
                </td>
              </tr>
            )}
            {!loading && !error && rows.length === 0 && (
              <tr>
                <td colSpan={span}>{empty || <EmptyState text="Nothing to show yet." />}</td>
              </tr>
            )}
            {!loading &&
              !error &&
              rows.map((row, i) => {
                const actions = rowActions?.(row) || [];
                return (
                  <tr
                    key={rowKey(row, i)}
                    onClick={(e) => clickRow(e, row)}
                    onKeyDown={(e) => e.key === "Enter" && clickRow(e, row)}
                    tabIndex={onRowClick ? 0 : undefined}
                    className={cn(
                      "border-b border-ims-divider last:border-b-0",
                      rowClassName?.(row),
                      onRowClick && "cursor-pointer outline-none hover:bg-ims-hover focus-visible:bg-ims-hover focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ims-focus"
                    )}
                  >
                    {columns.map((c) => {
                      const main = c.cell(row, i);
                      const sub = c.sub?.(row);
                      const align = alignOf(c);
                      return (
                        <td
                          key={c.key}
                          className={cn(
                            "h-row border-r border-ims-divider px-3.5 py-2 align-middle last:border-r-0",
                            align === "right" && "text-right",
                            align === "center" && "text-center",
                            c.numeric && "whitespace-nowrap tabular-nums",
                            c.nowrap && "whitespace-nowrap",
                            c.className
                          )}
                        >
                          {c.clamp ? (
                            <span className="line-clamp-2 break-words" title={textOf(main)}>{main}</span>
                          ) : (
                            main
                          )}
                          {sub !== undefined && sub !== null && sub !== "" && (
                            <span className={cn("mt-0.5 block text-t-small text-ims-muted", c.clamp ? "line-clamp-1" : "")} title={textOf(sub)}>{sub}</span>
                          )}
                        </td>
                      );
                    })}
                    {rowActions && (
                      <td className="h-row w-12 px-2 text-center" data-no-row-click>
                        {actions.length > 0 && <RowMenu row={row} actions={actions} />}
                      </td>
                    )}
                  </tr>
                );
              })}
          </tbody>
          {hasTotals && !loading && !error && rows.length > 0 && (
            <tfoot>
              <tr className="border-t-2 border-ims-border bg-ims-thead font-bold">
                {columns.map((c, i) => (
                  <td key={c.key} className={cn("h-12 border-r border-ims-divider px-3.5 last:border-r-0", (c.align || (c.numeric ? "right" : "left")) === "right" && "text-right", c.numeric && "whitespace-nowrap tabular-nums")}>
                    {i === 0 && c.total === undefined ? totalLabel : c.total ?? ""}
                  </td>
                ))}
                {rowActions && <td />}
              </tr>
            </tfoot>
          )}
        </table>
      </div>
      {footer}
    </div>
  );
}

function RowMenu<T>({ row, actions }: { row: T; actions: RowAction<T>[] }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button type="button" aria-label="Row actions" className="inline-flex h-9 w-9 items-center justify-center rounded-control text-ims-muted hover:bg-ims-subtle hover:text-ims-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ims-focus">
          <MoreHorizontal size={18} />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[180px] rounded-control border-ims-border p-1 shadow-menu">
        {actions.map((a) => (
          <DropdownMenuItem
            key={a.label}
            disabled={a.disabled}
            onSelect={() => a.onSelect(row)}
            className={cn("flex min-h-[38px] cursor-pointer items-center gap-2 rounded-md px-2.5 text-[14px]", a.danger ? "text-ims-danger focus:bg-ims-danger-bg focus:text-ims-danger" : "text-ims-text focus:bg-ims-subtle")}
          >
            {a.icon && <a.icon size={16} className="shrink-0" />}
            {a.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** "1–15 of 30" · rows per page 15 / 30 / 50 · previous / next. */
export function Pager({
  page,
  perPage,
  total,
  onPage,
  onPerPage,
  sizes = [15, 30, 50],
  className,
}: {
  page: number;
  perPage: number;
  total: number;
  onPage: (p: number) => void;
  onPerPage?: (n: number) => void;
  sizes?: number[];
  className?: string;
}) {
  const pages = Math.max(1, Math.ceil(total / perPage));
  const first = total ? (page - 1) * perPage + 1 : 0;
  const last = Math.min(page * perPage, total);
  return (
    <div className={cn("flex flex-wrap items-center justify-between gap-3 border-t border-ims-divider px-4 py-3 text-t-small text-ims-muted sm:px-5", className)}>
      <span className="tabular-nums">
        {fmtNumber(first)}–{fmtNumber(last)} of {fmtNumber(total)}
      </span>
      <div className="flex items-center gap-3">
        {onPerPage && (
          <label className="flex items-center gap-2">
            <span>Rows per page</span>
            <select value={perPage} onChange={(e) => onPerPage(Number(e.target.value))} className="h-9 rounded-control border border-ims-field bg-ims-card px-2 text-[13px] font-semibold text-ims-text outline-none focus:border-ims-focus focus:ring-2 focus:ring-ims-focus/25">
              {sizes.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </label>
        )}
        <div className="flex items-center gap-1">
          <button type="button" onClick={() => onPage(page - 1)} disabled={page <= 1} aria-label="Previous page" className="flex h-9 w-9 items-center justify-center rounded-control border border-ims-field bg-ims-card text-ims-text hover:bg-ims-subtle disabled:opacity-40">
            <ChevronLeft size={16} />
          </button>
          <span className="min-w-[64px] text-center tabular-nums text-ims-text">{page} / {pages}</span>
          <button type="button" onClick={() => onPage(page + 1)} disabled={page >= pages} aria-label="Next page" className="flex h-9 w-9 items-center justify-center rounded-control border border-ims-field bg-ims-card text-ims-text hover:bg-ims-subtle disabled:opacity-40">
            <ChevronRight size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ cell helpers
/** Numbers only (the column header says "(RWF)"). */
export function Num({ value, decimals, negativeRed }: { value?: number | string | null; decimals?: boolean; negativeRed?: boolean }) {
  const n = Number(value);
  return <span className={cn("tabular-nums", negativeRed && n < 0 && "text-ims-danger")}>{fmtNumber(value, decimals)}</span>;
}

/** Document numbers never wrap: PR-2026-000030. */
export function DocNo({ value, className }: { value?: string | null; className?: string }) {
  return <span className={cn("whitespace-nowrap font-mono text-[12.5px] text-ims-body", className)}>{value || "—"}</span>;
}

/** Full name, then role or department on a second line. */
export function Person({ name, detail }: { name?: string | null; detail?: React.ReactNode }) {
  return (
    <span className="block min-w-0">
      <span className="block truncate font-semibold text-ims-text">{name || "—"}</span>
      {detail && <span className="block truncate text-t-small text-ims-muted">{detail}</span>}
    </span>
  );
}

/** Title + optional second line, clamped. */
export function TwoLine({ main, sub, clamp = true }: { main: React.ReactNode; sub?: React.ReactNode; clamp?: boolean }) {
  return (
    <span className="block min-w-0">
      <span className={cn("block font-semibold text-ims-text", clamp && "line-clamp-2 break-words")} title={textOf(main)}>{main}</span>
      {sub && <span className={cn("mt-0.5 block text-t-small text-ims-muted", clamp && "line-clamp-1")} title={textOf(sub)}>{sub}</span>}
    </span>
  );
}
