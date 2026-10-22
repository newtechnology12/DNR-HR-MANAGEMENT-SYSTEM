/**
 * Bank reconciliation statement (or cash count): balances on both sides, every reconciling item with its
 * age and follow-up, the DAF's approval, and an Excel / PDF export with the RALGA header. While it is being
 * prepared the figures are recalculated each time it is opened.
 */
import * as React from "react";
import { Link, useParams } from "react-router-dom";
import { useQuery } from "react-query";
import { toast } from "sonner";
import { AlertTriangle, Ban, CornerUpLeft, Link2, Pencil, Scale, Send } from "lucide-react";
import pocketbase from "@/lib/pocketbase";
import { usePermissions } from "@/context/auth.context";
import { FOLLOW_UP, PERMS, REC_STATUS, RecItem, treasuryApi } from "@/lib/treasury";
import { DOCUMENT_LINKS, showDay } from "@/lib/ims";
import { errorMessage } from "@/lib/procurement";
import { exportReport } from "@/lib/exporter";
import { Skeleton } from "@/components/ui/skeleton";
import { Activity, ApprovalTracker } from "@/components/enterprise/Approval";
import { DecisionButtons, useApprovalTrail } from "@/components/enterprise/useApprovalTrail";
import DocumentUploads from "@/components/enterprise/Attachments";
import ExportMenu from "@/components/enterprise/ExportMenu";
import {
  Button,
  ButtonLink,
  Card,
  CardHeader,
  Column,
  DataTable,
  DatePicker,
  DetailHeader,
  EmptyState,
  Field,
  MenuItem,
  Modal,
  MoreMenu,
  Num,
  Page,
  Pill,
  PillTone,
  Tabs,
  Textarea,
  fmtDate,
  fmtMoney,
  fmtNumber,
  statusText,
} from "@/components/ims";
import { MoneyInput, ReasonDialog } from "@/components/treasury/TreasuryKit";
import { cn } from "@/utils";

type TabKey = "statement" | "items" | "documents" | "approvals" | "activity";
const LIST = "/dashboard/treasury/reconciliations";
const SECTIONS: { side: "book" | "bank"; direction: "in" | "out"; title: string; sign: "+" | "−" }[] = [
  { side: "book", direction: "in", title: "Receipts not yet on the statement (deposits in transit)", sign: "+" },
  { side: "book", direction: "out", title: "Payments not yet on the statement (unpresented)", sign: "−" },
  { side: "bank", direction: "in", title: "Bank credits not in the cash book", sign: "+" },
  { side: "bank", direction: "out", title: "Bank debits not in the cash book", sign: "−" },
];
const sourceLink = (i: RecItem) => (i.source_type && i.source_id ? DOCUMENT_LINKS[i.source_type]?.(i.source_id) || "" : "");

export default function ReconciliationDetail() {
  const { recId } = useParams();
  const { can } = usePermissions();
  const [tab, setTab] = React.useState<TabKey>("statement");
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
  if (q.isLoading) {
    return (
      <Page>
        <Skeleton className="h-5 w-48" />
        <Skeleton className="h-16 w-full max-w-2xl" />
        <Skeleton className="h-64 w-full" />
      </Page>
    );
  }
  const r: any = q.data;
  if (!r) {
    return (
      <Page>
        <Card>
          <EmptyState icon={Scale} text="This reconciliation is not available. It may be outside what your role can see." action={<ButtonLink to={LIST}>Back to reconciliations</ButtonLink>} />
        </Card>
      </Page>
    );
  }
  const a = r.expand?.account || {};
  const cash = a.kind === "cash";
  const items: RecItem[] = r.items || [];
  const editable = ["draft", "returned"].includes(r.status);
  const open = ["draft", "pending_approval", "returned"].includes(r.status);
  const missing = items.filter((i) => !i.follow_up && !i.matched_later).length;
  const status = REC_STATUS[r.status];
  const returnNote = r.status === "returned" ? [...trail.actions].reverse().find((x: any) => x.action === "return")?.comment : null;

  async function submit() {
    setBusy(true);
    try {
      await treasuryApi.rec(r.id, "submit");
      toast.success(`${r.number} sent to the DAF for approval`);
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
      subtitle: `${r.number} · as of ${showDay(r.as_of)} · ${statusText(REC_STATUS[r.status], r.status)} · prepared by ${r.expand?.prepared_by?.name || "—"}${r.approved_at ? ` · approved ${showDay(r.approved_at)}` : ""}`,
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

  const prep = editable && canPrepare;
  const more: MenuItem[] = [
    { label: "Cancel reconciliation", icon: Ban, danger: true, onSelect: () => setCancelling(true), hidden: !(open && can(["prepare_bank_reconciliation", "approve_bank_reconciliation"])) },
  ];

  const itemColumns: Column<RecItem>[] = [
    { key: "date", header: "Date", nowrap: true, cell: (i) => fmtDate(i.date) },
    {
      key: "description",
      header: "Description",
      className: "min-w-[240px]",
      cell: (i) => (
        <span className="block">
          {sourceLink(i) ? <Link to={sourceLink(i)} className="whitespace-nowrap font-mono text-t-small font-semibold text-ims-link hover:underline">{i.source_number}</Link> : null}
          <span className="line-clamp-2 break-words">{[i.counterparty, i.description].filter(Boolean).join(" · ")}</span>
        </span>
      ),
    },
    { key: "reference", header: "Reference", nowrap: true, cell: (i) => (i.reference ? <span className="font-mono text-t-small text-ims-muted">{i.reference}</span> : "") },
    { key: "amount", header: "Amount (RWF)", numeric: true, cell: (i) => <Num value={i.amount} /> },
    {
      key: "age",
      header: "Days",
      numeric: true,
      cell: (i) => (
        <span className="inline-flex items-center justify-end gap-1.5">
          {i.stale && <Pill tone="danger">Stale cheque</Pill>}
          {fmtNumber(i.age)}
        </span>
      ),
    },
    {
      key: "follow",
      header: "Follow-up",
      className: "min-w-[180px]",
      cell: (i) =>
        i.follow_up ? (
          <Pill tone={(FOLLOW_UP[i.follow_up]?.tone as PillTone) || "neutral"} title={FOLLOW_UP[i.follow_up]?.hint}>{FOLLOW_UP[i.follow_up]?.label || i.follow_up}</Pill>
        ) : i.matched_later ? (
          <Pill tone="info">Timing difference</Pill>
        ) : (
          <Pill tone="warning">Not reviewed</Pill>
        ),
      sub: (i) =>
        i.follow_up_note || i.matched_later ? (
          <>
            {i.follow_up_note && <span className="block">{i.follow_up_note}</span>}
            {i.matched_later && <span className="block text-ims-link">Cleared after this date</span>}
          </>
        ) : null,
    },
  ];

  return (
    <Page>
      <DetailHeader
        back={{ label: "Back to reconciliations", to: LIST }}
        number={r.number}
        type={cash ? "Cash count" : "Bank reconciliation"}
        status={status?.label || r.status}
        statusNote={status?.note}
        title={`${a.code || ""} · ${a.name || "Account"}`}
        facts={[
          { label: "As of", value: fmtDate(r.as_of) },
          r.expand?.period?.name,
          a.bank_name ? `${a.bank_name} ${a.account_number || ""}`.trim() : null,
          { label: "Prepared by", value: r.expand?.prepared_by?.name || "—" },
        ]}
        actions={
          <>
            <MoreMenu items={more} />
            {prep && !cash && <ButtonLink to={`/dashboard/treasury/reconcile/${a.id}`} icon={Link2}>Match items</ButtonLink>}
            {prep && <Button icon={Pencil} onClick={() => setEditing(true)}>{cash ? "Change count" : "Statement balance"}</Button>}
            {prep && <Button variant="primary" icon={Send} loading={busy} onClick={submit}>Submit for approval</Button>}
            <DecisionButtons approval={r.expand?.approval} number={r.number} onDone={refresh} />
          </>
        }
      />

      {r.status === "returned" && (
        <p role="status" className="flex items-start gap-2 rounded-card border border-ims-orange/30 bg-ims-orange-bg px-4 py-3 text-t-body text-ims-orange">
          <CornerUpLeft size={16} className="mt-0.5 shrink-0" aria-hidden />
          <span>Returned for changes{returnNote ? `: “${returnNote}”` : ""}. Correct it and submit it again.</span>
        </p>
      )}
      {(r.warnings || []).map((t: string) => (
        <p key={t} className="flex items-start gap-2 rounded-card border border-ims-warning/30 bg-ims-warning-bg px-4 py-3 text-t-body text-ims-warning">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" aria-hidden /> <span>{t}</span>
        </p>
      ))}
      {editable && missing > 0 && (
        <p className="flex items-start gap-2 rounded-card border border-ims-warning/30 bg-ims-warning-bg px-4 py-3 text-t-body text-ims-warning">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" aria-hidden />
          <span>{missing} reconciling item{missing === 1 ? " has" : "s have"} no follow-up yet. Set it on the matching screen before you submit it to the DAF.</span>
        </p>
      )}

      <Tabs
        label="Reconciliation sections"
        active={tab}
        onChange={(k) => setTab(k as TabKey)}
        tabs={[
          { key: "statement", label: "Statement" },
          ...(cash ? [] : [{ key: "items", label: "Items", count: items.length }]),
          { key: "documents", label: "Documents", count: (r.attachments || []).length },
          { key: "approvals", label: "Approvals" },
          { key: "activity", label: "Activity" },
        ]}
      />

      {tab === "statement" && (
        <Card>
          <CardHeader
            title={cash ? "Cash count" : "Bank reconciliation statement"}
            subtitle={`As of ${fmtDate(r.as_of)}, in RWF.${editable ? " Recalculated each time it is opened until it is submitted." : ""}`}
            action={<ExportMenu onExport={doExport} permission={PERMS.export} size="default" />}
          />
          {cash ? (
            <div className="max-w-md space-y-1">
              <Line label="Cash counted" value={r.statement_balance} />
              <Line label="Balance in the cash book" value={r.book_balance} />
              <Line label="Difference" value={r.difference} total ok={r.difference === 0} />
              {r.notes && <p className="pt-3 text-t-small text-ims-body">{r.notes}</p>}
            </div>
          ) : (
            <div className="space-y-5">
              <div className="grid gap-6 lg:grid-cols-2">
                <div className="space-y-1">
                  <Line label="Balance on the bank statement" value={r.statement_balance} hint={r.statement_balance !== r.statement_balance_computed ? `Imported lines give ${fmtNumber(r.statement_balance_computed)}` : undefined} />
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
              <div className={cn("flex items-center justify-between gap-3 rounded-control px-4 py-3", r.difference === 0 ? "bg-ims-success-bg" : "bg-ims-danger-bg")}>
                <span className="text-t-body font-bold text-ims-text">Difference</span>
                <span className={cn("text-t-kpi tabular-nums", r.difference === 0 ? "text-ims-success" : "text-ims-danger")}>{fmtMoney(r.difference)}</span>
              </div>
              {!items.length && <p className="text-t-small text-ims-muted">No reconciling items: the statement and the cash book agree line by line.</p>}
              {r.notes && <p className="text-t-small text-ims-body"><span className="font-semibold text-ims-text">Notes:</span> {r.notes}</p>}
            </div>
          )}
        </Card>
      )}

      {tab === "items" && !cash && (
        <>
          {SECTIONS.map((s) => {
            const list = items.filter((i) => i.side === s.side && i.direction === s.direction);
            if (!list.length) return null;
            const total = list.reduce((t, i) => t + i.amount, 0);
            return (
              <Card key={s.title} padded={false} className="overflow-hidden">
                <div className="px-5 pt-5">
                  <CardHeader title={s.title} subtitle={`${s.sign === "+" ? "Added" : "Taken off"}: ${s.sign} ${fmtMoney(total)} · ${list.length} item${list.length === 1 ? "" : "s"}`} />
                </div>
                <DataTable
                  columns={itemColumns.map((c) => (c.key === "amount" ? { ...c, total: <Num value={total} /> } : c))}
                  rows={list}
                  rowKey={(i) => `${i.side}-${i.id}`}
                  minWidth={820}
                  caption={s.title}
                />
              </Card>
            );
          })}
          {!items.length && (
            <Card>
              <EmptyState compact icon={Scale} text="No reconciling items: the statement and the cash book agree line by line." />
            </Card>
          )}
        </>
      )}

      {tab === "documents" && (
        <Card>
          <CardHeader title="Documents" subtitle={cash ? "The signed cash count sheet." : "The bank statement page and confirmations from the bank."} />
          <DocumentUploads collection="bank_reconciliations" record={r} canAdd={can(["prepare_bank_reconciliation", "approve_bank_reconciliation"])} canRemove={editable && canPrepare} onChange={refresh} hint={cash ? "The signed cash count sheet" : "The bank statement page, confirmations from the bank"} />
        </Card>
      )}

      {tab === "approvals" && <ApprovalTracker approval={r.expand?.approval} actions={trail.actions} />}

      {tab === "activity" && <Activity actions={trail.actions} audit={trail.audit} loading={trail.loading} />}

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
            throw e;
          }
        }}
      />
    </Page>
  );
}

/** One line of the reconciliation statement: label on the left, number on the right; totals in bold. */
function Line({ label, value, sign, total, hint, ok }: { label: string; value: number; sign?: "+" | "−"; total?: boolean; hint?: string; ok?: boolean }) {
  return (
    <div className={cn("flex items-baseline justify-between gap-3 py-1 text-t-body", total && "border-t-2 border-ims-border pt-2 font-bold")}>
      <span className={total ? "text-ims-text" : "text-ims-body"}>
        {sign && <span className="mr-1 inline-block w-3 text-ims-faint">{sign}</span>}
        {label}
        {hint && <span className="block pl-4 text-t-small font-normal text-ims-warning">{hint}</span>}
      </span>
      <span className={cn("tabular-nums", ok === true ? "text-ims-success" : ok === false ? "text-ims-danger" : "text-ims-text")}>{fmtNumber(Number(value || 0))}</span>
    </div>
  );
}

function EditDialog({ r, cash, onClose, onDone }: { r: any; cash: boolean; onClose: () => void; onDone: () => void }) {
  const [asOf, setAsOf] = React.useState(String(r.as_of).slice(0, 10));
  const [balance, setBalance] = React.useState<number | "">(r.statement_balance);
  const [notes, setNotes] = React.useState(r.notes || "");
  const [busy, setBusy] = React.useState(false);
  async function save() {
    setBusy(true);
    try {
      await pocketbase.collection("bank_reconciliations").update(r.id, { as_of: `${asOf} 12:00:00.000Z`, statement_balance: Number(balance), notes: notes.trim() });
      toast.success(`${r.number} saved and recalculated`);
      onDone();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      open
      onClose={busy ? () => undefined : onClose}
      title={<>Change <span className="whitespace-nowrap">{r.number}</span></>}
      description="The figures are recalculated when you save."
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button variant="primary" loading={busy} disabled={balance === "" || !asOf} onClick={save}>Save</Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="As of" required htmlFor="ed-date">
          <DatePicker id="ed-date" value={asOf} max={new Date().toISOString().slice(0, 10)} onChange={setAsOf} />
        </Field>
        <Field label={cash ? "Cash counted" : "Balance printed on the statement"} required htmlFor="ed-bal">
          <MoneyInput id="ed-bal" value={balance} onChange={setBalance} />
        </Field>
        <Field label="Notes" className="sm:col-span-2" htmlFor="ed-notes">
          <Textarea id="ed-notes" className="min-h-[72px]" value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>
      </div>
    </Modal>
  );
}
