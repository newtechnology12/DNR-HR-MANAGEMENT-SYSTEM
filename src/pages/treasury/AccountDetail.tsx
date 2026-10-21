/**
 * One bank account or cash book: balances and reconciliation status, the cash book with its running balance,
 * the imported statements, the reconciliations and the account details.
 */
import * as React from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useQuery } from "react-query";
import { toast } from "sonner";
import { ArrowRightLeft, FileSpreadsheet, PiggyBank, Landmark, Lock, Pencil, Scale, Star, Trash2 } from "lucide-react";
import pocketbase from "@/lib/pocketbase";
import { usePermissions } from "@/context/auth.context";
import { PERMS, REC_STATUS, STATEMENT_STATUS, treasuryApi } from "@/lib/treasury";
import { rwf, showDay } from "@/lib/ims";
import { errorMessage } from "@/lib/procurement";
import { exportReport } from "@/lib/exporter";
import { Button } from "@/components/ui/button";
import { Badge, EmptyState, KeyValues, ListSkeleton, PageHeader, StatusBadge } from "@/components/enterprise/ui";
import { Notebook } from "@/components/enterprise/DocumentLayout";
import ExportMenu from "@/components/enterprise/ExportMenu";
import { KindIcon, ReconState, Stat, lastMonthEnd } from "@/components/treasury/TreasuryKit";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/utils";
import AccountDialog from "./AccountDialog";
import ReceiptDialog from "./ReceiptDialog";
import TransferDialog from "./TransferDialog";
import StatementImport from "./StatementImport";

const today = () => new Date().toISOString().slice(0, 10);
const monthStart = () => `${today().slice(0, 7)}-01`;

export default function AccountDetail() {
  const { accountId } = useParams();
  const navigate = useNavigate();
  const { can } = usePermissions();
  const [tab, setTab] = React.useState("cashbook");
  const [dialog, setDialog] = React.useState<"" | "edit" | "receipt" | "transfer" | "import">("");
  const q = useQuery(["bank-account", accountId], () => pocketbase.collection("bank_accounts").getOne(accountId!, { expand: "funding_source,custodian,gl_account,created_by" }));
  const used = useQuery(["bank-account-used", accountId], async () => (await pocketbase.collection("cash_book_entries").getList(1, 1, { filter: `account = "${accountId}"`, fields: "id" })).totalItems > 0);
  const a: any = q.data;
  if (q.isLoading) return <div className="p-6"><ListSkeleton rows={6} /></div>;
  if (!a) return <div className="p-6"><EmptyState icon={Landmark} title="Account not found" text="It may be outside what your role can see." /></div>;
  const bank = a.kind === "bank";
  const due = lastMonthEnd();
  const refresh = () => q.refetch();

  return (
    <div className="space-y-4 px-3 sm:px-4">
      <PageHeader
        title={<span className="flex flex-wrap items-center gap-2.5"><KindIcon kind={a.kind} /> {a.name} {a.is_default && <Star size={15} className="fill-amber-400 text-amber-400" aria-label="Default for payments" />} {a.expand?.funding_source && <Badge tone="violet"><Lock size={11} className="mr-1" />Restricted: {a.expand.funding_source.code}</Badge>} {a.status !== "active" && <Badge tone="neutral">Closed</Badge>}</span>}
        description={`${a.code} · ${bank ? `${a.bank_name}${a.branch ? `, ${a.branch}` : ""} · ${a.account_number}` : `Cash book held by ${a.expand?.custodian?.name || "—"}`} · GL ${a.expand?.gl_account?.code || ""}`}
        breadcrumbs={[{ title: "Bank & cash", link: "/dashboard/treasury" }, { title: "Accounts", link: "/dashboard/treasury/accounts" }, { title: a.code, link: `/dashboard/treasury/accounts/${a.id}` }]}
        actions={
          <>
            {can("manage_treasury") && a.status === "active" && <Button size="sm" variant="outline" onClick={() => setDialog("receipt")}><PiggyBank size={14} /> Receipt</Button>}
            {can("manage_treasury") && a.status === "active" && <Button size="sm" variant="outline" onClick={() => setDialog("transfer")}><ArrowRightLeft size={14} /> Transfer</Button>}
            {bank && can("prepare_bank_reconciliation") && a.status === "active" && <Button size="sm" variant="outline" onClick={() => setDialog("import")}><FileSpreadsheet size={14} /> Import statement</Button>}
            {can("prepare_bank_reconciliation") && a.status === "active" && <Button size="sm" onClick={() => navigate(`/dashboard/treasury/reconcile/${a.id}`)}><Scale size={14} /> {bank ? "Reconcile" : "Count cash"}</Button>}
            {can("manage_bank_accounts") && <Button size="sm" variant="ghost" onClick={() => setDialog("edit")}><Pencil size={14} /> Edit</Button>}
          </>
        }
      />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Cash book balance" value={rwf(a.book_balance)} sub={a.last_entry_date ? `Last movement ${showDay(a.last_entry_date)}` : `Opening balance on ${showDay(a.opening_date)}`} />
        {bank ? <Stat label="Bank statement balance" value={a.statement_date ? rwf(a.statement_balance) : "—"} sub={a.statement_date ? `Imported to ${showDay(a.statement_date)}` : "No statement imported"} /> : <Stat label="Cash limit" value={a.cash_limit ? rwf(a.cash_limit) : "None"} sub={a.cash_limit && a.book_balance > a.cash_limit ? "Above the limit: bank the surplus" : "Most cash kept in the office"} tone={a.cash_limit && a.book_balance > a.cash_limit ? "warning" : "default"} />}
        <Stat label={bank ? "Reconciled to" : "Last cash count"} value={a.reconciled_to ? showDay(a.reconciled_to) : "Never"} sub={a.reconciled_to ? `${bank ? "Bank" : "Counted"}: ${rwf(a.reconciled_balance)}` : undefined} tone={a.reconciled_to && String(a.reconciled_to).slice(0, 10) >= due ? "success" : "warning"} />
        <Stat label={bank ? "Still to match" : "Entries since the count"} value={bank ? `${a.unmatched_bank} on statement · ${a.unmatched_book} in book` : String(a.unmatched_book)} sub={bank ? "Matched automatically on import" : undefined} />
      </div>
      <div className="flex justify-end">
        <ReconState reconciledTo={String(a.reconciled_to || "").slice(0, 10)} due={a.status === "active" && String(a.opening_date).slice(0, 10) <= due ? due : undefined} kind={a.kind} />
      </div>

      <section className="rounded-lg border border-slate-200 bg-white px-4 pb-4 pt-1 shadow-card">
        <Notebook
          tabs={[{ key: "cashbook", label: "Cash book" }, ...(bank ? [{ key: "statements", label: "Bank statements" }] : []), { key: "recs", label: bank ? "Reconciliations" : "Cash counts" }, { key: "details", label: "Details" }]}
          active={tab}
          onChange={setTab}
        />
        <div className="pt-4">
          {tab === "cashbook" && <CashBook account={a} />}
          {tab === "statements" && <Statements account={a} canDelete={can("prepare_bank_reconciliation")} onChanged={refresh} />}
          {tab === "recs" && <Reconciliations account={a} />}
          {tab === "details" && (
            <KeyValues
              columns={3}
              items={[
                { label: "Code", value: a.code },
                { label: "Type", value: bank ? "Bank account" : "Cash book" },
                { label: "Currency", value: a.currency || "RWF" },
                ...(bank ? [
                  { label: "Bank", value: a.bank_name }, { label: "Branch", value: a.branch }, { label: "Account number", value: <span className="font-mono">{a.account_number}</span> },
                  { label: "Account name", value: a.account_name }, { label: "SWIFT / BIC", value: a.swift_code }, { label: "Signatories", value: a.signatories },
                ] : [{ label: "Custodian", value: a.expand?.custodian?.name }, { label: "Cash limit", value: a.cash_limit ? rwf(a.cash_limit) : "None" }]),
                { label: "GL cash account", value: a.expand?.gl_account ? `${a.expand.gl_account.code} ${a.expand.gl_account.name}` : "" },
                { label: "Funds", value: a.expand?.funding_source ? `Restricted to ${a.expand.funding_source.name}` : "Unrestricted" },
                { label: "Opening balance", value: `${rwf(a.opening_balance)} on ${showDay(a.opening_date)}` },
                { label: "Default for payments", value: a.is_default ? "Yes" : "No" },
                { label: "Set up by", value: a.expand?.created_by?.name ? `${a.expand.created_by.name}, ${showDay(a.created)}` : showDay(a.created) },
                { label: "Notes", value: a.notes },
              ]}
            />
          )}
        </div>
      </section>

      <AccountDialog open={dialog === "edit"} account={a} locked={Boolean(used.data)} onClose={() => setDialog("")} onSaved={() => { setDialog(""); refresh(); }} />
      <ReceiptDialog open={dialog === "receipt"} prefill={{ account: a.id }} onClose={() => setDialog("")} onSaved={(id) => { setDialog(""); navigate(`/dashboard/treasury/receipts/${id}`); }} />
      <TransferDialog open={dialog === "transfer"} transfer={{ from_account: a.id }} onClose={() => setDialog("")} onSaved={(id) => { setDialog(""); navigate(`/dashboard/treasury/transfers/${id}`); }} />
      {dialog === "import" && <StatementImport account={a} onClose={() => setDialog("")} onDone={(r) => { setDialog(""); refresh(); toast.success(`${r.number}: ${r.lines} lines imported, ${r.matched} matched automatically`); }} />}
    </div>
  );
}

function CashBook({ account }: { account: any }) {
  const [from, setFrom] = React.useState(() => (String(account.opening_date).slice(0, 10) > monthStart() ? String(account.opening_date).slice(0, 10) : monthStart()));
  const [to, setTo] = React.useState(today());
  const q = useQuery(["cash-book", account.id, from, to, account.book_balance], () => treasuryApi.report("cash_book", { account: account.id, from, to }), { keepPreviousData: true });
  const rows = q.data?.rows || [];
  const doExport = (format: "xlsx" | "pdf" | "csv") =>
    exportReport({
      title: `Cash book — ${account.code} ${account.name}`, subtitle: `${showDay(from)} to ${showDay(to)}`, rows, format, what: `treasury:cash_book:${account.code}`, orientation: "landscape",
      totals: ["Money in", "Money out"],
      columns: [
        { header: "Date", value: (r: any) => r.date, format: "date", width: 12 },
        { header: "Document", value: (r: any) => r.number, width: 16 },
        { header: "Type", value: (r: any) => r.type, width: 12 },
        { header: "Payee / payer · description", value: (r: any) => r.description, width: 40 },
        { header: "Reference", value: (r: any) => r.reference, width: 16 },
        { header: "Money in", value: (r: any) => r.money_in, format: "money", width: 14 },
        { header: "Money out", value: (r: any) => r.money_out, format: "money", width: 14 },
        { header: "Balance", value: (r: any) => r.balance, format: "money", width: 15 },
        { header: "Status", value: (r: any) => r.status, width: 18 },
      ],
    });
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div className="flex flex-wrap items-end gap-2">
          <label className="text-[12px] font-medium text-slate-600">From<input type="date" className="mt-1 block h-9 rounded-md border border-slate-200 px-2.5 text-[13px]" value={from} min={String(account.opening_date).slice(0, 10)} onChange={(e) => setFrom(e.target.value)} /></label>
          <label className="text-[12px] font-medium text-slate-600">To<input type="date" className="mt-1 block h-9 rounded-md border border-slate-200 px-2.5 text-[13px]" value={to} max={today()} onChange={(e) => setTo(e.target.value)} /></label>
        </div>
        <ExportMenu onExport={doExport} permission={PERMS.export} disabled={!rows.length} />
      </div>
      {q.isLoading ? <ListSkeleton rows={6} /> : q.isError ? <EmptyState icon={Landmark} title="Cash book not available" text={(q.error as any)?.message || ""} /> : (
        <div className="overflow-x-auto rounded-md border border-slate-100">
          <table className="dnr-grid w-full min-w-[860px]">
            <thead><tr><th>Date</th><th>Document</th><th>Payee / payer · description</th><th>Reference</th><th className="text-right">Money in</th><th className="text-right">Money out</th><th className="text-right">Balance</th><th>Status</th></tr></thead>
            <tbody>
              {rows.map((r: any, i: number) => (
                <tr key={i} className={cn(i === 0 && "bg-slate-50 font-medium")}>
                  <td className="whitespace-nowrap text-[12.5px]">{showDay(r.date)}</td>
                  <td className="whitespace-nowrap text-[12.5px]">{r.link ? <Link to={r.link} className="font-mono text-primaryDark hover:underline">{r.number}</Link> : <span className="font-mono">{r.number}</span>}{r.type && <span className="block text-[11px] text-slate-500">{r.type}</span>}</td>
                  <td className="max-w-[340px] text-[12.5px] text-slate-700"><span className="line-clamp-2">{r.description}</span></td>
                  <td className="whitespace-nowrap font-mono text-[12px] text-slate-500">{r.reference}</td>
                  <td className="whitespace-nowrap text-right tabular-nums text-emerald-700">{r.money_in ? Number(r.money_in).toLocaleString("en-US") : ""}</td>
                  <td className="whitespace-nowrap text-right tabular-nums">{r.money_out ? Number(r.money_out).toLocaleString("en-US") : ""}</td>
                  <td className="whitespace-nowrap text-right font-medium tabular-nums">{Number(r.balance).toLocaleString("en-US")}</td>
                  <td className="whitespace-nowrap text-[12px]">{r.status ? <span className={cn(r.status.startsWith("Reconciled") ? "text-emerald-700" : r.status === "On statement" ? "text-sky-700" : "text-amber-700")}>{r.status}</span> : ""}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-slate-200 font-semibold">
                <td colSpan={4}>Movements · closing balance</td>
                <td className="text-right tabular-nums text-emerald-700">{Number(q.data?.totals.money_in || 0).toLocaleString("en-US")}</td>
                <td className="text-right tabular-nums">{Number(q.data?.totals.money_out || 0).toLocaleString("en-US")}</td>
                <td className="text-right tabular-nums">{rows.length ? Number(rows[rows.length - 1].balance).toLocaleString("en-US") : ""}</td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}

function Statements({ account, canDelete, onChanged }: { account: any; canDelete: boolean; onChanged: () => void }) {
  const navigate = useNavigate();
  const [del, setDel] = React.useState<any>(null);
  const [busy, setBusy] = React.useState(false);
  const q = useQuery(["statements", account.id, account.statement_date, account.unmatched_bank], () => pocketbase.collection("bank_statements").getFullList({ filter: `account = "${account.id}"`, sort: "-statement_from", expand: "imported_by" }));
  const rows = (q.data || []) as any[];
  if (q.isLoading) return <ListSkeleton rows={4} />;
  if (!rows.length) return <EmptyState icon={FileSpreadsheet} title="No statement imported" text="The Accountant imports the bank's Excel or CSV statement; lines are matched to the cash book automatically." />;
  return (
    <div className="overflow-x-auto">
      <table className="dnr-grid w-full min-w-[760px]">
        <thead><tr><th>Statement</th><th>Period</th><th className="text-right">Opening</th><th className="text-right">Closing</th><th className="text-right">Lines</th><th>Matched</th><th>Status</th><th /></tr></thead>
        <tbody>
          {rows.map((s) => {
            const pct = s.line_count ? Math.round((s.matched_count / s.line_count) * 100) : 0;
            return (
              <tr key={s.id} className="cursor-pointer hover:bg-slate-50" onClick={() => navigate(`/dashboard/treasury/statements/${s.id}`)}>
                <td className="whitespace-nowrap font-mono text-[12.5px] font-semibold">{s.number}<span className="block font-sans text-[11px] font-normal text-slate-500">{s.file_name}</span></td>
                <td className="whitespace-nowrap text-[12.5px]">{showDay(s.statement_from)} – {showDay(s.statement_to)}</td>
                <td className="whitespace-nowrap text-right tabular-nums">{s.opening_balance.toLocaleString("en-US")}</td>
                <td className="whitespace-nowrap text-right tabular-nums">{s.closing_balance.toLocaleString("en-US")}</td>
                <td className="text-right tabular-nums">{s.line_count}</td>
                <td className="min-w-[140px]">
                  <div className="flex items-center gap-2">
                    <div className="h-1.5 w-20 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-[#2a78d6]" style={{ width: `${pct}%` }} /></div>
                    <span className="text-[12px] tabular-nums text-slate-600">{s.matched_count}/{s.line_count}</span>
                  </div>
                </td>
                <td><StatusBadge status={s.status} map={STATEMENT_STATUS} /></td>
                <td className="text-right">{canDelete && s.status === "imported" && <button type="button" onClick={(e) => { e.stopPropagation(); setDel(s); }} className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600" aria-label={`Delete ${s.number}`}><Trash2 size={14} /></button>}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <Dialog open={Boolean(del)} onOpenChange={(o) => !o && setDel(null)}>
        <DialogContent className="max-w-md bg-white">
          <DialogHeader>
            <DialogTitle>Delete {del?.number}?</DialogTitle>
            <DialogDescription>Its {del?.line_count} lines and their matches are removed, so the file can be imported again (e.g. after fixing the column mapping). Entries recorded from it stay in the cash book.</DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setDel(null)}>Keep</Button>
            <Button variant="danger" disabled={busy} onClick={async () => {
              setBusy(true);
              try {
                await treasuryApi.deleteStatement(del.id);
                toast.success(`${del.number} deleted`);
                setDel(null);
                q.refetch();
                onChanged();
              } catch (e) {
                toast.error(errorMessage(e));
              } finally {
                setBusy(false);
              }
            }}>Delete import</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Reconciliations({ account }: { account: any }) {
  const navigate = useNavigate();
  const q = useQuery(["recs", account.id, account.reconciled_to], () => pocketbase.collection("bank_reconciliations").getFullList({ filter: `account = "${account.id}"`, sort: "-as_of", expand: "prepared_by" }));
  const rows = (q.data || []) as any[];
  if (q.isLoading) return <ListSkeleton rows={4} />;
  if (!rows.length) return <EmptyState icon={Scale} title={account.kind === "bank" ? "No reconciliation yet" : "No cash count yet"} text={account.kind === "bank" ? "The Accountant reconciles the account with the bank statement every month; the DAF approves." : "The Accountant counts the cash with the custodian; the DAF approves."} />;
  return (
    <div className="overflow-x-auto">
      <table className="dnr-grid w-full min-w-[700px]">
        <thead><tr><th>Number</th><th>As of</th><th className="text-right">{account.kind === "bank" ? "Bank" : "Counted"}</th><th className="text-right">Cash book</th><th className="text-right">Items</th><th className="text-right">Difference</th><th>Prepared by</th><th>Status</th></tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="cursor-pointer hover:bg-slate-50" onClick={() => navigate(`/dashboard/treasury/reconciliations/${r.id}`)}>
              <td className="font-mono text-[12.5px] font-semibold">{r.number}</td>
              <td className="whitespace-nowrap text-[12.5px]">{showDay(r.as_of)}</td>
              <td className="whitespace-nowrap text-right tabular-nums">{r.statement_balance.toLocaleString("en-US")}</td>
              <td className="whitespace-nowrap text-right tabular-nums">{r.book_balance.toLocaleString("en-US")}</td>
              <td className="text-right tabular-nums">{r.item_count}</td>
              <td className={cn("whitespace-nowrap text-right tabular-nums", r.difference ? "font-semibold text-red-600" : "text-emerald-700")}>{r.difference.toLocaleString("en-US")}</td>
              <td className="text-[12.5px]">{r.expand?.prepared_by?.name}</td>
              <td><StatusBadge status={r.status} map={REC_STATUS} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
