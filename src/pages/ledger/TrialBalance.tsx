/**
 * General ledger → Trial balance: the opening balance, the movements and the closing balance of every account for a
 * period, grouped by type, with the check that debits equal credits. Revenue and expense accounts start each fiscal
 * year at nil; earlier years' surplus sits in the accumulated surplus. Each account opens its ledger.
 */
import * as React from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQuery } from "react-query";
import { BookOpen, CalendarCheck, Scale } from "lucide-react";
import { exportReport, ExportFormat } from "@/lib/exporter";
import { ACCOUNT_TYPES, TYPE_ORDER, TrialBalanceRow, ledgerApi } from "@/lib/ledger";
import ExportMenu from "@/components/enterprise/ExportMenu";
import { Card, EmptyState, ErrorState, FilterBar, KpiBand, Num, Page, PageHeader, fmtDate, fmtDateTime, fmtMoneyShort, fmtNumber } from "@/components/ims";
import { Skeleton } from "@/components/ui/skeleton";
import { LedgerFilterControls, ledgerQuery, periodLabel, useLedgerChips, useLedgerFilter } from "@/components/ledger/LedgerFilters";
import { cn } from "@/utils";

const MONEY = ["opening_dr", "opening_cr", "debit", "credit", "closing_dr", "closing_cr"] as const;
type Sums = Record<(typeof MONEY)[number], number>;
const sums = (rows: TrialBalanceRow[]) => Object.fromEntries(MONEY.map((k) => [k, rows.reduce((t, r) => t + r[k], 0)])) as Sums;

const TH = "h-11 whitespace-nowrap border-b border-r border-ims-divider px-4 text-[12.5px] font-semibold text-ims-muted last:border-r-0";
const TD = "border-r border-ims-divider px-4 py-2 align-middle last:border-r-0";
const NUM = "whitespace-nowrap text-right tabular-nums";

/** Zero stays blank, as on a printed trial balance. */
const Amount = ({ n }: { n: number }) => (n ? <Num value={n} /> : null);

export default function TrialBalance() {
  const navigate = useNavigate();
  const { f, set } = useLedgerFilter();
  const chips = useLedgerChips(f, set);
  const q = useQuery(["trial-balance", f], () => ledgerApi.trialBalance(f), { keepPreviousData: true });
  const tb = q.data;
  const groups = React.useMemo(() => {
    const rows = tb?.rows || [];
    const known = TYPE_ORDER.map((type) => ({ type, label: ACCOUNT_TYPES[type], rows: rows.filter((r) => r.type === type) }));
    const other = rows.filter((r) => !TYPE_ORDER.includes(r.type));
    return [...known, { type: "other", label: "Other accounts", rows: other }].filter((g) => g.rows.length);
  }, [tb]);
  const pl = (tb?.rows || []).filter((r) => r.type === "revenue" || r.type === "expense");
  const surplus = pl.reduce((t, r) => t + r.credit - r.debit, 0);
  const ytd = pl.reduce((t, r) => t - r.closing, 0);
  const t = tb?.totals;
  const difference = t ? Math.max(Math.abs(t.opening_dr - t.opening_cr), Math.abs(t.debit - t.credit), Math.abs(t.closing_dr - t.closing_cr)) : 0;
  const query = ledgerQuery(f, tb);
  const ledgerOf = (account: string) => `/dashboard/finance/trial-balance/${account}${query ? `?${query}` : ""}`;

  const doExport = async (format: ExportFormat) => {
    if (!tb) return;
    await exportReport({
      title: "Trial balance",
      subtitle: [periodLabel(tb.from, tb.to), ...chips.map((c) => c.label), tb.balanced ? "Debits equal credits" : "Out of balance"].join(" · "),
      rows: tb.rows,
      format,
      what: "trial_balance",
      fileName: `trial-balance-${tb.to}`,
      orientation: "landscape",
      totals: ["Opening debit", "Opening credit", "Debit", "Credit", "Closing debit", "Closing credit"],
      columns: [
        { header: "Code", value: (r) => r.code, width: 10 },
        { header: "Account", value: (r) => r.name, width: 40 },
        { header: "Type", value: (r) => ACCOUNT_TYPES[r.type] || r.type, width: 14 },
        { header: "Opening debit", value: (r) => r.opening_dr, format: "money" },
        { header: "Opening credit", value: (r) => r.opening_cr, format: "money" },
        { header: "Debit", value: (r) => r.debit, format: "money" },
        { header: "Credit", value: (r) => r.credit, format: "money" },
        { header: "Closing debit", value: (r) => r.closing_dr, format: "money" },
        { header: "Closing credit", value: (r) => r.closing_cr, format: "money" },
      ],
    });
  };

  return (
    <Page>
      <PageHeader
        breadcrumbs={[{ label: "General ledger", to: "/dashboard/finance/journals" }, { label: "Trial balance" }]}
        title="Trial balance"
        subtitle="Opening balance, movements and closing balance of every account. Select an account to see its postings."
        meta={tb ? `${periodLabel(tb.from, tb.to)} · fiscal year from ${fmtDate(tb.fy_start)} · generated ${fmtDateTime(tb.generated_at)}` : undefined}
        secondary={[{ label: "Journal entries", icon: BookOpen, to: "/dashboard/finance/journals" }, { label: "Period close", icon: CalendarCheck, to: "/dashboard/finance/periods" }]}
      />
      <KpiBand
        loading={q.isLoading}
        items={[
          { label: "Debits = credits", value: tb?.balanced ? "Balanced" : "Out of balance", tone: tb?.balanced ? "success" : "danger", sub: tb?.balanced ? "opening, movements and closing" : `difference RWF ${fmtNumber(difference)}` },
          { label: "Accounts", value: fmtNumber(tb?.rows.length || 0), sub: "with a balance or a movement" },
          { label: "Surplus for the period", value: fmtMoneyShort(surplus), tone: surplus < 0 ? "danger" : "default", sub: surplus < 0 ? "deficit: expenses above revenue" : "revenue less expenses" },
          // the same figure when the period starts with the fiscal year
          ...(tb && tb.from !== tb.fy_start ? [{ label: "Surplus, year to date", value: fmtMoneyShort(ytd), tone: ytd < 0 ? ("danger" as const) : ("default" as const), sub: `since ${fmtDate(tb.fy_start)}` }] : []),
        ]}
      />
      <Card padded={false} className="overflow-hidden">
        <FilterBar chips={chips} onClear={() => set({ department: "", funding_source: "", project: "" })} right={<ExportMenu permission={["export_ledger", "view_journals"]} onExport={doExport} />}>
          <LedgerFilterControls f={f} set={set} shown={tb} />
        </FilterBar>
        {q.error && !tb ? (
          <ErrorState text="The trial balance could not be prepared." detail={(q.error as Error)?.message} onRetry={() => q.refetch()} />
        ) : (
          <div className="relative overflow-x-auto border-t border-ims-divider">
            <table className={cn("w-full border-collapse text-left text-t-body text-ims-text", q.isFetching && !q.isLoading && "opacity-60 transition-opacity")} style={{ minWidth: 1020 }}>
              <caption className="sr-only">Trial balance {tb ? periodLabel(tb.from, tb.to) : ""}</caption>
              <thead className="bg-ims-thead">
                <tr>
                  <th scope="col" rowSpan={2} className={cn(TH, "w-[34%]")}>Account</th>
                  <th scope="colgroup" colSpan={2} className={cn(TH, "h-9 text-center")}>Opening balance</th>
                  <th scope="colgroup" colSpan={2} className={cn(TH, "h-9 text-center")}>Movements in the period</th>
                  <th scope="colgroup" colSpan={2} className={cn(TH, "h-9 text-center")}>Closing balance</th>
                </tr>
                <tr>
                  {["Debit (RWF)", "Credit (RWF)", "Debit (RWF)", "Credit (RWF)", "Debit (RWF)", "Credit (RWF)"].map((h, i) => (
                    <th key={i} scope="col" className={cn(TH, "h-9 text-right")}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {q.isLoading &&
                  Array.from({ length: 8 }, (_, i) => (
                    <tr key={i} className="border-b border-ims-divider">
                      {Array.from({ length: 7 }, (__, j) => (
                        <td key={j} className={cn(TD, "h-row")}><Skeleton className={cn("h-4", j ? "ml-auto w-2/3" : "w-3/4")} /></td>
                      ))}
                    </tr>
                  ))}
                {!q.isLoading && !groups.length && (
                  <tr>
                    <td colSpan={7}><EmptyState icon={Scale} text="Nothing was posted in this period with these filters." /></td>
                  </tr>
                )}
                {groups.map((g) => {
                  const s = sums(g.rows);
                  return (
                    <React.Fragment key={g.type}>
                      <tr className="border-b border-ims-divider bg-ims-subtle">
                        <th scope="colgroup" colSpan={7} className="px-4 py-2 text-left text-[13px] font-bold text-ims-text">{g.label}</th>
                      </tr>
                      {g.rows.map((r) => (
                        <tr
                          key={r.account}
                          tabIndex={0}
                          onClick={(e) => !(e.target as HTMLElement).closest("a") && navigate(ledgerOf(r.account))}
                          onKeyDown={(e) => e.key === "Enter" && navigate(ledgerOf(r.account))}
                          className="cursor-pointer border-b border-ims-divider outline-none hover:bg-ims-hover focus-visible:bg-ims-hover focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ims-focus"
                        >
                          <td className={cn(TD, "h-[48px]")}>
                            <Link to={ledgerOf(r.account)} className="group inline-flex min-w-0 items-baseline gap-2.5">
                              <span className="font-mono text-[12.5px] text-ims-body">{r.code}</span>
                              <span className="font-semibold text-ims-text group-hover:text-ims-link group-hover:underline">{r.name}</span>
                            </Link>
                          </td>
                          {MONEY.map((k) => (
                            <td key={k} className={cn(TD, NUM)}><Amount n={r[k]} /></td>
                          ))}
                        </tr>
                      ))}
                      <tr className="border-b border-ims-border bg-ims-thead/60">
                        <td className={cn(TD, "h-10 text-[13px] font-bold text-ims-body")}>Total {g.label.toLowerCase()}</td>
                        {MONEY.map((k) => (
                          <td key={k} className={cn(TD, NUM, "text-[13px] font-bold text-ims-body")}><Amount n={s[k]} /></td>
                        ))}
                      </tr>
                    </React.Fragment>
                  );
                })}
              </tbody>
              {t && groups.length > 0 && (
                <tfoot>
                  <tr className="border-t-2 border-ims-border bg-ims-thead font-bold">
                    <td className={cn(TD, "h-12")}>Total</td>
                    {MONEY.map((k) => (
                      <td key={k} className={cn(TD, NUM)}><Num value={t[k]} /></td>
                    ))}
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        )}
      </Card>
    </Page>
  );
}
