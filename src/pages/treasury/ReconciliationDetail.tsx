/**
 * Bank reconciliation statement (or cash count): balances on both sides, every reconciling item with its
 * age and follow-up, the DAF's approval, and an Excel / PDF export with the RALGA header. While it is being
 * prepared the figures are recalculated each time it is opened.
 */
import * as React from "react";
import { Link, useParams } from "react-router-dom";
import { useQuery } from "react-query";
import { toast } from "sonner";
import { AlertTriangle, Link2, Pencil, Scale, Send, XCircle } from "lucide-react";
import pocketbase from "@/lib/pocketbase";
import { usePermissions } from "@/context/auth.context";
import { FOLLOW_UP, PERMS, REC_STATUS, RecItem, treasuryApi } from "@/lib/treasury";
import { rwf, showDay } from "@/lib/ims";
import { errorMessage } from "@/lib/procurement";
import { exportReport } from "@/lib/exporter";
import { Button } from "@/components/ui/button";
import { Badge, EmptyState, ListSkeleton, StatusBadge } from "@/components/enterprise/ui";
import { Chatter, ControlBar, DocumentPage, Notebook, Sheet, SheetTitle, toChatter } from "@/components/enterprise/DocumentLayout";
import { ApprovalTracker } from "@/components/enterprise/Approval";
import { DecisionButtons, useApprovalTrail } from "@/components/enterprise/useApprovalTrail";
import DocumentUploads from "@/components/enterprise/Attachments";
import ExportMenu from "@/components/enterprise/ExportMenu";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, inputCls, textareaCls } from "@/components/portal/kit";
import { MoneyInput, ReasonDialog } from "@/components/treasury/TreasuryKit";
import { cn } from "@/utils";

const STEPS = [{ key: "draft", label: "Prepared" }, { key: "pending_approval", label: "DAF approval" }, { key: "approved", label: "Approved" }];
const SECTIONS: { side: "book" | "bank"; direction: "in" | "out"; title: string; sign: "+" | "−" }[] = [
  { side: "book", direction: "in", title: "Receipts not yet on the statement (deposits in transit)", sign: "+" },
  { side: "book", direction: "out", title: "Payments not yet on the statement (unpresented)", sign: "−" },
  { side: "bank", direction: "in", title: "Bank credits not in the cash book", sign: "+" },
  { side: "bank", direction: "out", title: "Bank debits not in the cash book", sign: "−" },
];
const sourceLink = (i: RecItem) => (i.source_type === "cash_receipt" ? `/dashboard/treasury/receipts/${i.source_id}` : i.source_type === "bank_transfer" ? `/dashboard/treasury/transfers/${i.source_id}` : i.source_type === "payment_voucher" ? `/dashboard/finance/vouchers/${i.source_id}` : "");

export default function ReconciliationDetail() {
  const { recId } = useParams();
  const { can } = usePermissions();
  const [tab, setTab] = React.useState("statement");
  const [editing, setEditing] = React.useState(false);
  const [cancelling, setCancelling] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const canPrepare = can("prepare_bank_reconciliation");
  const q = useQuery(["reconciliation", recId], async () => {
    let r: any = await pocketbase.collection("bank_reconciliations").getOne(recId!, { expand: "account,prepared_by,approval,period" });
    if (["draft", "returned"].includes(r.status) && canPrepare) {
      await treasuryApi.rec(r.id, "refresh").catch(() => null);
      r = await pocketbase.collection("bank_reconciliations").getOne(recId!, { expand: "account,prepared_by,approval,period" });
    }
    return r;
  });
  const trail = useApprovalTrail("bank_reconciliation", "bank_reconciliations", recId);
  const refresh = () => {
    q.refetch();
    trail.refresh();
  };
  if (q.isLoading) return <div className="p-6"><ListSkeleton rows={8} /></div>;
  const r: any = q.data;
  if (!r) return <div className="p-6"><EmptyState icon={Scale} title="Reconciliation not found" text="It may be outside what your role can see." /></div>;
  const a = r.expand?.account || {};
  const cash = a.kind === "cash";
  const items: RecItem[] = r.items || [];
  const editable = ["draft", "returned"].includes(r.status);
  const open = ["draft", "pending_approval", "returned"].includes(r.status);
  const missing = items.filter((i) => !i.follow_up && !i.matched_later).length;

  async function submit() {
    setBusy(true);
    try {
      await treasuryApi.rec(r.id, "submit");
      toast.success("Sent to the DAF for approval");
      refresh();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  const doExport = (format: "xlsx" | "pdf" | "csv") => {
    const rows: any[] = [];
    const head = (label: string, amount: number | null, bold = true) => rows.push({ section: label, date: "", description: "", reference: "", amount, follow: "", bold });
    if (cash) {
      head("Cash counted", r.statement_balance);
      head("Balance in the cash book", r.book_balance);
      head("Difference", r.difference);
    } else {
      head("Balance on the bank statement", r.statement_balance);
      for (const s of SECTIONS.slice(0, 2)) {
        head(`${s.sign === "+" ? "Add" : "Less"}: ${s.title}`, items.filter((i) => i.side === s.side && i.direction === s.direction).reduce((t, i) => t + i.amount, 0));
        for (const i of items.filter((x) => x.side === s.side && x.direction === s.direction)) rows.push({ section: "", date: i.date, description: [i.counterparty, i.description].filter(Boolean).join(" · "), reference: i.reference || i.source_number, amount: i.amount, follow: FOLLOW_UP[i.follow_up]?.label || "" });
      }
      head("Adjusted bank balance", r.adjusted_bank_balance);
      head("Balance in the cash book", r.book_balance);
      for (const s of SECTIONS.slice(2)) {
        head(`${s.sign === "+" ? "Add" : "Less"}: ${s.title}`, items.filter((i) => i.side === s.side && i.direction === s.direction).reduce((t, i) => t + i.amount, 0));
        for (const i of items.filter((x) => x.side === s.side && x.direction === s.direction)) rows.push({ section: "", date: i.date, description: i.description, reference: i.reference, amount: i.amount, follow: FOLLOW_UP[i.follow_up]?.label || "" });
      }
      head("Adjusted cash book balance", r.adjusted_book_balance);
      head("Difference", r.difference);
    }
    exportReport({
      title: `${cash ? "Cash count" : "Bank reconciliation statement"} — ${a.code} ${a.name}`,
      subtitle: `${r.number} · as of ${showDay(r.as_of)} · ${REC_STATUS[r.status]?.label || r.status} · prepared by ${r.expand?.prepared_by?.name || "—"}${r.approved_at ? ` · approved ${showDay(r.approved_at)}` : ""}`,
      rows, format, what: `treasury:reconciliation:${r.number}`, orientation: "portrait",
      columns: [
        { header: "Item", value: (x: any) => x.section, width: 40 },
        { header: "Date", value: (x: any) => x.date, format: "date", width: 11 },
        { header: "Description", value: (x: any) => x.description, width: 34 },
        { header: "Reference", value: (x: any) => x.reference, width: 16 },
        { header: "Amount (RWF)", value: (x: any) => x.amount, format: "money", width: 16 },
        { header: "Follow-up", value: (x: any) => x.follow, width: 16 },
      ],
    });
  };

  return (
    <DocumentPage chatter={<Chatter items={toChatter(trail.actions, trail.audit)} />}>
      <ControlBar
        breadcrumbs={[{ title: "Bank & cash", link: "/dashboard/treasury" }, { title: "Reconciliations", link: "/dashboard/treasury/reconciliations" }, { title: r.number }]}
        steps={STEPS}
        current={r.status === "returned" ? "draft" : r.status}
        actions={
          <>
            {editable && canPrepare && <Button size="sm" onClick={submit} disabled={busy}><Send size={14} /> Send to the DAF</Button>}
            {editable && canPrepare && !cash && <Button size="sm" variant="outline" asChild><Link to={`/dashboard/treasury/reconcile/${a.id}`}><Link2 size={14} /> Match items</Link></Button>}
            {editable && canPrepare && <Button size="sm" variant="outline" onClick={() => setEditing(true)}><Pencil size={14} /> {cash ? "Change count" : "Statement balance"}</Button>}
            <DecisionButtons approval={r.expand?.approval} number={r.number} onDone={refresh} />
            <ExportMenu onExport={doExport} permission={PERMS.export} />
            {open && can(["prepare_bank_reconciliation", "approve_bank_reconciliation"]) && <Button size="sm" variant="ghost" className="text-red-700" onClick={() => setCancelling(true)}><XCircle size={14} /> Cancel</Button>}
          </>
        }
      />
      <Sheet ribbon={r.status === "approved" ? { label: "Approved", tone: "success" } : r.status === "rejected" ? { label: "Rejected", tone: "danger" } : r.status === "cancelled" ? { label: "Cancelled", tone: "neutral" } : undefined}>
        <SheetTitle kicker={cash ? "Cash count" : "Bank reconciliation statement"} title={r.number} badges={<StatusBadge status={r.status} map={REC_STATUS} />} />
        <p className="-mt-4 mb-5 text-[13px] text-slate-600">
          <Link to={`/dashboard/treasury/accounts/${a.id}`} className="font-medium text-primaryDark hover:underline">{a.code} · {a.name}</Link>
          {a.bank_name ? ` · ${a.bank_name} ${a.account_number}` : ""} · as of <span className="font-medium text-slate-900">{showDay(r.as_of)}</span>
          {r.expand?.period?.name ? ` · ${r.expand.period.name}` : ""} · prepared by {r.expand?.prepared_by?.name || "—"}
        </p>
        {(r.warnings || []).map((t: string) => <p key={t} className="mb-2 flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[12.5px] text-amber-900"><AlertTriangle size={14} className="mt-0.5 shrink-0" /> {t}</p>)}
        {editable && missing > 0 && <p className="mb-2 flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[12.5px] text-amber-900"><AlertTriangle size={14} className="mt-0.5 shrink-0" /> {missing} reconciling item{missing === 1 ? " has" : "s have"} no follow-up yet — set it on the matching screen before sending to the DAF.</p>}
        <Notebook tabs={[{ key: "statement", label: "Statement", count: items.length }, { key: "documents", label: "Documents", count: (r.attachments || []).length }, { key: "approval", label: "Approval" }]} active={tab} onChange={setTab} />
        <div className="pt-4">
          {tab === "statement" && (cash ? (
            <div className="max-w-md space-y-1">
              <Line label="Cash counted" value={r.statement_balance} />
              <Line label="Balance in the cash book" value={r.book_balance} />
              <Line label="Difference" value={r.difference} total ok={r.difference === 0} />
              {r.notes && <p className="pt-3 text-[12.5px] text-slate-600">{r.notes}</p>}
            </div>
          ) : (
            <div className="space-y-6">
              <div className="grid gap-6 lg:grid-cols-2">
                <div className="space-y-1">
                  <Line label="Balance on the bank statement" value={r.statement_balance} hint={r.statement_balance !== r.statement_balance_computed ? `imported lines: ${r.statement_balance_computed.toLocaleString("en-US")}` : undefined} />
                  <Line label="Add: receipts not yet on the statement" value={r.outstanding_receipts} sign="+" />
                  <Line label="Less: payments not yet on the statement" value={r.outstanding_payments} sign="−" />
                  <Line label="Adjusted bank balance" value={r.adjusted_bank_balance} total />
                </div>
                <div className="space-y-1">
                  <Line label="Balance in the cash book" value={r.book_balance} />
                  <Line label="Add: bank credits not in the cash book" value={r.unrecorded_receipts} sign="+" />
                  <Line label="Less: bank debits not in the cash book" value={r.unrecorded_payments} sign="−" />
                  <Line label="Adjusted cash book balance" value={r.adjusted_book_balance} total />
                </div>
              </div>
              <div className={cn("flex items-center justify-between rounded-lg px-4 py-3", r.difference === 0 ? "bg-emerald-50" : "bg-red-50")}>
                <span className="text-[13.5px] font-semibold text-slate-900">Difference</span>
                <span className={cn("text-[20px] font-semibold tabular-nums", r.difference === 0 ? "text-emerald-700" : "text-red-600")}>{rwf(r.difference)}</span>
              </div>
              {SECTIONS.map((s) => {
                const list = items.filter((i) => i.side === s.side && i.direction === s.direction);
                if (!list.length) return null;
                return (
                  <div key={s.title}>
                    <h4 className="mb-1.5 flex items-center justify-between text-[13px] font-semibold text-slate-800"><span>{s.title}</span><span className="tabular-nums">{s.sign} {list.reduce((t, i) => t + i.amount, 0).toLocaleString("en-US")}</span></h4>
                    <div className="overflow-x-auto rounded-md border border-slate-100">
                      <table className="dnr-grid w-full min-w-[760px]">
                        <thead><tr><th>Date</th><th>Description</th><th>Reference</th><th className="text-right">Amount</th><th className="text-right">Days</th><th>Follow-up</th></tr></thead>
                        <tbody>
                          {list.map((i) => (
                            <tr key={i.id}>
                              <td className="whitespace-nowrap text-[12.5px]">{showDay(i.date)}</td>
                              <td className="max-w-[320px] text-[12.5px]">
                                {sourceLink(i) ? <Link to={sourceLink(i)} className="font-mono text-primaryDark hover:underline">{i.source_number}</Link> : null}
                                <span className="line-clamp-2">{[i.counterparty, i.description].filter(Boolean).join(" · ")}</span>
                              </td>
                              <td className="whitespace-nowrap font-mono text-[12px] text-slate-500">{i.reference}</td>
                              <td className="whitespace-nowrap text-right tabular-nums">{i.amount.toLocaleString("en-US")}</td>
                              <td className="text-right tabular-nums">{i.age}{i.stale && <Badge tone="danger" className="ml-1.5">Stale cheque</Badge>}</td>
                              <td className="min-w-[160px] text-[12.5px]">{i.follow_up ? <Badge tone={FOLLOW_UP[i.follow_up]?.tone}>{FOLLOW_UP[i.follow_up]?.label}</Badge> : i.matched_later ? <Badge tone="info">Timing difference</Badge> : <Badge tone="warning">Not reviewed</Badge>}{i.follow_up_note && <span className="mt-0.5 block text-[11.5px] text-slate-500">{i.follow_up_note}</span>}{i.matched_later && <span className="mt-0.5 block text-[11.5px] text-sky-700">Cleared after this date</span>}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                );
              })}
              {!items.length && <p className="text-[12.5px] text-slate-500">No reconciling items: the statement and the cash book agree line by line.</p>}
              {r.notes && <p className="text-[12.5px] text-slate-600"><span className="font-medium">Notes:</span> {r.notes}</p>}
            </div>
          ))}
          {tab === "documents" && <DocumentUploads collection="bank_reconciliations" record={r} canAdd={can(["prepare_bank_reconciliation", "approve_bank_reconciliation"])} canRemove={editable && canPrepare} onChange={refresh} hint={cash ? "The signed cash count sheet" : "The bank statement page, confirmations from the bank"} />}
          {tab === "approval" && <ApprovalTracker approval={r.expand?.approval} actions={trail.actions} />}
        </div>
      </Sheet>
      {editing && <EditDialog r={r} cash={cash} onClose={() => setEditing(false)} onDone={() => { setEditing(false); refresh(); }} />}
      <ReasonDialog
        open={cancelling}
        title={`Cancel ${r.number}?`}
        description="The matches stay; a new reconciliation can be prepared for the account."
        confirmLabel="Cancel reconciliation"
        onClose={() => setCancelling(false)}
        onConfirm={async (reason) => {
          try {
            await treasuryApi.rec(r.id, "cancel", { reason });
            toast.success(`${r.number} cancelled`);
            setCancelling(false);
            refresh();
          } catch (e) {
            toast.error(errorMessage(e));
          }
        }}
      />
    </DocumentPage>
  );
}

function Line({ label, value, sign, total, hint, ok }: { label: string; value: number; sign?: "+" | "−"; total?: boolean; hint?: string; ok?: boolean }) {
  return (
    <div className={cn("flex items-baseline justify-between gap-3 py-1 text-[13.5px]", total && "border-t-2 border-slate-200 pt-2 font-semibold")}>
      <span className={total ? "text-slate-900" : "text-slate-600"}>{sign && <span className="mr-1 inline-block w-3 text-slate-400">{sign}</span>}{label}{hint && <span className="block pl-4 text-[11.5px] font-normal text-amber-700">{hint}</span>}</span>
      <span className={cn("tabular-nums", ok === true ? "text-emerald-700" : ok === false ? "text-red-600" : "text-slate-900")}>{Number(value || 0).toLocaleString("en-US")}</span>
    </div>
  );
}

function EditDialog({ r, cash, onClose, onDone }: { r: any; cash: boolean; onClose: () => void; onDone: () => void }) {
  const [asOf, setAsOf] = React.useState(String(r.as_of).slice(0, 10));
  const [balance, setBalance] = React.useState<number | "">(r.statement_balance);
  const [notes, setNotes] = React.useState(r.notes || "");
  const [busy, setBusy] = React.useState(false);
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg bg-white">
        <DialogHeader>
          <DialogTitle>{r.number}</DialogTitle>
          <DialogDescription>The figures are recalculated when you save.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="As of" htmlFor="ed-date"><input id="ed-date" type="date" className={inputCls} value={asOf} max={new Date().toISOString().slice(0, 10)} onChange={(e) => setAsOf(e.target.value)} /></Field>
          <Field label={cash ? "Cash counted" : "Balance printed on the statement"} htmlFor="ed-bal"><MoneyInput id="ed-bal" value={balance} onChange={setBalance} /></Field>
          <Field label="Notes" className="sm:col-span-2" htmlFor="ed-notes"><textarea id="ed-notes" className={cn(textareaCls, "min-h-[60px]")} value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button disabled={busy || balance === "" || !asOf} onClick={async () => {
            setBusy(true);
            try {
              await pocketbase.collection("bank_reconciliations").update(r.id, { as_of: `${asOf} 12:00:00.000Z`, statement_balance: Number(balance), notes: notes.trim() });
              toast.success("Saved");
              onDone();
            } catch (e) {
              toast.error(errorMessage(e));
            } finally {
              setBusy(false);
            }
          }}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
