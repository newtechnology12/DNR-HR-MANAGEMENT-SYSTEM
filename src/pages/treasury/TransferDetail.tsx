/**
 * Transfer document: from and to, amount, method, approval, and the two cash book entries it posted.
 */
import * as React from "react";
import { Link, useParams } from "react-router-dom";
import { useQuery } from "react-query";
import { toast } from "sonner";
import { ArrowRight, ArrowRightLeft, Pencil, Send, Undo2, XCircle } from "lucide-react";
import pocketbase from "@/lib/pocketbase";
import { usePermissions } from "@/context/auth.context";
import { METHOD_LABELS, TREASURY_DOC_STATUS, treasuryApi } from "@/lib/treasury";
import { rwf, showDay } from "@/lib/ims";
import { errorMessage } from "@/lib/procurement";
import { Button } from "@/components/ui/button";
import { EmptyState, ListSkeleton, StatusBadge } from "@/components/enterprise/ui";
import { Chatter, ControlBar, DocumentPage, FieldGrid, Notebook, Sheet, SheetTitle, toChatter } from "@/components/enterprise/DocumentLayout";
import { ApprovalTracker } from "@/components/enterprise/Approval";
import { DecisionButtons, useApprovalTrail } from "@/components/enterprise/useApprovalTrail";
import DocumentUploads from "@/components/enterprise/Attachments";
import { KindIcon, ReasonDialog } from "@/components/treasury/TreasuryKit";
import TransferDialog from "./TransferDialog";
import { Milestone } from "./ReceiptDetail";

const STEPS = [{ key: "draft", label: "Prepared" }, { key: "pending_approval", label: "Approval" }, { key: "approved", label: "Posted" }];
const RIBBON: Record<string, { label: string; tone: "success" | "danger" | "warning" | "neutral" }> = {
  approved: { label: "Posted", tone: "success" }, reversed: { label: "Reversed", tone: "danger" }, rejected: { label: "Rejected", tone: "danger" }, cancelled: { label: "Cancelled", tone: "neutral" },
};

export default function TransferDetail() {
  const { transferId } = useParams();
  const { can } = usePermissions();
  const [tab, setTab] = React.useState("cashbook");
  const [editing, setEditing] = React.useState(false);
  const [ask, setAsk] = React.useState<"" | "cancel" | "reverse">("");
  const [busy, setBusy] = React.useState(false);
  const q = useQuery(["transfer", transferId], async () => {
    const t: any = await pocketbase.collection("bank_transfers").getOne(transferId!, { expand: "from_account,to_account,prepared_by,approval,reversed_by" });
    const entries: any[] = await pocketbase.collection("cash_book_entries").getFullList({ filter: `source_type = "bank_transfer" && source_id = "${t.id}"`, sort: "entry_date,created", expand: "account" }).catch(() => []);
    return { t, entries };
  });
  const trail = useApprovalTrail("bank_transfer", "bank_transfers", transferId);
  const refresh = () => {
    q.refetch();
    trail.refresh();
  };

  async function submit() {
    setBusy(true);
    try {
      await treasuryApi.doc("transfers", transferId!, "submit");
      toast.success("Sent for approval");
      refresh();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  if (q.isLoading) return <div className="p-6"><ListSkeleton rows={6} /></div>;
  if (!q.data) return <div className="p-6"><EmptyState icon={ArrowRightLeft} title="Transfer not found" text="It may have been deleted, or it is outside what your role can see." /></div>;
  const { t, entries } = q.data;
  const from = t.expand?.from_account;
  const to = t.expand?.to_account;
  const editable = ["draft", "returned"].includes(t.status);
  const open = ["draft", "pending_approval", "returned"].includes(t.status);
  const matched = entries.some((e) => !e.reversal_of && e.match_group);

  return (
    <DocumentPage chatter={<Chatter items={toChatter(trail.actions, trail.audit)} />}>
      <ControlBar
        breadcrumbs={[{ title: "Bank & cash", link: "/dashboard/treasury" }, { title: "Transfers", link: "/dashboard/treasury/transfers" }, { title: t.number }]}
        steps={STEPS}
        current={t.status === "returned" ? "draft" : ["approved", "reversed"].includes(t.status) ? "approved" : t.status}
        actions={
          <>
            {editable && can("manage_treasury") && <Button size="sm" onClick={submit} disabled={busy}><Send size={14} /> Send for approval</Button>}
            {editable && can("manage_treasury") && <Button size="sm" variant="outline" onClick={() => setEditing(true)}><Pencil size={14} /> Edit</Button>}
            <DecisionButtons approval={t.expand?.approval} number={t.number} onDone={refresh} />
            {t.status === "approved" && can("approve_treasury") && !matched && <Button size="sm" variant="ghost" className="text-red-700" onClick={() => setAsk("reverse")}><Undo2 size={14} /> Reverse</Button>}
            {open && can(["manage_treasury", "approve_treasury"]) && <Button size="sm" variant="ghost" className="text-red-700" onClick={() => setAsk("cancel")}><XCircle size={14} /> Cancel</Button>}
          </>
        }
      />
      <Sheet ribbon={RIBBON[t.status]}>
        <SheetTitle kicker="Transfer between accounts" title={t.number} badges={<StatusBadge status={t.status} map={TREASURY_DOC_STATUS} />} />
        <div className="mb-6 grid items-center gap-3 rounded-lg border border-slate-100 bg-slate-50/70 px-4 py-3 sm:grid-cols-[1fr_auto_1fr_auto]">
          {[from, to].map((a, i) => (
            <React.Fragment key={i}>
              {i === 1 && <ArrowRight className="hidden text-slate-400 sm:block" size={18} aria-hidden />}
              <Link to={a ? `/dashboard/treasury/accounts/${a.id}` : "#"} className="flex min-w-0 items-center gap-2.5 rounded-md hover:bg-white">
                <KindIcon kind={a?.kind} />
                <span className="min-w-0">
                  <span className="block text-[11.5px] text-slate-500">{i === 0 ? "From" : "To"}</span>
                  <span className="block truncate text-[13.5px] font-semibold text-slate-900">{a?.code} · {a?.name}</span>
                </span>
              </Link>
            </React.Fragment>
          ))}
          <p className="text-right text-[24px] font-semibold tabular-nums tracking-tight text-slate-900">{rwf(t.amount)}</p>
        </div>
        <FieldGrid
          left={[
            { label: "Date", value: showDay(t.transfer_date) },
            { label: "Method", value: `${METHOD_LABELS[t.method] || t.method}${t.reference ? ` · ${t.reference}` : ""}` },
            { label: "Why", value: t.description },
          ]}
          right={[
            { label: "Prepared by", value: t.expand?.prepared_by?.name, hint: showDay(t.created) },
            { label: "Reversed", value: t.status === "reversed" ? `${showDay(t.reversed_at)} by ${t.expand?.reversed_by?.name || "the DAF"}` : "", hint: t.reversal_reason },
            { label: "Cancelled because", value: t.cancel_reason },
          ]}
        />
        <Notebook tabs={[{ key: "cashbook", label: "Cash book" }, { key: "documents", label: "Documents", count: (t.attachments || []).length }, { key: "approval", label: "Approval" }]} active={tab} onChange={setTab} />
        <div className="pt-4">
          {tab === "cashbook" && (
            entries.length ? (
              <ol className="space-y-3">
                {entries.map((e) => (
                  <Milestone
                    key={e.id}
                    done
                    tone={e.reversal_of ? "danger" : undefined}
                    title={`${e.direction === "in" ? "+" : "−"}${rwf(e.amount)} in ${e.expand?.account?.code} on ${showDay(e.entry_date)}${e.reversal_of ? " (reversal)" : ""}`}
                    text={e.match_group ? "Matched to the bank statement" : e.expand?.account?.kind === "cash" ? "Petty cash book" : "Not yet on a bank statement"}
                  />
                ))}
              </ol>
            ) : <Milestone done={false} title="Not posted yet" text="The transfer is posted out of one account and into the other once it is approved." />
          )}
          {tab === "documents" && <DocumentUploads collection="bank_transfers" record={t} canAdd={can(["manage_treasury", "approve_treasury"])} canRemove={editable && can("manage_treasury")} onChange={refresh} hint="Signed transfer instruction, cheque stub or bank advice" />}
          {tab === "approval" && <ApprovalTracker approval={t.expand?.approval} actions={trail.actions} />}
        </div>
      </Sheet>
      <TransferDialog open={editing} transfer={t} onClose={() => setEditing(false)} onSaved={() => { setEditing(false); refresh(); }} />
      <ReasonDialog
        open={ask === "cancel"}
        title={`Cancel ${t.number}?`}
        description="Nothing was posted yet; the transfer is kept as cancelled."
        confirmLabel="Cancel transfer"
        onClose={() => setAsk("")}
        onConfirm={async (reason) => {
          try {
            await treasuryApi.doc("transfers", t.id, "cancel", { reason });
            toast.success(`${t.number} cancelled`);
            setAsk("");
            refresh();
          } catch (e) {
            toast.error(errorMessage(e));
          }
        }}
      />
      <ReasonDialog
        open={ask === "reverse"}
        title={`Reverse ${t.number}?`}
        description={`The money goes back: ${rwf(t.amount)} out of ${to?.code} and into ${from?.code}, dated today.`}
        confirmLabel="Reverse transfer"
        min={10}
        onClose={() => setAsk("")}
        onConfirm={async (reason) => {
          try {
            await treasuryApi.doc("transfers", t.id, "reverse", { reason });
            toast.success(`${t.number} reversed`);
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
