import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "react-query";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { format, isPast } from "date-fns";
import { toast } from "sonner";
import {
  AlertTriangle, ArrowUpRight, FileSignature, GitBranch, Undo2, ArrowRight, Ban, Banknote, Check, CheckCheck, Clock, CornerUpLeft, FileText, Lock, MessageSquare, PackageCheck, Pencil, Printer, Receipt, Send, ShieldCheck, ShoppingCart, Truck, UserPlus, XCircle,
} from "lucide-react";
import pocketbase from "@/lib/pocketbase";
import { useRoles } from "@/context/roles.context";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/utils";
import { Badge, EmptyState, Panel, StatusBadge } from "@/components/enterprise/ui";
import { ActionDialog, ActionKind, ApprovalTracker } from "@/components/enterprise/Approval";
import { Chatter, ControlBar, DocumentPage, FieldGrid, Notebook, Sheet, SheetTitle, SmartButtons, Totals, toChatter } from "@/components/enterprise/DocumentLayout";
import { INVOICE_STATUS, LINE_TYPES, OPEN_PO_STATUSES, PAYMENT_METHODS, PO_STATUS, errorMessage, money, procurementApi, purchasingApi } from "@/lib/procurement";
import RecordInvoiceDialog from "@/pages/finance/RecordInvoiceDialog";
import { ReturnFormDialog } from "./Returns";
import { BudgetPanel } from "@/components/budget/BudgetKit";
import { Field, FormBlock, FormDialog, textareaCls } from "@/components/portal/kit";

const TABS = ["lines", "receipts", "bills", "other", "revisions", "approval"] as const;
const inputCls = "h-9 w-full rounded-md border border-slate-200 bg-white px-3 text-[13px] outline-none focus:border-primary focus:ring-2 focus:ring-primary/20";

const STEPS = [
  { key: "draft", label: "Draft" },
  { key: "pending_approval", label: "To approve" },
  { key: "approved", label: "Approved" },
  { key: "sent", label: "Sent" },
  { key: "received", label: "Received" },
  { key: "billed", label: "Billed" },
  { key: "done", label: "Done" },
];

function stepOf(po: any) {
  if (["completed", "closed"].includes(po.status)) return "done";
  if (po.invoiced_value > 0 && ["partially_received", "fully_received", "partially_invoiced", "fully_invoiced"].includes(po.status)) return "billed";
  if (["partially_received", "fully_received"].includes(po.status)) return "received";
  if (["sent", "acknowledged"].includes(po.status)) return "sent";
  if (po.status === "approved") return "approved";
  if (po.status === "pending_approval") return "pending_approval";
  return "draft";
}

const dateOf = (v?: string, f = "d MMM yyyy") => (v ? format(new Date(v), f) : "");
const th = "px-3 py-2";

export default function PurchaseOrderDetail() {
  const { poId } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [params, setParams] = useSearchParams();
  const tab = (params.get("tab") as (typeof TABS)[number]) || "lines";
  const { canPerform } = useRoles();
  const me = pocketbase.authStore.model as any;
  const [decision, setDecision] = React.useState<ActionKind | null>(null);
  const [step, setStep] = React.useState<"send" | "acknowledge" | "close" | null>(null);
  const [editing, setEditing] = React.useState(false);
  const [billing, setBilling] = React.useState(false);
  const [amending, setAmending] = React.useState(false);
  const [returning, setReturning] = React.useState("");

  const q = useQuery(["purchase_order", poId], async () => {
    const po = await pocketbase.collection("purchase_orders").getOne(poId!, { expand: "supplier,buyer,requester,department,requisition,rfq,quotation,approval,branch,category,contract" });
    const [receipts, actions, audit, invoices, payments, returns] = await Promise.all([
      pocketbase.collection("goods_receipts").getFullList({ filter: `purchase_order = "${poId}"`, sort: "-created", expand: "received_by,warehouse" }),
      pocketbase.collection("approval_actions").getFullList({ filter: `document_type = "purchase_order" && document_id = "${poId}"`, sort: "created", expand: "actor,target_user" }),
      procurementApi.audit({ collection: "purchase_orders", record: poId, perPage: 100 }).then((r) => r.items).catch(() => []),
      pocketbase.collection("supplier_invoices").getFullList({ filter: `purchase_order = "${poId}"`, sort: "-created" }).catch(() => [] as any[]),
      pocketbase.collection("payments").getFullList({ filter: `purchase_order = "${poId}"`, sort: "-payment_date", expand: "invoice,paid_by" }).catch(() => [] as any[]),
      pocketbase.collection("purchase_returns").getFullList({ filter: `purchase_order = "${poId}"`, sort: "-created" }).catch(() => [] as any[]),
    ]);
    return { po, receipts, actions, audit, invoices, payments, returns };
  });
  const refresh = () => {
    queryClient.invalidateQueries(["purchase_order", poId]);
    queryClient.invalidateQueries(["record-table"]);
    queryClient.invalidateQueries(["procurement-dashboard"]);
    queryClient.invalidateQueries(["notifications"]);
  };

  const po: any = q.data?.po;
  if (q.isLoading) return <div className="space-y-4 px-4 py-4 sm:px-6"><Skeleton className="h-12 w-80" /><Skeleton className="h-[480px] w-full" /></div>;
  if (!po) return <div className="px-4 py-4 sm:px-6"><Panel><EmptyState icon={ShoppingCart} title="Purchase order not available" text="It may be outside what your role can see." /></Panel></div>;

  const { receipts, invoices, payments, actions, audit } = q.data!;
  const approval = po.expand?.approval;
  const isBuyer = po.buyer === me?.id;
  // The server additionally requires the buyer or an organisation-wide procurement role.
  const canManage = canPerform("manage_purchase_orders");
  const isApprover = approval?.status === "pending" && (approval.pending_approvers || "").split(",").includes(me?.id);
  const editable = ["draft", "returned"].includes(po.status);
  const receivable = OPEN_PO_STATUSES.includes(po.status);
  const late = receivable && po.expected_delivery_date && isPast(new Date(po.expected_delivery_date));
  const items: any[] = po.items || [];
  const hasDisc = items.some((l) => l.discount_pct);
  const activeBills = invoices.filter((i: any) => !["cancelled", "rejected"].includes(i.status));
  const billedQty: Record<number, number> = {};
  for (const inv of activeBills) for (const l of inv.items || []) billedQty[l.line] = (billedQty[l.line] || 0) + (Number(l.quantity) || 0);
  const canBill = canPerform("manage_invoices") && po.received_value > 0 && !["cancelled", "rejected", "draft", "pending_approval", "returned"].includes(po.status) && (po.invoiced_value || 0) < po.received_value - 1;
  const openExceptions = invoices.filter((i: any) => i.status === "exception").length;
  const paid = (payments as any[]).reduce((a: number, p: any) => a + p.amount, 0) || po.paid_value || 0;
  const setTab = (t: string) => setParams(t === "lines" ? {} : { tab: t });

  const ribbon =
    po.status === "cancelled" ? { label: "Cancelled", tone: "neutral" as const }
    : po.status === "rejected" ? { label: "Rejected", tone: "danger" as const }
    : po.status === "completed" ? { label: "Paid", tone: "success" as const }
    : po.status === "closed" ? { label: "Closed", tone: "neutral" as const }
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
      {canManage && editable && isBuyer && <Button size="sm" onClick={() => setDecision("submit")}><Send size={14} /> Confirm order</Button>}
      {canManage && editable && <Button size="sm" variant="outline" onClick={() => setEditing(true)}><Pencil size={14} /> Edit</Button>}
      {canManage && po.status === "approved" && <Button size="sm" onClick={() => setStep("send")}><Send size={14} /> Send to supplier</Button>}
      {canManage && po.status === "sent" && <Button size="sm" variant="outline" onClick={() => setStep("acknowledge")}><CheckCheck size={14} /> Supplier acknowledged</Button>}
      {canPerform("receive_goods") && receivable && <Button size="sm" onClick={() => navigate(`/dashboard/procurement/purchase-orders/${po.id}/receive`)}><PackageCheck size={14} /> Receive products</Button>}
      {canBill && <Button size="sm" onClick={() => setBilling(true)}><Receipt size={14} /> Create bill</Button>}
      {!["draft", "pending_approval", "returned", "rejected", "cancelled"].includes(po.status) && (
        <a href={`/print/po/${po.id}`} target="_blank" rel="noreferrer" className="inline-flex h-8 items-center gap-1.5 rounded-btn border border-slate-200 bg-white px-3 text-[12.7px] text-slate-700 hover:bg-slate-50"><Printer size={14} /> Print</a>
      )}
      {canManage && ["partially_received", "fully_received"].includes(po.status) && <Button size="sm" variant="ghost" onClick={() => setStep("close")}><Lock size={14} /> Lock</Button>}
      {canPerform("amend_purchase_orders") && ["approved", "sent", "acknowledged", "partially_received"].includes(po.status) && <Button size="sm" variant="ghost" onClick={() => setAmending(true)}><GitBranch size={14} /> Amend</Button>}
      {canManage && ["draft", "returned", "pending_approval", "approved", "sent", "acknowledged"].includes(po.status) && <Button size="sm" variant="ghost" onClick={() => setDecision("cancel")}><Ban size={14} /> Cancel</Button>}
    </>
  );

  return (
    <DocumentPage
      chatter={
        <Chatter
          items={toChatter(actions, audit)}
          composer={approval ? <Button size="sm" variant="outline" className="w-full" onClick={() => setDecision("comment")}><MessageSquare size={14} /> Log a note</Button> : undefined}
        />
      }
    >
      <ControlBar
        breadcrumbs={[{ title: "Purchase", link: "/dashboard/procurement" }, { title: "Purchase orders", link: "/dashboard/procurement/purchase-orders" }, { title: po.number }]}
        actions={actionsBar}
        steps={STEPS}
        current={stepOf(po)}
      />

      {isApprover && (
        <div className="flex items-center gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2.5 text-[13px] text-amber-900">
          <Clock size={15} /> Waiting for your approval at step “{approval.steps?.[approval.current_level]?.name}”.
        </div>
      )}
      {late && (
        <div className="flex items-center gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2.5 text-[13px] text-red-800">
          <AlertTriangle size={15} /> Delivery was expected on {dateOf(po.expected_delivery_date)} and is overdue. Follow up with the supplier.
        </div>
      )}
      {openExceptions > 0 && (
        <div className="flex items-center gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2.5 text-[13px] text-red-800">
          <AlertTriangle size={15} /> {openExceptions} vendor bill{openExceptions > 1 ? "s have" : " has"} a three-way match exception.{" "}
          <button type="button" className="font-medium underline" onClick={() => setTab("bills")}>Review</button>
        </div>
      )}

      <DocumentFlow po={po} receipts={receipts} invoices={invoices} payments={payments} returns={q.data!.returns} onTab={setTab} />

      {po.status !== "cancelled" && (
        <BudgetPanel
          documentType="purchase_order" documentId={po.id} number={po.number} lineId={po.budget_line} department={po.department}
          amount={Math.round(po.grand_total || 0)} committed={po.committed_amount || 0} overrideId={po.budget_override}
          editable={editable && canManage && !po.committed_amount} allowOverride={editable}
          onChangeLine={(id) => pocketbase.collection("purchase_orders").update(po.id, { budget_line: id })} onDone={refresh}
        />
      )}

      <SmartButtons
        items={[
          ...(po.expand?.contract ? [{ icon: FileSignature, label: "Contract", value: po.expand.contract.number, onClick: () => navigate(`/dashboard/procurement/contracts/${po.contract}`) }] : []),
          ...(q.data!.returns.length ? [{ icon: Undo2, label: "Returns", value: q.data!.returns.length, onClick: () => navigate(`/dashboard/procurement/returns/${q.data!.returns[0].id}`) }] : []),
          { icon: Truck, label: "Receipts", value: receipts.length, onClick: () => setTab("receipts") },
          { icon: FileText, label: "Vendor bills", value: activeBills.length, onClick: () => setTab("bills"), tone: openExceptions ? "danger" : "default" },
          { icon: Banknote, label: "Paid", value: money(paid, po.currency), onClick: () => setTab("bills") },
          ...(approval ? [{ icon: ShieldCheck, label: "Approval", value: approval.status === "pending" ? `Step ${approval.current_level + 1}/${approval.steps?.length || 1}` : approval.status.charAt(0).toUpperCase() + approval.status.slice(1).replace(/_/g, " "), onClick: () => setTab("approval"), tone: approval.status === "pending" ? ("warning" as const) : ("default" as const) }] : []),
        ]}
      />

      <Sheet ribbon={ribbon}>
        <SheetTitle
          kicker={po.source === "direct" ? "Direct purchase order" : "Purchase order"}
          title={po.number}
          badges={
            <>
              <StatusBadge status={po.status} map={PO_STATUS} />
              {po.source === "direct" && <Badge tone="warning">Direct</Badge>}
              {po.revision > 0 && <Badge tone="violet">Revision {po.revision}</Badge>}
            </>
          }
        />
        <FieldGrid
          left={[
            {
              label: "Vendor",
              value: <Link className="font-medium text-primaryDark hover:underline" to={`/dashboard/procurement/suppliers/${po.supplier}`}>{po.expand?.supplier?.name}</Link>,
              hint: [po.expand?.supplier?.email, po.expand?.supplier?.phone].filter(Boolean).join(" · "),
            },
            { label: "Vendor reference", value: po.expand?.supplier?.code },
            { label: "Subject", value: po.title },
            { label: "Requisition", value: po.requisition && <Link className="text-primaryDark hover:underline" to={`/dashboard/procurement/requisitions/${po.requisition}`}>{po.expand?.requisition?.number}</Link> },
            { label: "Source", value: po.expand?.rfq ? <Link className="text-primaryDark hover:underline" to={`/dashboard/procurement/rfqs/${po.rfq}`}>{po.expand.rfq.number}</Link> : "Direct purchase" },
          ]}
          right={[
            { label: "Order date", value: dateOf(po.order_date) },
            { label: "Expected arrival", value: <span className={cn(late && "font-medium text-red-600")}>{dateOf(po.expected_delivery_date)}{late ? " · late" : ""}</span> },
            { label: "Deliver to", value: po.delivery_location || po.expand?.branch?.name },
            { label: "Buyer", value: po.expand?.buyer?.name },
            { label: "Department", value: po.expand?.department?.name, hint: po.expand?.requester?.name ? `Requested by ${po.expand.requester.name}` : undefined },
          ]}
        />

        <Notebook
          active={tab}
          onChange={setTab}
          tabs={[
            { key: "lines", label: "Products", count: items.length },
            { key: "receipts", label: "Receipts", count: receipts.length },
            { key: "bills", label: "Bills & payments", count: activeBills.length },
            { key: "other", label: "Other information" },
            ...((po.revisions || []).length ? [{ key: "revisions", label: "Revisions", count: po.revisions.length }] : []),
            ...(approval ? [{ key: "approval", label: "Approval" }] : []),
          ]}
        />

        <div className="pt-4">
          {tab === "lines" && (
            <>
              <div className="overflow-x-auto">
                <table className="dnr-grid w-full min-w-[760px] text-[13px]">
                  <thead>
                    <tr className="border-y border-slate-200 bg-slate-50 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                      <th className={cn(th, "w-10")}>#</th><th className={th}>Product</th><th className={th}>Type</th>
                      <th className={cn(th, "text-right")}>Quantity</th><th className={cn(th, "text-right")}>Received</th><th className={cn(th, "text-right")}>Billed</th>
                      <th className={cn(th, "text-right")}>Unit price</th>{hasDisc && <th className={cn(th, "text-right")}>Disc. %</th>}<th className={cn(th, "text-right")}>Taxes</th><th className={cn(th, "text-right")}>Amount</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {items.map((l) => {
                      const rec = l.received_qty || 0;
                      const bil = billedQty[l.line] || 0;
                      return (
                        <tr key={l.line} className="hover:bg-slate-50/60">
                          <td className="px-3 py-2.5 text-slate-500">{l.line}</td>
                          <td className="px-3 py-2.5"><p className="font-medium text-slate-800">{l.description}</p>{(l.brand || l.specification) && <p className="text-[12px] text-slate-500">{[l.brand, l.specification].filter(Boolean).join(" · ")}</p>}</td>
                          <td className="px-3 py-2.5"><Badge tone={LINE_TYPES[l.line_type]?.tone}>{LINE_TYPES[l.line_type]?.label}</Badge></td>
                          <td className="whitespace-nowrap px-3 py-2.5 text-right tabular-nums">{l.quantity} <span className="text-[12px] text-slate-500">{l.unit}</span></td>
                          <td className={cn("px-3 py-2.5 text-right tabular-nums", rec >= l.quantity ? "text-emerald-700" : rec > 0 ? "text-amber-700" : "text-slate-400")}>
                            {rec}{l.rejected_qty ? <span className="block text-[11px] text-red-600">{l.rejected_qty} rejected</span> : null}
                          </td>
                          <td className={cn("px-3 py-2.5 text-right tabular-nums", bil >= rec && bil > 0 ? "text-emerald-700" : bil > 0 ? "text-amber-700" : "text-slate-400")}>{bil}</td>
                          <td className="px-3 py-2.5 text-right tabular-nums">{Math.round(l.unit_price).toLocaleString()}</td>
                          {hasDisc && <td className="px-3 py-2.5 text-right tabular-nums text-slate-600">{l.discount_pct || ""}</td>}
                          <td className="px-3 py-2.5 text-right text-slate-600">{l.tax_rate ? `VAT ${l.tax_rate}%` : "Exempt"}</td>
                          <td className="px-3 py-2.5 text-right font-medium tabular-nums">{Math.round(l.total).toLocaleString()}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <p className="mt-4 max-w-md text-[12.5px] text-slate-500">{po.payment_terms ? <>Payment terms: <span className="text-slate-700">{po.payment_terms}</span></> : "Define payment terms on the order."}</p>
                <Totals
                  rows={[
                    ["Untaxed amount", money(po.subtotal - (po.discount_total || 0), po.currency)],
                    ...(po.discount_total ? [["Discount", `− ${money(po.discount_total, po.currency)}`] as [string, string]] : []),
                    ["VAT", money(po.tax_total, po.currency)],
                    ...(po.delivery_cost + po.other_charges ? [["Delivery & other charges", money(po.delivery_cost + po.other_charges, po.currency)] as [string, string]] : []),
                  ]}
                  total={["Total", money(po.grand_total, po.currency)]}
                />
              </div>
            </>
          )}

          {tab === "receipts" && (
            !receipts.length ? (
              <EmptyState icon={Truck} text={receivable ? "Nothing received yet." : "Deliveries can be recorded once the order is approved."} action={canPerform("receive_goods") && receivable && <Button size="sm" onClick={() => navigate(`/dashboard/procurement/purchase-orders/${po.id}/receive`)}><PackageCheck size={14} /> Receive products</Button>} />
            ) : (
              <div className="overflow-x-auto">
                <table className="dnr-grid w-full min-w-[760px] text-[13px]">
                  <thead><tr className="border-y border-slate-200 bg-slate-50 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500"><th className={th}>Reference</th><th className={th}>Date</th><th className={th}>Location</th><th className={th}>Received by</th><th className={th}>Lines</th><th className={cn(th, "text-right")}>Accepted value</th><th className={th} /></tr></thead>
                  <tbody className="divide-y divide-slate-100">
                    {receipts.map((g: any) => (
                      <tr key={g.id}>
                        <td className="px-3 py-2.5 font-medium">{g.number}{g.delivery_note_number && <span className="block text-[12px] font-normal text-slate-500">DN {g.delivery_note_number}</span>}</td>
                        <td className="whitespace-nowrap px-3 py-2.5 text-slate-600">{dateOf(g.receipt_date)}</td>
                        <td className="px-3 py-2.5 text-slate-600">{g.receipt_type === "service" ? "Service confirmation" : g.expand?.warehouse?.name || "—"}</td>
                        <td className="px-3 py-2.5">{g.expand?.received_by?.name}</td>
                        <td className="px-3 py-2.5 text-[12.5px] text-slate-600">
                          {g.items.map((i: any) => <p key={i.line}>{i.description}: {i.accepted}{i.rejected ? <span className="text-red-600"> · {i.rejected} rejected ({i.rejection_reason})</span> : ""}</p>)}
                        </td>
                        <td className="px-3 py-2.5 text-right tabular-nums">{money(g.accepted_value, po.currency)}</td>
                        <td className="px-3 py-2.5 text-right"><a className="inline-flex items-center gap-1 text-[12.5px] text-primaryDark hover:underline" href={`/print/grn/${g.id}`} target="_blank" rel="noreferrer"><Printer size={13} /> Print</a>{(canPerform("receive_goods") || canManage) && (g.items || []).some((i: any) => i.line_type === "goods" && i.accepted > 0) && <button type="button" onClick={() => setReturning(g.id)} className="ml-3 inline-flex items-center gap-1 text-[12.5px] text-red-700 hover:underline"><Undo2 size={13} /> Return</button>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          )}

          {tab === "bills" && (
            <div className="space-y-6">
              <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                {[
                  ["Ordered", po.grand_total],
                  ["Received", po.received_value],
                  ["Billed", po.invoiced_value || 0],
                  ["Paid", paid],
                ].map(([k, v]: any) => {
                  const pct = po.grand_total ? Math.min(100, Math.round((v / po.grand_total) * 100)) : 0;
                  return (
                    <div key={k} className="rounded-md border border-slate-200 px-3 py-2.5">
                      <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">{k}</p>
                      <p className="mt-0.5 text-[15px] font-semibold tabular-nums">{money(v, po.currency)}</p>
                      <div className="mt-1.5 h-1.5 rounded-full bg-slate-100"><div className="h-1.5 rounded-full bg-primary" style={{ width: `${pct}%` }} /></div>
                      <p className="mt-0.5 text-[11px] tabular-nums text-slate-500">{pct}% of order</p>
                    </div>
                  );
                })}
              </div>
              {!invoices.length ? (
                <EmptyState icon={Receipt} text={po.received_value > 0 ? "No vendor bill recorded yet." : "Bills can be recorded once goods or services have been received."} action={canBill && <Button size="sm" onClick={() => setBilling(true)}><Receipt size={14} /> Create bill</Button>} />
              ) : (
                <div className="overflow-x-auto">
                  <table className="dnr-grid w-full min-w-[760px] text-[13px]">
                    <thead><tr className="border-y border-slate-200 bg-slate-50 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500"><th className={th}>Bill</th><th className={th}>Vendor ref.</th><th className={th}>Bill date</th><th className={th}>Due</th><th className={cn(th, "text-right")}>Total</th><th className={cn(th, "text-right")}>Balance</th><th className={th}>Status</th></tr></thead>
                    <tbody className="divide-y divide-slate-100">
                      {invoices.map((i: any) => (
                        <tr key={i.id} className="cursor-pointer hover:bg-slate-50" onClick={() => navigate(`/dashboard/finance/invoices/${i.id}`)}>
                          <td className="px-3 py-2.5 font-medium text-primaryDark">{i.number}</td>
                          <td className="px-3 py-2.5 text-slate-600">{i.supplier_invoice_number}</td>
                          <td className="whitespace-nowrap px-3 py-2.5 text-slate-600">{dateOf(i.invoice_date)}</td>
                          <td className={cn("whitespace-nowrap px-3 py-2.5", i.balance > 0 && i.due_date && isPast(new Date(i.due_date)) ? "font-medium text-red-600" : "text-slate-600")}>{dateOf(i.due_date)}</td>
                          <td className="px-3 py-2.5 text-right tabular-nums">{money(i.total, i.currency)}</td>
                          <td className="px-3 py-2.5 text-right font-medium tabular-nums">{money(i.balance, i.currency)}</td>
                          <td className="px-3 py-2.5"><StatusBadge status={i.status} map={INVOICE_STATUS} /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {payments.length > 0 && (
                <div>
                  <h4 className="mb-2 text-[13px] font-semibold text-slate-800">Payments</h4>
                  <div className="overflow-x-auto">
                    <table className="dnr-grid w-full min-w-[640px] text-[13px]">
                      <thead><tr className="border-y border-slate-200 bg-slate-50 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500"><th className={th}>Payment</th><th className={th}>Date</th><th className={th}>Bill</th><th className={th}>Method</th><th className={th}>Reference</th><th className={cn(th, "text-right")}>Amount</th></tr></thead>
                      <tbody className="divide-y divide-slate-100">
                        {payments.map((p: any) => (
                          <tr key={p.id}>
                            <td className="px-3 py-2.5 font-medium">{p.number}</td>
                            <td className="whitespace-nowrap px-3 py-2.5 text-slate-600">{dateOf(p.payment_date)}</td>
                            <td className="px-3 py-2.5">{p.expand?.invoice?.number}</td>
                            <td className="px-3 py-2.5 text-slate-600">{PAYMENT_METHODS[p.method] || p.method}</td>
                            <td className="px-3 py-2.5 text-slate-600">{p.reference || "—"}</td>
                            <td className="px-3 py-2.5 text-right font-medium tabular-nums">{money(p.amount, p.currency)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}

          {tab === "other" && (
            <FieldGrid
              left={[
                { label: "Payment terms", value: po.payment_terms },
                { label: "Delivery terms", value: po.delivery_terms },
                { label: "Delivery location", value: po.delivery_location },
                { label: "Office", value: po.expand?.branch?.name },
                { label: "Category", value: po.expand?.category?.name },
              ]}
              right={[
                { label: "Currency", value: po.currency },
                { label: "Sent to supplier", value: dateOf(po.sent_at, "d MMM yyyy, HH:mm") },
                { label: "Direct purchase reason", value: po.source === "direct" ? po.justification : "" },
                { label: "Cancellation reason", value: po.cancel_reason },
                { label: "Internal notes", value: po.notes },
              ]}
            />
          )}

          {tab === "revisions" && <Revisions po={po} />}
          {tab === "approval" && <ApprovalTracker approval={approval} actions={actions} />}
        </div>
      </Sheet>
      {amending && <AmendDialog po={po} onClose={() => setAmending(false)} onDone={() => { setAmending(false); refresh(); }} />}
      {returning && <ReturnFormDialog grnId={returning} onClose={() => setReturning("")} />}

      <ActionDialog
        kind={decision}
        number={po.number}
        onClose={() => setDecision(null)}
        run={(kind, { comment, user }) => {
          if (kind === "submit") return purchasingApi.action(po.id, "submit");
          if (kind === "cancel") return purchasingApi.action(po.id, "cancel", { reason: comment });
          return procurementApi.act(approval.id, { action: kind, comment, user });
        }}
        onDone={() => {
          setDecision(null);
          refresh();
        }}
      />
      <StepDialog po={po} step={step} onClose={() => setStep(null)} onDone={() => { setStep(null); refresh(); }} />
      {editing && <EditPo po={po} onClose={() => setEditing(false)} onSaved={() => { setEditing(false); refresh(); }} />}
      <RecordInvoiceDialog po={po} open={billing} onClose={() => { setBilling(false); refresh(); }} />
    </DocumentPage>
  );
}

function StepDialog({ po, step, onClose, onDone }: { po: any; step: "send" | "acknowledge" | "close" | null; onClose: () => void; onDone: () => void }) {
  const [reason, setReason] = React.useState("");
  React.useEffect(() => setReason(""), [step]);
  const run = useMutation(() => purchasingApi.action(po.id, step!, { reason }), {
    onSuccess: () => { toast.success(`${po.number} updated`); onDone(); },
    onError: (e) => { toast.error(errorMessage(e)); },
  });
  const copy = {
    send: { title: `Send ${po.number} to ${po.expand?.supplier?.name}?`, text: "Print or save the PO as PDF and send it to the supplier. This records the date it was issued." },
    acknowledge: { title: `Supplier acknowledged ${po.number}?`, text: "Record that the supplier confirmed the order and delivery date." },
    close: { title: `Close ${po.number}?`, text: "No further deliveries will be accepted. Use this when the remaining quantity will not be delivered." },
  } as const;
  const c = step ? copy[step] : null;
  return (
    <Dialog open={Boolean(step)} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md bg-white">
        <DialogHeader><DialogTitle>{c?.title}</DialogTitle><DialogDescription>{c?.text}</DialogDescription></DialogHeader>
        {step === "close" && (
          <label className="block text-[12.5px] font-medium text-slate-700">Reason <span className="text-red-600">*</span>
            <textarea className="mt-1 h-20 w-full rounded-md border border-slate-200 px-3 py-2 text-[13px]" value={reason} onChange={(e) => setReason(e.target.value)} />
          </label>
        )}
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose}>Back</Button>
          <Button disabled={run.isLoading || (step === "close" && !reason.trim())} onClick={() => run.mutate()}>Confirm</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EditPo({ po, onClose, onSaved }: { po: any; onClose: () => void; onSaved: () => void }) {
  const direct = po.source === "direct";
  const [v, setV] = React.useState({
    expected_delivery_date: po.expected_delivery_date?.slice(0, 10) || "", delivery_location: po.delivery_location || "",
    payment_terms: po.payment_terms || "", delivery_terms: po.delivery_terms || "", notes: po.notes || "",
    delivery_cost: po.delivery_cost || 0, other_charges: po.other_charges || 0, contract: po.contract || "",
  });
  const contracts = useQuery(["po-contracts", po.supplier], () => pocketbase.collection("contracts").getFullList({ filter: `supplier = "${po.supplier}" && status = "active"`, sort: "-start_date" }));
  const amended = po.revision > 0;
  const [items, setItems] = React.useState<any[]>(po.items || []);
  const save = useMutation(
    () => pocketbase.collection("purchase_orders").update(po.id, { ...v, expected_delivery_date: v.expected_delivery_date ? `${v.expected_delivery_date} 00:00:00.000Z` : "", items }),
    { onSuccess: () => { toast.success("Purchase order updated"); onSaved(); }, onError: (e) => { toast.error(errorMessage(e)); } }
  );
  const set = (k: string) => (e: any) => setV((x) => ({ ...x, [k]: e.target.value }));
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[92vh] max-w-3xl overflow-y-auto bg-white">
        <DialogHeader>
          <DialogTitle>Edit {po.number}</DialogTitle>
          <DialogDescription>{direct ? "Direct purchase: prices can be corrected to the supplier's actual offer." : "Prices are locked to the awarded quotation. You can change delivery details and how each line is received."}</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="block text-[12.5px] font-medium text-slate-700">Expected delivery<input type="date" className={cn(inputCls, "mt-1")} value={v.expected_delivery_date} onChange={set("expected_delivery_date")} /></label>
          <label className="block text-[12.5px] font-medium text-slate-700">Delivery location<input className={cn(inputCls, "mt-1")} value={v.delivery_location} onChange={set("delivery_location")} /></label>
          <label className="block text-[12.5px] font-medium text-slate-700">Payment terms<input className={cn(inputCls, "mt-1")} value={v.payment_terms} onChange={set("payment_terms")} /></label>
          <label className="block text-[12.5px] font-medium text-slate-700">Delivery terms<input className={cn(inputCls, "mt-1")} value={v.delivery_terms} onChange={set("delivery_terms")} /></label>
          {direct && <label className="block text-[12.5px] font-medium text-slate-700">Delivery cost<input type="number" min={0} className={cn(inputCls, "mt-1")} value={v.delivery_cost} onChange={set("delivery_cost")} /></label>}
          {direct && <label className="block text-[12.5px] font-medium text-slate-700">Other charges<input type="number" min={0} className={cn(inputCls, "mt-1")} value={v.other_charges} onChange={set("other_charges")} /></label>}
          <label className="block text-[12.5px] font-medium text-slate-700 sm:col-span-2">Contract
            <select className={cn(inputCls, "mt-1")} value={v.contract} onChange={set("contract")}>
              <option value="">Not under a contract</option>
              {(contracts.data || []).map((c: any) => <option key={c.id} value={c.id}>{c.number} — {c.title} (remaining {money(c.remaining_value)})</option>)}
            </select>
            <span className="mt-1 block text-[11.5px] font-normal text-slate-500">When linked, the order must fit the contract period and remaining value.</span>
          </label>
          <label className="block text-[12.5px] font-medium text-slate-700 sm:col-span-2">Notes<textarea className={cn(inputCls, "mt-1 h-16 py-2")} value={v.notes} onChange={set("notes")} /></label>
        </div>
        <table className="dnr-grid w-full text-[13px]">
          <thead><tr className="border-y border-slate-100 bg-slate-50/70 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500"><th className="px-2 py-2">Line</th>{amended && <th className="px-2 py-2">Quantity</th>}<th className="px-2 py-2">Receive as</th>{direct && <th className="px-2 py-2">Unit price</th>}{direct && <th className="px-2 py-2">Tax %</th>}</tr></thead>
          <tbody className="divide-y divide-slate-100">
            {items.map((l, i) => (
              <tr key={l.line}>
                <td className="px-2 py-2">{l.description} <span className="text-slate-500">× {l.quantity}</span></td>
                {amended && <td className="w-28 px-2 py-2"><input type="number" min={l.received_qty || 0} className={inputCls} value={l.quantity} onChange={(e) => setItems((x) => x.map((it, idx) => (idx === i ? { ...it, quantity: Number(e.target.value) } : it)))} aria-label={`Line ${l.line} quantity`} /><span className="text-[11px] text-slate-500">min {l.received_qty || 0} received</span></td>}
                <td className="px-2 py-2">
                  <select className={inputCls} value={l.line_type} onChange={(e) => setItems((x) => x.map((it, idx) => (idx === i ? { ...it, line_type: e.target.value } : it)))} aria-label={`Line ${l.line} type`}>
                    {Object.entries(LINE_TYPES).map(([k, t]) => <option key={k} value={k}>{t.label} — {t.hint}</option>)}
                  </select>
                </td>
                {direct && <td className="px-2 py-2"><input type="number" min={0} className={inputCls} value={l.unit_price} onChange={(e) => setItems((x) => x.map((it, idx) => (idx === i ? { ...it, unit_price: Number(e.target.value) } : it)))} aria-label={`Line ${l.line} price`} /></td>}
                {direct && <td className="px-2 py-2"><input type="number" min={0} max={100} className={inputCls} value={l.tax_rate} onChange={(e) => setItems((x) => x.map((it, idx) => (idx === i ? { ...it, tax_rate: Number(e.target.value) } : it)))} aria-label={`Line ${l.line} tax`} /></td>}
              </tr>
            ))}
          </tbody>
        </table>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => save.mutate()} disabled={save.isLoading}>{save.isLoading ? "Saving…" : "Save"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Where the order comes from and what followed: requisition, RFQ, PO, receipts, bills, payments, returns. */
function DocumentFlow({ po, receipts, invoices, payments, returns, onTab }: { po: any; receipts: any[]; invoices: any[]; payments: any[]; returns: any[]; onTab: (t: string) => void }) {
  const navigate = useNavigate();
  const steps: { label: string; value: string; done: boolean; go?: () => void }[] = [
    { label: "Requisition", value: po.expand?.requisition?.number || "—", done: Boolean(po.requisition), go: po.requisition ? () => navigate(`/dashboard/procurement/requisitions/${po.requisition}`) : undefined },
    { label: po.source === "direct" ? "Direct purchase" : "RFQ", value: po.expand?.rfq?.number || (po.source === "direct" ? "No RFQ" : "—"), done: true, go: po.rfq ? () => navigate(`/dashboard/procurement/rfqs/${po.rfq}?tab=comparison`) : undefined },
    { label: "Purchase order", value: po.number, done: true },
    { label: "Goods received", value: receipts.length ? `${receipts.length} receipt${receipts.length > 1 ? "s" : ""}` : "None yet", done: receipts.length > 0, go: () => onTab("receipts") },
    { label: "Vendor bills", value: invoices.length ? `${invoices.length} bill${invoices.length > 1 ? "s" : ""}` : "None yet", done: invoices.length > 0, go: () => onTab("bills") },
    { label: "Payments", value: payments.length ? money(payments.reduce((a: number, p: any) => a + p.amount, 0)) : "None yet", done: payments.length > 0, go: () => onTab("bills") },
    ...(returns.length ? [{ label: "Returns", value: String(returns.length), done: true, go: () => navigate(`/dashboard/procurement/returns/${returns[0].id}`) }] : []),
  ];
  return (
    <nav aria-label="Document flow" className="flex items-stretch gap-1 overflow-x-auto rounded-lg border border-slate-200 bg-white p-2 shadow-card">
      {steps.map((st, i) => (
        <React.Fragment key={st.label}>
          {i > 0 && <ArrowRight size={14} className="mt-3 shrink-0 text-slate-300" />}
          <button type="button" disabled={!st.go} onClick={st.go} className={cn("min-w-[120px] shrink-0 rounded-md px-2.5 py-1.5 text-left", st.go && "hover:bg-slate-50", st.done ? "" : "opacity-60")}>
            <span className="block text-[10.5px] font-semibold uppercase tracking-wider text-slate-500">{st.label}</span>
            <span className={cn("block truncate text-[13px] font-medium", st.done ? "text-slate-900" : "text-slate-400")}>{st.value}</span>
          </button>
        </React.Fragment>
      ))}
    </nav>
  );
}

function Revisions({ po }: { po: any }) {
  return (
    <div className="overflow-x-auto">
      <table className="dnr-grid w-full min-w-[640px] text-[13px]">
        <thead><tr className="border-y border-slate-200 bg-slate-50 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500"><th className="px-3 py-2">Revision</th><th className="px-3 py-2">Amended</th><th className="px-3 py-2">By</th><th className="px-3 py-2">Reason</th><th className="px-3 py-2 text-right">Value before</th><th className="px-3 py-2">Lines before</th></tr></thead>
        <tbody className="divide-y divide-slate-100">
          {[...(po.revisions || [])].reverse().map((r: any) => (
            <tr key={r.revision}>
              <td className="px-3 py-2 font-medium">Rev {r.revision} to {r.revision + 1}</td>
              <td className="whitespace-nowrap px-3 py-2 text-slate-600">{String(r.amended_at || "").slice(0, 16).replace("T", " ")}</td>
              <td className="px-3 py-2">{r.amended_by}</td>
              <td className="px-3 py-2 text-slate-700">{r.reason}</td>
              <td className="px-3 py-2 text-right tabular-nums">{money(r.grand_total, po.currency)}</td>
              <td className="px-3 py-2 text-[12px] text-slate-600">{(r.items || []).map((l: any) => `${l.description} x ${l.quantity}`).join("; ")}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function AmendDialog({ po, onClose, onDone }: { po: any; onClose: () => void; onDone: () => void }) {
  const [reason, setReason] = React.useState("");
  const [tried, setTried] = React.useState(false);
  const run = useMutation(() => purchasingApi.action(po.id, "amend" as any, { reason }), {
    onSuccess: () => {
      toast.success(`${po.number} is back in draft (revision ${(po.revision || 0) + 1}); edit it and submit it for approval`);
      onDone();
    },
    onError: (e) => {
      toast.error(errorMessage(e));
    },
  });
  return (
    <FormDialog open onClose={onClose} icon={GitBranch} title={`Amend ${po.number}`} description="The approved version is kept in the revision history. The amended order must be approved again before it is sent." submitLabel="Start amendment" busy={run.isLoading} onSubmit={() => { setTried(true); if (reason.trim().length >= 10) run.mutate(); }}>
      <FormBlock icon={GitBranch} title="Why is the order amended?">
        <Field label="Reason" required error={tried && reason.trim().length < 10 && "At least 10 characters."}>
          <textarea className={textareaCls} rows={4} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. The supplier can only deliver 8 of the 10 units this quarter; quantity reduced as agreed by email on 12 Sept." />
        </Field>
        <p className="text-[12.5px] text-slate-500">Quantities cannot go below what was already received. For orders from an RFQ, prices stay as awarded.</p>
      </FormBlock>
    </FormDialog>
  );
}
