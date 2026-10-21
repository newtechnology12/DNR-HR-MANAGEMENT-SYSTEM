import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "react-query";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import {
  AlertTriangle, ArrowUpRight, Ban, Check, CheckCheck, ChevronRight, Clock, CornerUpLeft, GitBranch, Lock, LucideIcon, MessageSquare, PackageCheck, Pencil, Printer, Receipt, Send, ShoppingCart, Undo2, UserPlus, XCircle,
} from "lucide-react";
import pocketbase from "@/lib/pocketbase";
import { useRoles } from "@/context/roles.context";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/utils";
import DocumentUploads from "@/components/enterprise/Attachments";
import { Badge, StatusBadge } from "@/components/enterprise/ui";
import { ActionDialog, ActionKind, ApprovalTracker } from "@/components/enterprise/Approval";
import { Chatter, Totals, toChatter } from "@/components/enterprise/DocumentLayout";
import {
  Button,
  ButtonLink,
  Card,
  CardHeader,
  Column,
  DataTable,
  DatePicker,
  DetailHeader,
  Details,
  DocNo,
  EmptyState,
  Field,
  Input,
  KpiBand,
  MenuItem,
  Modal,
  MoneyInput,
  MoreMenu,
  Num,
  Page,
  Person,
  Select,
  Tabs,
  Textarea,
  buttonClass,
  fmtDate,
  fmtDateTime,
  fmtMoney,
  fmtNumber,
  overdue,
} from "@/components/ims";
import { INVOICE_STATUS, LINE_TYPES, OPEN_PO_STATUSES, PAYMENT_METHODS, PO_STATUS, errorMessage, money, procurementApi, purchasingApi } from "@/lib/procurement";
import RecordInvoiceDialog from "@/pages/finance/RecordInvoiceDialog";
import { ReturnFormDialog } from "./Returns";
import { BudgetPanel } from "@/components/budget/BudgetKit";

type TabKey = "details" | "items" | "receipts" | "approval" | "activity";
const TAB_KEYS: TabKey[] = ["details", "items", "receipts", "approval", "activity"];
/** Older links (?tab=lines, ?tab=bills…) still land on the right section. */
const TAB_ALIAS: Record<string, TabKey> = { lines: "items", bills: "receipts", other: "details", revisions: "details", documents: "details" };
const LIST = "/dashboard/procurement/purchase-orders";

/** Money in text: "RWF 1,250,000" (or the order's own currency). */
const amountIn = (n: number | undefined, currency?: string) => (!currency || currency === "RWF" ? fmtMoney(n || 0) : money(n, currency));

type Act = { key: string; label: string; icon: LucideIcon; run?: () => void; href?: string; main?: boolean };

export default function PurchaseOrderDetail() {
  const { poId } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [params, setParams] = useSearchParams();
  const rawTab = params.get("tab") || "details";
  const tab: TabKey = TAB_ALIAS[rawTab] || (TAB_KEYS.includes(rawTab as TabKey) ? (rawTab as TabKey) : "details");
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
  if (q.isLoading) {
    return (
      <Page>
        <Skeleton className="h-5 w-48" />
        <Skeleton className="h-16 w-full max-w-2xl" />
        <Skeleton className="h-64 w-full" />
      </Page>
    );
  }
  if (!po) {
    return (
      <Page>
        <Card>
          <EmptyState
            icon={ShoppingCart}
            text="This purchase order is not available. It may have been deleted, or your role cannot see it."
            action={<ButtonLink to={LIST}>Back to purchase orders</ButtonLink>}
          />
        </Card>
      </Page>
    );
  }

  const { receipts, invoices, payments, actions, audit } = q.data!;
  const returns: any[] = q.data!.returns;
  const approval = po.expand?.approval;
  const isBuyer = po.buyer === me?.id;
  // The server additionally requires the buyer or an organisation-wide procurement role.
  const canManage = canPerform("manage_purchase_orders");
  const isApprover = approval?.status === "pending" && (approval.pending_approvers || "").split(",").includes(me?.id);
  const editable = ["draft", "returned"].includes(po.status);
  const receivable = OPEN_PO_STATUSES.includes(po.status);
  const late = receivable ? overdue(po.expected_delivery_date) : null;
  const items: any[] = po.items || [];
  const hasDisc = items.some((l) => l.discount_pct);
  const activeBills = invoices.filter((i: any) => !["cancelled", "rejected"].includes(i.status));
  const billedQty: Record<number, number> = {};
  for (const inv of activeBills) for (const l of inv.items || []) billedQty[l.line] = (billedQty[l.line] || 0) + (Number(l.quantity) || 0);
  const canBill = canPerform("manage_invoices") && po.received_value > 0 && !["cancelled", "rejected", "draft", "pending_approval", "returned"].includes(po.status) && (po.invoiced_value || 0) < po.received_value - 1;
  const openExceptions = invoices.filter((i: any) => i.status === "exception").length;
  const paid = (payments as any[]).reduce((a: number, p: any) => a + p.amount, 0) || po.paid_value || 0;
  const setTab = (t: string) => setParams(t === "details" ? {} : { tab: t });
  const cur = po.currency || "RWF";
  const amount = (n?: number) => amountIn(n, cur);
  const pct = (v: number) => (po.grand_total ? Math.min(100, Math.round((v / po.grand_total) * 100)) : 0);
  const stepName = approval?.status === "pending" ? approval.steps?.[approval.current_level]?.name : null;
  const canReceive = canPerform("receive_goods") && receivable;
  const printable = !["draft", "pending_approval", "returned", "rejected", "cancelled"].includes(po.status);
  const goReceive = () => navigate(`${LIST}/${po.id}/receive`);

  // The next step is the primary button, then at most two secondary buttons; the rest go under "More".
  const acts = ([
    isApprover && { key: "approve", label: "Approve", icon: Check, run: () => setDecision("approve"), main: true },
    isApprover && { key: "return", label: "Return", icon: CornerUpLeft, run: () => setDecision("return") },
    isApprover && { key: "reject", label: "Reject", icon: XCircle, run: () => setDecision("reject") },
    canManage && editable && isBuyer && { key: "submit", label: "Submit for approval", icon: Send, run: () => setDecision("submit"), main: true },
    canManage && editable && { key: "edit", label: "Edit", icon: Pencil, run: () => setEditing(true) },
    canManage && po.status === "approved" && { key: "send", label: "Send to supplier", icon: Send, run: () => setStep("send"), main: true },
    canManage && po.status === "sent" && { key: "acknowledge", label: "Record acknowledgement", icon: CheckCheck, run: () => setStep("acknowledge"), main: true },
    canReceive && { key: "receive", label: "Receive delivery", icon: PackageCheck, run: goReceive, main: true },
    canBill && { key: "bill", label: "Create bill", icon: Receipt, run: () => setBilling(true), main: true },
    printable && { key: "print", label: "Print", icon: Printer, href: `/print/po/${po.id}` },
  ].filter(Boolean) as Act[]);
  const primaryAct = acts.find((a) => a.main);
  const rest = acts.filter((a) => a !== primaryAct);
  const shownSecondary = rest.slice(0, 2);
  const renderAct = (a: Act, variant: "primary" | "secondary") =>
    a.href ? (
      <a key={a.key} href={a.href} target="_blank" rel="noreferrer" className={buttonClass({ variant })}>
        <a.icon size={16} aria-hidden /> {a.label}
      </a>
    ) : (
      <Button key={a.key} variant={variant} icon={a.icon} onClick={a.run}>{a.label}</Button>
    );
  const more: MenuItem[] = [
    ...rest.slice(2).map((a) => ({ label: a.label, icon: a.icon, onSelect: a.href ? () => window.open(a.href, "_blank", "noopener,noreferrer") : a.run! })),
    { label: "Delegate", icon: UserPlus, onSelect: () => setDecision("delegate"), hidden: !isApprover },
    { label: "Escalate", icon: ArrowUpRight, onSelect: () => setDecision("escalate"), hidden: !isApprover },
    { label: "Comment", icon: MessageSquare, onSelect: () => setDecision("comment"), hidden: !approval },
    { label: "Close order", icon: Lock, onSelect: () => setStep("close"), hidden: !(canManage && ["partially_received", "fully_received"].includes(po.status)) },
    { label: "Amend order", icon: GitBranch, onSelect: () => setAmending(true), hidden: !(canPerform("amend_purchase_orders") && ["approved", "sent", "acknowledged", "partially_received"].includes(po.status)) },
    { label: "Cancel order", icon: Ban, danger: true, onSelect: () => setDecision("cancel"), hidden: !(canManage && ["draft", "returned", "pending_approval", "approved", "sent", "acknowledged"].includes(po.status)) },
  ];

  const statusNote = [stepName ? `At “${stepName}”` : PO_STATUS[po.status]?.note, late].filter(Boolean).join(" · ");
  const showMoney = receivable || po.received_value > 0 || (po.invoiced_value || 0) > 0;
  const lineSum = items.reduce((a, l) => a + (Number(l.total) || 0), 0);

  const lineColumns: Column<any>[] = [
    { key: "line", header: "#", width: "48px", cell: (l, i) => <span className="text-ims-muted">{l.line || i + 1}</span> },
    { key: "description", header: "Description", clamp: true, cell: (l) => l.description, sub: (l) => [l.brand, l.specification].filter(Boolean).join(" · ") },
    { key: "type", header: "Type", nowrap: true, cell: (l) => (LINE_TYPES[l.line_type] ? <Badge tone={LINE_TYPES[l.line_type].tone}>{LINE_TYPES[l.line_type].label}</Badge> : "—") },
    { key: "quantity", header: "Quantity", numeric: true, cell: (l) => `${fmtNumber(l.quantity, true)} ${l.unit || ""}`.trim() },
    {
      key: "received",
      header: "Received",
      numeric: true,
      cell: (l) => {
        const rec = l.received_qty || 0;
        return <span className={cn(rec >= l.quantity ? "text-ims-success" : rec > 0 ? "text-ims-warning" : "text-ims-faint")}>{fmtNumber(rec, true)}</span>;
      },
      sub: (l) => (l.rejected_qty ? <span className="text-ims-danger">{fmtNumber(l.rejected_qty, true)} rejected</span> : null),
    },
    {
      key: "billed",
      header: "Billed",
      numeric: true,
      cell: (l) => {
        const rec = l.received_qty || 0;
        const bil = billedQty[l.line] || 0;
        return <span className={cn(bil >= rec && bil > 0 ? "text-ims-success" : bil > 0 ? "text-ims-warning" : "text-ims-faint")}>{fmtNumber(bil, true)}</span>;
      },
    },
    { key: "unit_price", header: `Unit price (${cur})`, numeric: true, cell: (l) => <Num value={l.unit_price} /> },
    ...(hasDisc ? [{ key: "discount", header: "Discount (%)", numeric: true, cell: (l: any) => (l.discount_pct ? fmtNumber(l.discount_pct, true) : "—") }] : []),
    { key: "tax", header: "Tax", numeric: true, cell: (l) => (l.tax_rate ? `VAT ${fmtNumber(l.tax_rate, true)}%` : "Exempt") },
    { key: "total", header: `Total (${cur})`, numeric: true, cell: (l) => <Num value={l.total} />, total: <Num value={lineSum} /> },
  ];

  const receiptColumns: Column<any>[] = [
    { key: "number", header: "Receipt", nowrap: true, cell: (g) => <DocNo value={g.number} />, sub: (g) => (g.delivery_note_number ? `Delivery note ${g.delivery_note_number}` : null) },
    { key: "date", header: "Date", nowrap: true, cell: (g) => fmtDate(g.receipt_date) },
    { key: "location", header: "Location", cell: (g) => (g.receipt_type === "service" ? "Service confirmation" : g.expand?.warehouse?.name || "—") },
    { key: "by", header: "Received by", className: "max-w-[180px]", cell: (g) => <Person name={g.expand?.received_by?.name} /> },
    {
      key: "lines",
      header: "Lines",
      className: "min-w-[220px]",
      cell: (g) => (
        <ul className="space-y-0.5 text-t-small text-ims-body">
          {(g.items || []).map((i: any) => (
            <li key={i.line}>
              {i.description}: <span className="font-semibold tabular-nums text-ims-text">{fmtNumber(i.accepted, true)}</span>
              {i.rejected ? <span className="text-ims-danger"> · {fmtNumber(i.rejected, true)} rejected ({i.rejection_reason})</span> : null}
            </li>
          ))}
        </ul>
      ),
    },
    { key: "value", header: `Accepted (${cur})`, numeric: true, cell: (g) => <Num value={g.accepted_value} />, total: <Num value={receipts.reduce((a: number, g: any) => a + (g.accepted_value || 0), 0)} /> },
  ];

  const billColumns: Column<any>[] = [
    { key: "number", header: "Bill", nowrap: true, cell: (i) => <DocNo value={i.number} /> },
    { key: "ref", header: "Supplier reference", cell: (i) => i.supplier_invoice_number || "—" },
    { key: "date", header: "Bill date", nowrap: true, cell: (i) => fmtDate(i.invoice_date) },
    {
      key: "due",
      header: "Due",
      nowrap: true,
      cell: (i) => {
        const o = i.balance > 0 ? overdue(i.due_date) : null;
        return <span className={cn(o && "font-semibold text-ims-danger")}>{fmtDate(i.due_date)}</span>;
      },
      sub: (i) => (i.balance > 0 && overdue(i.due_date) ? <span className="text-ims-danger">{overdue(i.due_date)}</span> : null),
    },
    { key: "total", header: `Total (${cur})`, numeric: true, cell: (i) => <Num value={i.total} />, total: <Num value={(invoices as any[]).reduce((a: number, i: any) => a + (i.total || 0), 0)} /> },
    { key: "balance", header: `Balance (${cur})`, numeric: true, cell: (i) => <Num value={i.balance} />, total: <Num value={(invoices as any[]).reduce((a: number, i: any) => a + (i.balance || 0), 0)} /> },
    { key: "status", header: "Status", cell: (i) => <StatusBadge status={i.status} map={INVOICE_STATUS} /> },
  ];

  const paymentColumns: Column<any>[] = [
    { key: "number", header: "Payment", nowrap: true, cell: (p) => <DocNo value={p.number} /> },
    { key: "date", header: "Date", nowrap: true, cell: (p) => fmtDate(p.payment_date) },
    { key: "bill", header: "Bill", nowrap: true, cell: (p) => <DocNo value={p.expand?.invoice?.number} /> },
    { key: "method", header: "Method", cell: (p) => PAYMENT_METHODS[p.method] || p.method || "—" },
    { key: "reference", header: "Reference", cell: (p) => p.reference || "—" },
    { key: "amount", header: `Amount (${cur})`, numeric: true, cell: (p) => <Num value={p.amount} />, total: <Num value={paid} /> },
  ];

  return (
    <Page>
      <DetailHeader
        back={{ label: "Back to purchase orders", to: LIST }}
        number={po.number}
        type={`${po.source === "direct" ? "Direct purchase order" : "Purchase order"}${po.revision > 0 ? ` · revision ${po.revision}` : ""}`}
        status={PO_STATUS[po.status]?.label || po.status}
        statusNote={statusNote ? <span className={cn(late && "text-ims-danger")}>{statusNote}</span> : undefined}
        title={po.title || "Untitled order"}
        facts={[
          { label: "Supplier", value: po.expand?.supplier?.name || "—" },
          po.expand?.department?.name,
          po.expected_delivery_date ? { label: "Expected", value: fmtDate(po.expected_delivery_date) } : null,
          <strong key="total" className="font-bold text-ims-text">{amount(po.grand_total)}</strong>,
        ]}
        actions={
          <>
            <MoreMenu items={more} />
            {shownSecondary.map((a) => renderAct(a, "secondary"))}
            {primaryAct && renderAct(primaryAct, "primary")}
          </>
        }
      />

      {isApprover && (
        <p role="status" className="flex items-start gap-2 rounded-card border border-ims-warning/30 bg-ims-warning-bg px-4 py-3 text-t-body text-ims-warning">
          <Clock size={16} className="mt-0.5 shrink-0" aria-hidden />
          <span>Waiting for your decision{stepName ? ` at step “${stepName}”` : ""}. Approve it, return it for changes, or reject it.</span>
        </p>
      )}
      {late && (
        <p role="status" className="flex items-start gap-2 rounded-card border border-ims-danger/30 bg-ims-danger-bg px-4 py-3 text-t-body text-ims-danger">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" aria-hidden />
          <span>Delivery was expected on {fmtDate(po.expected_delivery_date)} ({late.toLowerCase()}). Follow up with the supplier.</span>
        </p>
      )}
      {openExceptions > 0 && (
        <p role="status" className="flex flex-wrap items-start gap-2 rounded-card border border-ims-danger/30 bg-ims-danger-bg px-4 py-3 text-t-body text-ims-danger">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" aria-hidden />
          <span>
            {openExceptions} supplier bill{openExceptions > 1 ? "s have" : " has"} a three-way match exception.{" "}
            <button type="button" className="font-bold underline underline-offset-2 hover:no-underline" onClick={() => setTab("receipts")}>Review the bills</button>
          </span>
        </p>
      )}
      {po.status === "cancelled" && po.cancel_reason && (
        <p className="rounded-card border border-ims-border bg-ims-card px-4 py-3 text-t-body text-ims-body">
          <span className="font-semibold text-ims-text">Cancelled.</span> {po.cancel_reason}
        </p>
      )}

      {showMoney && (
        <KpiBand
          items={[
            { label: "Received", value: amount(po.received_value), sub: `${pct(po.received_value)}% of the order`, onClick: () => setTab("receipts") },
            { label: "Still to receive", value: amount(Math.max((po.grand_total || 0) - (po.received_value || 0), 0)), sub: `${receipts.length} deliver${receipts.length === 1 ? "y" : "ies"} so far` },
            {
              label: "Billed",
              value: amount(po.invoiced_value || 0),
              sub: openExceptions ? `${openExceptions} match exception${openExceptions > 1 ? "s" : ""}` : `${activeBills.length} bill${activeBills.length === 1 ? "" : "s"}`,
              tone: openExceptions ? "danger" : "default",
              onClick: () => setTab("receipts"),
            },
            { label: "Paid", value: amount(paid), sub: `${pct(paid)}% of the order`, tone: paid > 0 && paid >= po.grand_total - 1 ? "success" : "default", onClick: () => setTab("receipts") },
          ]}
        />
      )}

      <Tabs
        label="Purchase order sections"
        active={tab}
        onChange={setTab}
        tabs={[
          { key: "details", label: "Details" },
          { key: "items", label: "Items", count: items.length },
          { key: "receipts", label: "Deliveries & bills" },
          { key: "approval", label: "Approvals" },
          { key: "activity", label: "Activity" },
        ]}
      />

      {tab === "details" && (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
          <div className="min-w-0 space-y-4 xl:col-span-2">
            <Card>
              <CardHeader title="Order" />
              <Details
                items={[
                  {
                    label: "Supplier",
                    value: <Link className="font-semibold text-ims-link hover:underline" to={`/dashboard/procurement/suppliers/${po.supplier}`}>{po.expand?.supplier?.name}</Link>,
                    hint: [po.expand?.supplier?.email, po.expand?.supplier?.phone].filter(Boolean).join(" · ") || undefined,
                  },
                  { label: "Supplier code", value: po.expand?.supplier?.code },
                  { label: "Order date", value: po.order_date ? fmtDate(po.order_date) : null },
                  {
                    label: "Expected delivery",
                    value: po.expected_delivery_date ? <span className={cn(late && "font-semibold text-ims-danger")}>{fmtDate(po.expected_delivery_date)}</span> : null,
                    hint: late ? <span className="text-ims-danger">{late}</span> : undefined,
                  },
                  { label: "Deliver to", value: po.delivery_location || po.expand?.branch?.name },
                  { label: "Buyer", value: po.expand?.buyer?.name },
                  { label: "Department", value: po.expand?.department?.name, hint: po.expand?.requester?.name ? `Requested by ${po.expand.requester.name}` : undefined },
                  { label: "Category", value: po.expand?.category?.name },
                  { label: "Office", value: po.expand?.branch?.name },
                  { label: "Currency", value: po.currency },
                  { label: "Payment terms", value: po.payment_terms },
                  { label: "Delivery terms", value: po.delivery_terms },
                  { label: "Sent to supplier", value: po.sent_at ? fmtDateTime(po.sent_at) : null },
                  { label: "Created", value: fmtDateTime(po.created) },
                  ...(po.source === "direct" ? [{ label: "Why a direct purchase", value: po.justification ? <span className="whitespace-pre-line">{po.justification}</span> : null, wide: true }] : []),
                  ...(po.cancel_reason ? [{ label: "Cancellation reason", value: <span className="whitespace-pre-line">{po.cancel_reason}</span>, wide: true }] : []),
                  ...(po.notes ? [{ label: "Internal notes", value: <span className="whitespace-pre-line">{po.notes}</span>, wide: true }] : []),
                ]}
              />
            </Card>
            {(po.revisions || []).length > 0 && <Revisions po={po} />}
          </div>
          <div className="min-w-0 space-y-4">
            {po.status !== "cancelled" && (
              <BudgetPanel
                documentType="purchase_order" documentId={po.id} number={po.number} lineId={po.budget_line} department={po.department}
                amount={Math.round(po.grand_total || 0)} committed={po.committed_amount || 0} overrideId={po.budget_override}
                editable={editable && canManage && !po.committed_amount} allowOverride={editable}
                onChangeLine={(id) => pocketbase.collection("purchase_orders").update(po.id, { budget_line: id })} onDone={refresh} stacked
              />
            )}
            <DocumentFlow po={po} receipts={receipts} invoices={invoices} payments={payments} returns={returns} onTab={setTab} />
            <Card>
              <CardHeader title="Documents" subtitle="Signed order, delivery notes and correspondence." />
              <DocumentUploads collection="purchase_orders" record={po} canAdd={canManage || canPerform("receive_goods") || canPerform("approve_purchase_orders") || canPerform("manage_invoices")} canRemove={canManage && editable} onChange={refresh} hint="PDF, images, Word or Excel, up to 20 MB each" />
            </Card>
          </div>
        </div>
      )}

      {tab === "items" && (
        <Card padded={false}>
          <div className="px-5 pt-5">
            <CardHeader title="Items and services" subtitle={po.source === "direct" ? "Direct purchase: prices can be corrected in the draft." : "Prices are those of the awarded quotation."} />
          </div>
          <DataTable columns={lineColumns} rows={items} rowKey={(l, i) => String(l.line ?? i)} minWidth={hasDisc ? 980 : 900} caption="Items and services" empty={<EmptyState compact text="No items on this order." />} />
          <div className="flex flex-col gap-4 border-t border-ims-divider px-5 pb-5 sm:flex-row sm:items-start sm:justify-between">
            <p className="mt-4 max-w-md text-t-small text-ims-muted">
              {po.payment_terms ? (
                <>
                  Payment terms: <span className="text-ims-body">{po.payment_terms}</span>
                </>
              ) : (
                "No payment terms on the order yet."
              )}
            </p>
            <Totals
              rows={[
                ["Untaxed amount", amount(po.subtotal - (po.discount_total || 0))],
                ...(po.discount_total ? [["Discount", `− ${amount(po.discount_total)}`] as [string, string]] : []),
                ["VAT", amount(po.tax_total)],
                ...(po.delivery_cost + po.other_charges ? [["Delivery and other charges", amount(po.delivery_cost + po.other_charges)] as [string, string]] : []),
              ]}
              total={["Total", amount(po.grand_total)]}
            />
          </div>
        </Card>
      )}

      {tab === "receipts" && (
        <div className="space-y-4">
          <Card padded={false}>
            <div className="px-5 pt-5">
              <CardHeader
                title="Deliveries"
                subtitle="Goods received notes and service confirmations for this order."
                action={canReceive && receipts.length > 0 ? <Button icon={PackageCheck} onClick={goReceive}>Receive delivery</Button> : undefined}
              />
            </div>
            <DataTable
              columns={receiptColumns}
              rows={receipts}
              rowKey={(g) => g.id}
              minWidth={860}
              caption="Deliveries"
              rowActions={(g) => [
                { label: "Print receipt", icon: Printer, onSelect: () => window.open(`/print/grn/${g.id}`, "_blank", "noopener,noreferrer") },
                ...((canPerform("receive_goods") || canManage) && (g.items || []).some((i: any) => i.line_type === "goods" && i.accepted > 0)
                  ? [{ label: "Return to supplier", icon: Undo2, onSelect: () => setReturning(g.id) }]
                  : []),
              ]}
              empty={
                <EmptyState
                  compact
                  icon={PackageCheck}
                  text={receivable ? "Nothing received yet." : "Deliveries can be recorded once the order is approved."}
                  action={canReceive ? <Button variant="primary" icon={PackageCheck} onClick={goReceive}>Receive delivery</Button> : undefined}
                />
              }
            />
          </Card>

          <Card padded={false}>
            <div className="px-5 pt-5">
              <CardHeader
                title="Supplier bills"
                subtitle="Each bill is matched against the order and what was received."
                action={canBill && invoices.length > 0 ? <Button icon={Receipt} onClick={() => setBilling(true)}>Create bill</Button> : undefined}
              />
            </div>
            <DataTable
              columns={billColumns}
              rows={invoices}
              rowKey={(i) => i.id}
              minWidth={820}
              caption="Supplier bills"
              onRowClick={(i) => navigate(`/dashboard/finance/invoices/${i.id}`)}
              empty={
                <EmptyState
                  compact
                  icon={Receipt}
                  text={po.received_value > 0 ? "No supplier bill recorded yet." : "Bills can be recorded once goods or services have been received."}
                  action={canBill ? <Button variant="primary" icon={Receipt} onClick={() => setBilling(true)}>Create bill</Button> : undefined}
                />
              }
            />
          </Card>

          {payments.length > 0 && (
            <Card padded={false}>
              <div className="px-5 pt-5">
                <CardHeader title="Payments" subtitle="Payments made against the bills of this order." />
              </div>
              <DataTable columns={paymentColumns} rows={payments} rowKey={(p) => p.id} minWidth={680} caption="Payments" />
            </Card>
          )}
        </div>
      )}

      {tab === "approval" && <ApprovalTracker approval={approval} actions={actions} />}

      {tab === "activity" && (
        // The avatar wrapper in Chatter stretches with the row; keep its status dot on the avatar.
        <div className="[&_ol>li>div.relative]:self-start">
          <Chatter
            items={toChatter(actions, audit)}
            composer={approval ? <Button size="sm" icon={MessageSquare} onClick={() => setDecision("comment")}>Add a comment</Button> : undefined}
          />
        </div>
      )}

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
    </Page>
  );
}

/** Keeps a document number on one line inside a sentence. */
function withNumber(text: string, number: string) {
  const i = number ? text.indexOf(number) : -1;
  if (i < 0) return text;
  return (
    <>
      {text.slice(0, i)}
      <span className="whitespace-nowrap">{number}</span>
      {text.slice(i + number.length)}
    </>
  );
}

function StepDialog({ po, step, onClose, onDone }: { po: any; step: "send" | "acknowledge" | "close" | null; onClose: () => void; onDone: () => void }) {
  const [reason, setReason] = React.useState("");
  const [tried, setTried] = React.useState(false);
  React.useEffect(() => {
    setReason("");
    setTried(false);
  }, [step]);
  const copy = {
    send: { title: `Send ${po.number} to ${po.expand?.supplier?.name || "the supplier"}?`, text: "Print or save the order as PDF and send it to the supplier. This records the date it was issued.", verb: "Send to supplier", done: `${po.number} sent to the supplier` },
    acknowledge: { title: `Record that the supplier acknowledged ${po.number}?`, text: "The supplier confirmed the order and the delivery date.", verb: "Record acknowledgement", done: `${po.number} acknowledged by the supplier` },
    close: { title: `Close ${po.number}?`, text: "No further deliveries will be accepted. Use this when the remaining quantity will not be delivered.", verb: "Close order", done: `${po.number} closed` },
  } as const;
  const c = step ? copy[step] : null;
  const run = useMutation(() => purchasingApi.action(po.id, step!, { reason }), {
    onSuccess: () => { toast.success(c?.done || `${po.number} updated`); onDone(); },
    onError: (e) => { toast.error(errorMessage(e)); },
  });
  const missing = step === "close" && !reason.trim();
  return (
    <Modal
      open={Boolean(step)}
      onClose={run.isLoading ? () => undefined : onClose}
      size="sm"
      title={c ? withNumber(c.title, po.number) : ""}
      description={c?.text}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={run.isLoading}>Cancel</Button>
          <Button
            variant="primary"
            loading={run.isLoading}
            onClick={() => {
              setTried(true);
              if (!missing) run.mutate();
            }}
          >
            {c?.verb}
          </Button>
        </>
      }
    >
      {step === "close" && (
        <Field label="Reason" required htmlFor="po-close-reason" error={tried && missing ? "Say why the rest of the order will not be delivered." : null}>
          <Textarea id="po-close-reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="For example: the supplier discontinued the item" invalid={tried && missing} />
        </Field>
      )}
    </Modal>
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
    { onSuccess: () => { toast.success(`${po.number} saved`); onSaved(); }, onError: (e) => { toast.error(errorMessage(e)); } }
  );
  const set = (k: string) => (e: any) => setV((x) => ({ ...x, [k]: e.target.value }));
  const setItem = (i: number, patch: Record<string, unknown>) => setItems((x) => x.map((it, idx) => (idx === i ? { ...it, ...patch } : it)));
  const cur = po.currency || "RWF";

  const columns: Column<any>[] = [
    { key: "line", header: "Line", clamp: true, cell: (l) => l.description, sub: (l) => `Ordered ${fmtNumber(l.quantity, true)} ${l.unit || ""}`.trim() },
    ...(amended
      ? [{
          key: "quantity",
          header: "Quantity",
          width: "120px",
          cell: (l: any, i: number) => (
            <Input type="number" min={l.received_qty || 0} step="any" inputMode="decimal" className="text-right tabular-nums" value={l.quantity} onChange={(e) => setItem(i, { quantity: Number(e.target.value) })} aria-label={`Line ${l.line} quantity`} />
          ),
          sub: (l: any) => `At least ${fmtNumber(l.received_qty || 0, true)} (received)`,
        }]
      : []),
    {
      key: "type",
      header: "Receive as",
      width: "240px",
      cell: (l, i) => (
        <Select value={l.line_type} onChange={(e) => setItem(i, { line_type: e.target.value })} aria-label={`Line ${l.line} type`}>
          {Object.entries(LINE_TYPES).map(([k, t]) => (
            <option key={k} value={k}>{t.label}</option>
          ))}
        </Select>
      ),
      sub: (l) => LINE_TYPES[l.line_type]?.hint,
    },
    ...(direct
      ? [
          {
            key: "price",
            header: `Unit price (${cur})`,
            width: "190px",
            cell: (l: any, i: number) => <MoneyInput value={l.unit_price} onChange={(n) => setItem(i, { unit_price: Number(n) || 0 })} />,
          },
          {
            key: "tax",
            header: "Tax (%)",
            width: "96px",
            cell: (l: any, i: number) => (
              <Input type="number" min={0} max={100} step="any" inputMode="decimal" className="text-right tabular-nums" value={l.tax_rate} onChange={(e) => setItem(i, { tax_rate: Number(e.target.value) })} aria-label={`Line ${l.line} tax`} />
            ),
          },
        ]
      : []),
  ];

  return (
    <Modal
      open
      onClose={save.isLoading ? () => undefined : onClose}
      size={direct ? "xl" : "lg"}
      title={<>Edit <span className="whitespace-nowrap">{po.number}</span></>}
      description={direct ? "Direct purchase: prices can be corrected to the supplier's actual offer." : "Prices are locked to the awarded quotation. You can change the delivery details and how each line is received."}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={save.isLoading}>Cancel</Button>
          <Button variant="primary" onClick={() => save.mutate()} loading={save.isLoading}>Save</Button>
        </>
      }
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Expected delivery" htmlFor="po-expected">
          <DatePicker id="po-expected" value={v.expected_delivery_date} onChange={(d) => setV((x) => ({ ...x, expected_delivery_date: d }))} />
        </Field>
        <Field label="Delivery location" htmlFor="po-location">
          <Input id="po-location" value={v.delivery_location} onChange={set("delivery_location")} />
        </Field>
        <Field label="Payment terms" htmlFor="po-payment-terms">
          <Input id="po-payment-terms" value={v.payment_terms} onChange={set("payment_terms")} placeholder="For example: 30 days after delivery" />
        </Field>
        <Field label="Delivery terms" htmlFor="po-delivery-terms">
          <Input id="po-delivery-terms" value={v.delivery_terms} onChange={set("delivery_terms")} />
        </Field>
        {direct && (
          <Field label="Delivery cost" htmlFor="po-delivery-cost">
            <MoneyInput id="po-delivery-cost" value={v.delivery_cost} onChange={(n) => setV((x) => ({ ...x, delivery_cost: n === "" ? 0 : n }))} />
          </Field>
        )}
        {direct && (
          <Field label="Other charges" htmlFor="po-other-charges">
            <MoneyInput id="po-other-charges" value={v.other_charges} onChange={(n) => setV((x) => ({ ...x, other_charges: n === "" ? 0 : n }))} />
          </Field>
        )}
        <Field label="Contract" htmlFor="po-contract" className="sm:col-span-2" hint="When linked, the order must fit the contract period and remaining value.">
          <Select id="po-contract" value={v.contract} onChange={set("contract")}>
            <option value="">Not under a contract</option>
            {(contracts.data || []).map((c: any) => (
              <option key={c.id} value={c.id}>{c.number} · {c.title} (remaining {fmtMoney(c.remaining_value)})</option>
            ))}
          </Select>
        </Field>
        <Field label="Notes" htmlFor="po-notes" className="sm:col-span-2">
          <Textarea id="po-notes" value={v.notes} onChange={set("notes")} className="min-h-[72px]" />
        </Field>
      </div>
      <div className="overflow-hidden rounded-control border border-ims-border">
        <DataTable columns={columns} rows={items} rowKey={(l, i) => String(l.line ?? i)} minWidth={direct ? 840 : 560} caption="Lines" />
      </div>
    </Modal>
  );
}

/** Where the order comes from and what followed: requisition, RFQ, contract, receipts, bills, payments, returns. */
function DocumentFlow({ po, receipts, invoices, payments, returns, onTab }: { po: any; receipts: any[]; invoices: any[]; payments: any[]; returns: any[]; onTab: (t: string) => void }) {
  const navigate = useNavigate();
  const steps: { label: string; value: string; done: boolean; go?: () => void; mono?: boolean }[] = [
    { label: "Requisition", value: po.expand?.requisition?.number || "—", mono: Boolean(po.requisition), done: Boolean(po.requisition), go: po.requisition ? () => navigate(`/dashboard/procurement/requisitions/${po.requisition}`) : undefined },
    { label: po.source === "direct" ? "Direct purchase" : "Request for quotation", value: po.expand?.rfq?.number || (po.source === "direct" ? "No RFQ" : "—"), mono: Boolean(po.rfq), done: true, go: po.rfq ? () => navigate(`/dashboard/procurement/rfqs/${po.rfq}?tab=comparison`) : undefined },
    ...(po.expand?.contract ? [{ label: "Contract", value: po.expand.contract.number, mono: true, done: true, go: () => navigate(`/dashboard/procurement/contracts/${po.contract}`) }] : []),
    { label: "Deliveries", value: receipts.length ? `${receipts.length} receipt${receipts.length > 1 ? "s" : ""}` : "None yet", done: receipts.length > 0, go: () => onTab("receipts") },
    { label: "Supplier bills", value: invoices.length ? `${invoices.length} bill${invoices.length > 1 ? "s" : ""}` : "None yet", done: invoices.length > 0, go: () => onTab("receipts") },
    { label: "Payments", value: payments.length ? amountIn(payments.reduce((a: number, p: any) => a + p.amount, 0), po.currency) : "None yet", done: payments.length > 0, go: () => onTab("receipts") },
    ...(returns.length ? [{ label: "Returns", value: `${returns.length} return${returns.length > 1 ? "s" : ""}`, done: true, go: () => navigate(`/dashboard/procurement/returns/${returns[0].id}`) }] : []),
  ];
  return (
    <Card>
      <CardHeader title="Linked documents" subtitle="Where the order comes from and what followed." />
      <nav aria-label="Linked documents">
        <ul className="-mx-2 divide-y divide-ims-divider">
          {steps.map((st) => {
            const body = (
              <>
                <span className="min-w-0">
                  <span className="block text-t-small text-ims-muted">{st.label}</span>
                  <span className={cn("block truncate", st.mono ? "whitespace-nowrap font-mono text-[13px]" : "text-t-body", st.done ? "font-semibold text-ims-text" : "text-ims-faint")}>{st.value}</span>
                </span>
                {st.go && <ChevronRight size={16} className="shrink-0 text-ims-faint" aria-hidden />}
              </>
            );
            return (
              <li key={st.label}>
                {st.go ? (
                  <button type="button" onClick={st.go} className="flex w-full items-center justify-between gap-3 rounded-control px-2 py-2.5 text-left hover:bg-ims-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ims-focus">
                    {body}
                  </button>
                ) : (
                  <div className="flex items-center justify-between gap-3 px-2 py-2.5">{body}</div>
                )}
              </li>
            );
          })}
        </ul>
      </nav>
    </Card>
  );
}

function Revisions({ po }: { po: any }) {
  const rows = [...(po.revisions || [])].reverse();
  const cur = po.currency || "RWF";
  const columns: Column<any>[] = [
    { key: "revision", header: "Revision", nowrap: true, cell: (r) => `${r.revision} to ${r.revision + 1}` },
    { key: "at", header: "Amended", nowrap: true, cell: (r) => fmtDateTime(r.amended_at) },
    { key: "by", header: "By", cell: (r) => r.amended_by || "—" },
    { key: "reason", header: "Reason", clamp: true, cell: (r) => r.reason },
    { key: "value", header: `Value before (${cur})`, numeric: true, cell: (r) => <Num value={r.grand_total} /> },
    { key: "lines", header: "Lines before", clamp: true, cell: (r) => (r.items || []).map((l: any) => `${l.description} × ${fmtNumber(l.quantity, true)}`).join("; ") },
  ];
  return (
    <Card padded={false}>
      <div className="px-5 pt-5">
        <CardHeader title="Revisions" subtitle="The approved version is kept each time the order is amended." />
      </div>
      <DataTable columns={columns} rows={rows} rowKey={(r) => String(r.revision)} minWidth={720} caption="Revisions" />
    </Card>
  );
}

function AmendDialog({ po, onClose, onDone }: { po: any; onClose: () => void; onDone: () => void }) {
  const [reason, setReason] = React.useState("");
  const [tried, setTried] = React.useState(false);
  const run = useMutation(() => purchasingApi.action(po.id, "amend" as any, { reason }), {
    onSuccess: () => {
      toast.success(`${po.number} is back in draft as revision ${(po.revision || 0) + 1}. Edit it and submit it for approval.`);
      onDone();
    },
    onError: (e) => {
      toast.error(errorMessage(e));
    },
  });
  const short = reason.trim().length < 10;
  return (
    <Modal
      open
      onClose={run.isLoading ? () => undefined : onClose}
      title={<>Amend <span className="whitespace-nowrap">{po.number}</span>?</>}
      description="The approved version is kept in the revision history. The amended order must be approved again before it is sent."
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={run.isLoading}>Cancel</Button>
          <Button
            variant="primary"
            icon={GitBranch}
            loading={run.isLoading}
            onClick={() => {
              setTried(true);
              if (reason.trim().length >= 10) run.mutate();
            }}
          >
            Start amendment
          </Button>
        </>
      }
    >
      <Field
        label="Why is the order amended?"
        required
        htmlFor="po-amend-reason"
        error={tried && short ? "Write at least 10 characters so approvers know what changed." : null}
        hint="Quantities cannot go below what was already received. For orders from an RFQ, prices stay as awarded."
      >
        <Textarea id="po-amend-reason" rows={4} value={reason} onChange={(e) => setReason(e.target.value)} invalid={tried && short} placeholder="For example: the supplier can only deliver 8 of the 10 units this quarter; quantity reduced as agreed by email on 12 Sept." />
      </Field>
    </Modal>
  );
}
