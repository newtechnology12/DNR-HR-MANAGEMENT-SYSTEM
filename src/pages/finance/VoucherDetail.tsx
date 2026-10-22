/**
 * Payment voucher document: payee and verified bank account, invoices or budget line, withholding tax,
 * approval (DAF → SG above the DAF limit) and execution by the Cashier, with the payments it created.
 */
import * as React from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useQuery } from "react-query";
import { toast } from "sonner";
import { AlertTriangle, Banknote, Clock, CornerUpLeft, FileCheck2, Info, LucideIcon, Pencil, Printer, Send, ShieldCheck, XCircle } from "lucide-react";
import pocketbase from "@/lib/pocketbase";
import { usePermissions } from "@/context/auth.context";
import { AUTHORITIES, BANK_LABELS, VOUCHER_STATUS, VOUCHER_TYPES, payablesApi } from "@/lib/payables";
import { PAYMENT_METHODS, errorMessage } from "@/lib/procurement";
import { Skeleton } from "@/components/ui/skeleton";
import { Totals } from "@/components/enterprise/DocumentLayout";
import { Activity, ApprovalTracker } from "@/components/enterprise/Approval";
import { DecisionButtons, useApprovalTrail } from "@/components/enterprise/useApprovalTrail";
import { BudgetPanel } from "@/components/budget/BudgetKit";
import DocumentUploads from "@/components/enterprise/Attachments";
import { AccountSelect } from "@/components/treasury/TreasuryKit";
import { activeAccounts } from "@/lib/treasury";
import { cn } from "@/utils";
import {
  Button,
  ButtonLink,
  Card,
  CardHeader,
  Column,
  ConfirmDialog,
  DataTable,
  DatePicker,
  DetailHeader,
  Details,
  DocNo,
  EmptyState,
  Field,
  Input,
  MenuItem,
  Modal,
  MoreMenu,
  Num,
  Page,
  Person,
  Select,
  Tabs,
  fmtDate,
  fmtDateTime,
  fmtMoney,
  overdue as overdueText,
} from "@/components/ims";

type TabKey = "details" | "lines" | "payments" | "approval" | "activity";
const TAB_KEYS: TabKey[] = ["details", "lines", "payments", "approval", "activity"];
const TAB_ALIAS: Record<string, TabKey> = { documents: "details", items: "lines", approvals: "approval" };
const LIST = "/dashboard/finance/vouchers";

type Act = { key: string; label: string; icon: LucideIcon; run: () => void; main?: boolean; disabled?: boolean; loading?: boolean; title?: string };

export default function VoucherDetail() {
  const { voucherId } = useParams();
  const navigate = useNavigate();
  const { can } = usePermissions();
  const me = pocketbase.authStore.model as any;
  const [params, setParams] = useSearchParams();
  const rawTab = params.get("tab") || "details";
  const tab: TabKey = TAB_ALIAS[rawTab] || (TAB_KEYS.includes(rawTab as TabKey) ? (rawTab as TabKey) : "details");
  const setTab = (t: string) => setParams(t === "details" ? {} : { tab: t });
  const [paying, setPaying] = React.useState(false);
  const [cancelling, setCancelling] = React.useState(false);
  const [busy, setBusy] = React.useState(false);

  const q = useQuery(["voucher", voucherId], async () => {
    const v: any = await pocketbase.collection("payment_vouchers").getOne(voucherId!, { expand: "supplier,prepared_by,paid_by,approval,budget_line,department,expense_account,paid_from" });
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
      toast.success(`${q.data?.v?.number || "Voucher"} submitted for approval`);
      refresh();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  if (q.isLoading) {
    return (
      <Page>
        <Skeleton className="h-5 w-48" />
        <Skeleton className="h-16 w-full max-w-2xl" />
        <Skeleton className="h-64 w-full" />
      </Page>
    );
  }
  if (!q.data) {
    return (
      <Page>
        <Card>
          <EmptyState
            icon={FileCheck2}
            text="This payment voucher is not available. It may have been deleted, or your role cannot see it."
            action={<ButtonLink to={LIST}>Back to payment vouchers</ButtonLink>}
          />
        </Card>
      </Page>
    );
  }
  const { v } = q.data;
  const payments: any[] = q.data.payments;
  const approval = v.expand?.approval;
  const editable = can("manage_payment_vouchers") && ["draft", "returned"].includes(v.status);
  const lines: any[] = v.lines || [];
  const bank = v.payee_bank || {};
  const preparedByMe = v.prepared_by === me?.id;
  const cancellable = (can("manage_payment_vouchers") || can("approve_payment_vouchers")) && ["draft", "returned", "pending_approval", "approved"].includes(v.status);
  const late = v.status === "approved" && v.due_date && String(v.due_date).slice(0, 10) < new Date().toISOString().slice(0, 10) ? overdueText(v.due_date) : null;
  const isApprover = approval?.status === "pending" && String(approval?.pending_approvers || "").split(",").includes(me?.id);
  const canPay = v.status === "approved" && can("record_payments");
  const stepName = approval?.status === "pending" ? approval.steps?.[approval.current_level]?.name : null;
  const typeLabel = VOUCHER_TYPES[v.voucher_type]?.label;

  // The next step is the primary button (approvers get Return · Reject · Approve), then at most two
  // secondary buttons; the rest go under "More".
  const acts = [
    editable && { key: "submit", label: "Submit for approval", icon: Send, run: submit, main: true, loading: busy },
    editable && { key: "edit", label: "Edit", icon: Pencil, run: () => navigate(`${LIST}/${v.id}/edit`) },
    canPay && {
      key: "pay",
      label: "Execute payment",
      icon: Banknote,
      run: () => setPaying(true),
      main: true,
      disabled: preparedByMe,
      title: preparedByMe ? "You prepared this voucher; someone else must execute it." : undefined,
    },
    { key: "print", label: "Print", icon: Printer, run: () => window.print() },
  ].filter(Boolean) as Act[];
  const primaryAct = isApprover ? undefined : acts.find((a) => a.main);
  const rest = acts.filter((a) => a !== primaryAct);
  const shown = isApprover ? [] : rest.slice(0, 2);
  const more: MenuItem[] = [
    ...(isApprover ? rest : rest.slice(2)).map((a) => ({ label: a.label, icon: a.icon, onSelect: a.run, disabled: a.disabled })),
    { label: "Cancel voucher", icon: XCircle, danger: true, onSelect: () => setCancelling(true), hidden: !cancellable },
  ];
  const btn = (a: Act, variant: "primary" | "secondary") => (
    <Button key={a.key} variant={variant} icon={a.icon} onClick={a.run} disabled={a.disabled} loading={a.loading} title={a.title}>{a.label}</Button>
  );

  const statusNote = [stepName ? `At “${stepName}”` : VOUCHER_STATUS[v.status]?.note, late].filter(Boolean).join(" · ");

  const invoiceColumns: Column<any>[] = [
    {
      key: "invoice",
      header: "Invoice",
      nowrap: true,
      cell: (l) => <Link to={`/dashboard/finance/invoices/${l.invoice}`} className="whitespace-nowrap font-mono text-t-small font-semibold text-ims-link hover:underline">{l.number}</Link>,
      sub: (l) => (l.supplier_invoice_number ? `Supplier ref. ${l.supplier_invoice_number}` : null),
    },
    { key: "date", header: "Invoice date", nowrap: true, cell: (l) => fmtDate(l.invoice_date) },
    { key: "due", header: "Due", nowrap: true, cell: (l) => fmtDate(l.due_date) },
    { key: "total", header: "Invoice total (RWF)", numeric: true, cell: (l) => <span className="text-ims-muted"><Num value={l.total} /></span>, total: <Num value={lines.reduce((a, l) => a + (Number(l.total) || 0), 0)} /> },
    { key: "amount", header: "Paid by this voucher (RWF)", numeric: true, cell: (l) => <span className="font-semibold"><Num value={l.amount} /></span>, total: <Num value={lines.reduce((a, l) => a + (Number(l.amount) || 0), 0)} /> },
    { key: "base", header: "Taxable before VAT (RWF)", numeric: true, cell: (l) => <Num value={l.base} />, total: <Num value={lines.reduce((a, l) => a + (Number(l.base) || 0), 0)} /> },
  ];

  const statutoryColumns: Column<any>[] = [
    {
      key: "liability",
      header: "Liability",
      cell: (l) => (
        <span>
          <span className="mr-1.5 font-mono text-t-small font-semibold text-ims-text">{l.code}</span>
          {l.name}
        </span>
      ),
    },
    { key: "authority", header: "Paid to", nowrap: true, cell: (l) => AUTHORITIES[l.authority]?.label || l.authority || "—" },
    { key: "period", header: "For the month of", nowrap: true, cell: (l) => l.period || "—" },
    { key: "amount", header: "Paid by this voucher (RWF)", numeric: true, cell: (l) => <span className="font-semibold"><Num value={l.amount} /></span>, total: <Num value={lines.reduce((a, l) => a + (Number(l.amount) || 0), 0)} /> },
  ];
  const LINES_TITLE: Record<string, [string, string, string]> = {
    invoice: ["Invoices", "Invoices paid by this voucher", "Approved supplier invoices, after the three-way match."],
    statutory: ["Liabilities", "Liabilities paid by this voucher", "What the payroll and the tax withheld left owing to the authority. No budget line: the cost was charged when the payroll or the invoice was approved."],
    direct: ["Expense", "Expense", "A payment without a purchase order, charged to a budget line."],
  };
  const [linesTab, linesTitle, linesSubtitle] = LINES_TITLE[v.voucher_type] || LINES_TITLE.direct;

  const paymentColumns: Column<any>[] = [
    { key: "number", header: "Payment", nowrap: true, cell: (p) => <DocNo value={p.number} />, sub: (p) => fmtDate(p.payment_date) },
    { key: "invoice", header: "Invoice", nowrap: true, cell: (p) => <DocNo value={p.expand?.invoice?.number} /> },
    { key: "method", header: "Method", cell: (p) => PAYMENT_METHODS[p.method] || p.method || "—", sub: (p) => p.reference },
    { key: "by", header: "Paid by", className: "max-w-[180px]", cell: (p) => <Person name={p.expand?.paid_by?.name} /> },
    { key: "gross", header: "Gross (RWF)", numeric: true, cell: (p) => <Num value={p.amount} />, total: <Num value={payments.reduce((a: number, p: any) => a + (p.amount || 0), 0)} /> },
    { key: "wht", header: "Tax withheld (RWF)", numeric: true, cell: (p) => (p.wht_amount ? <Num value={p.wht_amount} /> : "—"), total: <Num value={payments.reduce((a: number, p: any) => a + (p.wht_amount || 0), 0)} /> },
    { key: "net", header: "Net paid (RWF)", numeric: true, cell: (p) => <span className="font-semibold"><Num value={p.net_amount || p.amount} /></span>, total: <Num value={payments.reduce((a: number, p: any) => a + (p.net_amount || p.amount || 0), 0)} /> },
  ];

  return (
    <Page>
      <DetailHeader
        back={{ label: "Back to payment vouchers", to: LIST }}
        number={v.number}
        type={typeLabel ? `Payment voucher · ${typeLabel}` : "Payment voucher"}
        status={VOUCHER_STATUS[v.status]?.label || v.status}
        statusNote={statusNote ? <span className={cn(late && "text-ims-danger")}>{statusNote}</span> : undefined}
        title={v.payee_name || "Payment voucher"}
        facts={[
          { label: "Prepared by", value: v.expand?.prepared_by?.name || "—" },
          v.expand?.department?.name,
          v.due_date ? { label: "Pay by", value: fmtDate(v.due_date) } : null,
          { label: "Net to pay", value: fmtMoney(v.net_amount) },
        ]}
        actions={
          <>
            <MoreMenu items={more} />
            {shown.map((a) => btn(a, "secondary"))}
            {primaryAct && btn(primaryAct, "primary")}
            <DecisionButtons approval={approval} number={v.number} onDone={refresh} />
          </>
        }
      />

      {isApprover && (
        <p role="status" className="flex items-start gap-2 rounded-card border border-ims-warning/30 bg-ims-warning-bg px-4 py-3 text-t-body text-ims-warning">
          <Clock size={16} className="mt-0.5 shrink-0" aria-hidden />
          <span>Waiting for your decision{stepName ? ` at step “${stepName}”` : ""}. Approve it, return it for changes, or reject it.</span>
        </p>
      )}
      {v.status === "returned" && editable && (
        <p role="status" className="flex items-start gap-2 rounded-card border border-ims-orange/30 bg-ims-orange-bg px-4 py-3 text-t-body text-ims-orange">
          <CornerUpLeft size={16} className="mt-0.5 shrink-0" aria-hidden />
          <span>Returned for changes. Edit it and submit it again; approval starts again from the first step.</span>
        </p>
      )}
      {late && (
        <p role="status" className="flex items-start gap-2 rounded-card border border-ims-danger/30 bg-ims-danger-bg px-4 py-3 text-t-body text-ims-danger">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" aria-hidden />
          <span>Payment was due on {fmtDate(v.due_date)} ({late.toLowerCase()}).</span>
        </p>
      )}
      {canPay && preparedByMe && (
        <p role="status" className="flex items-start gap-2 rounded-card border border-ims-info/20 bg-ims-info-bg px-4 py-3 text-t-body text-ims-info">
          <Info size={16} className="mt-0.5 shrink-0" aria-hidden />
          <span>You prepared this voucher, so someone else must execute the payment.</span>
        </p>
      )}

      <Tabs
        label="Voucher sections"
        active={tab}
        onChange={setTab}
        tabs={[
          { key: "details", label: "Details" },
          { key: "lines", label: linesTab, count: v.voucher_type === "direct" ? undefined : lines.length },
          { key: "payments", label: "Payments", count: payments.length },
          { key: "approval", label: "Approvals" },
          { key: "activity", label: "Activity" },
        ]}
      />

      {tab === "details" && (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
          <Card className="xl:col-span-2">
            <CardHeader title="Voucher" />
            <Details
              items={[
                {
                  label: "Payee",
                  value: v.supplier ? <Link className="font-semibold text-ims-link hover:underline" to={`/dashboard/procurement/suppliers/${v.supplier}`}>{v.payee_name}</Link> : v.payee_name,
                  hint: v.expand?.supplier?.tin ? `TIN ${v.expand.supplier.tin}` : undefined,
                },
                {
                  label: "Paid to account",
                  value: bank.bank_account_number ? (
                    <span>
                      <span className="font-mono">{bank.bank_account_number}</span> · {bank.bank_name}{bank.bank_branch ? `, ${bank.bank_branch}` : ""}
                    </span>
                  ) : (
                    "No bank account on file"
                  ),
                  hint: bank.bank_account_name || undefined,
                },
                { label: "Type", value: typeLabel },
                { label: "Department", value: v.expand?.department?.name },
                { label: "Prepared by", value: v.expand?.prepared_by?.name, hint: fmtDateTime(v.created) },
                { label: "Pay by", value: v.due_date ? <span className={cn(late && "font-semibold text-ims-danger")}>{fmtDate(v.due_date)}</span> : null, hint: late ? <span className="text-ims-danger">{late}</span> : undefined },
                ...(v.status === "paid"
                  ? [
                    {
                      label: "Paid",
                      value: v.status === "paid" ? `${fmtDate(v.payment_date)} · ${PAYMENT_METHODS[v.payment_method] || v.payment_method || ""} ${v.payment_reference || ""}`.trim() : null,
                      hint: v.expand?.paid_by ? `By ${v.expand.paid_by.name}` : undefined,
                    },
                    {
                      label: "Paid from",
                      value: v.expand?.paid_from ? <Link to={`/dashboard/treasury/accounts/${v.paid_from}`} className="font-semibold text-ims-link hover:underline">{v.expand.paid_from.code} · {v.expand.paid_from.name}</Link> : null,
                    },
                  ]
                  : []),
                { label: "What is paid", value: v.description ? <span className="whitespace-pre-line">{v.description}</span> : null, wide: true },
                ...(v.notes ? [{ label: "Notes for the approvers", value: <span className="whitespace-pre-line">{v.notes}</span>, wide: true }] : []),
              ]}
            />
          </Card>
          <div className="min-w-0 space-y-4">
            {v.voucher_type === "direct" && v.budget_line && !["cancelled", "rejected"].includes(v.status) && (
              <BudgetPanel
                documentType="payment_voucher" documentId={v.id} number={v.number} lineId={v.budget_line}
                amount={["draft", "returned", "pending_approval"].includes(v.status) ? v.gross_amount : 0} overrideId={v.budget_override}
                allowOverride={["draft", "returned"].includes(v.status)} onDone={refresh} stacked
              />
            )}
            <Card>
              <CardHeader title="Documents" subtitle="Invoice, delivery note, bank transfer confirmation." />
              <DocumentUploads collection="payment_vouchers" record={v} canAdd={can(["manage_payment_vouchers", "approve_payment_vouchers", "record_payments"])} canRemove={editable} onChange={refresh} hint="PDF or images, up to 20 MB each" />
            </Card>
          </div>
        </div>
      )}

      {tab === "lines" && (
        <Card padded={false}>
          <div className="px-5 pt-5">
            <CardHeader title={linesTitle} subtitle={linesSubtitle} />
          </div>
          {v.voucher_type === "invoice" ? (
            <DataTable columns={invoiceColumns} rows={lines} rowKey={(l) => l.invoice} minWidth={760} caption="Invoices" onRowClick={(l) => navigate(`/dashboard/finance/invoices/${l.invoice}`)} empty={<EmptyState compact text="No invoices on this voucher." />} />
          ) : v.voucher_type === "statutory" ? (
            <DataTable columns={statutoryColumns} rows={lines} rowKey={(l) => l.account} minWidth={680} caption="Liabilities paid" empty={<EmptyState compact text="No liabilities on this voucher." />} />
          ) : (
            <div className="px-5 pb-5">
              <div className="rounded-control border border-ims-border px-4 py-3">
                <Details
                  columns={3}
                  items={[
                    { label: "Budget line", value: v.expand?.budget_line?.code ? <span className="font-mono font-semibold">{v.expand.budget_line.code}</span> : null, hint: v.expand?.budget_line?.name },
                    { label: "Expense account", value: v.expand?.expense_account ? `${v.expand.expense_account.code} · ${v.expand.expense_account.name}` : null },
                    { label: "Charged to the budget", value: v.actual_amount ? fmtMoney(v.actual_amount) : "On approval" },
                  ]}
                />
              </div>
            </div>
          )}
          <div className="border-t border-ims-divider px-5 pb-5 [&_dd]:whitespace-nowrap">
            <Totals
              rows={[
                ["Gross amount", fmtMoney(v.gross_amount)],
                [`Withholding tax${v.wht_rate ? ` (${v.wht_rate}%)` : ""}`, v.wht_amount ? `− ${fmtMoney(v.wht_amount)}` : "—"],
              ]}
              total={["Net to the payee", fmtMoney(v.net_amount)]}
            />
            {v.wht_code && <p className="ml-auto mt-2 max-w-sm text-right text-t-small text-ims-muted">{v.wht_code}, {v.wht_rate}% of {fmtMoney(v.wht_base)}</p>}
          </div>
        </Card>
      )}

      {tab === "payments" && (
        <Card padded={false}>
          <div className="px-5 pt-5">
            <CardHeader title="Payments" subtitle={`Created when the Cashier executes the voucher${v.voucher_type === "invoice" ? ", one per invoice" : ""}.`} />
          </div>
          <DataTable
            columns={paymentColumns}
            rows={payments}
            rowKey={(p) => p.id}
            minWidth={760}
            caption="Payments"
            empty={
              <EmptyState
                compact
                icon={Banknote}
                text={v.status === "approved" ? "Approved and ready for the Cashier to pay." : "Payments show here once the voucher is paid."}
                action={canPay && !preparedByMe ? <Button variant="primary" icon={Banknote} onClick={() => setPaying(true)}>Execute payment</Button> : undefined}
              />
            }
          />
        </Card>
      )}

      {tab === "approval" && <ApprovalTracker approval={approval} actions={trail.actions} />}

      {tab === "activity" && <Activity actions={trail.actions} audit={trail.audit} loading={trail.loading} />}

      {paying && <PayDialog v={v} onClose={() => setPaying(false)} onDone={() => { setPaying(false); refresh(); }} />}
      <ConfirmDialog
        open={cancelling}
        onClose={() => setCancelling(false)}
        title={`Cancel ${v.number}?`}
        description={`${v.actual_amount ? "The amount charged to the budget line is reversed. " : ""}${v.voucher_type === "invoice" ? "The invoices become free to pay on another voucher." : v.voucher_type === "statutory" ? "What it holds becomes free to pay on another voucher." : ""}`.trim()}
        confirmLabel="Cancel voucher"
        danger
        reason={{ label: "Reason", placeholder: "Why the voucher is no longer needed", required: true }}
        onConfirm={async (reason) => {
          try {
            await payablesApi.action(v.id, "cancel", { reason });
            toast.success(`${v.number} cancelled`);
            refresh();
          } catch (e) {
            toast.error(errorMessage(e));
            throw e;
          }
        }}
      />
    </Page>
  );
}

function PayDialog({ v, onClose, onDone }: { v: any; onClose: () => void; onDone: () => void }) {
  const [method, setMethod] = React.useState(v.payee_bank?.bank_account_number ? "bank_transfer" : "cheque");
  const [reference, setReference] = React.useState("");
  const [date, setDate] = React.useState(new Date().toISOString().slice(0, 10));
  const [busy, setBusy] = React.useState(false);
  const [tried, setTried] = React.useState(false);
  const [account, setAccount] = React.useState<any>(null);
  const needsRef = method === "bank_transfer" || method === "cheque";
  const kind = method === "cash" ? "cash" : "bank";
  // The account the money leaves: the default of the right kind, unless the Cashier chooses another.
  React.useEffect(() => {
    let live = true;
    activeAccounts(kind).then((list) => {
      if (!live) return;
      const usable = list.filter((a: any) => !a.funding_source || a.funding_source === v.funding_source);
      setAccount(usable.find((a: any) => a.is_default) || usable[0] || null);
    }).catch(() => null);
    return () => {
      live = false;
    };
  }, [kind, v.funding_source]);
  const short = account && account.book_balance < v.net_amount;
  const restricted = account?.funding_source && account.funding_source !== v.funding_source;
  const refMissing = needsRef && reference.trim().length < 3;
  async function run() {
    setTried(true);
    if (!account || short || restricted || refMissing) return;
    setBusy(true);
    try {
      const r = await payablesApi.action(v.id, "pay", { method, reference: reference.trim(), payment_date: `${date} 12:00:00.000Z`, account: account?.id || "" });
      toast.success(`${v.number} paid: ${(r.payments || []).join(", ")}`);
      onDone();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  const accountError = tried && !account ? "Choose the account the money leaves from." : short ? `Only ${fmtMoney(account.book_balance)} in ${account.code}: not enough for ${fmtMoney(v.net_amount)}.` : restricted ? `${account.code} holds restricted donor money of another funding source.` : null;
  return (
    <Modal
      open
      onClose={busy ? () => undefined : onClose}
      size="md"
      title={<>Execute the payment of <span className="whitespace-nowrap">{v.number}</span>?</>}
      description={`Pay ${fmtMoney(v.net_amount)} to ${v.payee_name}${v.wht_amount ? `; ${fmtMoney(v.wht_amount)} withholding tax is kept for RRA` : ""}.`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button variant="primary" icon={Banknote} onClick={run} loading={busy} disabled={Boolean(short || restricted)}>Pay {fmtMoney(v.net_amount)}</Button>
        </>
      }
    >
      <div className="rounded-control border border-ims-border bg-ims-thead px-4 py-3 text-t-small">
        <p className="mb-1 flex items-center gap-1.5 font-semibold text-ims-text"><ShieldCheck size={15} className="text-ims-success" aria-hidden /> Account approved on this voucher</p>
        {BANK_LABELS.filter(([k]) => v.payee_bank?.[k]).map(([k, label]) => (
          <p key={k} className="text-ims-body">{label}: <span className={cn(k === "bank_account_number" && "font-mono")}>{v.payee_bank[k]}</span></p>
        ))}
        {!v.payee_bank?.bank_account_number && <p className="text-ims-warning">No bank account on file. Pay by cheque or cash.</p>}
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Method" required htmlFor="pay-method">
          <Select id="pay-method" value={method} onChange={(e) => setMethod(e.target.value)}>
            {Object.entries(PAYMENT_METHODS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </Select>
        </Field>
        <Field label="Payment date" required htmlFor="pay-date">
          <DatePicker id="pay-date" value={date} max={new Date().toISOString().slice(0, 10)} onChange={setDate} />
        </Field>
        <Field label={kind === "cash" ? "Pay from cash book" : "Pay from bank account"} required htmlFor="pay-account" className="sm:col-span-2" error={accountError}>
          <AccountSelect id="pay-account" value={account?.id || ""} kind={kind} invalid={Boolean(accountError)} onChange={(_, a) => setAccount(a || null)} />
        </Field>
        <Field
          label={method === "cheque" ? "Cheque number" : "Bank or transaction reference"}
          required={needsRef}
          htmlFor="pay-reference"
          className="sm:col-span-2"
          error={tried && refMissing ? (method === "cheque" ? "Enter the cheque number." : "Enter the bank or transaction reference.") : null}
        >
          <Input id="pay-reference" value={reference} onChange={(e) => setReference(e.target.value)} invalid={tried && refMissing} placeholder={method === "cheque" ? "For example: 004512" : "For example: BK-TRF-2026-10-0412"} />
        </Field>
      </div>
      <p className="text-t-small text-ims-muted">Separation of duties: whoever prepared or approved this voucher cannot pay it. The supplier's verified bank details must not have changed since it was prepared.</p>
    </Modal>
  );
}
