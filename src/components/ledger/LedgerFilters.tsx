/**
 * Filters shared by the trial balance and the account ledger: a period (this month, last month, this or last fiscal
 * year, or chosen dates) and the department, funding source and project. They live in the address, so a trial
 * balance line opens its account ledger for the same period and filters, and a link can be shared.
 */
import { useSearchParams } from "react-router-dom";
import { ChevronDown } from "lucide-react";
import { DateRangeFilter, FilterChip, FilterSelect, fmtDate } from "@/components/ims";
import { useJournalRefs } from "./LinesEditor";

export type LedgerFilter = { from: string; to: string; department: string; funding_source: string; project: string };
const KEYS = ["from", "to", "department", "funding_source", "project"] as const;

const pad = (n: number) => String(n).padStart(2, "0");
const iso = (d: Date) => d.toISOString().slice(0, 10);
export const todayIso = () => iso(new Date());

/** Period shortcuts for a fiscal year that starts in `fyMonth` (RALGA: July). */
export function periodPresets(today: string, fyMonth: number) {
  const y = Number(today.slice(0, 4));
  const m = Number(today.slice(5, 7));
  const lastEnd = iso(new Date(Date.UTC(y, m - 1, 0)));
  const fyYear = m >= fyMonth ? y : y - 1;
  return [
    { value: "month", label: "This month", from: `${today.slice(0, 7)}-01`, to: today },
    { value: "last_month", label: "Last month", from: `${lastEnd.slice(0, 7)}-01`, to: lastEnd },
    { value: "fy", label: "This fiscal year", from: `${fyYear}-${pad(fyMonth)}-01`, to: today },
    { value: "last_fy", label: "Last fiscal year", from: `${fyYear - 1}-${pad(fyMonth)}-01`, to: iso(new Date(Date.UTC(fyYear, fyMonth - 1, 0))) },
  ];
}

export function useLedgerFilter() {
  const [params, setParams] = useSearchParams();
  const f = Object.fromEntries(KEYS.map((k) => [k, params.get(k) || ""])) as LedgerFilter;
  const set = (patch: Partial<LedgerFilter>) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    setParams(next, { replace: true });
  };
  return { f, set };
}

/** The same filters as an address query, with the dates the server actually used. */
export function ledgerQuery(f: LedgerFilter, shown?: { from: string; to: string }) {
  const all: Record<string, string> = { ...f, from: f.from || shown?.from || "", to: f.to || shown?.to || "" };
  return new URLSearchParams(Object.entries(all).filter(([, v]) => v)).toString();
}

/** Chips for the department, funding source and project (the period is always shown in the bar). */
export function useLedgerChips(f: LedgerFilter, set: (p: Partial<LedgerFilter>) => void): FilterChip[] {
  const refs = useJournalRefs();
  const name = (list: any[] | undefined, id: string, code?: boolean) => {
    const r = (list || []).find((x) => x.id === id);
    return r ? (code ? `${r.code} · ${r.name}` : r.name) : "…";
  };
  return [
    f.department && { key: "department", label: `Department: ${name(refs.data?.departments, f.department)}`, onRemove: () => set({ department: "" }) },
    f.funding_source && { key: "fund", label: `Funding source: ${name(refs.data?.funds, f.funding_source, true)}`, onRemove: () => set({ funding_source: "" }) },
    f.project && { key: "project", label: `Project: ${name(refs.data?.projects, f.project, true)}`, onRemove: () => set({ project: "" }) },
  ].filter(Boolean) as FilterChip[];
}

export const periodLabel = (from?: string, to?: string) => (from && to ? `${fmtDate(from)} – ${fmtDate(to)}` : "");

function PeriodSelect({ value, onChange, options }: { value: string; onChange: (v: string) => void; options: { value: string; label: string }[] }) {
  return (
    <span className="relative inline-block">
      <select
        aria-label="Period"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-button w-[180px] appearance-none truncate rounded-control border border-ims-link/60 bg-ims-card pl-3 pr-9 text-[13.5px] font-semibold text-ims-text outline-none focus:border-ims-focus focus:ring-2 focus:ring-ims-focus/25"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
      <ChevronDown size={15} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-ims-muted" aria-hidden />
    </span>
  );
}

/** Period shortcut, dates, department, funding source and project — children of a FilterBar. */
export function LedgerFilterControls({ f, set, shown }: { f: LedgerFilter; set: (p: Partial<LedgerFilter>) => void; shown?: { from: string; to: string; fy_start?: string } }) {
  const refs = useJournalRefs();
  const fyMonth = shown?.fy_start ? Number(shown.fy_start.slice(5, 7)) : 7;
  const from = f.from || shown?.from || "";
  const to = f.to || shown?.to || "";
  const presets = periodPresets(todayIso(), fyMonth);
  const preset = presets.find((p) => p.from === from && p.to === to)?.value || "custom";
  return (
    <>
      <PeriodSelect
        value={preset}
        options={[...presets, { value: "custom", label: "Chosen dates" }]}
        onChange={(v) => {
          const p = presets.find((x) => x.value === v);
          if (p) set({ from: p.from, to: p.to });
        }}
      />
      <DateRangeFilter label="Dates" from={from} to={to} onChange={(a, b) => set({ from: a, to: b })} />
      <FilterSelect label="Department" value={f.department} onChange={(v) => set({ department: v })} options={(refs.data?.departments || []).map((d) => ({ value: d.id, label: d.name }))} />
      <FilterSelect label="Funding source" value={f.funding_source} onChange={(v) => set({ funding_source: v })} options={(refs.data?.funds || []).map((d) => ({ value: d.id, label: `${d.code} · ${d.name}` }))} />
      <FilterSelect label="Project" value={f.project} onChange={(v) => set({ project: v })} options={(refs.data?.projects || []).map((d) => ({ value: d.id, label: `${d.code} · ${d.name}` }))} />
    </>
  );
}
