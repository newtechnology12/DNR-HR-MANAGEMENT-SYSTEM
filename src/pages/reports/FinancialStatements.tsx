/**
 * Reports → Financial statements, prepared from the general ledger (IPSAS presentation): financial position at a
 * date, financial performance for a period (by department, funding source or project) and cash flow (direct
 * method). Every figure comes from posted journals, so the statements always agree with the trial balance; each
 * account line opens its ledger for the finance team. Excel, PDF and CSV with the RALGA header.
 */
import * as React from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useQuery } from "react-query";
import { CheckCircle2, AlertTriangle, Scale } from "lucide-react";
import { usePermissions } from "@/context/auth.context";
import { exportReport, ExportFormat } from "@/lib/exporter";
import { CashFlow, FinancialPerformance, FinancialPosition, StatementGroup, statementsApi } from "@/lib/statements";
import ExportMenu from "@/components/enterprise/ExportMenu";
import { Card, DatePicker, DateRangeFilter, ErrorState, FilterBar, Page, PageHeader, Tabs, fmtDate, fmtDateTime, fmtNumber } from "@/components/ims";
import { Skeleton } from "@/components/ui/skeleton";
import { LedgerFilterControls, periodLabel, useLedgerChips, useLedgerFilter } from "@/components/ledger/LedgerFilters";
import { cn } from "@/utils";

const today = () => new Date().toISOString().slice(0, 10);
/** Accounting style: negatives in brackets, nothing for zero. */
const acc = (n?: number) => (!n ? "—" : n < 0 ? `(${fmtNumber(-n)})` : fmtNumber(n));

type Row = { kind: "section" | "group" | "line" | "detail" | "subtotal" | "total" | "grand" | "note"; label: string; code?: string; account?: string; a?: number; b?: number };

/** A statement as rows: headings, account lines, subtotals and totals. */
function StatementTable({ heads, rows, link }: { heads: string[]; rows: Row[]; link?: (account: string) => string }) {
  const cols = heads.length - 1;
  return (
    <div className="relative overflow-x-auto">
      <table className="w-full border-collapse text-t-body text-ims-text" style={{ minWidth: cols > 1 ? 720 : 560 }}>
        <thead className="bg-ims-thead">
          <tr>
            {heads.map((h, i) => (
              <th key={i} scope="col" className={cn("h-11 border-b border-ims-divider px-4 text-[12.5px] font-semibold text-ims-muted", i ? "w-[190px] text-right" : "text-left")}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => {
            const nums = [r.a, r.b].slice(0, cols);
            if (r.kind === "section") {
              return <tr key={i} className="border-b border-ims-divider bg-ims-subtle"><th scope="colgroup" colSpan={heads.length} className="px-4 py-2.5 text-left text-[13.5px] font-bold text-ims-text">{r.label}</th></tr>;
            }
            if (r.kind === "group") {
              return <tr key={i}><td colSpan={heads.length} className="px-4 pb-1 pt-3 text-[13px] font-bold text-ims-body">{r.label}</td></tr>;
            }
            if (r.kind === "note") {
              return <tr key={i}><td colSpan={heads.length} className="px-4 pb-1 pt-2 text-t-small font-semibold text-ims-muted">{r.label}</td></tr>;
            }
            const strong = r.kind === "subtotal" || r.kind === "total" || r.kind === "grand";
            const label = r.account && link ? <Link className="hover:text-ims-link hover:underline" to={link(r.account)}>{r.label}</Link> : r.label;
            return (
              <tr key={i} className={cn(r.kind === "subtotal" && "border-t border-ims-divider", r.kind === "total" && "border-t border-ims-border", r.kind === "grand" && "border-t-2 border-ims-border bg-ims-thead")}>
                <td className={cn("px-4 py-1.5", r.kind === "line" && "pl-8", r.kind === "detail" && "pl-12 text-t-small text-ims-muted", strong && "font-bold", r.kind === "grand" && "py-2.5")}>
                  {r.code && <span className="mr-2 font-mono text-[12px] text-ims-faint">{r.code}</span>}
                  {label}
                </td>
                {nums.map((n, j) => (
                  <td key={j} className={cn("whitespace-nowrap px-4 py-1.5 text-right tabular-nums", strong && "font-bold", r.kind === "detail" && "text-t-small text-ims-muted", r.kind === "grand" && "py-2.5")}>{acc(n)}</td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function groupRows(groups: StatementGroup[], subtotalWord = "Total"): Row[] {
  const out: Row[] = [];
  for (const g of groups) {
    out.push({ kind: "group", label: g.name });
    for (const l of g.lines) {
      out.push({ kind: "line", label: l.name, code: l.code, account: l.account, a: l.amount, b: l.compare });
      for (const d of l.detail || []) out.push({ kind: "detail", label: d.name, code: d.code, account: d.account, a: d.amount, b: d.compare });
    }
    out.push({ kind: "subtotal", label: `${subtotalWord} ${g.name.toLowerCase()}`, a: g.total, b: g.compare });
  }
  return out;
}

function positionRows(p: FinancialPosition): Row[] {
  const rows: Row[] = [];
  for (const s of p.sections) {
    rows.push({ kind: "section", label: s.label });
    if (s.key === "net_assets") for (const l of s.groups[0].lines) rows.push({ kind: "line", label: l.name, code: l.code, account: l.account, a: l.amount, b: l.compare });
    else rows.push(...groupRows(s.groups));
    rows.push({ kind: "total", label: `Total ${s.label.toLowerCase()}`, a: s.total, b: s.compare });
  }
  rows.push({ kind: "grand", label: "Total liabilities and net assets", a: p.totals.liabilities + p.totals.net_assets, b: p.totals.compare_liabilities + p.totals.compare_net_assets });
  return rows;
}

function performanceRows(p: FinancialPerformance): Row[] {
  return [
    { kind: "section", label: "Revenue" }, ...groupRows(p.revenue), { kind: "total", label: "Total revenue", a: p.totals.revenue, b: p.totals.revenue_ytd },
    { kind: "section", label: "Expenses" }, ...groupRows(p.expenses), { kind: "total", label: "Total expenses", a: p.totals.expenses, b: p.totals.expenses_ytd },
    { kind: "grand", label: "Surplus / (deficit)", a: p.totals.surplus, b: p.totals.surplus_ytd },
  ];
}

function cashRows(c: CashFlow): Row[] {
  const line = (l: { label: string; amount: number }): Row => ({ kind: "line", label: l.label, a: l.amount });
  return [
    { kind: "section", label: "Cash flows from operating activities" },
    { kind: "note", label: "Receipts" }, ...c.receipts.map(line),
    { kind: "note", label: "Payments" }, ...c.payments.map(line),
    { kind: "subtotal", label: "Net cash from operating activities", a: c.operating },
    { kind: "section", label: "Cash flows from investing activities" }, ...(c.investing.length ? c.investing.map(line) : [{ kind: "note" as const, label: "No investing activity in the period." }]),
    { kind: "subtotal", label: "Net cash from investing activities", a: c.investing_total },
    { kind: "section", label: "Cash flows from financing activities" }, ...(c.financing.length ? c.financing.map(line) : [{ kind: "note" as const, label: "No financing activity in the period." }]),
    { kind: "subtotal", label: "Net cash from financing activities", a: c.financing_total },
    { kind: "total", label: "Net increase / (decrease) in cash and cash equivalents", a: c.net },
    { kind: "line", label: "Cash and cash equivalents at the beginning of the period", a: c.opening },
    { kind: "grand", label: "Cash and cash equivalents at the end of the period", a: c.closing },
  ];
}

function Check({ ok, good, bad }: { ok: boolean; good: string; bad: string }) {
  return (
    <p className={cn("flex items-center gap-2 border-t border-ims-divider px-5 py-3 text-t-small font-semibold", ok ? "text-ims-success" : "text-ims-danger")}>
      {ok ? <CheckCircle2 size={16} aria-hidden /> : <AlertTriangle size={16} aria-hidden />} {ok ? good : bad}
    </p>
  );
}

function Loading() {
  return <div className="space-y-2.5 px-5 py-5">{Array.from({ length: 10 }, (_, i) => <Skeleton key={i} className={cn("h-5", i % 4 === 0 ? "w-1/3" : "w-full")} />)}</div>;
}

async function exportRows(title: string, subtitle: string, heads: string[], rows: Row[], format: ExportFormat, file: string) {
  const out = rows.filter((r) => r.kind !== "note" || r.label).map((r) => ({ ...r, indent: r.kind === "line" ? "    " : r.kind === "detail" ? "        " : "" }));
  await exportReport({
    title, subtitle, rows: out, format, what: "financial_statements", fileName: file, orientation: "portrait", totals: [],
    columns: [
      { header: heads[0], value: (r) => `${r.indent}${r.code ? `${r.code} ` : ""}${r.kind === "section" ? r.label.toUpperCase() : r.label}`, width: 60 },
      ...heads.slice(1).map((h, i) => ({ header: h, value: (r: any) => (r.kind === "section" || r.kind === "group" || r.kind === "note" ? null : (i === 0 ? r.a : r.b) || 0), format: "money" as const })),
    ],
  });
}

export default function FinancialStatements() {
  const { can } = usePermissions();
  const [params, setParams] = useSearchParams();
  const tab = ["position", "performance", "cash"].includes(params.get("s") || "") ? (params.get("s") as string) : "position";
  const ledger = can(["view_journals", "approve_journals", "export_ledger"]);
  return (
    <Page>
      <PageHeader
        breadcrumbs={[{ label: "Reports" }, { label: "Financial statements" }]}
        title="Financial statements"
        subtitle="Prepared from the general ledger (IPSAS presentation). Every figure ties to the trial balance."
        secondary={ledger ? [{ label: "Trial balance", icon: Scale, to: "/dashboard/finance/trial-balance" }] : []}
      />
      <Card padded={false} className="overflow-hidden">
        <Tabs inset active={tab} onChange={(k) => { const next = new URLSearchParams(params); next.set("s", k); setParams(next, { replace: true }); }} tabs={[{ key: "position", label: "Financial position" }, { key: "performance", label: "Financial performance" }, { key: "cash", label: "Cash flow" }]} />
        {tab === "position" && <Position ledger={ledger} />}
        {tab === "performance" && <Performance ledger={ledger} />}
        {tab === "cash" && <Cash />}
      </Card>
    </Page>
  );
}

function Position({ ledger }: { ledger: boolean }) {
  const [asAt, setAsAt] = React.useState(today());
  const q = useQuery(["statement-position", asAt], () => statementsApi.position(asAt), { keepPreviousData: true });
  const p = q.data;
  const heads = p ? ["", `${fmtDate(p.as_at)} (RWF)`, `${fmtDate(p.compare_at)} (RWF)`] : ["", "Now (RWF)", "Start of year (RWF)"];
  const rows = p ? positionRows(p) : [];
  return (
    <>
      <FilterBar right={<ExportMenu permission={["view_financial_reports", "export_ledger"]} onExport={(f) => exportRows("Statement of financial position", `As at ${fmtDate(asAt)} · start of the fiscal year beside it`, heads.map((h, i) => (i ? h : "Line")), rows, f, `financial-position-${asAt}`)} />}>
        <span className="inline-flex items-center gap-1.5"><span className="text-t-small font-semibold text-ims-muted">As at</span><DatePicker value={asAt} max={today()} onChange={(d) => setAsAt(d || today())} className="h-button w-[160px] text-[13.5px]" /></span>
      </FilterBar>
      {q.isLoading ? <Loading /> : q.error ? <ErrorState detail={(q.error as Error).message} onRetry={() => q.refetch()} /> : (
        <>
          <div className={cn("border-t border-ims-divider", q.isFetching && "opacity-60")}><StatementTable heads={heads} rows={rows} link={ledger ? (a) => `/dashboard/finance/trial-balance/${a}?to=${asAt}` : undefined} /></div>
          <Check ok={Boolean(p?.balanced)} good={`Assets equal liabilities plus net assets · generated ${fmtDateTime(p?.generated_at)}`} bad="Assets do not equal liabilities plus net assets — check the trial balance." />
        </>
      )}
    </>
  );
}

function Performance({ ledger }: { ledger: boolean }) {
  const { f, set } = useLedgerFilter();
  const chips = useLedgerChips(f, set);
  const q = useQuery(["statement-performance", f], () => statementsApi.performance(f), { keepPreviousData: true });
  const p = q.data;
  const heads = ["", p ? `${periodLabel(p.from, p.to)} (RWF)` : "Period (RWF)", "Year to date (RWF)"];
  const rows = p ? performanceRows(p) : [];
  return (
    <>
      <FilterBar chips={chips} onClear={() => set({ department: "", funding_source: "", project: "" })} right={<ExportMenu permission={["view_financial_reports", "export_ledger"]} onExport={(fmt) => exportRows("Statement of financial performance", [p ? periodLabel(p.from, p.to) : "", ...chips.map((c) => c.label)].filter(Boolean).join(" · "), heads.map((h, i) => (i ? h : "Line")), rows, fmt, `financial-performance-${p?.to || today()}`)} />}>
        <LedgerFilterControls f={f} set={set} shown={p} />
      </FilterBar>
      {q.isLoading ? <Loading /> : q.error ? <ErrorState detail={(q.error as Error).message} onRetry={() => q.refetch()} /> : (
        <div className={cn("border-t border-ims-divider", q.isFetching && "opacity-60")}>
          <StatementTable heads={heads} rows={rows} link={ledger && p ? (a) => `/dashboard/finance/trial-balance/${a}?from=${p.from}&to=${p.to}` : undefined} />
        </div>
      )}
    </>
  );
}

function Cash() {
  const [range, setRange] = React.useState<[string, string]>(["", ""]);
  const q = useQuery(["statement-cash", range], () => statementsApi.cashFlow({ from: range[0], to: range[1] }), { keepPreviousData: true });
  const c = q.data;
  const heads = ["", c ? `${periodLabel(c.from, c.to)} (RWF)` : "Period (RWF)"];
  const rows = c ? cashRows(c) : [];
  return (
    <>
      <FilterBar right={<ExportMenu permission={["view_financial_reports", "export_ledger"]} onExport={(f) => exportRows("Cash flow statement (direct method)", c ? periodLabel(c.from, c.to) : "", heads.map((h, i) => (i ? h : "Line")), rows, f, `cash-flow-${c?.to || today()}`)} />}>
        <DateRangeFilter label="Period" from={range[0] || c?.from || ""} to={range[1] || c?.to || ""} onChange={(a, b) => setRange([a, b])} />
      </FilterBar>
      {q.isLoading ? <Loading /> : q.error ? <ErrorState detail={(q.error as Error).message} onRetry={() => q.refetch()} /> : (
        <>
          <div className={cn("border-t border-ims-divider", q.isFetching && "opacity-60")}><StatementTable heads={heads} rows={rows} /></div>
          <Check ok={Boolean(c?.reconciles)} good="Opening cash plus the net flow equals the cash in the bank and cash books at the end of the period." bad="The cash flow does not reconcile with the cash books — check unposted entries." />
        </>
      )}
    </>
  );
}
