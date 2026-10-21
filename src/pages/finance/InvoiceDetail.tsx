import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "react-query";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { format, isPast } from "date-fns";
import { toast } from "sonner";
import { AlertTriangle, ArrowUpRight, Ban, Banknote, Check, CheckCircle2, Clock, CornerUpLeft, FileText, MessageSquare, Send, ShieldAlert, ShieldCheck, ShoppingCart, UserPlus, XCircle } from "lucide-react";
import pocketbase from "@/lib/pocketbase";
import { useRoles } from "@/context/roles.context";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/utils";
import { EmptyState, Panel, StatusBadge } from "@/components/enterprise/ui";
import { ActionDialog, ActionKind, ApprovalTracker } from "@/components/enterprise/Approval";
import { Chatter, ControlBar, DocumentPage, FieldGrid, Notebook, Sheet, SheetTitle, SmartButtons, Totals, toChatter } from "@/components/enterprise/DocumentLayout";
import { INVOICE_STATUS, PAYMENT_METHODS, PO_STATUS, errorMessage, financeApi, money, procurementApi } from "@/lib/procurement";

const TABS = ["lines", "payments", "approval"] as const;
const STEPS = [
  { key: "received", label: "Received" },
  { key: "matched", label: "Matched" },
  { key: "pending_approval", label: "To approve" },
  { key: "approved", label: "To pay" },
  { key: "paid", label: "Paid" },
];
const stepOf = (s: string) => (s === "exception" || s === "returned" ? "received" : s === "partially_paid" ? "approved" : ["rejected", "cancelled"].includes(s) ? "received" : s);
const dateOf = (v?: string, f = "d MMM yyyy") => (v ? format(new Date(v), f) : "");
const th = "px-3 py-2";

export default function InvoiceDetail() {
  const { invoiceId } = useParams();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const tab = (params.get("tab") as (typeof TABS)[number]) || "lines";
  const setTab = (t: string) => setParams(t === "lines" ? {} : { tab: t });
  const { canPerform } = useRoles();
  const me = pocketbase.authStore.model as any;
  const [decision, setDecision] = React.useState<ActionKind | null>(null);
  const [resolving, setResolving] = React.useState(false);

  const q = useQuery(["supplier_invoice", invoiceId], async () => {
    const inv = await pocketbase.collection("supplier_invoices").getOne(invoiceId!, { expand: "supplier,purchase_order,department,recorded_by,resolved_by,approval" });
    const [payments, actions, audit] = await Promise.all([
      pocketbase.collection("payments").getFullList({ filter: `invoice = "${invoiceId}"`, sort: "-payment_date", expand: "paid_by,voucher" }).catch(() => [] as any[]),
      pocketbase.collection("approval_actions").getFullList({ filter: `document_type = "supplier_invoice" && document_id = "${invoiceId}"`, sort: "created", expand: "actor,target_user" }),
      procurementApi.audit({ collection: "supplier_invoices", record: invoiceId, perPage: 100 }).then((r) => r.items).catch(() => []),
    ]);
    return { inv, payments, actions, audit };
  });
  const refresh = () => {
    queryClient.invalidateQueries(["supplier_invoice", invoiceId]);
    queryClient.invalidateQueries(["record-table"]);
    queryClient.invalidateQueries(["notifications"]);
  };

  const inv: any = q.data?.inv;
  if (q.isLoading) return <div className="space-y-4 px-4 py-4 sm:px-6"><Skeleton className="h-12 w-80" /><Skeleton className="h-[480px] w-full" /></div>;
  if (!inv) return <div className="px-4 py-4 sm:px-6"><Panel><EmptyState icon={FileText} title="Vendor bill not available" text="It may be outside what your role can see." /></Panel></div>;

  const { payments, actions, audit } = q.data!;
  const po = inv.expand?.purchase_order;
  const approval = inv.expand?.approval;
  const isApprover = approval?.status === "pending" && (approval.pending_approvers || "").split(",").includes(me?.id);
  const issues: string[] = inv.match_result?.issues || [];
  const lines: any[] = inv.items || [];
  const overdue = inv.balance > 0 && ["approved", "partially_paid"].includes(inv.status) && inv.due_date && isPast(new Date(inv.due_date));
  const ribbon =
    inv.status === "paid" ? { label: "Paid", tone: "success" as const }
    : inv.status === "cancelled" ? { label: "Cancelled", tone: "neutral" as const }
    : inv.status === "rejected" ? { label: "Rejected", tone: "danger" as const }
    : inv.status === "partially_paid" ? { label: "Partial", tone: "warning" as const }
    : undefined;

  const actionsBar = (
    <>
      {isApprover && (
        <>
          <Button size="sm" onClick={() => setDecision("approve")}><Check size={14} /> Approve</Button>
          <Button size="sm" variant="outline" onClick={() => setDecision("return")}><CornerUpLeft size={14} /> Send back</Button>
          <Button size="sm" variant="outline" className="text-red-700" onClick={() => setDecision("reject")}><XCircle size={14} /> Reject</Button>
          <Button size="sm" variant="ghost" onClick={() => setDecision("delegate")}><UserPlus size={14} /> Delegate</Button>
          <Button size="sm" variant="ghost" onClick={() => setDecision("escalate")}><ArrowUpRight size={14} /> Escalate</Button>
        </>
      )}
      {canPerform("resolve_invoice_exceptions") && inv.status === "exception" && <Button size="sm" onClick={() => setResolving(true)}><ShieldAlert size={14} /> Resolve exception</Button>}
      {canPerform("manage_invoices") && ["matched", "returned"].includes(inv.status) && <Button size="sm" onClick={() => setDecision("submit")}><Send size={14} /> Submit for approval</Button>}
      {canPerform("manage_payment_vouchers") && ["approved", "partially_paid"].includes(inv.status) && <Button size="sm" onClick={() => navigate(`/dashboard/finance/vouchers/new?supplier=${inv.supplier}&invoice=${inv.id}`)}><Banknote size={14} /> Prepare payment voucher</Button>}
      {canPerform("manage_invoices") && !["partially_paid", "paid", "cancelled"].includes(inv.status) && <Button size="sm" variant="ghost" onClick={() => setDecision("cancel")}><Ban size={14} /> Cancel</Button>}
      {approval && <Button size="sm" variant="ghost" onClick={() => setDecision("comment")}><MessageSquare size={14} /> Log note</Button>}
    </>
  );

  return (
    <DocumentPage chatter={<Chatter items={toChatter(actions, audit)} />}>
      <ControlBar
        breadcrumbs={[{ title: "Accounts payable", link: "/dashboard/finance/invoices" }, { title: "Vendor bills", link: "/dashboard/finance/invoices" }, { title: inv.number }]}
        actions={actionsBar}
        steps={STEPS}
        current={stepOf(inv.status)}
      />

      {isApprover && (
        <div className="flex items-center gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2.5 text-[13px] text-amber-900">
          <Clock size={15} /> Waiting for your approval at step “{approval.steps?.[approval.current_level]?.name}”.
        </div>
      )}
      {inv.status === "exception" && (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2.5 text-[13px] text-red-800">
          <p className="flex items-center gap-2 font-medium"><AlertTriangle size={15} /> Three-way match exception — this bill cannot be approved until it is corrected or the exception is resolved.</p>
          <ul className="ml-6 mt-1 list-disc space-y-0.5">{issues.map((i) => <li key={i}>{i}</li>)}</ul>
        </div>
      )}
      {inv.match_status === "partial" && (inv.match_result?.warnings || []).length > 0 && (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2.5 text-[13px] text-amber-900">
          <p className="font-medium">Partial match — differences within the configured tolerance (the bill can be approved):</p>
          <ul className="ml-5 mt-1 list-disc space-y-0.5">{inv.match_result.warnings.map((w: string) => <li key={w}>{w}</li>)}</ul>
        </div>
      )}
      {inv.exception_overridden && (
        <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2.5 text-[13px] text-amber-900">
          <ShieldAlert size={15} className="mt-0.5 shrink-0" />
          <span>Exception resolved by <span className="font-medium">{inv.expand?.resolved_by?.name}</span> on {dateOf(inv.resolved_at, "d MMM yyyy, HH:mm")}: “{inv.exception_resolution}”</span>
        </div>
      )}
      {overdue && (
        <div className="flex items-center gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2.5 text-[13px] text-red-800">
          <AlertTriangle size={15} /> Payment was due on {dateOf(inv.due_date)}.
        </div>
      )}

      <SmartButtons
        items={[
          ...(po ? [{ icon: ShoppingCart, label: "Purchase order", value: po.number, onClick: () => navigate(`/dashboard/procurement/purchase-orders/${po.id}`) }] : []),
          { icon: ["matched", "partial"].includes(inv.match_status) ? CheckCircle2 : ShieldAlert, label: "Three-way match", value: inv.match_status === "matched" ? "Matched" : inv.match_status === "partial" ? "Partial match" : inv.exception_overridden ? "Resolved" : `${issues.length} issue${issues.length === 1 ? "" : "s"}`, tone: inv.match_status === "matched" ? "default" : inv.match_status === "partial" || inv.exception_overridden ? "warning" : "danger" },
          { icon: Banknote, label: "Payments", value: payments.length, onClick: () => setTab("payments") },
          ...(approval ? [{ icon: ShieldCheck, label: "Approval", value: approval.status === "pending" ? `Step ${approval.current_level + 1}/${approval.steps?.length || 1}` : approval.status.charAt(0).toUpperCase() + approval.status.slice(1), onClick: () => setTab("approval") }] : []),
        ]}
      />

      <Sheet ribbon={ribbon}>
        <SheetTitle kicker="Vendor bill" title={inv.number} badges={<StatusBadge status={inv.status} map={INVOICE_STATUS} />} />
        <FieldGrid
          left={[
            { label: "Vendor", value: <Link className="font-medium text-primaryDark hover:underline" to={`/dashboard/procurement/suppliers/${inv.supplier}`}>{inv.expand?.supplier?.name}</Link>, hint: inv.expand?.supplier?.tin ? `TIN ${inv.expand.supplier.tin}` : undefined },
            { label: "Bill reference", value: inv.supplier_invoice_number },
            { label: "Purchase order", value: po && <Link className="text-primaryDark hover:underline" to={`/dashboard/procurement/purchase-orders/${po.id}`}>{po.number}</Link>, hint: po ? `${po.title} · ${PO_STATUS[po.status]?.label || po.status}` : undefined },
            { label: "Department", value: inv.expand?.department?.name },
          ]}
          right={[
            { label: "Bill date", value: dateOf(inv.invoice_date) },
            { label: "Due date", value: <span className={cn(overdue && "font-medium text-red-600")}>{dateOf(inv.due_date)}{overdue ? " · overdue" : ""}</span> },
            { label: "Recorded by", value: inv.expand?.recorded_by?.name, hint: dateOf(inv.created, "d MMM yyyy, HH:mm") },
            { label: "Notes", value: inv.notes },
          ]}
        />

        <Notebook
          active={tab}
          onChange={setTab}
          tabs={[
            { key: "lines", label: "Invoice lines & match", count: lines.length },
            { key: "payments", label: "Payments", count: payments.length },
            ...(approval ? [{ key: "approval", label: "Approval" }] : []),
          ]}
        />

        <div className="pt-4">
          {tab === "lines" && (
            <>
              <div className="overflow-x-auto">
                <table className="dnr-grid w-full min-w-[880px] text-[13px]">
                  <thead>
                    <tr className="border-y border-slate-200 bg-slate-50 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                      <th className={th}>Product</th>
                      <th className={cn(th, "text-right")}>Ordered</th><th className={cn(th, "text-right")}>Received</th><th className={cn(th, "text-right")}>Billed before</th><th className={cn(th, "text-right")}>Billed now</th>
                      <th className={cn(th, "text-right")}>PO price</th><th className={cn(th, "text-right")}>Bill price</th><th className={cn(th, "text-right")}>Tax</th><th className={cn(th, "text-right")}>Amount</th><th className={th}>Match</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {lines.map((l) => {
                      const ok = !(l.issues || []).length;
                      const qtyBad = l.received !== undefined && l.invoiced_before + l.quantity > l.received;
                      const priceBad = l.po_unit_price && Math.abs(l.unit_price - l.po_unit_price) / l.po_unit_price > (inv.match_result?.price_tolerance_pct ?? 2) / 100;
                      return (
                        <tr key={l.line} className={cn(!ok && "bg-red-50/40")}>
                          <td className="px-3 py-2.5"><p className="font-medium text-slate-800">{l.description}</p><p className="text-[12px] text-slate-500">{l.unit}</p></td>
                          <td className="px-3 py-2.5 text-right tabular-nums">{l.ordered ?? "—"}</td>
                          <td className="px-3 py-2.5 text-right tabular-nums">{l.received ?? "—"}</td>
                          <td className="px-3 py-2.5 text-right tabular-nums text-slate-500">{l.invoiced_before ?? 0}</td>
                          <td className={cn("px-3 py-2.5 text-right font-medium tabular-nums", qtyBad && "text-red-600")}>{l.quantity}</td>
                          <td className="px-3 py-2.5 text-right tabular-nums text-slate-500">{l.po_unit_price ? Math.round(l.po_unit_price).toLocaleString() : "—"}</td>
                          <td className={cn("px-3 py-2.5 text-right tabular-nums", priceBad && "font-medium text-red-600")}>{Math.round(l.unit_price).toLocaleString()}</td>
                          <td className="px-3 py-2.5 text-right text-slate-600">{l.tax_rate ? `${l.tax_rate}%` : "0%"}</td>
                          <td className="px-3 py-2.5 text-right font-medium tabular-nums">{Math.round(l.total).toLocaleString()}</td>
                          <td className="px-3 py-2.5">
                            {ok ? (
                              <span className="inline-flex items-center gap-1 text-[12px] font-medium text-emerald-700"><CheckCircle2 size={13} /> OK</span>
                            ) : (
                              <ul className="space-y-0.5 text-[12px] text-red-700">{l.issues.map((i: string) => <li key={i}>{i}</li>)}</ul>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <Totals
                rows={[["Untaxed amount", money(inv.subtotal, inv.currency)], ["VAT", money(inv.tax_total, inv.currency)]]}
                total={["Total", money(inv.total, inv.currency)]}
              />
              {inv.paid_amount > 0 && (
                <dl className="ml-auto mt-1 w-full max-w-sm space-y-1 text-[13.5px]">
                  <div className="flex justify-between text-slate-600"><dt>Paid</dt><dd className="tabular-nums">− {money(inv.paid_amount, inv.currency)}</dd></div>
                  <div className="flex justify-between font-semibold text-slate-900"><dt>Amount due</dt><dd className="tabular-nums">{money(inv.balance, inv.currency)}</dd></div>
                </dl>
              )}
            </>
          )}

          {tab === "payments" && (
            !payments.length ? (
              <EmptyState icon={Banknote} text={["approved", "partially_paid"].includes(inv.status) ? "Not paid yet. Payments are made through a payment voucher: the Accountant prepares it, the DAF approves, the Cashier executes." : "The bill can be paid once it is approved."} action={canPerform("manage_payment_vouchers") && ["approved", "partially_paid"].includes(inv.status) && <Button size="sm" onClick={() => navigate(`/dashboard/finance/vouchers/new?supplier=${inv.supplier}&invoice=${inv.id}`)}><Banknote size={14} /> Prepare payment voucher</Button>} />
            ) : (
              <div className="overflow-x-auto">
                <table className="dnr-grid w-full min-w-[640px] text-[13px]">
                  <thead><tr className="border-y border-slate-200 bg-slate-50 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500"><th className={th}>Payment</th><th className={th}>Voucher</th><th className={th}>Date</th><th className={th}>Method</th><th className={th}>Reference</th><th className={th}>Paid by</th><th className={cn(th, "text-right")}>Settled</th><th className={cn(th, "text-right")}>Tax withheld</th><th className={cn(th, "text-right")}>Net paid</th></tr></thead>
                  <tbody className="divide-y divide-slate-100">
                    {payments.map((p: any) => (
                      <tr key={p.id}>
                        <td className="px-3 py-2.5 font-medium">{p.number}</td>
                        <td className="px-3 py-2.5">{p.voucher ? <Link to={`/dashboard/finance/vouchers/${p.voucher}`} className="text-primaryDark hover:underline">{p.expand?.voucher?.number || "voucher"}</Link> : "—"}</td>
                        <td className="whitespace-nowrap px-3 py-2.5 text-slate-600">{dateOf(p.payment_date)}</td>
                        <td className="px-3 py-2.5">{PAYMENT_METHODS[p.method] || p.method}</td>
                        <td className="px-3 py-2.5 text-slate-600">{p.reference || "—"}</td>
                        <td className="px-3 py-2.5">{p.expand?.paid_by?.name}</td>
                        <td className="px-3 py-2.5 text-right tabular-nums">{money(p.amount, p.currency)}</td>
                        <td className="px-3 py-2.5 text-right tabular-nums text-slate-600">{p.wht_amount ? money(p.wht_amount, p.currency) : "—"}</td>
                        <td className="px-3 py-2.5 text-right font-medium tabular-nums">{money(p.voucher ? p.net_amount : p.amount, p.currency)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          )}

          {tab === "approval" && <ApprovalTracker approval={approval} actions={actions} />}
        </div>
      </Sheet>

      <ActionDialog
        kind={decision}
        number={inv.number}
        onClose={() => setDecision(null)}
        run={(kind, { comment, user }) => {
          if (kind === "submit") return financeApi.invoiceAction(inv.id, "submit");
          if (kind === "cancel") return financeApi.invoiceAction(inv.id, "cancel", { reason: comment });
          return procurementApi.act(approval.id, { action: kind, comment, user });
        }}
        onDone={() => {
          setDecision(null);
          refresh();
        }}
      />
      <ResolveDialog inv={inv} issues={issues} open={resolving} onClose={() => setResolving(false)} onDone={() => { setResolving(false); refresh(); }} />
          </DocumentPage>
  );
}

function ResolveDialog({ inv, issues, open, onClose, onDone }: { inv: any; issues: string[]; open: boolean; onClose: () => void; onDone: () => void }) {
  const [reason, setReason] = React.useState("");
  React.useEffect(() => setReason(""), [open]);
  const run = useMutation(() => financeApi.invoiceAction(inv.id, "resolve", { reason }), {
    onSuccess: () => { toast.success(`${inv.number}: exception resolved`); onDone(); },
    onError: (e) => { toast.error(errorMessage(e)); },
  });
  const short = reason.trim().length < 15;
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg bg-white">
        <DialogHeader>
          <DialogTitle>Resolve match exception · {inv.number}</DialogTitle>
          <DialogDescription>Accept the differences below and allow the bill to go for approval. Your name and reason are kept in the audit trail.</DialogDescription>
        </DialogHeader>
        <ul className="list-disc space-y-0.5 rounded-md bg-red-50 py-2 pl-8 pr-3 text-[12.5px] text-red-800">{issues.map((i) => <li key={i}>{i}</li>)}</ul>
        <label className="block text-[12.5px] font-medium text-slate-700">
          How was it resolved? <span className="text-red-600">*</span>
          <Textarea className="mt-1 h-24" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Price increase agreed in contract addendum no. 3 dated 12 May" />
          <span className={cn("mt-1 block text-[11.5px]", short ? "text-slate-500" : "text-emerald-700")}>{reason.trim().length}/15 characters minimum</span>
        </label>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Back</Button>
          <Button disabled={short || run.isLoading} onClick={() => run.mutate()}>{run.isLoading ? "Saving…" : "Resolve exception"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
