/**
 * FilterBar, above every table: search on the left (with a placeholder that says what it searches),
 * then filter dropdowns and a date range, removable chips for active filters, "Clear filters" when
 * anything is set, and the export / import controls on the right.
 */
import * as React from "react";
import { ChevronDown, Search, X } from "lucide-react";
import { cn } from "@/utils";
import { DatePicker } from "./Form";

export function SearchBox({ value, onChange, placeholder, className, label = "Search" }: { value: string; onChange: (v: string) => void; placeholder: string; className?: string; label?: string }) {
  return (
    <label className={cn("relative block w-full sm:w-[300px]", className)}>
      <span className="sr-only">{label}</span>
      <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ims-faint" aria-hidden />
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="h-button w-full rounded-control border border-ims-field bg-ims-card pl-9 pr-8 text-[14px] text-ims-text placeholder:text-ims-faint focus:border-ims-focus focus:outline-none focus:ring-2 focus:ring-ims-focus/25 [&::-webkit-search-cancel-button]:hidden"
      />
      {value && (
        <button type="button" onClick={() => onChange("")} aria-label="Clear search" className="absolute right-2 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-md text-ims-muted hover:bg-ims-subtle hover:text-ims-text">
          <X size={14} />
        </button>
      )}
    </label>
  );
}

export type Option = { value: string; label: string };

/** A filter dropdown that reads "Status: All" until something is chosen. */
export function FilterSelect({ label, value, onChange, options, className }: { label: string; value: string; onChange: (v: string) => void; options: Option[]; className?: string }) {
  return (
    <span className={cn("relative inline-block", className)}>
      <select
        aria-label={label}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={cn(
          "h-button w-[180px] appearance-none truncate rounded-control border bg-ims-card pl-3 pr-9 text-[13.5px] font-semibold outline-none focus:border-ims-focus focus:ring-2 focus:ring-ims-focus/25",
          value ? "border-ims-link/60 text-ims-text" : "border-ims-field text-ims-muted"
        )}
      >
        <option value="">{label}: All</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
      <ChevronDown size={15} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-ims-muted" aria-hidden />
    </span>
  );
}

/** From / to dates on one field. */
export function DateRangeFilter({ label = "Date", from, to, onChange }: { label?: string; from: string; to: string; onChange: (from: string, to: string) => void }) {
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5" role="group" aria-label={`${label} range`}>
      <span className="text-t-small font-semibold text-ims-muted">{label}</span>
      <DatePicker value={from} onChange={(v) => onChange(v, to)} placeholder="From" max={to || undefined} className="h-button w-[150px] text-[13.5px]" />
      <span className="text-ims-faint" aria-hidden>–</span>
      <DatePicker value={to} onChange={(v) => onChange(from, v)} placeholder="To" min={from || undefined} className="h-button w-[150px] text-[13.5px]" />
    </span>
  );
}

export type FilterChip = { key: string; label: string; onRemove: () => void };

export function FilterBar({
  search,
  children,
  chips = [],
  onClear,
  right,
  className,
}: {
  search?: { value: string; onChange: (v: string) => void; placeholder: string };
  children?: React.ReactNode;
  chips?: FilterChip[];
  onClear?: () => void;
  right?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-3 px-4 py-3.5 sm:px-5", className)}>
      <div className="flex flex-col gap-2.5 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-1 flex-wrap items-center gap-2">
          {search && <SearchBox {...search} />}
          {children}
          {onClear && chips.length > 0 && (
            <button type="button" onClick={onClear} className="h-9 px-1.5 text-[13.5px] font-bold text-ims-link hover:underline">
              Clear filters
            </button>
          )}
        </div>
        {right && <div className="flex flex-wrap items-center gap-2">{right}</div>}
      </div>
      {chips.length > 0 && (
        <ul className="flex flex-wrap gap-1.5" aria-label="Active filters">
          {chips.map((c) => (
            <li key={c.key}>
              <span className="inline-flex h-7 items-center gap-1 rounded-pill bg-ims-info-bg pl-2.5 pr-1 text-t-small font-semibold text-ims-info">
                {c.label}
                <button type="button" onClick={c.onRemove} aria-label={`Remove filter ${c.label}`} className="flex h-5 w-5 items-center justify-center rounded-full hover:bg-ims-card/70">
                  <X size={12} />
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
