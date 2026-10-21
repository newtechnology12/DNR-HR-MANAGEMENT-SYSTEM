import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "react-query";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { isPast } from "date-fns";
import { toast } from "sonner";
import {
  AlertTriangle,
  Ban,
  CalendarClock,
  ChevronDown,
  Eye,
  ExternalLink,
  FileSearch,
  FileText,
  Lock,
  Pencil,
  Plus,
  Printer,
  Scale,
  Send,
  ShoppingCart,
  Trophy,
  XCircle,
} from "lucide-react";
import pocketbase from "@/lib/pocketbase";
import { useRoles } from "@/context/roles.context";
import { Skeleton } from "@/components/ui/skeleton";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Initials, StatusBadge } from "@/components/enterprise/ui";
import { FileDrop } from "@/components/portal/kit";
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
  MoneyInput,
  Modal,
  MoreMenu,
  Num,
  Page,
  RowAction,
  SearchBox,
  Select,
  Tabs,
  Textarea,
  buttonClass,
  fmtDate,
  fmtDateTime,
  fmtMoney,
  fmtNumber,
  fmtWhen,
  overdue,
} from "@/components/ims";
import {
  COMPLIANCE,
  EVALUATION_CRITERIA,
  INVITE_STATUS,
  QUOTE_STATUS,
  RFQ_STATUS,
  errorMessage,
  money,
  procurementApi,
  purchasingApi,
  sourcingApi,
} from "@/lib/procurement";
import { cn } from "@/utils";
import { Rating } from "./Suppliers";

type TabKey = "details" | "items" | "quotations" | "evaluation" | "activity";
const TAB_KEYS: TabKey[] = ["details", "items", "quotations", "evaluation", "activity"];
/** Older links (?tab=overview, ?tab=comparison) still land on the right tab. */
const LEGACY_TAB: Record<string, TabKey> = { overview: "details", comparison: "evaluation" };
const LIST = "/dashboard/procurement/rfqs";

/** Money in text: "RWF 1,250,000" (or the quotation's own currency). */
const inCurrency = (n: number | undefined, currency?: string) => (!currency || currency === "RWF" ? fmtMoney(n) : money(n, currency));

const COMPLIANCE_TONE: Record<string, string> = { compliant: "text-ims-success", partial: "text-ims-warning", non_compliant: "text-ims-danger font-semibold" };
function Compliance({ value }: { value?: string }) {
  if (!value) return <span className="text-ims-faint">—</span>;
  return <span className={cn("whitespace-nowrap", COMPLIANCE_TONE[value] || "text-ims-body")}>{COMPLIANCE[value]?.label || value}</span>;
}

type SupplierRow = { supplier: any; invite?: any; quote?: any; invited: boolean };

export default function RfqDetail() {
  const { rfqId } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [params, setParams] = useSearchParams();
  const rawTab = params.get("tab") || "details";
  const tab: TabKey = LEGACY_TAB[rawTab] || (TAB_KEYS.includes(rawTab as TabKey) ? (rawTab as TabKey) : "details");
  const setTab = (t: TabKey) => setParams(t === "details" ? {} : { tab: t });
  const { canPerform } = useRoles();
  const canManage = canPerform("manage_rfqs");
  const [editing, setEditing] = React.useState(false);
  const [quoteFor, setQuoteFor] = React.useState<{ supplier: any; quote?: any } | null>(null);
  const [confirm, setConfirm] = React.useState<"send" | "close" | "cancel" | null>(null);

  const q = useQuery(["rfq", rfqId], async () => {
    const [rfq, invites, quotes, pos] = await Promise.all([
      pocketbase.collection("rfqs").getOne(rfqId!, { expand: "requisition,department,buyer,requester,suppliers,awarded_quotation.supplier,awarded_by" }),
      pocketbase.collection("rfq_suppliers").getFullList({ filter: `rfq = "${rfqId}"`, expand: "supplier" }),
      pocketbase.collection("quotations").getFullList({ filter: `rfq = "${rfqId}"`, sort: "grand_total", expand: "supplier" }),
      pocketbase.collection("purchase_orders").getFullList({ filter: `rfq = "${rfqId}" && status != "cancelled"`, fields: "id,number,status" }).catch(() => []),
    ]);
    return { rfq, invites, quotes, pos };
  });
  const refresh = () => {
    queryClient.invalidateQueries(["rfq", rfqId]);
    queryClient.invalidateQueries(["audit", "rfqs", rfqId]);
    queryClient.invalidateQueries(["record-table"]);
  };

  // Supplier response (viewed / declined), set from the row menu of the suppliers table.
  const setInvite = useMutation(({ invite, status }: { invite: any; status: string; name?: string }) => pocketbase.collection("rfq_suppliers").update(invite.id, { status }), {
    onSuccess: (_d, v) => {
      toast.success(`${v.name || "Supplier"} marked as ${v.status === "declined" ? "declined" : "viewed"}`);
      refresh();
    },
    onError: (e) => {
      toast.error(errorMessage(e));
    },
  });

  const r: any = q.data?.rfq;
  if (q.isLoading) {
    return (
      <Page>
        <Skeleton className="h-5 w-48" />
        <Skeleton className="h-16 w-full max-w-2xl" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-64 w-full" />
      </Page>
    );
  }
  if (!r) {
    return (
      <Page>
        <Card>
          <EmptyState
            icon={FileSearch}
            text="This RFQ is not available. It may have been deleted, or your role cannot see it."
            action={<ButtonLink to={LIST}>Back to RFQs</ButtonLink>}
          />
        </Card>
      </Page>
    );
  }

  const open = r.status === "sent";
  const closingPassed = r.closing_date && isPast(new Date(r.closing_date));
  const suppliers: any[] = r.expand?.suppliers || [];
  const invites = q.data!.invites;
  const quotes = q.data!.quotes;
  const pos: any[] = q.data!.pos;
  const winner = r.expand?.awarded_quotation;
  const canRecord = canManage && ["sent", "closed"].includes(r.status);
  const canAward = canPerform("award_rfqs");
  const lowest = quotes.length ? Math.min(...quotes.map((x: any) => x.grand_total)) : null;
  const lateCount = quotes.filter((x: any) => x.received_late).length;
  const openQuote = (supplier: any, quote?: any) => setQuoteFor({ supplier, quote });

  const rows: SupplierRow[] = [
    ...suppliers.map((s) => ({ supplier: s, invite: invites.find((i: any) => i.supplier === s.id), quote: quotes.find((x: any) => x.supplier === s.id), invited: true })),
    ...quotes.filter((x: any) => !suppliers.some((s) => s.id === x.supplier)).map((x: any) => ({ supplier: x.expand?.supplier || { id: x.supplier }, quote: x, invited: false })),
  ];
  const waiting = rows.filter((row) => row.invited && !row.quote).map((row) => row.supplier);

  // The next step is the primary button; at most two secondary buttons; the rest go under "More".
  let primary: React.ReactNode = null;
  const secondary: React.ReactNode[] = [];
  if (canManage && r.status === "draft") {
    if (suppliers.length) {
      primary = <Button variant="primary" icon={Send} onClick={() => setConfirm("send")}>Send to {suppliers.length} {suppliers.length === 1 ? "supplier" : "suppliers"}</Button>;
      secondary.push(<Button key="edit" icon={Pencil} onClick={() => setEditing(true)}>Edit</Button>);
    } else {
      primary = <Button variant="primary" icon={Plus} onClick={() => setEditing(true)}>Invite suppliers</Button>;
    }
  } else if (canManage && open) {
    const closeFirst = closingPassed || !waiting.length;
    const record = waiting.length ? <RecordQuoteButton key="record" suppliers={waiting} primary={!closeFirst} onPick={(s) => openQuote(s)} /> : null;
    const close = <Button key="close" variant={closeFirst ? "primary" : "secondary"} icon={Lock} onClick={() => setConfirm("close")}>Close quotations</Button>;
    if (closeFirst) {
      primary = close;
      if (record) secondary.push(record);
    } else {
      primary = record;
      secondary.push(close);
    }
  } else if (r.status === "closed" && (canManage || canAward) && tab !== "evaluation") {
    primary = <Button variant="primary" icon={Scale} onClick={() => setTab("evaluation")}>{canAward ? "Compare and award" : "Compare and score"}</Button>;
  } else if (r.status === "awarded") {
    if (pos.length) primary = <ButtonLink variant="primary" icon={ShoppingCart} to={`/dashboard/procurement/purchase-orders/${pos[0].id}`}>Open {pos[0].number}</ButtonLink>;
    else if (canPerform("manage_purchase_orders")) primary = <CreatePoButton rfqId={r.id} />;
  }
  const more: MenuItem[] = [
    { label: "Extend closing date", icon: CalendarClock, onSelect: () => setEditing(true), hidden: !(canManage && open) },
    { label: "Cancel RFQ", icon: Ban, danger: true, onSelect: () => setConfirm("cancel"), hidden: !(canManage && ["draft", "sent", "closed"].includes(r.status)) },
  ];

  const supplierColumns: Column<SupplierRow>[] = [
    {
      key: "supplier",
      header: "Supplier",
      className: "min-w-[220px]",
      cell: (row) => (
        <Link className="font-semibold text-ims-text hover:text-ims-link hover:underline" to={`/dashboard/procurement/suppliers/${row.supplier.id}`}>
          {row.supplier.name || "Supplier"}
        </Link>
      ),
      sub: (row) =>
        row.supplier.code || row.supplier.email ? (
          <>
            {row.supplier.code}
            {row.supplier.email && <span className="block break-all">{row.supplier.email}</span>}
          </>
        ) : null,
    },
    {
      key: "response",
      header: "Response",
      nowrap: true,
      cell: (row) => (row.invite ? <StatusBadge status={row.invite.status} map={INVITE_STATUS} /> : row.invited ? <StatusBadge status="invited" map={INVITE_STATUS} /> : <span className="text-ims-faint">Not invited</span>),
    },
    {
      key: "quotation",
      header: "Quotation",
      nowrap: true,
      cell: (row) => (row.quote ? <DocNo value={row.quote.number} /> : <span className="text-ims-faint">—</span>),
      sub: (row) =>
        row.quote ? (
          <>
            Ref {row.quote.supplier_reference || "—"}
            {row.quote.received_late && <span className="font-semibold text-ims-warning"> · Late</span>}
            {row.quote.attachments?.length > 0 && ` · ${row.quote.attachments.length} ${row.quote.attachments.length === 1 ? "file" : "files"}`}
          </>
        ) : null,
    },
    { key: "total", header: `Total (${r.currency || "RWF"})`, numeric: true, cell: (row) => (row.quote ? <Num value={row.quote.grand_total} /> : <span className="text-ims-faint">—</span>) },
    { key: "delivery", header: "Delivery (days)", numeric: true, cell: (row) => (row.quote?.delivery_days ? <Num value={row.quote.delivery_days} /> : <span className="text-ims-faint">—</span>) },
    { key: "compliance", header: "Compliance", cell: (row) => <Compliance value={row.quote?.technical_compliance} /> },
    { key: "score", header: "Score (of 100)", numeric: true, cell: (row) => (row.quote?.total_score ? fmtNumber(row.quote.total_score, true) : <span className="text-ims-faint">—</span>) },
    { key: "status", header: "Status", nowrap: true, cell: (row) => (row.quote ? <StatusBadge status={row.quote.status} map={QUOTE_STATUS} /> : <span className="text-ims-faint">—</span>) },
  ];
  const supplierActions = (row: SupplierRow): RowAction<SupplierRow>[] => [
    ...(canRecord ? [{ label: row.quote ? "Edit quotation" : "Record quotation", icon: row.quote ? Pencil : Plus, onSelect: () => openQuote(row.supplier, row.quote) }] : []),
    ...(row.invited ? [{ label: "Print RFQ for this supplier", icon: Printer, onSelect: () => window.open(`/print/rfq/${r.id}/${row.supplier.id}`, "_blank", "noopener") }] : []),
    ...(canManage && row.invite && open && row.invite.status === "sent"
      ? [
          { label: "Mark as viewed", icon: Eye, onSelect: () => setInvite.mutate({ invite: row.invite, status: "viewed", name: row.supplier.name }) },
          { label: "Mark as declined", icon: XCircle, onSelect: () => setInvite.mutate({ invite: row.invite, status: "declined", name: row.supplier.name }) },
        ]
      : []),
    ...((row.quote?.attachments || []) as string[]).map((f) => ({ label: `Open ${f}`, icon: FileText, onSelect: () => window.open(pocketbase.files.getUrl(row.quote, f), "_blank", "noopener") })),
    { label: "Open supplier", icon: ExternalLink, onSelect: () => navigate(`/dashboard/procurement/suppliers/${row.supplier.id}`) },
  ];

  const itemColumns: Column<any>[] = [
    { key: "line", header: "#", width: "48px", cell: (it, i) => <span className="text-ims-muted">{it.line || i + 1}</span> },
    { key: "description", header: "Description", clamp: true, cell: (it) => it.description, sub: (it) => it.specification },
    { key: "quantity", header: "Quantity", numeric: true, nowrap: true, cell: (it) => `${fmtNumber(it.quantity, true)} ${it.unit || ""}`.trim() },
  ];

  const weights = r.evaluation_weights || {};

  return (
    <Page>
      <DetailHeader
        back={{ label: "Back to RFQs", to: LIST }}
        number={r.number}
        type="Request for quotation"
        status={RFQ_STATUS[r.status]?.label || r.status}
        statusNote={RFQ_STATUS[r.status]?.note}
        title={r.title || "Untitled RFQ"}
        facts={[
          r.expand?.requisition
            ? {
                label: "Requisition",
                value: (
                  <Link className="whitespace-nowrap font-mono text-[13px] text-ims-link hover:underline" to={`/dashboard/procurement/requisitions/${r.requisition}`}>
                    {r.expand.requisition.number}
                  </Link>
                ),
              }
            : null,
          r.expand?.department?.name,
          { label: "Buyer", value: r.expand?.buyer?.name || "—" },
          r.issue_date ? { label: "Issued", value: fmtDate(r.issue_date) } : "Not sent yet",
        ]}
        actions={
          primary || secondary.length || more.some((m) => !m.hidden) ? (
            <>
              <MoreMenu items={more} />
              {secondary}
              {primary}
            </>
          ) : undefined
        }
      />

      {winner && (
        <div role="status" className="flex items-start gap-2 rounded-card border border-ims-success/30 bg-ims-success-bg px-4 py-3 text-t-body text-ims-success">
          <Trophy size={16} className="mt-0.5 shrink-0" aria-hidden />
          <div className="min-w-0">
            <p>
              <span className="font-semibold">Awarded to {winner.expand?.supplier?.name}.</span>
              {r.award_not_lowest && <span className="font-semibold text-ims-warning"> Not the lowest price.</span>}
              {r.award_reason && <> Reason: “{r.award_reason}”</>}
            </p>
            <p className="mt-0.5 text-t-small">
              By {r.expand?.awarded_by?.name || "—"}, {fmtDateTime(r.awarded_at)}.
            </p>
          </div>
        </div>
      )}
      {open && closingPassed && (
        <p role="status" className="flex items-start gap-2 rounded-card border border-ims-warning/30 bg-ims-warning-bg px-4 py-3 text-t-body text-ims-warning">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" aria-hidden />
          <span>The closing date has passed. Close quotations to start the evaluation; quotations recorded from now on are marked late.</span>
        </p>
      )}
      {r.status === "cancelled" && r.cancel_reason && (
        <p className="rounded-card border border-ims-border bg-ims-card px-4 py-3 text-t-body text-ims-body">
          <span className="font-semibold text-ims-text">Cancelled.</span> {r.cancel_reason}
        </p>
      )}

      <KpiBand
        items={[
          { label: "Quotations received", value: `${quotes.length} of ${suppliers.length}`, sub: lateCount ? `${lateCount} late` : suppliers.length ? `${suppliers.length} ${suppliers.length === 1 ? "supplier" : "suppliers"} invited` : "No suppliers invited" },
          { label: "Lowest offer", value: lowest === null ? "—" : inCurrency(lowest, r.currency) },
          { label: "Awarded amount", value: winner ? inCurrency(winner.grand_total, winner.currency) : "—", sub: winner ? winner.expand?.supplier?.name : "Not awarded yet" },
          {
            label: "Closing date",
            value: fmtDate(r.closing_date),
            sub: open ? (closingPassed ? overdue(r.closing_date) || "Passed" : "Open for quotes") : r.status === "draft" ? "Not sent yet" : "Quotations closed",
            tone: open && closingPassed ? "warning" : "default",
          },
        ]}
      />

      <Tabs
        label="RFQ sections"
        active={tab}
        onChange={(k) => setTab(k as TabKey)}
        tabs={[
          { key: "details", label: "Details" },
          { key: "items", label: "Items", count: (r.items || []).length },
          { key: "quotations", label: "Quotations", count: quotes.length },
          { key: "evaluation", label: "Evaluation" },
          { key: "activity", label: "Activity" },
        ]}
      />

      {tab === "details" && (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
          <Card className="xl:col-span-2">
            <CardHeader title="Terms" subtitle="What every invited supplier receives with the RFQ." />
            <Details
              items={[
                {
                  label: "Requisition",
                  value: r.expand?.requisition ? (
                    <Link className="whitespace-nowrap font-mono text-[13px] text-ims-link hover:underline" to={`/dashboard/procurement/requisitions/${r.requisition}`}>
                      {r.expand.requisition.number}
                    </Link>
                  ) : null,
                },
                { label: "Requested by", value: r.expand?.requester?.name },
                { label: "Department", value: r.expand?.department?.name },
                { label: "Buyer", value: r.expand?.buyer?.name },
                { label: "Issued", value: r.issue_date ? fmtDate(r.issue_date) : "Not sent yet" },
                { label: "Closing date", value: r.closing_date ? fmtDate(r.closing_date) : null },
                { label: "Currency", value: r.currency },
                { label: "Delivery location", value: r.delivery_location },
                { label: "Delivery terms", value: r.delivery_terms },
                { label: "Payment terms", value: r.payment_terms },
                { label: "Required documents", value: r.required_documents, wide: true },
                { label: "Notes", value: r.notes ? <span className="whitespace-pre-line">{r.notes}</span> : null, wide: true },
                ...(r.cancel_reason ? [{ label: "Cancellation reason", value: r.cancel_reason, wide: true }] : []),
              ]}
            />
          </Card>
          <Card>
            <CardHeader title="Evaluation weights" subtitle="How much each criterion counts in the weighted score." />
            <dl className="space-y-2 text-t-body">
              {EVALUATION_CRITERIA.map((c) => (
                <div key={c.key} className="flex items-baseline justify-between gap-3">
                  <dt className="text-ims-muted">{c.label}</dt>
                  <dd className="font-semibold tabular-nums text-ims-text">{fmtNumber(weights[c.key] || 0, true)}%</dd>
                </div>
              ))}
              <div className="flex items-baseline justify-between gap-3 border-t border-ims-divider pt-2">
                <dt className="font-semibold text-ims-text">Total</dt>
                <dd className="font-bold tabular-nums text-ims-text">{fmtNumber(EVALUATION_CRITERIA.reduce((a, c) => a + (Number(weights[c.key]) || 0), 0), true)}%</dd>
              </div>
            </dl>
          </Card>
        </div>
      )}

      {tab === "items" && (
        <Card padded={false}>
          <div className="px-5 pt-5">
            <CardHeader title="Items requested" subtitle="Suppliers see the descriptions and quantities, never the internal estimates." />
          </div>
          <DataTable
            columns={itemColumns}
            rows={r.items || []}
            rowKey={(it, i) => String(it.line ?? i)}
            minWidth={520}
            caption="Items requested"
            empty={<EmptyState compact text="No items on this RFQ." />}
          />
        </Card>
      )}

      {tab === "quotations" && (
        <Card padded={false}>
          <div className="px-5 pt-5">
            <CardHeader
              title="Suppliers and quotations"
              subtitle={
                r.status === "draft"
                  ? "Who is invited. Quotations can be recorded once the RFQ is sent."
                  : canRecord
                    ? "Each supplier's response and quotation. Open a row to record or edit its quotation."
                    : "Each supplier's response and quotation."
              }
            />
          </div>
          <DataTable
            columns={supplierColumns}
            rows={rows}
            rowKey={(row) => row.supplier.id}
            onRowClick={canRecord ? (row) => openQuote(row.supplier, row.quote) : (row) => navigate(`/dashboard/procurement/suppliers/${row.supplier.id}`)}
            rowActions={supplierActions}
            minWidth={980}
            caption="Suppliers and quotations"
            empty={
              <EmptyState
                compact
                icon={FileSearch}
                text="No suppliers invited yet."
                action={canManage && r.status === "draft" ? <Button variant="primary" icon={Plus} onClick={() => setEditing(true)}>Invite suppliers</Button> : undefined}
              />
            }
          />
        </Card>
      )}

      {tab === "evaluation" && <Comparison rfq={r} quotes={quotes} onChanged={refresh} canScore={canManage} canAward={canAward} />}
      {tab === "activity" && <RfqActivity rfqId={r.id} />}

      {editing && <RfqEditDialog rfq={r} onClose={() => setEditing(false)} onSaved={() => { setEditing(false); refresh(); }} />}
      {quoteFor && <QuotationDialog rfq={r} supplier={quoteFor.supplier} quote={quoteFor.quote} onClose={() => setQuoteFor(null)} onSaved={() => { setQuoteFor(null); refresh(); }} />}
      <ConfirmAction kind={confirm} rfq={r} onClose={() => setConfirm(null)} onDone={() => { setConfirm(null); refresh(); if (confirm === "cancel") navigate(LIST); }} />
    </Page>
  );
}

/** "Record quotation": straight to the form for one waiting supplier, a menu of suppliers for several. */
function RecordQuoteButton({ suppliers, onPick, primary }: { suppliers: any[]; onPick: (s: any) => void; primary?: boolean }) {
  const variant = primary ? "primary" : "secondary";
  if (suppliers.length === 1) {
    return <Button variant={variant} icon={Plus} onClick={() => onPick(suppliers[0])}>Record quotation</Button>;
  }
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className={buttonClass({ variant })}>
        <Plus size={16} aria-hidden /> Record quotation <ChevronDown size={15} aria-hidden />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[240px] rounded-control border-ims-border p-1 shadow-menu">
        <p className="px-2.5 pb-1 pt-1.5 text-t-small text-ims-muted">Waiting for a quotation from</p>
        {suppliers.map((s) => (
          <DropdownMenuItem key={s.id} onSelect={() => onPick(s)} className="flex min-h-[38px] cursor-pointer items-center gap-2 rounded-md px-2.5 text-[14px] text-ims-text focus:bg-ims-subtle">
            {s.name}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function ConfirmAction({ kind, rfq, onClose, onDone }: { kind: "send" | "close" | "cancel" | null; rfq: any; onClose: () => void; onDone: () => void }) {
  const [reason, setReason] = React.useState("");
  React.useEffect(() => setReason(""), [kind]);
  const n = rfq.suppliers?.length || 0;
  const run = useMutation(() => sourcingApi.rfqAction(rfq.id, kind!, kind === "cancel" ? { reason } : {}), {
    onSuccess: () => {
      toast.success(kind === "send" ? `${rfq.number} sent to ${n} ${n === 1 ? "supplier" : "suppliers"}` : kind === "close" ? `${rfq.number} closed for evaluation` : `${rfq.number} cancelled`);
      onDone();
    },
    onError: (e) => {
      toast.error(errorMessage(e));
    },
  });
  const copy = {
    send: {
      title: `Send ${rfq.number} to ${n} ${n === 1 ? "supplier" : "suppliers"}?`,
      text: `Each supplier gets its own RFQ. Items and suppliers are locked afterwards; you can still extend the closing date.${n < 3 ? " Fewer than 3 suppliers are invited: check what the procurement policy asks for." : ""}`,
      verb: "Send",
      icon: Send,
    },
    close: { title: `Close ${rfq.number} for quotations?`, text: "No more on-time quotations are expected. You can then compare the offers and award.", verb: "Close quotations", icon: Lock },
    cancel: { title: `Cancel ${rfq.number}?`, text: "The requisition goes back to Approved so it can be sourced again.", verb: "Cancel RFQ", icon: Ban },
  } as const;
  const c = kind ? copy[kind] : null;
  return (
    <Modal
      open={Boolean(kind)}
      onClose={onClose}
      size="sm"
      title={c?.title || ""}
      description={c?.text}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={run.isLoading}>{kind === "cancel" ? "Keep RFQ" : "Cancel"}</Button>
          <Button variant={kind === "cancel" ? "danger" : "primary"} icon={c?.icon} loading={run.isLoading} disabled={kind === "cancel" && !reason.trim()} onClick={() => run.mutate()}>
            {c?.verb}
          </Button>
        </>
      }
    >
      {kind === "cancel" && (
        <Field label="Reason" required htmlFor="rfq-cancel-reason" hint="Kept in the audit trail and shown on the RFQ.">
          <Textarea id="rfq-cancel-reason" autoFocus value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Why is this RFQ cancelled?" />
        </Field>
      )}
    </Modal>
  );
}

function RfqEditDialog({ rfq, onClose, onSaved }: { rfq: any; onClose: () => void; onSaved: () => void }) {
  const draft = rfq.status === "draft";
  const [v, setV] = React.useState({
    title: rfq.title, closing_date: rfq.closing_date?.slice(0, 10) || "", delivery_location: rfq.delivery_location || "",
    payment_terms: rfq.payment_terms || "", delivery_terms: rfq.delivery_terms || "", required_documents: rfq.required_documents || "",
    notes: rfq.notes || "", suppliers: (rfq.suppliers || []) as string[], evaluation_weights: rfq.evaluation_weights || {},
  });
  const [search, setSearch] = React.useState("");
  const sup = useQuery(["active-suppliers"], () => pocketbase.collection("suppliers").getFullList({ filter: `status = "active"`, sort: "-rating,name", expand: "categories" }), { enabled: draft });
  const reqCategory = rfq.expand?.requisition?.category;
  const weightTotal = EVALUATION_CRITERIA.reduce((a, c) => a + (Number(v.evaluation_weights[c.key]) || 0), 0);
  const save = useMutation(
    () => pocketbase.collection("rfqs").update(rfq.id, { ...v, closing_date: v.closing_date ? `${v.closing_date} 17:00:00.000Z` : "" }),
    { onSuccess: () => { toast.success(`${rfq.number} saved`); onSaved(); }, onError: (e) => { toast.error(errorMessage(e)); } }
  );
  const set = (k: string) => (e: any) => setV((x) => ({ ...x, [k]: e.target.value }));
  const list = (sup.data || []).filter((s: any) => `${s.name} ${s.code}`.toLowerCase().includes(search.toLowerCase()));
  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title={draft ? `Edit ${rfq.number}` : `Extend the closing date of ${rfq.number}`}
      description={draft ? "Everything can change until the RFQ is sent." : "Suppliers already have this RFQ; only the closing date and the notes can change."}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button variant="primary" loading={save.isLoading} disabled={draft && weightTotal !== 100} onClick={() => save.mutate()}>Save</Button>
        </>
      }
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {draft && (
          <Field label="Title" htmlFor="rfq-title" className="sm:col-span-2">
            <Input id="rfq-title" value={v.title} onChange={set("title")} />
          </Field>
        )}
        <Field label="Closing date" htmlFor="rfq-edit-closing">
          <DatePicker id="rfq-edit-closing" value={v.closing_date} onChange={(d) => setV((x) => ({ ...x, closing_date: d }))} />
        </Field>
        {draft && (
          <Field label="Delivery location" htmlFor="rfq-delivery-location">
            <Input id="rfq-delivery-location" value={v.delivery_location} onChange={set("delivery_location")} />
          </Field>
        )}
        {draft && (
          <Field label="Payment terms" htmlFor="rfq-payment-terms">
            <Input id="rfq-payment-terms" value={v.payment_terms} onChange={set("payment_terms")} />
          </Field>
        )}
        {draft && (
          <Field label="Delivery terms" htmlFor="rfq-delivery-terms">
            <Input id="rfq-delivery-terms" value={v.delivery_terms} onChange={set("delivery_terms")} />
          </Field>
        )}
        {draft && (
          <Field label="Required documents" htmlFor="rfq-required-documents" className="sm:col-span-2">
            <Input id="rfq-required-documents" value={v.required_documents} onChange={set("required_documents")} />
          </Field>
        )}
        <Field label="Notes" htmlFor="rfq-notes" className="sm:col-span-2">
          <Textarea id="rfq-notes" className="min-h-[72px]" value={v.notes} onChange={set("notes")} />
        </Field>
      </div>
      {draft && (
        <>
          <fieldset>
            <legend className="mb-1.5 text-t-label text-ims-text">Invite suppliers ({v.suppliers.length})</legend>
            <SearchBox value={search} onChange={setSearch} placeholder="Search supplier name or code" className="mb-2 sm:w-full" label="Search suppliers" />
            <ul className="max-h-52 divide-y divide-ims-divider overflow-y-auto rounded-control border border-ims-border">
              {sup.isLoading && <li className="px-3 py-2.5"><Skeleton className="h-5 w-2/3" /></li>}
              {!sup.isLoading && !list.length && <li className="px-3 py-2.5 text-t-body text-ims-muted">No active supplier matches “{search}”.</li>}
              {list.map((s: any) => {
                const on = v.suppliers.includes(s.id);
                const match = s.categories?.includes(reqCategory);
                return (
                  <li key={s.id}>
                    <label className={cn("flex cursor-pointer items-center gap-3 px-3 py-2 text-t-body hover:bg-ims-hover", on && "bg-ims-info-bg hover:bg-ims-info-bg")}>
                      <input type="checkbox" className="h-4 w-4 shrink-0 accent-ims-primary" checked={on} onChange={() => setV((x) => ({ ...x, suppliers: on ? x.suppliers.filter((id) => id !== s.id) : [...x.suppliers, s.id] }))} />
                      <span className="min-w-0 flex-1">
                        <span className="font-semibold text-ims-text">{s.name}</span>
                        {match && <span className="ml-2 text-t-small font-semibold text-ims-info">Serves this category</span>}
                        <span className="block truncate text-t-small text-ims-muted">{(s.expand?.categories || []).map((c: any) => c.name).join(", ")}</span>
                      </span>
                      <Rating value={s.rating} count={s.evaluations_count} />
                    </label>
                  </li>
                );
              })}
            </ul>
          </fieldset>
          <fieldset>
            <legend className="text-t-label text-ims-text">Evaluation weights (%)</legend>
            <p className={cn("mb-2 mt-0.5 text-t-hint", weightTotal === 100 ? "text-ims-muted" : "text-ims-danger")} role={weightTotal === 100 ? undefined : "alert"}>
              {weightTotal === 100 ? "The weights add up to 100%." : `The weights add up to ${fmtNumber(weightTotal, true)}%. Change them so they add up to 100%.`}
            </p>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {EVALUATION_CRITERIA.map((c) => (
                <Field key={c.key} label={c.label} htmlFor={`weight-${c.key}`}>
                  <Input
                    id={`weight-${c.key}`}
                    type="number"
                    min={0}
                    max={100}
                    className="text-right tabular-nums"
                    value={v.evaluation_weights[c.key] ?? 0}
                    onChange={(e) => setV((x) => ({ ...x, evaluation_weights: { ...x.evaluation_weights, [c.key]: Number(e.target.value) } }))}
                  />
                </Field>
              ))}
            </div>
          </fieldset>
        </>
      )}
    </Modal>
  );
}

function QuotationDialog({ rfq, supplier, quote, onClose, onSaved }: { rfq: any; supplier: any; quote?: any; onClose: () => void; onSaved: () => void }) {
  const [lines, setLines] = React.useState<any[]>(() =>
    (rfq.items || []).map((it: any) => {
      const q = quote?.items?.find((x: any) => x.line === it.line);
      return { line: it.line, description: it.description, quantity: it.quantity, unit: it.unit, unit_price: q?.unit_price ?? "", discount_pct: q?.discount_pct ?? 0, tax_rate: q?.tax_rate ?? 18, brand: q?.brand || "" };
    })
  );
  const [v, setV] = React.useState({
    supplier_reference: quote?.supplier_reference || "", quotation_date: quote?.quotation_date?.slice(0, 10) || new Date().toISOString().slice(0, 10),
    validity_date: quote?.validity_date?.slice(0, 10) || new Date(Date.now() + 30 * 864e5).toISOString().slice(0, 10),
    delivery_cost: quote?.delivery_cost ?? 0, other_charges: quote?.other_charges ?? 0, delivery_days: quote?.delivery_days ?? "",
    payment_terms: quote?.payment_terms || supplier?.payment_terms || "", warranty: quote?.warranty || "", technical_compliance: quote?.technical_compliance || "compliant", notes: quote?.notes || "",
  });
  const [files, setFiles] = React.useState<File[]>([]);
  const set = (k: string) => (e: any) => setV((x) => ({ ...x, [k]: e.target.value }));
  const setValue = (k: string) => (val: any) => setV((x) => ({ ...x, [k]: val }));
  const setLine = (i: number, k: string, val: string) => setLines((l) => l.map((x, idx) => (idx === i ? { ...x, [k]: val } : x)));
  const rwf = !rfq.currency || rfq.currency === "RWF";

  let subtotal = 0, discount = 0, tax = 0;
  for (const l of lines) {
    if (l.unit_price === "" || l.unit_price === null) continue;
    const gross = l.quantity * Number(l.unit_price);
    const d = (gross * (Number(l.discount_pct) || 0)) / 100;
    subtotal += gross; discount += d; tax += ((gross - d) * (Number(l.tax_rate) || 0)) / 100;
  }
  const grand = subtotal - discount + tax + (Number(v.delivery_cost) || 0) + (Number(v.other_charges) || 0);

  const save = useMutation(
    () => {
      const body = new FormData();
      if (!quote) { body.append("rfq", rfq.id); body.append("supplier", supplier.id); }
      body.append("items", JSON.stringify(lines.map((l) => ({ line: l.line, unit_price: l.unit_price === "" ? null : Number(l.unit_price), discount_pct: Number(l.discount_pct) || 0, tax_rate: Number(l.tax_rate) || 0, brand: l.brand }))));
      Object.entries(v).forEach(([k, val]) => body.append(k, ["quotation_date", "validity_date"].includes(k) && val ? `${val} 00:00:00.000Z` : String(val ?? "")));
      files.forEach((f) => body.append("attachments", f));
      return quote ? pocketbase.collection("quotations").update(quote.id, body) : pocketbase.collection("quotations").create(body);
    },
    { onSuccess: (x: any) => { toast.success(`${x.number} saved: ${inCurrency(x.grand_total, x.currency)}`); onSaved(); }, onError: (e) => { toast.error(errorMessage(e)); } }
  );

  const lineColumns: Column<any>[] = [
    { key: "item", header: "Item", clamp: true, cell: (l) => l.description, sub: (l) => `${fmtNumber(l.quantity, true)} ${l.unit || ""}`.trim() },
    {
      key: "unit_price",
      header: `Unit price (${rfq.currency || "RWF"})`,
      width: "150px",
      cell: (l, i) => <Input type="number" min={0} step="any" className="h-9 text-right tabular-nums" value={l.unit_price} onChange={(e) => setLine(i, "unit_price", e.target.value)} placeholder="Not quoted" aria-label={`Line ${l.line} unit price`} />,
    },
    { key: "discount", header: "Discount (%)", width: "110px", cell: (l, i) => <Input type="number" min={0} max={100} className="h-9 text-right tabular-nums" value={l.discount_pct} onChange={(e) => setLine(i, "discount_pct", e.target.value)} aria-label={`Line ${l.line} discount`} /> },
    { key: "tax", header: "Tax (%)", width: "100px", cell: (l, i) => <Input type="number" min={0} max={100} className="h-9 text-right tabular-nums" value={l.tax_rate} onChange={(e) => setLine(i, "tax_rate", e.target.value)} aria-label={`Line ${l.line} tax`} /> },
    { key: "brand", header: "Brand or model", width: "170px", cell: (l, i) => <Input className="h-9" value={l.brand} onChange={(e) => setLine(i, "brand", e.target.value)} aria-label={`Line ${l.line} brand or model`} /> },
    {
      key: "total",
      header: `Line total (${rfq.currency || "RWF"})`,
      numeric: true,
      cell: (l) => {
        const gross = l.unit_price === "" ? null : l.quantity * Number(l.unit_price);
        const net = gross === null ? null : gross - (gross * (Number(l.discount_pct) || 0)) / 100;
        return net === null ? <span className="text-ims-faint">—</span> : <Num value={Math.round(net + (net * (Number(l.tax_rate) || 0)) / 100)} />;
      },
      total: <Num value={subtotal - discount + tax} />,
    },
  ];

  return (
    <Modal
      open
      onClose={onClose}
      size="xl"
      title={quote ? `Edit ${quote.number} from ${supplier?.name}` : `Record the quotation from ${supplier?.name}`}
      description="Enter the prices exactly as quoted. Leave a unit price empty when the supplier did not quote that line; the server recalculates the totals."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button variant="primary" loading={save.isLoading} onClick={() => save.mutate()}>Save quotation</Button>
        </>
      }
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Field label="Supplier's reference" htmlFor="quote-reference">
          <Input id="quote-reference" value={v.supplier_reference} onChange={set("supplier_reference")} />
        </Field>
        <Field label="Quotation date" htmlFor="quote-date">
          <DatePicker id="quote-date" value={v.quotation_date} onChange={setValue("quotation_date")} />
        </Field>
        <Field label="Valid until" htmlFor="quote-validity">
          <DatePicker id="quote-validity" value={v.validity_date} onChange={setValue("validity_date")} />
        </Field>
      </div>
      <div className="overflow-hidden rounded-card border border-ims-border">
        <DataTable columns={lineColumns} rows={lines} rowKey={(l) => String(l.line)} minWidth={820} caption="Quoted prices" totalLabel="Total of the lines" />
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
        <Field label="Delivery cost" htmlFor="quote-delivery-cost">
          {rwf ? <MoneyInput id="quote-delivery-cost" value={v.delivery_cost} onChange={setValue("delivery_cost")} /> : <Input id="quote-delivery-cost" type="number" min={0} className="text-right tabular-nums" value={v.delivery_cost} onChange={set("delivery_cost")} />}
        </Field>
        <Field label="Other charges" htmlFor="quote-other-charges">
          {rwf ? <MoneyInput id="quote-other-charges" value={v.other_charges} onChange={setValue("other_charges")} /> : <Input id="quote-other-charges" type="number" min={0} className="text-right tabular-nums" value={v.other_charges} onChange={set("other_charges")} />}
        </Field>
        <Field label="Delivery time (days)" htmlFor="quote-delivery-days">
          <Input id="quote-delivery-days" type="number" min={0} className="text-right tabular-nums" value={v.delivery_days} onChange={set("delivery_days")} />
        </Field>
        <Field label="Technical compliance" htmlFor="quote-compliance">
          <Select id="quote-compliance" value={v.technical_compliance} onChange={set("technical_compliance")}>
            {Object.entries(COMPLIANCE).map(([k, c]) => <option key={k} value={k}>{c.label}</option>)}
          </Select>
        </Field>
        <Field label="Payment terms" htmlFor="quote-payment-terms" className="sm:col-span-2">
          <Input id="quote-payment-terms" value={v.payment_terms} onChange={set("payment_terms")} />
        </Field>
        <Field label="Warranty" htmlFor="quote-warranty" className="sm:col-span-2">
          <Input id="quote-warranty" value={v.warranty} onChange={set("warranty")} placeholder="For example: 12 months" />
        </Field>
        <Field label="Notes" htmlFor="quote-notes" className="sm:col-span-4">
          <Input id="quote-notes" value={v.notes} onChange={set("notes")} />
        </Field>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-[minmax(0,1fr)_300px]">
        <Field label="Quotation documents">
          <FileDrop files={files} onChange={setFiles} label="Attach the quotation" />
        </Field>
        <dl className="h-fit space-y-1.5 rounded-card border border-ims-border bg-ims-thead px-4 py-3 text-t-body">
          <div className="flex justify-between gap-3 text-ims-body"><dt>Subtotal</dt><dd className="tabular-nums">{inCurrency(subtotal, rfq.currency)}</dd></div>
          <div className="flex justify-between gap-3 text-ims-body"><dt>Discount</dt><dd className="tabular-nums">− {inCurrency(discount, rfq.currency)}</dd></div>
          <div className="flex justify-between gap-3 text-ims-body"><dt>Tax</dt><dd className="tabular-nums">{inCurrency(tax, rfq.currency)}</dd></div>
          <div className="flex justify-between gap-3 text-ims-body"><dt>Delivery and other charges</dt><dd className="whitespace-nowrap tabular-nums">{inCurrency((Number(v.delivery_cost) || 0) + (Number(v.other_charges) || 0), rfq.currency)}</dd></div>
          <div className="flex justify-between gap-3 border-t border-ims-border pt-1.5 font-bold text-ims-text"><dt>Grand total</dt><dd className="tabular-nums">{inCurrency(grand, rfq.currency)}</dd></div>
        </dl>
      </div>
    </Modal>
  );
}

function SupplierHead({ q }: { q: any }) {
  return (
    <span className="inline-block text-right leading-tight">
      <span className="block font-semibold text-ims-text">{q.expand?.supplier?.name}</span>
      <span className="block font-mono text-[11.5px] font-normal text-ims-muted">{q.number}</span>
    </span>
  );
}

type CompareRow = { key: string; label: React.ReactNode; sub?: React.ReactNode; value: (q: any, i: number) => React.ReactNode };

function Comparison({ rfq, quotes, onChanged, canScore, canAward }: { rfq: any; quotes: any[]; onChanged: () => void; canScore: boolean; canAward: boolean }) {
  const locked = ["awarded", "cancelled"].includes(rfq.status);
  const weights = rfq.evaluation_weights || {};
  const [scores, setScores] = React.useState<Record<string, Record<string, number>>>(() => Object.fromEntries(quotes.map((q) => [q.id, q.scores || {}])));
  const [choice, setChoice] = React.useState<string>(rfq.awarded_quotation || "");
  const [reason, setReason] = React.useState("");
  React.useEffect(() => setScores(Object.fromEntries(quotes.map((q) => [q.id, q.scores || {}]))), [quotes]);

  const saveScores = useMutation(() => Promise.all(quotes.map((q) => pocketbase.collection("quotations").update(q.id, { scores: scores[q.id] || {} }))), {
    onSuccess: () => { toast.success("Evaluation scores saved"); onChanged(); },
    onError: (e) => { toast.error(errorMessage(e)); },
  });
  const award = useMutation(() => sourcingApi.rfqAction(rfq.id, "award", { quotation: choice, reason }), {
    onSuccess: () => {
      const name = quotes.find((q) => q.id === choice)?.expand?.supplier?.name;
      toast.success(name ? `${rfq.number} awarded to ${name}` : `${rfq.number} awarded`);
      onChanged();
    },
    onError: (e) => { toast.error(errorMessage(e)); },
  });

  if (!quotes.length) {
    return (
      <Card>
        <EmptyState compact icon={Scale} text={rfq.status === "draft" ? "Send the RFQ and record the quotations to compare the offers." : "Record at least one quotation to compare the offers."} />
      </Card>
    );
  }

  const lowestTotal = Math.min(...quotes.map((q) => q.grand_total));
  const fastest = Math.min(...quotes.filter((q) => q.delivery_days > 0).map((q) => q.delivery_days));
  const weighted = (qid: string) => EVALUATION_CRITERIA.reduce((a, c) => a + ((weights[c.key] || 0) * Math.min(Math.max(Number(scores[qid]?.[c.key]) || 0, 0), 10)) / 10, 0);
  const best = quotes.reduce((b, q) => (weighted(q.id) > weighted(b.id) ? q : b), quotes[0]);
  const chosen = quotes.find((q) => q.id === choice);
  const aboveLowest = chosen ? chosen.grand_total - lowestTotal : 0;
  const several = quotes.length > 1;

  const suggestPriceScores = () =>
    setScores((s) => Object.fromEntries(quotes.map((q) => [q.id, { ...(s[q.id] || {}), price: Math.round((lowestTotal / q.grand_total) * 100) / 10 }])));

  // Prices: one row per item, then discount and charges; the grand total is the total row.
  const priceRows: CompareRow[] = [
    ...(rfq.items || []).map((it: any) => {
      const prices = quotes.map((q) => q.items?.find((x: any) => x.line === it.line)).map((x) => (x?.quoted ? x.total : null));
      const min = Math.min(...(prices.filter((p) => p !== null) as number[]));
      return {
        key: `line-${it.line}`,
        label: it.description,
        sub: `${fmtNumber(it.quantity, true)} ${it.unit || ""}`.trim(),
        value: (_q: any, i: number) =>
          prices[i] === null ? <span className="text-ims-faint">Not quoted</span> : <span className={cn(prices[i] === min && several && "font-semibold text-ims-success")}><Num value={prices[i]} /></span>,
      };
    }),
    { key: "discount", label: "Discount", value: (q) => (q.discount_total ? <Num value={-q.discount_total} /> : <span className="text-ims-faint">—</span>) },
    { key: "charges", label: "Delivery and other charges", value: (q) => <Num value={q.delivery_cost + q.other_charges} /> },
  ];
  const priceColumns: Column<CompareRow>[] = [
    { key: "item", header: "Item", clamp: true, className: "min-w-[220px]", cell: (row) => row.label, sub: (row) => row.sub },
    ...quotes.map((q, i) => ({
      key: q.id,
      header: <SupplierHead q={q} />,
      numeric: true,
      cell: (row: CompareRow) => row.value(q, i),
      total: (
        <span className={cn(q.grand_total === lowestTotal && "text-ims-success")}>
          <Num value={q.grand_total} />
          {q.grand_total === lowestTotal && several && <span className="ml-1.5 text-t-small font-semibold">Lowest</span>}
        </span>
      ),
    })),
  ];

  const termRows: CompareRow[] = [
    { key: "delivery", label: "Delivery time", value: (q) => (q.delivery_days ? <span className={cn(q.delivery_days === fastest && several && "font-semibold text-ims-success")}>{fmtNumber(q.delivery_days)} days</span> : <span className="text-ims-faint">—</span>) },
    { key: "warranty", label: "Warranty", value: (q) => q.warranty || <span className="text-ims-faint">—</span> },
    { key: "payment", label: "Payment terms", value: (q) => q.payment_terms || <span className="text-ims-faint">—</span> },
    { key: "validity", label: "Valid until", value: (q) => fmtDate(q.validity_date) },
    { key: "compliance", label: "Technical compliance", value: (q) => <Compliance value={q.technical_compliance} /> },
    { key: "rating", label: "Supplier rating", value: (q) => <Rating value={q.expand?.supplier?.rating} count={q.expand?.supplier?.evaluations_count} /> },
    { key: "received", label: "Received", value: (q) => (q.received_late ? <span className="font-semibold text-ims-warning">Late</span> : "On time") },
  ];
  const termColumns: Column<CompareRow>[] = [
    { key: "term", header: "Term", className: "min-w-[220px] text-ims-body", cell: (row) => row.label },
    ...quotes.map((q, i) => ({ key: q.id, header: <SupplierHead q={q} />, align: "right" as const, cell: (row: CompareRow) => row.value(q, i) })),
  ];

  const scoreColumns: Column<(typeof EVALUATION_CRITERIA)[number]>[] = [
    { key: "criterion", header: "Criterion", className: "min-w-[200px]", cell: (c) => c.label, sub: (c) => `Weight ${fmtNumber(weights[c.key] || 0, true)}%` },
    ...quotes.map((q) => ({
      key: q.id,
      header: <SupplierHead q={q} />,
      align: "right" as const,
      cell: (c: (typeof EVALUATION_CRITERIA)[number]) =>
        !canScore || locked ? (
          <span className="tabular-nums">{scores[q.id]?.[c.key] === undefined ? <span className="text-ims-faint">—</span> : fmtNumber(scores[q.id]?.[c.key], true)}</span>
        ) : (
        <Input
          type="number"
          min={0}
          max={10}
          step={0.5}
          disabled={!canScore || locked}
          aria-label={`${c.label} score for ${q.expand?.supplier?.name}`}
          className="ml-auto h-9 w-20 text-right tabular-nums"
          value={scores[q.id]?.[c.key] ?? ""}
          onChange={(e) => setScores((s) => ({ ...s, [q.id]: { ...(s[q.id] || {}), [c.key]: Number(e.target.value) } }))}
        />
        ),
      total: (
        <span className={cn("tabular-nums", q.id === best.id && weighted(best.id) > 0 && "text-ims-success")}>
          {weighted(q.id).toFixed(1)}
          {q.id === best.id && weighted(best.id) > 0 && several && <span className="ml-1.5 text-t-small font-semibold">Highest</span>}
        </span>
      ),
    })),
  ];

  return (
    <div className="space-y-4">
      <Card padded={false}>
        <div className="px-5 pt-5">
          <CardHeader title="Price comparison" subtitle={`Amounts in ${rfq.currency || "RWF"}. The lowest price on each line and the lowest total are in green; the system never selects a supplier for you.`} />
        </div>
        <DataTable columns={priceColumns} rows={priceRows} rowKey={(row) => row.key} minWidth={240 + quotes.length * 200} caption="Price comparison" totalLabel={`Grand total (${rfq.currency || "RWF"})`} />
      </Card>

      <Card padded={false}>
        <div className="px-5 pt-5">
          <CardHeader title="Terms offered" subtitle="The fastest delivery is in green." />
        </div>
        <DataTable columns={termColumns} rows={termRows} rowKey={(row) => row.key} minWidth={240 + quotes.length * 200} caption="Terms offered" />
      </Card>

      <Card padded={false}>
        <div className="px-5 pt-5">
          <CardHeader
            title="Weighted evaluation"
            subtitle="Score each criterion from 0 to 10. Each score counts by its weight, for a weighted score out of 100."
            action={
              canScore && !locked ? (
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" onClick={suggestPriceScores}>Suggest price scores</Button>
                  <Button size="sm" variant="primary" loading={saveScores.isLoading} onClick={() => saveScores.mutate()}>Save scores</Button>
                </div>
              ) : undefined
            }
          />
        </div>
        <DataTable columns={scoreColumns} rows={[...EVALUATION_CRITERIA]} rowKey={(c) => c.key} minWidth={220 + quotes.length * 180} caption="Weighted evaluation" totalLabel="Weighted score (of 100)" />
      </Card>

      {!locked && (
        <Card>
          <CardHeader
            title="Select the supplier"
            subtitle={canAward ? "Your decision and its reason are kept permanently in the audit trail." : "Only roles allowed to select the winning supplier can award."}
          />
          {!canAward ? (
            <p className="text-t-body text-ims-muted">The scores are advisory. A procurement manager or the director makes the award.</p>
          ) : (
            <div className="space-y-4">
              <fieldset>
                <legend className="sr-only">Supplier to award</legend>
                <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
                  {quotes.map((q) => {
                    const blocked = q.technical_compliance === "non_compliant";
                    return (
                      <label
                        key={q.id}
                        className={cn(
                          "flex cursor-pointer items-start gap-2.5 rounded-control border p-3 text-t-body",
                          choice === q.id ? "border-ims-link bg-ims-info-bg" : "border-ims-border hover:bg-ims-hover",
                          blocked && "cursor-not-allowed opacity-55 hover:bg-transparent"
                        )}
                      >
                        <input type="radio" name="award" disabled={blocked} checked={choice === q.id} onChange={() => setChoice(q.id)} className="mt-1 shrink-0 accent-ims-primary" />
                        <span className="min-w-0">
                          <span className="block font-semibold text-ims-text">{q.expand?.supplier?.name}</span>
                          <span className="block tabular-nums text-t-small text-ims-muted">
                            {inCurrency(q.grand_total, q.currency)} · score {weighted(q.id).toFixed(1)}
                          </span>
                          {blocked && <span className="block text-t-small text-ims-danger">Non-compliant: cannot be selected</span>}
                        </span>
                      </label>
                    );
                  })}
                </div>
              </fieldset>
              {chosen && aboveLowest > 0 && (
                <p role="status" className="flex items-start gap-2 rounded-card border border-ims-warning/30 bg-ims-warning-bg px-4 py-3 text-t-body text-ims-warning">
                  <AlertTriangle size={16} className="mt-0.5 shrink-0" aria-hidden />
                  <span>This offer is {inCurrency(aboveLowest, rfq.currency)} above the lowest quotation. Explain why it gives better value; the award will be flagged “not the lowest price”.</span>
                </p>
              )}
              <Field label="Reason for selection" required htmlFor="award-reason" hint={`Write at least 15 characters (${reason.trim().length} so far).`}>
                <Textarea id="award-reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="For example: Supplier B delivers in 7 days and meets every technical requirement." />
              </Field>
              <div className="flex justify-end">
                <Button variant="primary" icon={Trophy} loading={award.isLoading} disabled={!choice || reason.trim().length < 15} onClick={() => award.mutate()}>
                  {chosen ? `Award to ${chosen.expand?.supplier?.name}` : "Award RFQ"}
                </Button>
              </div>
            </div>
          )}
        </Card>
      )}
    </div>
  );
}

const ACTIVITY_LABELS: Record<string, string> = {
  created: "created the RFQ",
  updated: "edited the RFQ",
  sent: "sent the RFQ to the suppliers",
  closed: "closed quotations",
  awarded: "awarded the RFQ",
  cancelled: "cancelled the RFQ",
  quotation_recorded: "recorded quotation",
  quotation_updated: "edited quotation",
  quotation_evaluated: "scored quotation",
};

function RfqActivity({ rfqId }: { rfqId: string }) {
  const q = useQuery(["audit", "rfqs", rfqId], () => procurementApi.audit({ collection: "rfqs", record: rfqId, perPage: 100 }));
  return (
    <Card>
      <CardHeader title="Activity" subtitle="Changes to this RFQ, its quotations and the award. The history cannot be edited." />
      {q.isLoading ? (
        <div className="space-y-3" aria-busy="true" aria-label="Loading">
          {Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-10 w-full rounded-control" />)}
        </div>
      ) : !q.data?.items.length ? (
        <EmptyState compact text="No activity yet." />
      ) : (
        <ol className="space-y-4">
          {q.data.items.map((e) => (
            <li key={e.id} className="flex gap-3">
              <Initials name={e.actor_name} />
              <div className="min-w-0 flex-1 text-t-body">
                <p className="text-ims-text">
                  <span className="font-semibold">{e.actor_name || "System"}</span> {ACTIVITY_LABELS[e.action] || e.action.replace(/_/g, " ")}{" "}
                  {e.record_label !== "" && e.action.startsWith("quotation") && <span className="whitespace-nowrap font-mono text-[12.5px] text-ims-muted">{e.record_label}</span>}
                </p>
                <p className="text-t-small text-ims-muted" title={fmtDateTime(e.created)}>{fmtWhen(e.created)}</p>
                {e.comment && <p className="mt-1 rounded-control bg-ims-thead px-3 py-2 text-ims-body">“{e.comment}”</p>}
                {e.action === "awarded" && e.changes?.not_lowest_price?.new === true && <p className="mt-1 text-t-small font-semibold text-ims-warning">Not the lowest price</p>}
              </div>
            </li>
          ))}
        </ol>
      )}
    </Card>
  );
}

function CreatePoButton({ rfqId }: { rfqId: string }) {
  const navigate = useNavigate();
  const create = useMutation(() => purchasingApi.fromRfq(rfqId), {
    onSuccess: (po) => {
      toast.success(`${po.number} created as a draft. Review it, then submit it for approval.`);
      navigate(`/dashboard/procurement/purchase-orders/${po.id}`);
    },
    onError: (e) => {
      toast.error(errorMessage(e));
    },
  });
  return <Button variant="primary" icon={ShoppingCart} loading={create.isLoading} onClick={() => create.mutate()}>Create purchase order</Button>;
}
