/**
 * One journal entry: its balanced lines with every dimension (department, funding source, project, budget line),
 * where it came from, its approval (manual journals) and its reversal. Drafts are edited and sent for approval here;
 * the DAF approves or reverses a posted manual journal.
 */
import * as React from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useQuery } from "react-query";
import { BookOpen, Pencil, Send, Undo2, XCircle } from "lucide-react";
import pocketbase from "@/lib/pocketbase";
import { usePermissions } from "@/context/auth.context";
import { errorMessage } from "@/lib/procurement";
import { exportReport, ExportFormat } from "@/lib/exporter";
import { JOURNAL_SOURCES, JOURNAL_TYPES, JOURNAL_WORD, ledgerApi, sourceLink } from "@/lib/ledger";
import ExportMenu from "@/components/enterprise/ExportMenu";
import { ApprovalTracker } from "@/components/enterprise/Approval";
import { DecisionButtons, useApprovalTrail } from "@/components/enterprise/useApprovalTrail";
import DocumentUploads from "@/components/enterprise/Attachments";
import { Chatter, toChatter } from "@/components/enterprise/DocumentLayout";
import { ListSkeleton } from "@/components/enterprise/ui";
import {
  Button, ButtonLink, Card, Column, ConfirmDialog, DataTable, DatePicker, DetailHeader, Details, EmptyState, Field, Modal, Num, Page, Tabs, Textarea, fmtDate, fmtDateTime, fmtMoney, notify,
} from "@/components/ims";

const today = () => new Date().toISOString().slice(0, 10);

export default function JournalDetail() {
  const { journalId } = useParams();
  const navigate = useNavigate();
  const { can } = usePermissions();
  const [tab, setTab] = React.useState("lines");
  const [busy, setBusy] = React.useState(false);
  const [cancelling, setCancelling] = React.useState(false);
  const [reversing, setReversing] = React.useState(false);
  const q = useQuery(["gl-journal", journalId], async () => {
    const j: any = await pocketbase.collection("gl_journals").getOne(journalId!, { expand: "period,fiscal_year,created_by,posted_by,prepared_by,reversal_of,reversed_by,approval,recurring" });
    const lines: any[] = await pocketbase.collection("gl_journal_lines").getFullList({ filter: `journal = "${j.id}"`, sort: "line_no", expand: "account,department,funding_source,project,budget_line" });
    return { j, lines };
  });
  const trail = useApprovalTrail("journal_entry", "gl_journals", journalId);
  const refresh = () => {
    q.refetch();
    trail.refresh();
  };
  if (q.isLoading) return <Page><ListSkeleton rows={6} /></Page>;
  if (!q.data) return <Page><EmptyState icon={BookOpen} text="This journal does not exist, or your role cannot see the general ledger." /></Page>;
  const { j, lines } = q.data;
  const x = j.expand || {};
  const manual = j.journal_type === "manual" || j.journal_type === "recurring";
  const editable = manual && ["draft", "returned"].includes(j.status) && can("manage_journals");
  const link = sourceLink(j.source_type, j.source_id);
  const debit = lines.reduce((t, l) => t + l.debit, 0);
  const credit = lines.reduce((t, l) => t + l.credit, 0);
  const note = j.status === "posted" ? `Posted ${fmtDate(j.posted_at || j.created)}` : j.status === "reversed" ? (x.reversed_by ? <>Reversed by <Link className="font-mono text-ims-link hover:underline" to={`/dashboard/finance/journals/${j.reversed_by}`}>{x.reversed_by.number}</Link></> : "Reversed") : j.status === "pending_approval" ? "With the Director of Finance" : j.status === "returned" ? "Returned for correction" : undefined;

  const submit = async () => {
    setBusy(true);
    try {
      await ledgerApi.journal(j.id, "submit");
      notify.success(`${j.number} sent to the Director of Finance for approval.`);
      refresh();
    } catch (e) {
      notify.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  const doExport = (format: ExportFormat) => exportReport({
    title: `Journal ${j.number}`, subtitle: `${fmtDate(j.date)} · ${j.description}`, rows: lines, format, what: `gl_journal:${j.number}`, orientation: "landscape", fileName: j.number, totals: ["Debit", "Credit"],
    columns: [
      { header: "#", value: (l: any) => l.line_no, width: 4 },
      { header: "Account", value: (l: any) => l.expand?.account?.code || "", width: 9 }, { header: "Account name", value: (l: any) => l.expand?.account?.name || "", width: 28 },
      { header: "Description", value: (l: any) => l.description, width: 30 },
      { header: "Department", value: (l: any) => l.expand?.department?.name || "", width: 20 }, { header: "Funding", value: (l: any) => l.expand?.funding_source?.code || "", width: 9 },
      { header: "Project", value: (l: any) => l.expand?.project?.code || "", width: 9 }, { header: "Budget line", value: (l: any) => l.expand?.budget_line?.code || "", width: 14 },
      { header: "Debit", value: (l: any) => l.debit, format: "money" }, { header: "Credit", value: (l: any) => l.credit, format: "money" },
    ],
  });

  const columns: Column<any>[] = [
    { key: "no", header: "#", numeric: true, width: "44px", cell: (l) => <span className="text-ims-muted">{l.line_no}</span> },
    {
      key: "account", header: "Account", width: "28%",
      cell: (l) => <Link data-no-row-click className="hover:underline" to={`/dashboard/finance/trial-balance/${l.account}`}><span className="font-mono font-semibold">{l.expand?.account?.code}</span> {l.expand?.account?.name}</Link>,
      sub: (l) => l.description,
    },
    { key: "department", header: "Department", cell: (l) => l.expand?.department?.name || "—" },
    { key: "funding", header: "Funding / project", nowrap: true, cell: (l) => `${l.expand?.funding_source?.code || "—"}${l.expand?.project ? ` · ${l.expand.project.code}` : ""}`, sub: (l) => l.expand?.budget_line?.code },
    { key: "debit", header: "Debit (RWF)", numeric: true, nowrap: true, cell: (l) => (l.debit ? <Num value={l.debit} /> : ""), total: <Num value={debit} /> },
    { key: "credit", header: "Credit (RWF)", numeric: true, nowrap: true, cell: (l) => (l.credit ? <Num value={l.credit} /> : ""), total: <Num value={credit} /> },
  ];

  return (
    <Page>
      <DetailHeader
        back={{ label: "Back to journal entries", to: "/dashboard/finance/journals" }}
        number={j.number}
        type={`${JOURNAL_TYPES[j.journal_type] || j.journal_type} journal`}
        status={j.status}
        statusMap={JOURNAL_WORD}
        statusNote={note}
        title={j.description}
        facts={[
          { label: "Date", value: fmtDate(j.date) },
          x.period && { label: "Period", value: x.period.name },
          { label: "Amount", value: <span className="tabular-nums">{fmtMoney(j.total_debit)}</span> },
          j.source_type && j.source_type !== "manual" && { label: "From", value: link ? <Link className="text-ims-link hover:underline" to={link}>{JOURNAL_SOURCES[j.source_type] || j.source_type} {j.source_number}</Link> : `${JOURNAL_SOURCES[j.source_type] || j.source_type} ${j.source_number || ""}` },
        ]}
        actions={
          <>
            <ExportMenu permission={["export_ledger", "view_journals"]} onExport={doExport} />
            {editable && <ButtonLink to={`/dashboard/finance/journals/${j.id}/edit`} icon={Pencil}>Edit</ButtonLink>}
            {/* withdrawn by the people who prepare journals; the DAF decides with Reject */}
            {manual && ["draft", "returned", "pending_approval"].includes(j.status) && can("manage_journals") && <Button icon={XCircle} className="text-ims-danger" onClick={() => setCancelling(true)}>Cancel journal</Button>}
            {manual && j.status === "posted" && can("approve_journals") && <Button icon={Undo2} onClick={() => setReversing(true)}>Reverse</Button>}
            <DecisionButtons approval={x.approval} number={j.number} onDone={refresh} />
            {editable && <Button variant="primary" icon={Send} loading={busy} onClick={submit}>Submit for approval</Button>}
          </>
        }
      />
      {debit !== credit && <p className="rounded-card border border-ims-danger/40 bg-ims-danger-bg px-5 py-3 text-t-body text-ims-danger">This journal does not balance: debits {fmtMoney(debit)}, credits {fmtMoney(credit)}.</p>}
      <Card padded={false} className="overflow-hidden">
        <Tabs inset active={tab} onChange={setTab} tabs={[{ key: "lines", label: "Lines", count: lines.length }, { key: "details", label: "Details" }, ...(manual ? [{ key: "approvals", label: "Approvals" }, { key: "documents", label: "Documents", count: (j.attachments || []).length }] : []), { key: "activity", label: "Activity" }]} />
        {tab === "lines" && <DataTable columns={columns} rows={lines} rowKey={(l) => l.id} minWidth={860} totalLabel="Total" empty={<EmptyState icon={BookOpen} text="This journal has no lines." compact />} />}
        {tab === "details" && (
          <div className="px-5 py-5">
            <Details
              columns={3}
              items={[
                { label: "Type", value: JOURNAL_TYPES[j.journal_type] || j.journal_type },
                { label: "Fiscal year", value: x.fiscal_year?.name || x.fiscal_year?.code },
                { label: "Prepared by", value: x.prepared_by?.name || x.created_by?.name || (j.journal_type === "automatic" ? "Posted by the module" : ""), hint: fmtDateTime(j.created) },
                { label: "Posted", value: j.posted_at ? `${fmtDate(j.posted_at)}${x.posted_by ? ` by ${x.posted_by.name}` : ""}` : "" },
                { label: "Reversal of", value: x.reversal_of ? <Link className="font-mono text-ims-link hover:underline" to={`/dashboard/finance/journals/${j.reversal_of}`}>{x.reversal_of.number}</Link> : "" },
                { label: "Reversed by", value: x.reversed_by ? <Link className="font-mono text-ims-link hover:underline" to={`/dashboard/finance/journals/${j.reversed_by}`}>{x.reversed_by.number}</Link> : "", hint: j.reversal_reason || undefined },
                { label: "Recurring journal", value: x.recurring ? <Link className="text-ims-link hover:underline" to="/dashboard/finance/recurring-journals">{x.recurring.name}</Link> : "" },
                { label: "Cancelled because", value: j.cancel_reason },
              ]}
            />
            <p className="mt-5 text-t-small text-ims-muted">Salary lines are posted by department and funding source; the payslips themselves stay in the payroll.</p>
          </div>
        )}
        {tab === "approvals" && <div className="px-5 py-5"><ApprovalTracker approval={x.approval} actions={trail.actions} /></div>}
        {tab === "documents" && <div className="px-5 py-5"><DocumentUploads collection="gl_journals" record={j} canAdd={can(["manage_journals", "approve_journals"])} canRemove={editable} onChange={refresh} hint="Calculation, invoice or letter that supports the journal" /></div>}
        {tab === "activity" && <div className="p-3"><Chatter items={toChatter(trail.actions, trail.audit)} /></div>}
      </Card>
      <ConfirmDialog
        open={cancelling}
        onClose={() => setCancelling(false)}
        title={`Cancel ${j.number}?`}
        description="Nothing is posted; the journal is kept as cancelled."
        confirmLabel="Cancel journal"
        danger
        reason={{ label: "Why", min: 5, required: true }}
        onConfirm={async (reason) => {
          try {
            await ledgerApi.journal(j.id, "cancel", { reason });
            notify.success(`${j.number} cancelled.`);
            setCancelling(false);
            refresh();
          } catch (e) {
            notify.error(errorMessage(e));
          }
        }}
      />
      {reversing && <ReverseDialog journal={j} onClose={() => setReversing(false)} onDone={(id) => { setReversing(false); navigate(`/dashboard/finance/journals/${id}`); }} />}
    </Page>
  );
}

function ReverseDialog({ journal, onClose, onDone }: { journal: any; onClose: () => void; onDone: (id: string) => void }) {
  const [reason, setReason] = React.useState("");
  const [date, setDate] = React.useState(today());
  const [busy, setBusy] = React.useState(false);
  const go = async () => {
    setBusy(true);
    try {
      const r = await ledgerApi.journal(journal.id, "reverse", { reason: reason.trim(), date });
      notify.success(`${journal.number} reversed by ${r.number}.`);
      onDone(r.id);
    } catch (e) {
      notify.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal
      open
      onClose={onClose}
      title={`Reverse ${journal.number}?`}
      description="An opposite journal is posted on the date you choose; the original stays in the ledger, marked as reversed."
      footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" icon={Undo2} loading={busy} disabled={reason.trim().length < 10} onClick={go}>Reverse</Button></>}
    >
      <Field label="Date of the reversal" required htmlFor="rev-date" hint="In an open month, not before the journal itself."><DatePicker id="rev-date" value={date} min={journal.date.slice(0, 10)} onChange={setDate} /></Field>
      <Field label="Why" required htmlFor="rev-reason" hint="At least 10 characters"><Textarea id="rev-reason" value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
    </Modal>
  );
}
