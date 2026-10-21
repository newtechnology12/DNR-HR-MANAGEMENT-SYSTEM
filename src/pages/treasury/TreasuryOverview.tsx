/**
 * Bank & cash → Cash position: how much money RALGA holds today (bank, petty cash, restricted donor money),
 * month-end balances this fiscal year, this month's flows, what is waiting and which accounts are due for
 * reconciliation.
 */
import { Link, useNavigate } from "react-router-dom";
import { useQuery } from "react-query";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ArrowRightLeft, Banknote, ClipboardCheck, FileSpreadsheet, PiggyBank, Landmark, Scale } from "lucide-react";
import { usePermissions } from "@/context/auth.context";
import { treasuryApi } from "@/lib/treasury";
import { rwf, showDay } from "@/lib/ims";
import { compactMoney } from "@/lib/procurement";
import { Button } from "@/components/ui/button";
import { CHART, EmptyState, HorizontalBars, ListSkeleton, PageHeader, Panel } from "@/components/enterprise/ui";
import { KindIcon, ReconState, Stat } from "@/components/treasury/TreasuryKit";
import { cn } from "@/utils";

const short = (n: number) => compactMoney(n, "").trim();

export default function TreasuryOverview() {
  const navigate = useNavigate();
  const { can } = usePermissions();
  const q = useQuery(["treasury-position"], () => treasuryApi.position(), { refetchInterval: 60000 });
  const p = q.data;
  if (q.isLoading) return <div className="space-y-4 px-3 py-2 sm:px-4"><ListSkeleton rows={8} /></div>;
  if (!p) return <div className="p-6"><EmptyState icon={Landmark} title="Cash position not available" text={(q.error as any)?.message || "You may not have access to bank and cash."} /></div>;
  const active = p.accounts.filter((a) => a.status === "active" || a.book_balance !== 0);
  const work = [
    { label: "Receipts waiting for the DAF", n: p.pending.receipts, link: "/dashboard/treasury/receipts?view=pending", icon: PiggyBank },
    { label: "Transfers waiting for approval", n: p.pending.transfers, link: "/dashboard/treasury/transfers?view=pending", icon: ArrowRightLeft },
    { label: "Reconciliations waiting for the DAF", n: p.pending.reconciliations, link: "/dashboard/treasury/reconciliations?view=pending", icon: Scale },
    { label: "Approved vouchers to pay", n: p.pending.to_pay, link: "/dashboard/finance/vouchers?view=to_pay", icon: Banknote },
    { label: "Drafts (receipts, transfers)", n: p.pending.drafts, link: "/dashboard/treasury/receipts?view=draft", icon: ClipboardCheck },
  ];
  const months = p.months.map((m) => ({ ...m, name: m.label.split(" ")[0] }));

  return (
    <div className="space-y-4 px-3 sm:px-4">
      <PageHeader
        title="Cash position"
        description={`Money held by RALGA on ${showDay(p.today)}, from the cash books. Updated with every receipt, payment and transfer.`}
        breadcrumbs={[{ title: "Bank & cash", link: "/dashboard/treasury" }]}
        actions={
          <>
            {can("manage_treasury") && <Button size="sm" variant="outline" onClick={() => navigate("/dashboard/treasury/receipts")}><PiggyBank size={14} /> Receipts</Button>}
            {can("prepare_bank_reconciliation") && <Button size="sm" variant="outline" onClick={() => navigate("/dashboard/treasury/statements")}><FileSpreadsheet size={14} /> Bank statements</Button>}
            <Button size="sm" onClick={() => navigate("/dashboard/treasury/reports")}>Reports</Button>
          </>
        }
      />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <Stat label="Total cash and bank" value={rwf(p.totals.total)} sub={`${active.length} accounts`} />
        <Stat label="In the banks" value={rwf(p.totals.bank)} />
        <Stat label="Petty cash" value={rwf(p.totals.cash)} />
        <Stat label="Restricted donor money" value={rwf(p.totals.restricted)} sub={`Unrestricted ${rwf(p.totals.unrestricted)}`} />
        <Stat label="Received this month" value={rwf(p.this_month.receipts)} sub={p.this_month.interest ? `Interest ${rwf(p.this_month.interest)}` : undefined} tone="success" />
        <Stat label="Paid this month" value={rwf(p.this_month.payments)} sub={p.this_month.charges ? `Bank charges ${rwf(p.this_month.charges)}` : undefined} />
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <Panel title="Month-end cash, this fiscal year" subtitle="All bank accounts and cash books together; the current month shows today's balance">
          {months.length ? (
            <div className="h-[260px]" role="img" aria-label="Month-end cash balance by month">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={months} margin={{ top: 8, right: 8, left: 8, bottom: 0 }} barCategoryGap="28%">
                  <CartesianGrid vertical={false} stroke={CHART.grid} />
                  <XAxis dataKey="name" tickLine={false} axisLine={{ stroke: CHART.grid }} tick={{ fontSize: 12, fill: CHART.axis }} />
                  <YAxis tickLine={false} axisLine={false} width={56} tick={{ fontSize: 11.5, fill: CHART.axis }} tickFormatter={short} />
                  <Tooltip cursor={{ fill: "#f1f5f9" }} content={<MonthTip accounts={p.accounts} />} />
                  <Bar isAnimationActive={false} dataKey="total" name="Cash and bank" fill={CHART.series1} radius={[4, 4, 0, 0]} maxBarSize={44} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : <EmptyState icon={Landmark} text="No month in the fiscal year yet." />}
        </Panel>
        <Panel title="Waiting" subtitle="Work in progress across bank and cash">
          <ul className="divide-y divide-slate-100">
            {work.map((w) => (
              <li key={w.label}>
                <Link to={w.link} className="flex items-center gap-3 py-2.5 hover:bg-slate-50">
                  <w.icon size={16} className="text-slate-400" />
                  <span className="flex-1 text-[13px] text-slate-700">{w.label}</span>
                  <span className={cn("min-w-[28px] rounded-full px-2 py-0.5 text-center text-[12px] font-semibold tabular-nums", w.n ? "bg-amber-100 text-amber-800" : "bg-slate-100 text-slate-500")}>{w.n}</span>
                </Link>
              </li>
            ))}
          </ul>
          {p.due.length > 0 && (
            <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2">
              <p className="text-[12.5px] font-semibold text-amber-900">Due for reconciliation (to {showDay(p.due[0].due)})</p>
              {p.due.map((d) => (
                <p key={d.id} className="mt-0.5 flex items-center justify-between text-[12.5px] text-amber-900">
                  <span>{d.code} · {d.name}</span>
                  <span className="text-[11.5px]">{d.reconciled_to ? `done to ${showDay(d.reconciled_to)}` : "never"}</span>
                </p>
              ))}
            </div>
          )}
        </Panel>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)]">
        <Panel title="Balance by account" subtitle="Cash book balance today">
          <HorizontalBars data={active.map((a) => ({ name: a.code, value: a.book_balance }))} label="Cash book balance" format={(v) => short(v)} labelWidth={80} />
        </Panel>
        <Panel title="Accounts" action={{ label: "All accounts", onClick: () => navigate("/dashboard/treasury/accounts") }}>
          <div className="overflow-x-auto">
            <table className="dnr-grid w-full min-w-[640px]">
              <thead><tr><th>Account</th><th className="text-right">Cash book</th><th className="text-right">Bank statement</th><th>Reconciliation</th><th className="text-right">To match</th></tr></thead>
              <tbody>
                {active.map((a) => (
                  <tr key={a.id} className="cursor-pointer hover:bg-slate-50" onClick={() => navigate(`/dashboard/treasury/accounts/${a.id}`)}>
                    <td><span className="flex items-center gap-2"><KindIcon kind={a.kind} className="h-7 w-7" /><span><span className="block text-[13px] font-medium text-slate-900">{a.code}</span><span className="block text-[11.5px] text-slate-500">{a.name}{a.funding_source ? " · restricted" : ""}</span></span></span></td>
                    <td className="whitespace-nowrap text-right font-semibold tabular-nums">{a.book_balance.toLocaleString("en-US")}</td>
                    <td className="whitespace-nowrap text-right tabular-nums text-slate-600">{a.kind === "bank" && a.statement_date ? <>{a.statement_balance.toLocaleString("en-US")}<span className="block text-[11px] text-slate-400">to {showDay(a.statement_date)}</span></> : "—"}</td>
                    <td><ReconState reconciledTo={a.reconciled_to} due={p.due.find((d) => d.id === a.id)?.due} kind={a.kind} /></td>
                    <td className="text-right tabular-nums">{a.kind === "bank" ? a.unmatched_bank + a.unmatched_book : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      </div>
    </div>
  );
}

function MonthTip({ active, payload, accounts }: any) {
  if (!active || !payload?.length) return null;
  const m = payload[0].payload;
  return (
    <div className="rounded-md border border-slate-200 bg-white px-3 py-2 text-[12px] shadow-card-hover">
      <p className="mb-1 font-semibold text-slate-800">{m.label} · {showDay(m.end)}</p>
      {accounts.filter((a: any) => m.accounts[a.id]).map((a: any) => (
        <p key={a.id} className="flex justify-between gap-6 text-slate-600"><span>{a.code}</span><span className="tabular-nums text-slate-900">{Number(m.accounts[a.id]).toLocaleString("en-US")}</span></p>
      ))}
      <p className="mt-1 flex justify-between gap-6 border-t border-slate-100 pt-1 font-semibold text-slate-900"><span>Total</span><span className="tabular-nums">{rwf(m.total)}</span></p>
    </div>
  );
}
