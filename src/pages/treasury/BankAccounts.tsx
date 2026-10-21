/**
 * Bank & cash → Accounts: RALGA's bank accounts and cash books with their cash book balance, the last bank
 * statement, how far each is reconciled and what is still to match. The DAF sets accounts up.
 */
import * as React from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQuery } from "react-query";
import { Landmark, Lock, Plus, Scale, Star } from "lucide-react";
import pocketbase from "@/lib/pocketbase";
import { usePermissions } from "@/context/auth.context";
import { PERMS } from "@/lib/treasury";
import { rwf, showDay } from "@/lib/ims";
import { exportReport } from "@/lib/exporter";
import { Button } from "@/components/ui/button";
import { Badge, EmptyState, ListSkeleton, PageHeader } from "@/components/enterprise/ui";
import ExportMenu from "@/components/enterprise/ExportMenu";
import { KindIcon, ReconState, lastMonthEnd } from "@/components/treasury/TreasuryKit";
import AccountDialog from "./AccountDialog";

export default function BankAccounts() {
  const navigate = useNavigate();
  const { can } = usePermissions();
  const [open, setOpen] = React.useState(false);
  const [showClosed, setShowClosed] = React.useState(false);
  const q = useQuery(["bank-accounts"], () => pocketbase.collection("bank_accounts").getFullList({ sort: "kind,code", expand: "funding_source,custodian,gl_account" }));
  const all = (q.data || []) as any[];
  const active = all.filter((a) => a.status === "active");
  const closed = all.filter((a) => a.status !== "active");
  const due = lastMonthEnd();

  const doExport = (format: "xlsx" | "pdf" | "csv") =>
    exportReport({
      title: "Bank and cash accounts", subtitle: `Balances as of ${showDay(new Date().toISOString())}`, rows: all, format, what: "treasury:accounts", orientation: "landscape",
      totals: ["Cash book balance"],
      columns: [
        { header: "Code", value: (a: any) => a.code, width: 12 },
        { header: "Name", value: (a: any) => a.name, width: 26 },
        { header: "Type", value: (a: any) => (a.kind === "cash" ? "Cash book" : "Bank"), width: 10 },
        { header: "Bank", value: (a: any) => a.bank_name, width: 18 },
        { header: "Account number", value: (a: any) => a.account_number, width: 20 },
        { header: "GL", value: (a: any) => a.expand?.gl_account?.code || "", width: 8 },
        { header: "Funds", value: (a: any) => (a.expand?.funding_source ? `Restricted: ${a.expand.funding_source.name}` : "Unrestricted"), width: 24 },
        { header: "Cash book balance", value: (a: any) => a.book_balance, format: "money", width: 16 },
        { header: "Statement balance", value: (a: any) => (a.kind === "bank" ? a.statement_balance : ""), format: "money", width: 16 },
        { header: "Statement to", value: (a: any) => a.statement_date, format: "date", width: 12 },
        { header: "Reconciled to", value: (a: any) => a.reconciled_to, format: "date", width: 12 },
        { header: "Status", value: (a: any) => a.status, width: 10 },
      ],
    });

  return (
    <div className="space-y-4 px-3 sm:px-4">
      <PageHeader
        title="Bank & cash accounts"
        description="Each account's cash book balance, its last bank statement and how far it is reconciled. Balances update with every receipt, payment and transfer."
        breadcrumbs={[{ title: "Bank & cash", link: "/dashboard/treasury" }, { title: "Accounts", link: "/dashboard/treasury/accounts" }]}
        actions={
          <>
            <ExportMenu onExport={doExport} permission={PERMS.export} disabled={!all.length} />
            {can("manage_bank_accounts") && <Button onClick={() => setOpen(true)}><Plus size={15} /> New account</Button>}
          </>
        }
      />
      {q.isLoading ? <ListSkeleton rows={4} /> : !all.length ? (
        <EmptyState icon={Landmark} title="No accounts yet" text="The Director of Finance sets up RALGA's bank accounts and the petty cash book, with their opening balances." />
      ) : (
        <>
          {(["bank", "cash"] as const).map((kind) => {
            const list = active.filter((a) => a.kind === kind);
            if (!list.length) return null;
            return (
              <section key={kind} className="space-y-2">
                <h3 className="text-[11.5px] font-semibold uppercase tracking-wider text-slate-500">{kind === "bank" ? "Bank accounts" : "Cash books"}</h3>
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {list.map((a) => <AccountCard key={a.id} a={a} due={due} onOpen={() => navigate(`/dashboard/treasury/accounts/${a.id}`)} canReconcile={can("prepare_bank_reconciliation")} />)}
                </div>
              </section>
            );
          })}
          {closed.length > 0 && (
            <section className="space-y-2">
              <button type="button" onClick={() => setShowClosed((x) => !x)} className="text-[12.5px] font-medium text-primaryDark hover:underline">{showClosed ? "Hide" : "Show"} closed accounts ({closed.length})</button>
              {showClosed && <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{closed.map((a) => <AccountCard key={a.id} a={a} due={due} onOpen={() => navigate(`/dashboard/treasury/accounts/${a.id}`)} canReconcile={false} />)}</div>}
            </section>
          )}
        </>
      )}
      <AccountDialog open={open} onClose={() => setOpen(false)} onSaved={(id) => { setOpen(false); q.refetch(); navigate(`/dashboard/treasury/accounts/${id}`); }} />
    </div>
  );
}

function AccountCard({ a, due, onOpen, canReconcile }: { a: any; due: string; onOpen: () => void; canReconcile: boolean }) {
  const bank = a.kind === "bank";
  const over = !bank && a.cash_limit > 0 && a.book_balance > a.cash_limit;
  const toMatch = (a.unmatched_bank || 0) + (bank ? a.unmatched_book || 0 : 0);
  return (
    <article className="flex flex-col rounded-lg border border-slate-200 bg-white shadow-card transition-shadow hover:shadow-card-hover">
      <button type="button" onClick={onOpen} className="flex flex-1 flex-col gap-3 px-4 pb-3 pt-4 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40">
        <div className="flex items-start gap-3">
          <KindIcon kind={a.kind} />
          <div className="min-w-0 flex-1">
            <p className="flex flex-wrap items-center gap-1.5 text-[14px] font-semibold text-slate-900">
              {a.name}
              {a.is_default && <span title="Default for payments"><Star size={13} className="fill-amber-400 text-amber-400" aria-label="Default for payments" /></span>}
            </p>
            <p className="truncate text-[12px] text-slate-500">{a.code} · {bank ? `${a.bank_name}${a.account_number ? ` · ${a.account_number}` : ""}` : `Held by ${a.expand?.custodian?.name || "—"}`}</p>
          </div>
          {a.status !== "active" ? <Badge tone="neutral">Closed</Badge> : a.expand?.funding_source ? <Badge tone="violet"><Lock size={11} className="mr-1" />Restricted</Badge> : null}
        </div>
        <div>
          <p className="text-[11.5px] text-slate-500">Cash book balance</p>
          <p className={over ? "text-[22px] font-semibold tabular-nums text-red-600" : "text-[22px] font-semibold tabular-nums text-slate-900"}>{rwf(a.book_balance)}</p>
          {over && <p className="text-[11.5px] font-medium text-red-600">Above the cash limit of {rwf(a.cash_limit)}: bank the surplus</p>}
          {a.expand?.funding_source && <p className="truncate text-[11.5px] text-violet-700">Only for {a.expand.funding_source.name}</p>}
        </div>
        <dl className="grid grid-cols-2 gap-2 border-t border-slate-100 pt-2.5 text-[12px]">
          {bank ? (
            <div>
              <dt className="text-slate-500">Bank statement</dt>
              <dd className="font-medium tabular-nums text-slate-800">{a.statement_date ? `${rwf(a.statement_balance)}` : "None imported"}</dd>
              {a.statement_date && <dd className="text-[11px] text-slate-400">to {showDay(a.statement_date)}</dd>}
            </div>
          ) : (
            <div>
              <dt className="text-slate-500">Cash limit</dt>
              <dd className="font-medium tabular-nums text-slate-800">{a.cash_limit ? rwf(a.cash_limit) : "None"}</dd>
            </div>
          )}
          <div>
            <dt className="text-slate-500">{bank ? "To match" : "Since last count"}</dt>
            <dd className="font-medium tabular-nums text-slate-800">{bank ? `${toMatch} item${toMatch === 1 ? "" : "s"}` : `${a.unmatched_book || 0} entr${a.unmatched_book === 1 ? "y" : "ies"}`}</dd>
          </div>
        </dl>
      </button>
      <div className="flex items-center justify-between gap-2 border-t border-slate-100 px-4 py-2.5">
        <ReconState reconciledTo={String(a.reconciled_to || "").slice(0, 10)} due={a.status === "active" && String(a.opening_date).slice(0, 10) <= due ? due : undefined} kind={a.kind} />
        {canReconcile && a.status === "active" && (
          <Link to={`/dashboard/treasury/reconcile/${a.id}`} className="inline-flex items-center gap-1 whitespace-nowrap text-[12.5px] font-medium text-primaryDark hover:underline">
            <Scale size={13} /> {bank ? "Reconcile" : "Count cash"}
          </Link>
        )}
      </div>
    </article>
  );
}
