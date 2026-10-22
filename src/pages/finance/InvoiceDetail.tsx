import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "react-query";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { AlertTriangle, ArrowUpRight, Ban, Banknote, Check, CheckCircle2, Clock, CornerUpLeft, FileText, LucideIcon, MessageSquare, Send, ShieldAlert, UserPlus, XCircle } from "lucide-react";
import pocketbase from "@/lib/pocketbase";
import { useRoles } from "@/context/roles.context";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/utils";
import DocumentUploads from "@/components/enterprise/Attachments";
import { ActionDialog, ActionKind, Activity, ApprovalTracker } from "@/components/enterprise/Approval";
import { Totals } from "@/components/enterprise/DocumentLayout";
import {
  Button,
  ButtonLink,
  Card,
  CardHeader,
  Column,
  DataTable,
  DetailHeader,
  Details,
  DocNo,
  EmptyState,
  Field,
  KpiBand,
  MenuItem,
  Modal,
  MoreMenu,
  Num,
  Page,
  Person,
  Tabs,
  Textarea,
  fmtDate,
  fmtDateTime,
  fmtMoney,
  fmtNumber,
  overdue as overdueText,
  sentence,
  statusText,
  statusWord,
} from "@/components/ims";
import { INVOICE_STATUS, PAYMENT_METHODS, PO_STATUS, errorMessage, financeApi, money, procurementApi } from "@/lib/procurement";

type TabKey = "details" | "lines" | "payments" | "approval" | "activity";
const TAB_KEYS: TabKey[] = ["details", "lines", "payments", "approval", "activity"];
/** Older links (?tab=documents) still land on the right section. */
const TAB_ALIAS: Record<string, TabKey> = { documents: "details", items: "lines", approvals: "approval" };
const LIST = "/dashboard/finance/invoices";

type Act = { key: string; label: string; icon: LucideIcon; run: () => void; main?: boolean };

export default function InvoiceDetail() {
  const { invoiceId } = useParams();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const rawTab = params.get("tab") || "details";
  const tab: TabKey = TAB_ALIAS[rawTab] || (TAB_KEYS.includes(rawTab as TabKey) ? (rawTab as TabKey) : "details");
  const setTab = (t: string) => setParams(t === "details" ? {} : { tab: t });
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
  if (q.isLoading) {
    return (
      <Page>
        <Skeleton className="h-5 w-48" />
        <Skeleton className="h-16 w-full max-w-2xl" />
        <Skeleton className="h-64 w-full" />
      </Page>
    );
  }
  if (!inv) {
    return (
      <Page>
        <Card>
          <EmptyState
            icon={FileText}
            text="This supplier invoice is not available. It may have been deleted, or your role cannot see it."
            action={<ButtonLink to={LIST}>Back to supplier invoices</ButtonLink>}
          />
        </Card>
      </Page>
    );
  }

  const { actions, audit } = q.data!;
  const payments: any[] = q.data!.payments;
  const po = inv.expand?.purchase_order;
  const approval = inv.expand?.approval;
  const isApprover = approval?.status === "pending" && (approval.pending_approvers || "").split(",").includes(me?.id);
  const issues: string[] = inv.match_result?.issues || [];
  const lines: any[] = inv.items || [];
  const payable = ["approved", "partially_paid"].includes(inv.status);
  const late = inv.balance > 0 && payable ? overdueText(inv.due_date) : null;
  const cur = inv.currency || "RWF";
  const amount = (n?: number) => (cur === "RWF" ? fmtMoney(n || 0) : money(n, cur));
  const stepName = approval?.status === "pending" ? approval.steps?.[approval.current_level]?.name : null;
  const canVoucher = canPerform("manage_payment_vouchers") && payable;
  const goVoucher = () => navigate(`/dashboard/finance/vouchers/new?supplier=${inv.supplier}&invoice=${inv.id}`);

  // The next step is the primary button, then at most two secondary buttons; the rest go under "More".
  const acts = [
    isApprover && { key: "approve", label: "Approve", icon: Check, run: () => setDecision("approve"), main: true },
    isApprover && { key: "return", label: "Return", icon: CornerUpLeft, run: () => setDecision("return") },
    isApprover && { key: "reject", label: "Reject", icon: XCircle, run: () => setDecision("reject") },
    canPerform("resolve_invoice_exceptions") && inv.status === "exception" && { key: "resolve", label: "Resolve exception", icon: ShieldAlert, run: () => setResolving(true), main: true },
    canPerform("manage_invoices") && ["matched", "returned"].includes(inv.status) && { key: "submit", label: "Submit for approval", icon: Send, run: () => setDecision("submit"), main: true },
    canVoucher && { key: "voucher", label: "Prepare payment voucher", icon: Banknote, run: goVoucher, main: true },
  ].filter(Boolean) as Act[];
  const primaryAct = acts.find((a) => a.main);
  const rest = acts.filter((a) => a !== primaryAct);
  const more: MenuItem[] = [
    ...rest.slice(2).map((a) => ({ label: a.label, icon: a.icon, onSelect: a.run })),
    { label: "Delegate", icon: UserPlus, onSelect: () => setDecision("delegate"), hidden: !isApprover },
    { label: "Escalate", icon: ArrowUpRight, onSelect: () => setDecision("escalate"), hidden: !isApprover },
    { label: "Add a comment", icon: MessageSquare, onSelect: () => setDecision("comment"), hidden: !approval },
    { label: "Cancel invoice", icon: Ban, danger: true, onSelect: () => setDecision("cancel"), hidden: !(canPerform("manage_invoices") && !["partially_paid", "paid", "cancelled"].includes(inv.status)) },
  ];

  const statusNote = [stepName ? `At “${stepName}”` : INVOICE_STATUS[inv.status]?.note, late].filter(Boolean).join(" · ");
  const matchText = inv.match_status === "matched" ? "Matched" : inv.match_status === "partial" ? "Partial match" : inv.exception_overridden ? "Resolved" : `${issues.length} issue${issues.length === 1 ? "" : "s"}`;
  const matchTone = inv.match_status === "matched" ? "success" : inv.match_status === "partial" || inv.exception_overridden ? "warning" : "danger";
  const tolerance = inv.match_result?.price_tolerance_pct ?? 2;
  const lineSum = lines.reduce((a, l) => a + (Number(l.total) || 0), 0);

  const lineColumns: Column<any>[] = [
    {
      key: "description",
      header: "Description",
      className: "min-w-[240px]",
      cell: (l) => <span className="font-semibold">{l.description}</span>,
      sub: (l) =>
        (l.issues || []).length ? (
          <>
            {l.unit}
            <span className="mt-1 block space-y-0.5 text-ims-danger">{l.issues.map((i: string) => <span key={i} className="block">{i}</span>)}</span>
          </>
        ) : (
          <span className="inline-flex items-center gap-1">{l.unit}{l.unit ? " · " : ""}<span className="inline-flex items-center gap-1 font-semibold text-ims-success"><CheckCircle2 size={13} aria-hidden /> Matches</span></span>
        ),
    },
    { key: "ordered", header: "Ordered", numeric: true, cell: (l) => fmtNumber(l.ordered, true) },
    { key: "received", header: "Received", numeric: true, cell: (l) => fmtNumber(l.received, true) },
    { key: "before", header: "Invoiced before", numeric: true, cell: (l) => <span className="text-ims-muted">{fmtNumber(l.invoiced_before ?? 0, true)}</span> },
    {
      key: "quantity",
      header: "Invoiced now",
      numeric: true,
      cell: (l) => {
        const qtyBad = l.received !== undefined && l.invoiced_before + l.quantity > l.received;
        return <span className={cn("font-semibold", qtyBad && "text-ims-danger")}>{fmtNumber(l.quantity, true)}</span>;
      },
    },
    { key: "po_price", header: `Order price (${cur})`, numeric: true, cell: (l) => (l.po_unit_price ? <span className="text-ims-muted"><Num value={l.po_unit_price} /></span> : "—") },
    {
      key: "price",
      header: `Invoice price (${cur})`,
      numeric: true,
      cell: (l) => {
        const priceBad = l.po_unit_price && Math.abs(l.unit_price - l.po_unit_price) / l.po_unit_price > tolerance / 100;
        return <span className={cn(priceBad && "font-semibold text-ims-danger")}><Num value={l.unit_price} /></span>;
      },
    },
    { key: "tax", header: "Tax (%)", numeric: true, cell: (l) => fmtNumber(l.tax_rate || 0, true) },
    { key: "total", header: `Amount (${cur})`, numeric: true, cell: (l) => <Num value={l.total} />, total: <Num value={lineSum} /> },
  ];

  const paymentColumns: Column<any>[] = [
    { key: "number", header: "Payment", nowrap: true, cell: (p) => <DocNo value={p.number} />, sub: (p) => fmtDate(p.payment_date) },
    {
      key: "voucher",
      header: "Voucher",
      nowrap: true,
      cell: (p) => (p.voucher ? <Link to={`/dashboard/finance/vouchers/${p.voucher}`} className="whitespace-nowrap font-mono text-t-small font-semibold text-ims-link hover:underline">{p.expand?.voucher?.number || "Voucher"}</Link> : "—"),
    },
    { key: "method", header: "Method", cell: (p) => PAYMENT_METHODS[p.method] || p.method || "—", sub: (p) => p.reference },
    { key: "by", header: "Paid by", className: "max-w-[180px]", cell: (p) => <Person name={p.expand?.paid_by?.name} /> },
    { key: "amount", header: `Settled (${cur})`, numeric: true, cell: (p) => <Num value={p.amount} />, total: <Num value={payments.reduce((a: number, p: any) => a + (p.amount || 0), 0)} /> },
    { key: "wht", header: `Tax withheld (${cur})`, numeric: true, cell: (p) => (p.wht_amount ? <Num value={p.wht_amount} /> : "—"), total: <Num value={payments.reduce((a: number, p: any) => a + (p.wht_amount || 0), 0)} /> },
    {
      key: "net",
      header: `Net paid (${cur})`,
      numeric: true,
      cell: (p) => <Num value={p.voucher ? p.net_amount : p.amount} />,
      total: <Num value={payments.reduce((a: number, p: any) => a + ((p.voucher ? p.net_amount : p.amount) || 0), 0)} />,
    },
  ];

  return (
    <Page>
      <DetailHeader
        back={{ label: "Back to supplier invoices", to: LIST }}
        number={inv.number}
        type="Supplier invoice"
        status={INVOICE_STATUS[inv.status]?.label || inv.status}
        statusNote={statusNote ? <span className={cn(late && "text-ims-danger")}>{statusNote}</span> : undefined}
        title={inv.expand?.supplier?.name || "Supplier invoice"}
        facts={[
          inv.supplier_invoice_number ? { label: "Supplier reference", value: inv.supplier_invoice_number } : null,
          po ? { label: "Order", value: <span className="whitespace-nowrap">{po.number}</span> } : null,
          inv.expand?.department?.name,
          inv.due_date ? { label: "Due", value: fmtDate(inv.due_date) } : null,
          <strong key="total" className="font-bold text-ims-text">{amount(inv.total)}</strong>,
        ]}
        actions={
          <>
            <MoreMenu items={more} />
            {rest.slice(0, 2).map((a) => <Button key={a.key} icon={a.icon} onClick={a.run}>{a.label}</Button>)}
            {primaryAct && <Button variant="primary" icon={primaryAct.icon} onClick={primaryAct.run}>{primaryAct.label}</Button>}
          </>
        }
      />

      {isApprover && (
        <p role="status" className="flex items-start gap-2 rounded-card border border-ims-warning/30 bg-ims-warning-bg px-4 py-3 text-t-body text-ims-warning">
          <Clock size={16} className="mt-0.5 shrink-0" aria-hidden />
          <span>Waiting for your decision{stepName ? ` at step “${stepName}”` : ""}. Approve it, return it for changes, or reject it.</span>
        </p>
      )}
      {inv.status === "exception" && (
        <div role="status" className="rounded-card border border-ims-danger/30 bg-ims-danger-bg px-4 py-3 text-t-body text-ims-danger">
          <p className="flex items-start gap-2 font-semibold">
            <AlertTriangle size={16} className="mt-0.5 shrink-0" aria-hidden />
            Three-way match exception. The invoice cannot be approved until it is corrected or the exception is resolved.
          </p>
          {issues.length > 0 && <ul className="ml-6 mt-1 list-disc space-y-0.5 pl-4 text-t-small">{issues.map((i) => <li key={i}>{i}</li>)}</ul>}
        </div>
      )}
      {inv.match_status === "partial" && (inv.match_result?.warnings || []).length > 0 && (
        <div role="status" className="rounded-card border border-ims-warning/30 bg-ims-warning-bg px-4 py-3 text-t-body text-ims-warning">
          <p className="font-semibold">Partial match: the differences are within the tolerance, so the invoice can be approved.</p>
          <ul className="ml-2 mt-1 list-disc space-y-0.5 pl-4 text-t-small">{inv.match_result.warnings.map((w: string) => <li key={w}>{w}</li>)}</ul>
        </div>
      )}
      {inv.exception_overridden && (
        <p role="status" className="flex items-start gap-2 rounded-card border border-ims-info/20 bg-ims-info-bg px-4 py-3 text-t-body text-ims-info">
          <ShieldAlert size={16} className="mt-0.5 shrink-0" aria-hidden />
          <span>
            Exception resolved by <span className="font-semibold">{inv.expand?.resolved_by?.name}</span> on {fmtDateTime(inv.resolved_at)}: “{inv.exception_resolution}”
          </span>
        </p>
      )}
      {late && (
        <p role="status" className="flex items-start gap-2 rounded-card border border-ims-danger/30 bg-ims-danger-bg px-4 py-3 text-t-body text-ims-danger">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" aria-hidden />
          <span>Payment was due on {fmtDate(inv.due_date)} ({late.toLowerCase()}).{canVoucher ? " Prepare a payment voucher." : ""}</span>
        </p>
      )}
      {inv.status === "cancelled" && inv.cancel_reason && (
        <p className="rounded-card border border-ims-border bg-ims-card px-4 py-3 text-t-body text-ims-body">
          <span className="font-semibold text-ims-text">Cancelled.</span> {inv.cancel_reason}
        </p>
      )}

      <KpiBand
        items={[
          { label: "Three-way match", value: matchText, sub: inv.match_status === "partial" ? "Within tolerance" : inv.exception_overridden ? "Exception accepted" : undefined, tone: matchTone, onClick: () => setTab("lines") },
          { label: "Paid", value: amount(inv.paid_amount || 0), sub: `${payments.length} payment${payments.length === 1 ? "" : "s"}`, tone: inv.status === "paid" ? "success" : "default", onClick: () => setTab("payments") },
          { label: "Amount due", value: amount(inv.balance || 0), sub: late || (inv.due_date ? `Due ${fmtDate(inv.due_date)}` : undefined), tone: late ? "danger" : "default" },
          {
            label: "Approval",
            value: !approval ? "Not submitted" : approval.status === "pending" ? `Step ${approval.current_level + 1} of ${approval.steps?.length || 1}` : statusWord(approval.status) || sentence(approval.status),
            sub: stepName || undefined,
            onClick: () => setTab("approval"),
          },
        ]}
      />

      <Tabs
        label="Invoice sections"
        active={tab}
        onChange={setTab}
        tabs={[
          { key: "details", label: "Details" },
          { key: "lines", label: "Items", count: lines.length },
          { key: "payments", label: "Payments", count: payments.length },
          { key: "approval", label: "Approvals" },
          { key: "activity", label: "Activity" },
        ]}
      />

      {tab === "details" && (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
          <Card className="xl:col-span-2">
            <CardHeader title="Invoice" />
            <Details
              items={[
                {
                  label: "Supplier",
                  value: <Link className="font-semibold text-ims-link hover:underline" to={`/dashboard/procurement/suppliers/${inv.supplier}`}>{inv.expand?.supplier?.name}</Link>,
                  hint: inv.expand?.supplier?.tin ? `TIN ${inv.expand.supplier.tin}` : undefined,
                },
                { label: "Supplier reference", value: inv.supplier_invoice_number },
                {
                  label: "Purchase order",
                  value: po ? <Link className="whitespace-nowrap font-semibold text-ims-link hover:underline" to={`/dashboard/procurement/purchase-orders/${po.id}`}>{po.number}</Link> : null,
                  hint: po ? `${po.title} · ${statusText(PO_STATUS[po.status], po.status)}` : undefined,
                },
                { label: "Department", value: inv.expand?.department?.name },
                { label: "Invoice date", value: inv.invoice_date ? fmtDate(inv.invoice_date) : null },
                {
                  label: "Due date",
                  value: inv.due_date ? <span className={cn(late && "font-semibold text-ims-danger")}>{fmtDate(inv.due_date)}</span> : null,
                  hint: late ? <span className="text-ims-danger">{late}</span> : undefined,
                },
                { label: "Recorded by", value: inv.expand?.recorded_by?.name, hint: fmtDateTime(inv.created) },
                { label: "Currency", value: cur },
                ...(inv.notes ? [{ label: "Notes", value: <span className="whitespace-pre-line">{inv.notes}</span>, wide: true }] : []),
              ]}
            />
          </Card>
          <Card>
            <CardHeader title="Documents" subtitle="The supplier's invoice (scan or PDF) and any credit notes." />
            <DocumentUploads
              collection="supplier_invoices"
              record={inv}
              canAdd={canPerform("manage_invoices") || canPerform("approve_invoices") || canPerform("resolve_invoice_exceptions")}
              canRemove={canPerform("manage_invoices") && ["received", "exception", "matched", "returned"].includes(inv.status)}
              onChange={refresh}
              hint="PDF or images, up to 20 MB each"
            />
          </Card>
        </div>
      )}

      {tab === "lines" && (
        <Card padded={false}>
          <div className="px-5 pt-5">
            <CardHeader title="Items and three-way match" subtitle={`Each line is checked against the order and what was received. Price tolerance ${fmtNumber(tolerance, true)}%.`} />
          </div>
          <DataTable
            columns={lineColumns}
            rows={lines}
            rowKey={(l, i) => String(l.line ?? i)}
            rowClassName={(l) => ((l.issues || []).length ? "bg-ims-danger-bg/40" : undefined)}
            minWidth={940}
            caption="Invoice items"
            empty={<EmptyState compact text="No items on this invoice." />}
          />
          <div className="border-t border-ims-divider px-5 pb-5">
            <Totals rows={[["Untaxed amount", amount(inv.subtotal)], ["VAT", amount(inv.tax_total)]]} total={["Total", amount(inv.total)]} />
          </div>
        </Card>
      )}

      {tab === "payments" && (
        <Card padded={false}>
          <div className="px-5 pt-5">
            <CardHeader
              title="Payments"
              subtitle="Payments go through a payment voucher: the Accountant prepares it, the DAF approves it, the Cashier pays it."
              action={canVoucher && payments.length > 0 ? <Button icon={Banknote} onClick={goVoucher}>Prepare payment voucher</Button> : undefined}
            />
          </div>
          <DataTable
            columns={paymentColumns}
            rows={payments}
            rowKey={(p) => p.id}
            onRowClick={(p) => p.voucher && navigate(`/dashboard/finance/vouchers/${p.voucher}`)}
            minWidth={820}
            caption="Payments"
            empty={
              <EmptyState
                compact
                icon={Banknote}
                text={payable ? "Not paid yet. Prepare a payment voucher to pay it." : "The invoice can be paid once it is approved."}
                action={canVoucher ? <Button variant="primary" icon={Banknote} onClick={goVoucher}>Prepare payment voucher</Button> : undefined}
              />
            }
          />
        </Card>
      )}

      {tab === "approval" && <ApprovalTracker approval={approval} actions={actions} />}

      {tab === "activity" && <Activity actions={actions} audit={audit} loading={false} />}

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
    </Page>
  );
}

function ResolveDialog({ inv, issues, open, onClose, onDone }: { inv: any; issues: string[]; open: boolean; onClose: () => void; onDone: () => void }) {
  const [reason, setReason] = React.useState("");
  const [tried, setTried] = React.useState(false);
  React.useEffect(() => {
    setReason("");
    setTried(false);
  }, [open]);
  const run = useMutation(() => financeApi.invoiceAction(inv.id, "resolve", { reason }), {
    onSuccess: () => { toast.success(`Match exception on ${inv.number} resolved`); onDone(); },
    onError: (e) => { toast.error(errorMessage(e)); },
  });
  const short = reason.trim().length < 15;
  return (
    <Modal
      open={open}
      onClose={run.isLoading ? () => undefined : onClose}
      title={<>Resolve the match exception on <span className="whitespace-nowrap">{inv.number}</span>?</>}
      description="The differences below are accepted and the invoice can go for approval. Your name and reason are kept in the audit trail."
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={run.isLoading}>Cancel</Button>
          <Button
            variant="primary"
            icon={ShieldAlert}
            loading={run.isLoading}
            onClick={() => {
              setTried(true);
              if (!short) run.mutate();
            }}
          >
            Resolve exception
          </Button>
        </>
      }
    >
      {issues.length > 0 && (
        <ul className="list-disc space-y-0.5 rounded-control bg-ims-danger-bg py-2.5 pl-8 pr-3 text-t-small text-ims-danger">
          {issues.map((i) => <li key={i}>{i}</li>)}
        </ul>
      )}
      <Field
        label="How was it resolved?"
        required
        htmlFor="invoice-resolve-reason"
        error={tried && short ? "Write at least 15 characters so approvers know why the difference is accepted." : null}
        hint={`${reason.trim().length} of at least 15 characters`}
      >
        <Textarea id="invoice-resolve-reason" rows={4} value={reason} onChange={(e) => setReason(e.target.value)} invalid={tried && short} placeholder="For example: price increase agreed in contract addendum no. 3 dated 12 May" />
      </Field>
    </Modal>
  );
}
