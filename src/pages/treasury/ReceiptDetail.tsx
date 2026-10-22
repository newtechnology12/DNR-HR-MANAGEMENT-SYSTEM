/**
 * Receipt document: who paid, how much, into which account and what for; the DAF's verification; where it
 * stands in the cash book and whether the bank statement shows it yet.
 */
import * as React from "react";
import { Link, useParams } from "react-router-dom";
import { useQuery } from "react-query";
import { toast } from "sonner";
import { Ban, BookCheck, CircleDashed, CornerUpLeft, Pencil, PiggyBank, Send, Undo2 } from "lucide-react";
import pocketbase from "@/lib/pocketbase";
import { usePermissions } from "@/context/auth.context";
import { METHOD_LABELS, PAYER_TYPES, TREASURY_DOC_STATUS, treasuryApi } from "@/lib/treasury";
import { errorMessage } from "@/lib/procurement";
import { Skeleton } from "@/components/ui/skeleton";
import { Activity, ApprovalTracker } from "@/components/enterprise/Approval";
import { DecisionButtons, useApprovalTrail } from "@/components/enterprise/useApprovalTrail";
import DocumentUploads from "@/components/enterprise/Attachments";
import { Button, ButtonLink, Card, CardHeader, DetailHeader, Details, EmptyState, MenuItem, MoreMenu, Page, Tabs, fmtDate, fmtDateTime, fmtMoney } from "@/components/ims";
import { ReasonDialog } from "@/components/treasury/TreasuryKit";
import { cn } from "@/utils";
import ReceiptDialog from "./ReceiptDialog";

type TabKey = "details" | "documents" | "approvals" | "activity";
const LIST = "/dashboard/treasury/receipts";

export default function ReceiptDetail() {
  const { receiptId } = useParams();
  const { can } = usePermissions();
  const [tab, setTab] = React.useState<TabKey>("details");
  const [editing, setEditing] = React.useState(false);
  const [ask, setAsk] = React.useState<"" | "cancel" | "reverse">("");
  const [busy, setBusy] = React.useState(false);
  const q = useQuery(["receipt", receiptId], async () => {
    const r: any = await pocketbase.collection("cash_receipts").getOne(receiptId!, { expand: "account,income_account,funding_source,project,recorded_by,approval,reversed_by" });
    const entries: any[] = await pocketbase.collection("cash_book_entries").getFullList({ filter: `source_type = "cash_receipt" && source_id = "${r.id}"`, sort: "entry_date,created" }).catch(() => []);
    const groups = entries.map((e) => e.match_group).filter(Boolean);
    const lines: any[] = groups.length ? await pocketbase.collection("bank_statement_lines").getFullList({ filter: groups.map((g) => `match_group = "${g}"`).join(" || "), expand: "statement" }).catch(() => []) : [];
    return { r, entries, lines };
  });
  const trail = useApprovalTrail("cash_receipt", "cash_receipts", receiptId);
  const refresh = () => {
    q.refetch();
    trail.refresh();
  };

  async function submit() {
    setBusy(true);
    try {
      await treasuryApi.doc("receipts", receiptId!, "submit");
      toast.success(`${q.data?.r.number || "Receipt"} sent to the DAF for verification`);
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
          <EmptyState icon={PiggyBank} text="This receipt is not available. It may have been deleted, or your role cannot see it." action={<ButtonLink to={LIST}>Back to receipts</ButtonLink>} />
        </Card>
      </Page>
    );
  }
  const { r, entries, lines } = q.data;
  const a = r.expand?.account;
  const editable = ["draft", "returned"].includes(r.status);
  const open = ["draft", "pending_approval", "returned"].includes(r.status);
  const posted = entries.find((e) => !e.reversal_of);
  const reversal = entries.find((e) => e.reversal_of);
  const bankLine = posted?.match_group ? lines.find((l) => l.match_group === posted.match_group) : null;
  const canEdit = editable && can("manage_treasury");
  const status = TREASURY_DOC_STATUS[r.status];
  const returnNote = r.status === "returned" ? [...trail.actions].reverse().find((x: any) => x.action === "return")?.comment : null;

  const more: MenuItem[] = [
    { label: "Reverse receipt", icon: Undo2, danger: true, onSelect: () => setAsk("reverse"), hidden: !(r.status === "approved" && can("approve_treasury") && !bankLine) },
    { label: "Cancel receipt", icon: Ban, danger: true, onSelect: () => setAsk("cancel"), hidden: !(open && can(["manage_treasury", "approve_treasury"])) },
  ];

  return (
    <Page>
      <DetailHeader
        back={{ label: "Back to receipts", to: LIST }}
        number={r.number}
        type="Receipt"
        status={status?.label || r.status}
        statusNote={status?.note}
        title={`From ${r.payer_name}`}
        facts={[
          <strong key="amount" className="font-bold text-ims-text">{fmtMoney(r.amount)}</strong>,
          { label: "Received", value: fmtDate(r.receipt_date) },
          a ? { label: "Into", value: a.code } : null,
          `${METHOD_LABELS[r.method] || r.method}${r.reference ? ` · ${r.reference}` : ""}`,
        ]}
        actions={
          <>
            <MoreMenu items={more} />
            {canEdit && <Button icon={Pencil} onClick={() => setEditing(true)}>Edit</Button>}
            {canEdit && <Button variant="primary" icon={Send} loading={busy} onClick={submit}>Submit for approval</Button>}
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
      {r.cancel_reason && (
        <p className="rounded-card border border-ims-border bg-ims-card px-4 py-3 text-t-body text-ims-body">
          <span className="font-semibold text-ims-text">Cancelled.</span> {r.cancel_reason}
        </p>
      )}

      <Tabs
        label="Receipt sections"
        active={tab}
        onChange={(k) => setTab(k as TabKey)}
        tabs={[
          { key: "details", label: "Details" },
          { key: "documents", label: "Documents", count: (r.attachments || []).length },
          { key: "approvals", label: "Approvals" },
          { key: "activity", label: "Activity" },
        ]}
      />

      {tab === "details" && (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
          <Card className="xl:col-span-2">
            <CardHeader title="Receipt" />
            <Details
              items={[
                { label: "Received from", value: r.payer_name, hint: PAYER_TYPES[r.payer_type] },
                { label: "Amount", value: fmtMoney(r.amount) },
                { label: "Date received", value: fmtDate(r.receipt_date) },
                { label: "Into account", value: a ? <Link to={`/dashboard/treasury/accounts/${a.id}`} className="font-semibold text-ims-link hover:underline">{a.code} · {a.name}</Link> : null, hint: a?.bank_name },
                { label: "Method", value: METHOD_LABELS[r.method] || r.method },
                { label: "Reference", value: r.reference ? <span className="font-mono">{r.reference}</span> : null },
                { label: "What it is for", value: r.expand?.income_account ? `${r.expand.income_account.code} ${r.expand.income_account.name}` : null },
                { label: "Funding source", value: r.expand?.funding_source?.name || "Not specified" },
                { label: "Project", value: r.expand?.project ? `${r.expand.project.code} · ${r.expand.project.name}` : null },
                { label: "Recorded by", value: r.expand?.recorded_by?.name, hint: fmtDateTime(r.created) },
                ...(r.status === "reversed" ? [{ label: "Reversed", value: `${fmtDate(r.reversed_at)} by ${r.expand?.reversed_by?.name || "the DAF"}`, hint: r.reversal_reason }] : []),
                { label: "Description", value: r.description ? <span className="whitespace-pre-line">{r.description}</span> : null, wide: true },
              ]}
            />
          </Card>
          <Card>
            <CardHeader title="Cash book and bank" subtitle="Where the money stands in RALGA's books." />
            <ol className="space-y-4">
              <Milestone done={Boolean(posted)} title={posted ? `Posted to the cash book on ${fmtDate(posted.entry_date)}` : "Not yet in the cash book"} text={posted ? `${a?.code} cash book: +${fmtMoney(posted.amount)}` : "It is posted when the DAF verifies it."} />
              {a?.kind === "bank" && (
                <Milestone
                  done={Boolean(bankLine)}
                  title={bankLine ? `On the bank statement of ${fmtDate(bankLine.txn_date)}` : "Not yet on a bank statement"}
                  text={bankLine ? `${bankLine.expand?.statement?.number || "Statement"} · line ${bankLine.line_no}: ${bankLine.description}` : "It is matched automatically when the Accountant imports the statement that shows it."}
                />
              )}
              {reversal && <Milestone done title={`Reversed in the cash book on ${fmtDate(reversal.entry_date)}`} text={`−${fmtMoney(reversal.amount)} · ${r.reversal_reason}`} tone="danger" />}
            </ol>
          </Card>
        </div>
      )}

      {tab === "documents" && (
        <Card>
          <CardHeader title="Documents" subtitle="Bank advice, deposit slip, remittance letter or a copy of the receipt issued." />
          <DocumentUploads collection="cash_receipts" record={r} canAdd={can(["manage_treasury", "approve_treasury"])} canRemove={editable && can("manage_treasury")} onChange={refresh} hint="Bank advice, deposit slip, remittance letter or a copy of the receipt issued" />
        </Card>
      )}

      {tab === "approvals" && <ApprovalTracker approval={r.expand?.approval} actions={trail.actions} />}

      {tab === "activity" && <Activity actions={trail.actions} audit={trail.audit} loading={trail.loading} />}

      <ReceiptDialog open={editing} receipt={r} onClose={() => setEditing(false)} onSaved={() => { setEditing(false); refresh(); }} />
      <ReasonDialog
        open={ask === "cancel"}
        title={`Cancel ${r.number}?`}
        description="Nothing was posted yet; the receipt is kept as cancelled."
        confirmLabel="Cancel receipt"
        onClose={() => setAsk("")}
        onConfirm={async (reason) => {
          try {
            await treasuryApi.doc("receipts", r.id, "cancel", { reason });
            toast.success(`${r.number} cancelled`);
            setAsk("");
            refresh();
          } catch (e) {
            toast.error(errorMessage(e));
            throw e;
          }
        }}
      />
      <ReasonDialog
        open={ask === "reverse"}
        title={`Reverse ${r.number}?`}
        description={`An opposite entry of ${fmtMoney(r.amount)} is posted today in ${a?.code}. Use it when the money did not arrive (for example a cheque returned unpaid).`}
        confirmLabel="Reverse receipt"
        min={10}
        onClose={() => setAsk("")}
        onConfirm={async (reason) => {
          try {
            await treasuryApi.doc("receipts", r.id, "reverse", { reason });
            toast.success(`${r.number} reversed`);
            setAsk("");
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

/** One step of a document's way through the books: done (check) or still to come (dashed circle). */
export function Milestone({ done, title, text, tone }: { done: boolean; title: string; text: string; tone?: "danger" }) {
  return (
    <li className="flex items-start gap-3">
      {done ? (
        <BookCheck size={18} className={cn("mt-px shrink-0", tone === "danger" ? "text-ims-danger" : "text-ims-success")} aria-label="Done" />
      ) : (
        <CircleDashed size={18} className="mt-px shrink-0 text-ims-faint" aria-label="Not yet" />
      )}
      <div className="min-w-0">
        <p className="text-t-body font-semibold text-ims-text">{title}</p>
        <p className="text-t-small text-ims-muted">{text}</p>
      </div>
    </li>
  );
}
