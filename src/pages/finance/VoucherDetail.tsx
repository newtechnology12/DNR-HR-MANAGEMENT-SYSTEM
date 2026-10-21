/**
 * Payment voucher document: payee and verified bank account, invoices or budget line, withholding tax,
 * approval (DAF → SG above the DAF limit) and execution by the Cashier, with the payments it created.
 */
import * as React from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useQuery } from "react-query";
import { toast } from "sonner";
import { AlertTriangle, Banknote, FileCheck2, Paperclip, Pencil, Printer, Send, ShieldCheck, XCircle } from "lucide-react";
import pocketbase from "@/lib/pocketbase";
import { usePermissions } from "@/context/auth.context";
import { BANK_LABELS, VOUCHER_STATUS, VOUCHER_TYPES, payablesApi } from "@/lib/payables";
import { rwf, showDay } from "@/lib/ims";
import { PAYMENT_METHODS, errorMessage } from "@/lib/procurement";
import { Button } from "@/components/ui/button";
import { EmptyState, ListSkeleton, StatusBadge } from "@/components/enterprise/ui";
import { Chatter, ControlBar, DocumentPage, FieldGrid, Notebook, Sheet, SheetTitle, Totals, toChatter } from "@/components/enterprise/DocumentLayout";
import { ApprovalTracker } from "@/components/enterprise/Approval";
import { DecisionButtons, useApprovalTrail } from "@/components/enterprise/useApprovalTrail";
import { BudgetPanel } from "@/components/budget/BudgetKit";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { inputCls } from "@/components/portal/kit";
import { cn } from "@/utils";

const STEPS = [
  { key: "draft", label: "Draft" },
  { key: "pending_approval", label: "Approval" },
  { key: "approved", label: "To pay" },
  { key: "paid", label: "Paid" },
];

export default function VoucherDetail() {
  const { voucherId } = useParams();
  const navigate = useNavigate();
  const { can } = usePermissions();
  const me = pocketbase.authStore.model as any;
  const [tab, setTab] = React.useState("lines");
  const [paying, setPaying] = React.useState(false);
  const [cancelling, setCancelling] = React.useState(false);
  const [busy, setBusy] = React.useState(false);

  const q = useQuery(["voucher", voucherId], async () => {
    const v: any = await pocketbase.collection("payment_vouchers").getOne(voucherId!, { expand: "supplier,prepared_by,paid_by,approval,budget_line,department,expense_account" });
    const payments = await pocketbase.collection("payments").getFullList({ filter: `voucher = "${voucherId}"`, sort: "created", expand: "invoice,paid_by" }).catch(() => [] as any[]);
    return { v, payments };
  });
  const trail = useApprovalTrail("payment_voucher", "payment_vouchers", voucherId);
  const refresh = () => {
    q.refetch();
    trail.refresh();
  };

  async function submit() {
    setBusy(true);
    try {
      await payablesApi.action(voucherId!, "submit");
      toast.success("Sent for approval");
      refresh();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  if (q.isLoading) return <div className="p-6"><ListSkeleton rows={8} /></div>;
  if (!q.data) return <div className="p-6"><EmptyState icon={FileCheck2} title="Voucher not available" text="It may be outside what your role can see." /></div>;
  const { v, payments } = q.data;
  const editable = can("manage_payment_vouchers") && ["draft", "returned"].includes(v.status);
  const lines: any[] = v.lines || [];
  const bank = v.payee_bank || {};
  const preparedByMe = v.prepared_by === me?.id;
  const cancellable = (can("manage_payment_vouchers") || can("approve_payment_vouchers")) && ["draft", "returned", "pending_approval", "approved"].includes(v.status);
  const overdue = v.status === "approved" && v.due_date && String(v.due_date).slice(0, 10) < new Date().toISOString().slice(0, 10);

  return (
    <DocumentPage chatter={<Chatter items={toChatter(trail.actions, trail.audit)} />}>
      <ControlBar
        breadcrumbs={[{ title: "Payables", link: "/dashboard/finance/invoices" }, { title: "Payment vouchers", link: "/dashboard/finance/vouchers" }, { title: v.number }]}
        steps={STEPS}
        current={v.status === "returned" ? "draft" : ["rejected", "cancelled"].includes(v.status) ? "draft" : v.status}
        actions={
          <>
            {editable && <Button size="sm" onClick={submit} disabled={busy}><Send size={14} /> Submit for approval</Button>}
            {editable && <Button size="sm" variant="outline" onClick={() => navigate(`/dashboard/finance/vouchers/${v.id}/edit`)}><Pencil size={14} /> Edit</Button>}
            <DecisionButtons approval={v.expand?.approval} number={v.number} onDone={refresh} />
            {v.status === "approved" && can("record_payments") && (
              <Button size="sm" onClick={() => setPaying(true)} disabled={preparedByMe} title={preparedByMe ? "You prepared this voucher; someone else must execute it." : undefined}><Banknote size={14} /> Execute payment</Button>
            )}
            <Button size="sm" variant="outline" onClick={() => window.print()}><Printer size={14} /> Print</Button>
            {cancellable && <Button size="sm" variant="ghost" className="text-red-700" onClick={() => setCancelling(true)}><XCircle size={14} /> Cancel</Button>}
          </>
        }
      />
      {overdue && <div className="flex items-center gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2.5 text-[13px] text-red-800"><AlertTriangle size={15} /> Payment was due on {showDay(v.due_date)}.</div>}
      {v.voucher_type === "direct" && v.budget_line && !["cancelled", "rejected"].includes(v.status) && (
        <BudgetPanel documentType="payment_voucher" documentId={v.id} number={v.number} lineId={v.budget_line} amount={["draft", "returned", "pending_approval"].includes(v.status) ? v.gross_amount : 0} overrideId={v.budget_override} allowOverride={["draft", "returned"].includes(v.status)} onDone={refresh} />
      )}
      <Sheet ribbon={v.status === "paid" ? { label: "Paid", tone: "success" } : v.status === "rejected" ? { label: "Rejected", tone: "danger" } : v.status === "cancelled" ? { label: "Cancelled", tone: "neutral" } : v.status === "returned" ? { label: "Returned", tone: "warning" } : undefined}>
        <SheetTitle kicker={`Payment voucher · ${VOUCHER_TYPES[v.voucher_type]?.label || ""}`} title={v.number} badges={<StatusBadge status={v.status} map={VOUCHER_STATUS} />} />
        <FieldGrid
          left={[
            { label: "Payee", value: v.supplier ? <Link className="text-primaryDark hover:underline" to={`/dashboard/procurement/suppliers/${v.supplier}`}>{v.payee_name}</Link> : v.payee_name, hint: v.expand?.supplier?.tin ? `TIN ${v.expand.supplier.tin}` : undefined },
            { label: "Paid to account", value: bank.bank_account_number ? <span><span className="font-mono">{bank.bank_account_number}</span> · {bank.bank_name}{bank.bank_branch ? `, ${bank.bank_branch}` : ""}</span> : "No bank account on file", hint: bank.bank_account_name || undefined },
            { label: "What is paid", value: v.description },
            { label: "Department", value: v.expand?.department?.name },
          ]}
          right={[
            { label: "Prepared by", value: v.expand?.prepared_by?.name, hint: showDay(v.created) },
            { label: "Pay by", value: v.due_date ? showDay(v.due_date) : "" },
            { label: "Paid", value: v.status === "paid" ? `${showDay(v.payment_date)} · ${PAYMENT_METHODS[v.payment_method] || v.payment_method} ${v.payment_reference}` : "", hint: v.expand?.paid_by ? `by ${v.expand.paid_by.name}` : undefined },
            { label: "Notes", value: v.notes },
          ]}
        />
        <Notebook
          tabs={[
            { key: "lines", label: v.voucher_type === "invoice" ? "Invoices" : "Expense", count: v.voucher_type === "invoice" ? lines.length : undefined },
            { key: "payments", label: "Payments", count: payments.length },
            { key: "documents", label: "Documents", count: (v.attachments || []).length },
            { key: "approval", label: "Approval" },
          ]}
          active={tab}
          onChange={setTab}
        />
        <div className="pt-4">
          {tab === "lines" && (
            <>
              {v.voucher_type === "invoice" ? (
                <div className="overflow-x-auto">
                  <table className="dnr-grid w-full min-w-[720px]">
                    <thead><tr><th>Invoice</th><th>Invoice date</th><th>Due</th><th className="text-right">Invoice total</th><th className="text-right">Paid by this voucher</th><th className="text-right">Taxable (before VAT)</th></tr></thead>
                    <tbody>
                      {lines.map((l) => (
                        <tr key={l.invoice}>
                          <td><Link to={`/dashboard/finance/invoices/${l.invoice}`} className="font-mono text-[12.5px] font-semibold text-primaryDark hover:underline">{l.number}</Link><span className="block text-[12px] text-slate-500">Supplier ref. {l.supplier_invoice_number}</span></td>
                          <td className="text-[12.5px] text-slate-600">{showDay(l.invoice_date)}</td>
                          <td className="text-[12.5px] text-slate-600">{l.due_date ? showDay(l.due_date) : "—"}</td>
                          <td className="text-right tabular-nums text-slate-600">{rwf(l.total)}</td>
                          <td className="text-right font-medium tabular-nums">{rwf(l.amount)}</td>
                          <td className="text-right tabular-nums text-slate-600">{rwf(l.base)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <dl className="grid grid-cols-1 gap-3 rounded-md border border-slate-200 p-3 text-[13px] sm:grid-cols-3">
                  <div><dt className="text-[12px] text-slate-500">Budget line</dt><dd className="font-mono font-semibold">{v.expand?.budget_line?.code || "—"}</dd></div>
                  <div><dt className="text-[12px] text-slate-500">Expense account</dt><dd>{v.expand?.expense_account ? `${v.expand.expense_account.code} — ${v.expand.expense_account.name}` : "—"}</dd></div>
                  <div><dt className="text-[12px] text-slate-500">Charged to the budget</dt><dd className="tabular-nums">{v.actual_amount ? rwf(v.actual_amount) : "On approval"}</dd></div>
                </dl>
              )}
              <Totals
                rows={[["Gross amount", rwf(v.gross_amount)], [`Withholding tax${v.wht_code ? ` (${v.wht_code}, ${v.wht_rate}% of ${rwf(v.wht_base)})` : ""}`, v.wht_amount ? `− ${rwf(v.wht_amount)}` : "—"]]}
                total={["Net to the payee", rwf(v.net_amount)]}
              />
            </>
          )}
          {tab === "payments" && (
            !payments.length ? <EmptyState icon={Banknote} text={v.status === "approved" ? "Approved — waiting for the Cashier." : "Payments appear here once the voucher is executed."} /> : (
              <div className="overflow-x-auto">
                <table className="dnr-grid w-full min-w-[720px]">
                  <thead><tr><th>Payment</th><th>Date</th><th>Invoice</th><th>Method / reference</th><th className="text-right">Gross</th><th className="text-right">Tax withheld</th><th className="text-right">Net paid</th><th>Paid by</th></tr></thead>
                  <tbody>
                    {payments.map((p: any) => (
                      <tr key={p.id}>
                        <td className="font-mono text-[12.5px] font-semibold">{p.number}</td>
                        <td className="text-[12.5px]">{showDay(p.payment_date)}</td>
                        <td className="text-[12.5px]">{p.expand?.invoice?.number || "—"}</td>
                        <td className="text-[12.5px]">{PAYMENT_METHODS[p.method] || p.method} {p.reference}</td>
                        <td className="text-right tabular-nums">{rwf(p.amount)}</td>
                        <td className="text-right tabular-nums text-slate-600">{p.wht_amount ? rwf(p.wht_amount) : "—"}</td>
                        <td className="text-right font-medium tabular-nums">{rwf(p.net_amount || p.amount)}</td>
                        <td className="text-[12.5px]">{p.expand?.paid_by?.name}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          )}
          {tab === "documents" && (
            !(v.attachments || []).length ? <EmptyState icon={Paperclip} text={editable ? "Add supporting documents with Edit." : "No supporting documents attached."} /> : (
              <ul className="divide-y divide-slate-100 rounded-md border border-slate-200 text-[13px]">
                {(v.attachments || []).map((f: string) => (
                  <li key={f} className="flex items-center justify-between gap-2 px-3 py-2.5">
                    <span className="flex min-w-0 items-center gap-2"><Paperclip size={14} className="shrink-0 text-slate-400" /><span className="truncate">{f}</span></span>
                    <a href={pocketbase.files.getUrl(v, f)} target="_blank" rel="noreferrer" className="shrink-0 text-[12.5px] font-medium text-primaryDark hover:underline">Open</a>
                  </li>
                ))}
              </ul>
            )
          )}
          {tab === "approval" && <ApprovalTracker approval={v.expand?.approval} actions={trail.actions} />}
        </div>
      </Sheet>
      {paying && <PayDialog v={v} onClose={() => setPaying(false)} onDone={() => { setPaying(false); refresh(); }} />}
      {cancelling && <CancelDialog v={v} onClose={() => setCancelling(false)} onDone={() => { setCancelling(false); refresh(); }} />}
    </DocumentPage>
  );
}

function PayDialog({ v, onClose, onDone }: { v: any; onClose: () => void; onDone: () => void }) {
  const [method, setMethod] = React.useState(v.payee_bank?.bank_account_number ? "bank_transfer" : "cheque");
  const [reference, setReference] = React.useState("");
  const [date, setDate] = React.useState(new Date().toISOString().slice(0, 10));
  const [busy, setBusy] = React.useState(false);
  const needsRef = method === "bank_transfer" || method === "cheque";
  async function run() {
    setBusy(true);
    try {
      const r = await payablesApi.action(v.id, "pay", { method, reference: reference.trim(), payment_date: `${date} 12:00:00.000Z` });
      toast.success(`${v.number} paid — ${(r.payments || []).join(", ")}`);
      onDone();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md bg-white">
        <DialogHeader>
          <DialogTitle>Execute payment · {v.number}</DialogTitle>
          <DialogDescription>Pay {rwf(v.net_amount)} to {v.payee_name}{v.wht_amount ? `; ${rwf(v.wht_amount)} withholding tax is kept for RRA` : ""}.</DialogDescription>
        </DialogHeader>
        <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-[12.5px]">
          <p className="mb-1 flex items-center gap-1.5 font-medium text-slate-700"><ShieldCheck size={14} className="text-emerald-600" /> Account approved on this voucher</p>
          {BANK_LABELS.filter(([k]) => v.payee_bank?.[k]).map(([k, label]) => <p key={k} className="text-slate-600">{label}: <span className={cn(k === "bank_account_number" && "font-mono")}>{v.payee_bank[k]}</span></p>)}
          {!v.payee_bank?.bank_account_number && <p className="text-amber-800">No bank account on file — pay by cheque or cash.</p>}
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="block text-[12.5px] font-medium text-slate-700">Method<select className={cn(inputCls, "mt-1")} value={method} onChange={(e) => setMethod(e.target.value)}>{Object.entries(PAYMENT_METHODS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
          <label className="block text-[12.5px] font-medium text-slate-700">Payment date<input type="date" className={cn(inputCls, "mt-1")} value={date} max={new Date().toISOString().slice(0, 10)} onChange={(e) => setDate(e.target.value)} /></label>
          <label className="block text-[12.5px] font-medium text-slate-700 sm:col-span-2">{method === "cheque" ? "Cheque number" : "Bank / transaction reference"}{needsRef && <span className="text-red-600"> *</span>}<input className={cn(inputCls, "mt-1")} value={reference} onChange={(e) => setReference(e.target.value)} placeholder={method === "cheque" ? "e.g. 004512" : "e.g. BK-TRF-2026-10-0412"} /></label>
        </div>
        <p className="text-[12px] text-slate-500">Separation of duties: whoever prepared or approved this voucher cannot execute it. The supplier's verified bank details must not have changed since it was prepared.</p>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={run} disabled={busy || (needsRef && reference.trim().length < 3)}><Banknote size={14} /> {busy ? "Paying…" : `Confirm payment of ${rwf(v.net_amount)}`}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CancelDialog({ v, onClose, onDone }: { v: any; onClose: () => void; onDone: () => void }) {
  const [reason, setReason] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  async function run() {
    setBusy(true);
    try {
      await payablesApi.action(v.id, "cancel", { reason: reason.trim() });
      toast.success(`${v.number} cancelled`);
      onDone();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md bg-white">
        <DialogHeader>
          <DialogTitle>Cancel {v.number}?</DialogTitle>
          <DialogDescription>{v.actual_amount ? "The amount charged to the budget line is reversed. " : ""}The invoices become free to pay on another voucher.</DialogDescription>
        </DialogHeader>
        <textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason" className="h-20 w-full rounded-md border border-slate-200 px-3 py-2 text-[13px] outline-none focus:border-primary" />
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose}>Keep</Button>
          <Button variant="danger" disabled={!reason.trim() || busy} onClick={run}>Cancel voucher</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
