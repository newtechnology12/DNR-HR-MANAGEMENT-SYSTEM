/**
 * Reports → Donor report: for one funding source, what was brought forward and received, what was spent against
 * each budget line of the fund, the fund balance and the cash held in its restricted account — the figures a
 * development partner asks for, straight from the ledger and the budget.
 */
import * as React from "react";
import { useQuery } from "react-query";
import { PiggyBank } from "lucide-react";
import pocketbase from "@/lib/pocketbase";
import { exportReport, ExportFormat } from "@/lib/exporter";
import { DonorReport as Report, statementsApi } from "@/lib/statements";
import ExportMenu from "@/components/enterprise/ExportMenu";
import { Card, CardHeader, Column, DataTable, DateRangeFilter, EmptyState, ErrorState, FilterBar, FilterSelect, KpiBand, Num, Page, PageHeader, Pill, TwoLine, fmtDate, fmtMoneyShort, fmtNumber } from "@/components/ims";
import { periodLabel } from "@/components/ledger/LedgerFilters";

type Line = Report["lines"][number];
const STATUS_TONE = { green: "success", amber: "warning", red: "danger" } as const;
const STATUS_WORD = { green: "On track", amber: "Watch", red: "Over or near the limit" } as const;

export default function DonorReport() {
  const funds = useQuery(["funding-sources-all"], () => pocketbase.collection("funding_sources").getFullList({ sort: "code", fields: "id,code,name,type,restricted" }), { staleTime: 300_000 });
  const list = (funds.data || []) as any[];
  const [fund, setFund] = React.useState("");
  const [range, setRange] = React.useState<[string, string]>(["", ""]);
  React.useEffect(() => {
    if (!fund && list.length) setFund((list.find((f) => f.type === "donor") || list[0]).id);
  }, [list, fund]);
  const q = useQuery(["donor-report", fund, range], () => statementsApi.donor({ funding_source: fund, from: range[0], to: range[1] }), { enabled: Boolean(fund), keepPreviousData: true });
  const r = q.data;

  const doExport = async (format: ExportFormat) => {
    if (!r) return;
    await exportReport({
      title: `Donor report — ${r.funding_source.code} ${r.funding_source.name}`,
      subtitle: [periodLabel(r.from, r.to), r.funding_source.donor, r.funding_source.agreement && `Agreement ${r.funding_source.agreement}`, `Brought forward ${fmtNumber(r.opening)} · received ${fmtNumber(r.received)} · spent ${fmtNumber(r.spent)} · balance ${fmtNumber(r.closing)}`].filter(Boolean).join(" · "),
      rows: r.lines, format, what: "donor_report", fileName: `donor-report-${r.funding_source.code}-${r.to}`, orientation: "landscape",
      totals: ["Budget", "Spent in the period", "Spent this year", "Committed", "Available"],
      columns: [
        { header: "Budget line", value: (l: Line) => l.code, width: 18 }, { header: "Line", value: (l: Line) => l.name, width: 36 }, { header: "Account", value: (l: Line) => l.account, width: 30 },
        { header: "Budget", value: (l: Line) => l.budget || 0, format: "money" }, { header: "Spent in the period", value: (l: Line) => l.spent, format: "money" },
        { header: "Spent this year", value: (l: Line) => l.actual_ytd || 0, format: "money" }, { header: "Committed", value: (l: Line) => l.committed || 0, format: "money" },
        { header: "Available", value: (l: Line) => l.available || 0, format: "money" }, { header: "Used %", value: (l: Line) => (l.used_pct === undefined ? null : l.used_pct), format: "number" },
      ],
    });
  };

  const columns: Column<Line>[] = [
    { key: "line", header: "Budget line", width: "34%", cell: (l) => <TwoLine main={`${l.code} · ${l.name}`} sub={l.depreciation ? "Assets bought with the fund wear out over time" : l.unbudgeted ? "Spent without a budget line of this fund" : l.account} /> },
    { key: "budget", header: "Budget (RWF)", numeric: true, cell: (l) => (l.budget === undefined ? "—" : <Num value={l.budget} />), total: r ? <Num value={r.lines.reduce((t, l) => t + (l.budget || 0), 0)} /> : undefined },
    { key: "spent", header: "Spent in the period (RWF)", numeric: true, cell: (l) => <Num value={l.spent} />, total: r ? <Num value={r.spent} /> : undefined },
    { key: "committed", header: "Committed (RWF)", numeric: true, cell: (l) => (l.committed ? <Num value={l.committed} /> : "—") },
    { key: "available", header: "Available (RWF)", numeric: true, cell: (l) => (l.available === undefined ? "—" : <Num value={l.available} negativeRed />) },
    {
      key: "used", header: "Used", nowrap: true,
      cell: (l) => (l.status ? <span className="inline-flex flex-col items-start gap-1"><Pill tone={STATUS_TONE[l.status]}>{STATUS_WORD[l.status]}</Pill><span className="text-t-small text-ims-muted">{l.used_pct}% of the budget</span></span> : l.depreciation ? <span className="inline-flex flex-col items-start gap-1"><Pill tone="neutral">Depreciation</Pill><span className="text-t-small text-ims-muted">not a budget item</span></span> : <Pill tone="danger">Not budgeted</Pill>),
    },
  ];

  return (
    <Page>
      <PageHeader
        breadcrumbs={[{ label: "Reports" }, { label: "Donor report" }]}
        title="Donor report"
        subtitle="For one funding source: funds brought forward and received, spending against each budget line, the fund balance and the cash held for it."
        meta={r ? [r.funding_source.donor, r.funding_source.agreement && `agreement ${r.funding_source.agreement}`, r.funding_source.start && `${fmtDate(r.funding_source.start)} – ${fmtDate(r.funding_source.end)}`].filter(Boolean).join(" · ") : undefined}
      />
      <Card padded={false} className="overflow-hidden">
        <FilterBar right={<ExportMenu permission={["view_financial_reports", "export_ledger"]} onExport={doExport} />}>
          <FilterSelect label="Funding source" all={false} value={fund} onChange={setFund} options={list.map((f) => ({ value: f.id, label: `${f.code} · ${f.name}` }))} />
          <DateRangeFilter label="Period" from={range[0] || r?.from || ""} to={range[1] || r?.to || ""} onChange={(a, b) => setRange([a, b])} />
        </FilterBar>
      </Card>
      <KpiBand
        loading={q.isLoading || !r}
        items={[
          { label: "Brought forward", value: r ? fmtMoneyShort(r.opening) : "—", sub: r?.brought_in ? `incl. ${fmtMoneyShort(r.brought_in)} at go-live` : "unspent at the start" },
          { label: "Received", value: r ? fmtMoneyShort(r.received) : "—", sub: r ? `${r.receipts.length} source${r.receipts.length === 1 ? "" : "s"} of funds` : undefined },
          { label: "Spent", value: r ? fmtMoneyShort(r.spent) : "—", sub: "in the period" },
          { label: "Fund balance", value: r ? fmtMoneyShort(r.closing) : "—", tone: r && r.closing < 0 ? "danger" : "default", sub: r ? `at ${fmtDate(r.to)}` : undefined },
          { label: "Cash held", value: r ? fmtMoneyShort(r.cash) : "—", sub: r?.accounts.length ? r.accounts.map((a) => a.code).join(", ") : "no restricted account" },
        ]}
      />
      {q.error && !r ? (
        <Card><ErrorState detail={(q.error as Error).message} onRetry={() => q.refetch()} /></Card>
      ) : (
        <>
          <Card padded={false} className="overflow-hidden">
            <div className="px-5 pb-3 pt-5"><CardHeader className="mb-0" title="Spending against the budget" subtitle="Every budget line of the fund this fiscal year, and anything charged to the fund without one." /></div>
            <DataTable columns={columns} rows={r?.lines || []} rowKey={(l) => l.line || l.code} loading={q.isLoading} minWidth={940} empty={<EmptyState icon={PiggyBank} text="No budget line or spending for this fund in the period." />} />
          </Card>
          <div className="grid gap-4 lg:grid-cols-3">
            <Card>
              <CardHeader title="Funds received" subtitle={r ? (r.expected ? `${fmtMoneyShort(r.received)} of ${fmtMoneyShort(r.expected)} expected this year` : periodLabel(r.from, r.to)) : undefined} />
              {r && r.receipts.length ? (
                <ul className="divide-y divide-ims-divider">
                  {r.receipts.map((x) => <li key={x.code} className="flex items-baseline justify-between gap-3 py-2 text-t-body"><span><span className="mr-2 font-mono text-[12px] text-ims-faint">{x.code}</span>{x.name}</span><span className="tabular-nums">{fmtNumber(x.amount)}</span></li>)}
                </ul>
              ) : <p className="text-t-body text-ims-muted">Nothing received in the period.</p>}
            </Card>
            <Card>
              <CardHeader title="By project" subtitle="Spending in the period" />
              {r && r.projects.length ? (
                <ul className="divide-y divide-ims-divider">
                  {r.projects.map((x) => <li key={x.project || "none"} className="flex items-baseline justify-between gap-3 py-2 text-t-body"><span>{x.code ? <span className="mr-2 font-mono text-[12px] text-ims-faint">{x.code}</span> : null}{x.name}</span><span className="tabular-nums">{fmtNumber(x.spent)}</span></li>)}
                </ul>
              ) : <p className="text-t-body text-ims-muted">No spending in the period.</p>}
            </Card>
            <Card>
              <CardHeader title="Cash held for the fund" subtitle={r ? `At ${fmtDate(r.to)}` : undefined} />
              {r && r.accounts.length ? (
                <ul className="divide-y divide-ims-divider">
                  {r.accounts.map((x) => <li key={x.code} className="flex items-baseline justify-between gap-3 py-2 text-t-body"><span><span className="mr-2 font-mono text-[12px] text-ims-faint">{x.code}</span>{x.name}</span><span className="tabular-nums">{fmtNumber(x.balance)}</span></li>)}
                </ul>
              ) : <p className="text-t-body text-ims-muted">The fund has no restricted bank account; its money is held with RALGA's other funds.</p>}
              {r && r.accounts.length > 0 && r.cash !== r.closing && (
                <p className="mt-3 text-t-small text-ims-muted">The cash differs from the fund balance by {fmtNumber(Math.abs(r.cash - r.closing))}: amounts owed or prepaid, and assets bought with the fund.</p>
              )}
            </Card>
          </div>
        </>
      )}
    </Page>
  );
}
