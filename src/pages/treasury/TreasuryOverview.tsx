/**
 * Bank & cash → Cash position: how much money RALGA holds today (bank, petty cash, restricted donor money),
 * month-end balances this fiscal year, this month's flows, what is waiting and which accounts are due for
 * reconciliation.
 */
import { Link, useNavigate } from "react-router-dom";
import { useQuery } from "react-query";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { AlertTriangle, ArrowRightLeft, BarChart3, Banknote, ClipboardCheck, FileSpreadsheet, Landmark, PiggyBank, Scale } from "lucide-react";
import { usePermissions } from "@/context/auth.context";
import { TreasuryAccount, treasuryApi } from "@/lib/treasury";
import { compactMoney } from "@/lib/procurement";
import { CHART, HorizontalBars } from "@/components/enterprise/ui";
import { Card, CardHeader, Column, DataTable, EmptyState, ErrorState, KpiBand, Num, Page, PageHeader, Pill, fmtDate, fmtMoney, fmtMoneyShort, fmtNumber } from "@/components/ims";
import { ReconState } from "@/components/treasury/TreasuryKit";

const short = (n: number) => compactMoney(n, "").trim();

export default function TreasuryOverview() {
  const navigate = useNavigate();
  const { can } = usePermissions();
  const q = useQuery(["treasury-position"], () => treasuryApi.position(), { refetchInterval: 60000 });
  const p = q.data;

  const header = (
    <PageHeader
      breadcrumbs={[{ label: "Bank & cash" }]}
      title="Cash position"
      subtitle={`Money held by RALGA${p ? ` on ${fmtDate(p.today)}` : ""}, from the cash books of every bank account and petty cash.`}
      primary={{ label: "Reports", icon: BarChart3, to: "/dashboard/treasury/reports" }}
      secondary={[
        ...(can("manage_treasury") ? [{ label: "Receipts", icon: PiggyBank, to: "/dashboard/treasury/receipts" }] : []),
        ...(can("prepare_bank_reconciliation") ? [{ label: "Bank statements", icon: FileSpreadsheet, to: "/dashboard/treasury/statements" }] : []),
      ]}
    />
  );

  if (q.isLoading) {
    return (
      <Page>
        {header}
        <KpiBand loading items={["Total cash and bank", "Petty cash", "Restricted donor money", "Received this month", "Paid this month"].map((label) => ({ label, value: null }))} />
      </Page>
    );
  }
  if (!p) {
    return (
      <Page>
        {header}
        <Card>
          <ErrorState text="The cash position could not be loaded." detail={(q.error as any)?.message || "Your role may not have access to bank and cash."} onRetry={() => q.refetch()} />
        </Card>
      </Page>
    );
  }

  const active = p.accounts.filter((a) => a.status === "active" || a.book_balance !== 0);
  const work = [
    { label: "Receipts waiting for the DAF", n: p.pending.receipts, link: "/dashboard/treasury/receipts?view=pending", icon: PiggyBank },
    { label: "Transfers waiting for approval", n: p.pending.transfers, link: "/dashboard/treasury/transfers?view=pending", icon: ArrowRightLeft },
    { label: "Reconciliations waiting for the DAF", n: p.pending.reconciliations, link: "/dashboard/treasury/reconciliations?view=pending", icon: Scale },
    { label: "Approved vouchers to pay", n: p.pending.to_pay, link: "/dashboard/finance/vouchers?view=to_pay", icon: Banknote },
    { label: "Drafts (receipts, transfers)", n: p.pending.drafts, link: "/dashboard/treasury/receipts?view=draft", icon: ClipboardCheck },
  ];
  const months = p.months.map((m) => ({ ...m, name: m.label.split(" ")[0] }));
  const dueOf = (id: string) => p.due.find((d) => d.id === id)?.due;

  const columns: Column<TreasuryAccount>[] = [
    {
      key: "account",
      header: "Account",
      cell: (a) => <span className="font-semibold text-ims-text">{a.code}</span>,
      sub: (a) => `${a.name}${a.funding_source ? " · restricted" : ""}`,
    },
    {
      key: "book",
      header: "Cash book (RWF)",
      numeric: true,
      cell: (a) => <span className="font-semibold"><Num value={a.book_balance} /></span>,
      total: <Num value={active.reduce((s, a) => s + (a.book_balance || 0), 0)} />,
    },
    {
      key: "statement",
      header: "Bank statement (RWF)",
      numeric: true,
      cell: (a) => (a.kind === "bank" && a.statement_date ? <Num value={a.statement_balance} /> : <span className="text-ims-faint">—</span>),
      sub: (a) => (a.kind === "bank" && a.statement_date ? `to ${fmtDate(a.statement_date)}` : null),
    },
    { key: "rec", header: "Reconciliation", cell: (a) => <ReconState reconciledTo={a.reconciled_to} due={dueOf(a.id)} kind={a.kind} /> },
    {
      key: "match",
      header: "To match",
      numeric: true,
      cell: (a) => (a.kind === "bank" ? fmtNumber(a.unmatched_bank + a.unmatched_book) : <span className="text-ims-faint">—</span>),
    },
  ];

  return (
    <Page>
      {header}

      <KpiBand
        items={[
          { label: "Total cash and bank", value: fmtMoneyShort(p.totals.total), sub: `In the banks ${fmtMoneyShort(p.totals.bank)}`, to: "/dashboard/treasury/accounts" },
          { label: "Petty cash", value: fmtMoneyShort(p.totals.cash), sub: "In the office" },
          { label: "Restricted donor money", value: fmtMoneyShort(p.totals.restricted), sub: `Unrestricted ${fmtMoneyShort(p.totals.unrestricted)}` },
          { label: "Received this month", value: fmtMoneyShort(p.this_month.receipts), tone: "success", sub: p.this_month.interest ? `Interest ${fmtMoneyShort(p.this_month.interest)}` : "Receipts posted" },
          { label: "Paid this month", value: fmtMoneyShort(p.this_month.payments), sub: p.this_month.charges ? `Bank charges ${fmtMoneyShort(p.this_month.charges)}` : "Payments posted" },
        ]}
      />

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader title="Month-end cash, this fiscal year" subtitle="All bank accounts and cash books together; the current month shows today's balance." />
          {months.length ? (
            <div className="h-[260px]" role="img" aria-label="Month-end cash balance by month">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={months} margin={{ top: 8, right: 8, left: 8, bottom: 0 }} barCategoryGap="28%">
                  <CartesianGrid vertical={false} stroke={CHART.grid} />
                  <XAxis dataKey="name" tickLine={false} axisLine={{ stroke: CHART.grid }} tick={{ fontSize: 12, fill: CHART.axis }} />
                  <YAxis tickLine={false} axisLine={false} width={56} tick={{ fontSize: 12, fill: CHART.axis }} tickFormatter={short} />
                  <Tooltip cursor={{ fill: CHART.grid }} content={<MonthTip accounts={p.accounts} />} />
                  <Bar isAnimationActive={false} dataKey="total" name="Cash and bank" fill={CHART.series1} radius={[4, 4, 0, 0]} maxBarSize={44} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <EmptyState compact icon={Landmark} text="No month of the fiscal year has ended yet." />
          )}
        </Card>

        <Card>
          <CardHeader title="Waiting" subtitle="Work in progress across bank and cash." />
          <ul className="-mx-2 divide-y divide-ims-divider">
            {work.map((w) => (
              <li key={w.label}>
                <Link to={w.link} className="flex min-h-[44px] items-center gap-3 rounded-control px-2 py-2 hover:bg-ims-hover">
                  <w.icon size={16} className="shrink-0 text-ims-faint" aria-hidden />
                  <span className="flex-1 text-t-body text-ims-body">{w.label}</span>
                  <Pill tone={w.n ? "warning" : "neutral"} className="min-w-[28px] justify-center tabular-nums">{fmtNumber(w.n)}</Pill>
                </Link>
              </li>
            ))}
          </ul>
          {p.due.length > 0 && (
            <div className="mt-4 rounded-control border border-ims-warning/30 bg-ims-warning-bg px-3.5 py-3 text-ims-warning">
              <p className="flex items-center gap-1.5 text-t-small font-bold">
                <AlertTriangle size={14} className="shrink-0" aria-hidden /> Due for reconciliation to {fmtDate(p.due[0].due)}
              </p>
              <ul className="mt-1 space-y-0.5">
                {p.due.map((d) => (
                  <li key={d.id}>
                    <Link to={`/dashboard/treasury/accounts/${d.id}`} className="flex items-baseline justify-between gap-3 text-t-small hover:underline">
                      <span className="min-w-0">{d.code} · {d.name}</span>
                      <span className="shrink-0">{d.reconciled_to ? `Last ${fmtDate(d.reconciled_to)}` : "Never reconciled"}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Card padded={false} className="overflow-hidden xl:col-span-2">
          <div className="px-5 pt-5">
            <CardHeader title="Accounts" subtitle="Cash book and last bank statement of each account." link={{ label: "All accounts", to: "/dashboard/treasury/accounts" }} />
          </div>
          <DataTable
            columns={columns}
            rows={active}
            rowKey={(a) => a.id}
            onRowClick={(a) => navigate(`/dashboard/treasury/accounts/${a.id}`)}
            minWidth={640}
            caption="Accounts and their balances"
            empty={<EmptyState compact icon={Landmark} text="No bank account or cash book is set up yet." />}
          />
        </Card>
        <Card>
          <CardHeader title="Balance by account" subtitle="Cash book balance today, in RWF." />
          {active.length ? (
            <HorizontalBars data={active.map((a) => ({ name: a.code, value: a.book_balance }))} label="Cash book balance" format={(v) => short(v)} labelWidth={80} />
          ) : (
            <EmptyState compact icon={Landmark} text="No balances yet." />
          )}
        </Card>
      </div>
    </Page>
  );
}

function MonthTip({ active, payload, accounts }: any) {
  if (!active || !payload?.length) return null;
  const m = payload[0].payload;
  return (
    <div className="rounded-control border border-ims-border bg-ims-card px-3 py-2 text-t-small shadow-menu">
      <p className="mb-1 font-bold text-ims-text">{m.label} · {fmtDate(m.end)}</p>
      {accounts.filter((a: any) => m.accounts[a.id]).map((a: any) => (
        <p key={a.id} className="flex justify-between gap-6 text-ims-body"><span>{a.code}</span><span className="tabular-nums text-ims-text">{fmtNumber(m.accounts[a.id])}</span></p>
      ))}
      <p className="mt-1 flex justify-between gap-6 border-t border-ims-divider pt-1 font-bold text-ims-text"><span>Total</span><span className="tabular-nums">{fmtMoney(m.total)}</span></p>
    </div>
  );
}
