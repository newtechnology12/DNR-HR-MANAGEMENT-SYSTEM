/**
 * Receipt document: who paid, how much, into which account and what for; the DAF's verification; where it
 * stands in the cash book and whether the bank statement shows it yet.
 */
import * as React from "react";
import { Link, useParams } from "react-router-dom";
import { useQuery } from "react-query";
import { toast } from "sonner";
import { BookCheck, CircleDashed, PiggyBank, Pencil, Send, Undo2, XCircle } from "lucide-react";
import pocketbase from "@/lib/pocketbase";
import { usePermissions } from "@/context/auth.context";
import { METHOD_LABELS, PAYER_TYPES, TREASURY_DOC_STATUS, treasuryApi } from "@/lib/treasury";
import { rwf, showDay } from "@/lib/ims";
import { errorMessage } from "@/lib/procurement";
import { Button } from "@/components/ui/button";
import { EmptyState, ListSkeleton, StatusBadge } from "@/components/enterprise/ui";
import { Chatter, ControlBar, DocumentPage, FieldGrid, Notebook, Sheet, SheetTitle, toChatter } from "@/components/enterprise/DocumentLayout";
import { ApprovalTracker } from "@/components/enterprise/Approval";
import { DecisionButtons, useApprovalTrail } from "@/components/enterprise/useApprovalTrail";
import DocumentUploads from "@/components/enterprise/Attachments";
import { ReasonDialog } from "@/components/treasury/TreasuryKit";
import ReceiptDialog from "./ReceiptDialog";

const STEPS = [{ key: "draft", label: "Recorded" }, { key: "pending_approval", label: "DAF verification" }, { key: "approved", label: "Posted" }];
const RIBBON: Record<string, { label: string; tone: "success" | "danger" | "warning" | "neutral" }> = {
  approved: { label: "Posted", tone: "success" }, reversed: { label: "Reversed", tone: "danger" }, rejected: { label: "Rejected", tone: "danger" }, cancelled: { label: "Cancelled", tone: "neutral" },
};

export default function ReceiptDetail() {
  const { receiptId } = useParams();
  const { can } = usePermissions();
  const [tab, setTab] = React.useState("cashbook");
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
      toast.success("Sent to the DAF for verification");
      refresh();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  if (q.isLoading) return <div className="p-6"><ListSkeleton rows={6} /></div>;
  if (!q.data) return <div className="p-6"><EmptyState icon={PiggyBank} title="Receipt not found" text="It may have been deleted, or it is outside what your role can see." /></div>;
  const { r, entries, lines } = q.data;
  const a = r.expand?.account;
  const editable = ["draft", "returned"].includes(r.status);
  const open = ["draft", "pending_approval", "returned"].includes(r.status);
  const posted = entries.find((e) => !e.reversal_of);
  const reversal = entries.find((e) => e.reversal_of);
  const bankLine = posted?.match_group ? lines.find((l) => l.match_group === posted.match_group) : null;

  return (
    <DocumentPage chatter={<Chatter items={toChatter(trail.actions, trail.audit)} />}>
      <ControlBar
        breadcrumbs={[{ title: "Bank & cash", link: "/dashboard/treasury" }, { title: "Receipts", link: "/dashboard/treasury/receipts" }, { title: r.number }]}
        steps={STEPS}
        current={r.status === "returned" ? "draft" : ["approved", "reversed"].includes(r.status) ? "approved" : r.status}
        actions={
          <>
            {editable && can("manage_treasury") && <Button size="sm" onClick={submit} disabled={busy}><Send size={14} /> Send to the DAF</Button>}
            {editable && can("manage_treasury") && <Button size="sm" variant="outline" onClick={() => setEditing(true)}><Pencil size={14} /> Edit</Button>}
            <DecisionButtons approval={r.expand?.approval} number={r.number} onDone={refresh} />
            {r.status === "approved" && can("approve_treasury") && !bankLine && <Button size="sm" variant="ghost" className="text-red-700" onClick={() => setAsk("reverse")}><Undo2 size={14} /> Reverse</Button>}
            {open && can(["manage_treasury", "approve_treasury"]) && <Button size="sm" variant="ghost" className="text-red-700" onClick={() => setAsk("cancel")}><XCircle size={14} /> Cancel</Button>}
          </>
        }
      />
      <Sheet ribbon={RIBBON[r.status]}>
        <SheetTitle kicker="Receipt" title={r.number} badges={<StatusBadge status={r.status} map={TREASURY_DOC_STATUS} />} />
        <div className="mb-6 flex flex-wrap items-end justify-between gap-3 rounded-lg border border-slate-100 bg-slate-50/70 px-4 py-3">
          <div>
            <p className="text-[12px] text-slate-500">Amount received</p>
            <p className="text-[26px] font-semibold tabular-nums tracking-tight text-slate-900">{rwf(r.amount)}</p>
          </div>
          <p className="text-[12.5px] text-slate-600">{METHOD_LABELS[r.method] || r.method}{r.reference ? <> · <span className="font-mono">{r.reference}</span></> : ""}</p>
        </div>
        <FieldGrid
          left={[
            { label: "Received from", value: r.payer_name, hint: PAYER_TYPES[r.payer_type] },
            { label: "Date received", value: showDay(r.receipt_date) },
            { label: "Into account", value: a ? <Link to={`/dashboard/treasury/accounts/${a.id}`} className="text-primaryDark hover:underline">{a.code} · {a.name}</Link> : "—", hint: a?.bank_name },
            { label: "Description", value: r.description },
          ]}
          right={[
            { label: "What it is for", value: r.expand?.income_account ? `${r.expand.income_account.code} ${r.expand.income_account.name}` : "—" },
            { label: "Funding source", value: r.expand?.funding_source?.name || "Not specified" },
            { label: "Project", value: r.expand?.project ? `${r.expand.project.code} · ${r.expand.project.name}` : "" },
            { label: "Recorded by", value: r.expand?.recorded_by?.name, hint: showDay(r.created) },
            { label: "Reversed", value: r.status === "reversed" ? `${showDay(r.reversed_at)} by ${r.expand?.reversed_by?.name || "the DAF"}` : "", hint: r.reversal_reason },
            { label: "Cancelled because", value: r.cancel_reason },
          ]}
        />
        <Notebook tabs={[{ key: "cashbook", label: "Cash book & bank" }, { key: "documents", label: "Documents", count: (r.attachments || []).length }, { key: "approval", label: "Verification" }]} active={tab} onChange={setTab} />
        <div className="pt-4">
          {tab === "cashbook" && (
            <ol className="space-y-3">
              <Milestone done={Boolean(posted)} title={posted ? `Posted to the cash book on ${showDay(posted.entry_date)}` : "Not yet in the cash book"} text={posted ? `${a?.code} cash book: +${rwf(posted.amount)}` : "It is posted when the DAF verifies it."} />
              {a?.kind === "bank" && (
                <Milestone
                  done={Boolean(bankLine)}
                  title={bankLine ? `On the bank statement of ${showDay(bankLine.txn_date)}` : "Not yet on a bank statement"}
                  text={bankLine ? `${bankLine.expand?.statement?.number || "Statement"} · line ${bankLine.line_no}: ${bankLine.description}` : "It is matched automatically when the Accountant imports the statement that shows it."}
                />
              )}
              {reversal && <Milestone done title={`Reversed in the cash book on ${showDay(reversal.entry_date)}`} text={`−${rwf(reversal.amount)} · ${r.reversal_reason}`} tone="danger" />}
            </ol>
          )}
          {tab === "documents" && <DocumentUploads collection="cash_receipts" record={r} canAdd={can(["manage_treasury", "approve_treasury"])} canRemove={editable && can("manage_treasury")} onChange={refresh} hint="Bank advice, deposit slip, remittance letter or a copy of the receipt issued" />}
          {tab === "approval" && <ApprovalTracker approval={r.expand?.approval} actions={trail.actions} />}
        </div>
      </Sheet>
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
          }
        }}
      />
      <ReasonDialog
        open={ask === "reverse"}
        title={`Reverse ${r.number}?`}
        description={`An opposite entry of ${rwf(r.amount)} is posted today in ${a?.code}. Use it when the money did not arrive (e.g. a cheque returned unpaid).`}
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
          }
        }}
      />
    </DocumentPage>
  );
}

export function Milestone({ done, title, text, tone }: { done: boolean; title: string; text: string; tone?: "danger" }) {
  return (
    <li className="flex items-start gap-3">
      {done ? <BookCheck size={18} className={tone === "danger" ? "mt-0.5 text-red-600" : "mt-0.5 text-emerald-600"} aria-hidden /> : <CircleDashed size={18} className="mt-0.5 text-slate-300" aria-hidden />}
      <div>
        <p className="text-[13.5px] font-medium text-slate-900">{title}</p>
        <p className="text-[12.5px] text-slate-500">{text}</p>
      </div>
    </li>
  );
}
