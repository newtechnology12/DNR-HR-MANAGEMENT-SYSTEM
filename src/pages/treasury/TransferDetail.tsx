/**
 * Transfer document: from and to, amount, method, approval, and the two cash book entries it posted.
 */
import * as React from "react";
import { Link, useParams } from "react-router-dom";
import { useQuery } from "react-query";
import { toast } from "sonner";
import { ArrowRight, ArrowRightLeft, Ban, CornerUpLeft, Pencil, Send, Undo2 } from "lucide-react";
import pocketbase from "@/lib/pocketbase";
import { usePermissions } from "@/context/auth.context";
import { METHOD_LABELS, TREASURY_DOC_STATUS, treasuryApi } from "@/lib/treasury";
import { errorMessage } from "@/lib/procurement";
import { Skeleton } from "@/components/ui/skeleton";
import { Activity, ApprovalTracker } from "@/components/enterprise/Approval";
import { DecisionButtons, useApprovalTrail } from "@/components/enterprise/useApprovalTrail";
import DocumentUploads from "@/components/enterprise/Attachments";
import { Button, ButtonLink, Card, CardHeader, DetailHeader, Details, EmptyState, MenuItem, MoreMenu, Page, Tabs, fmtDate, fmtDateTime, fmtMoney } from "@/components/ims";
import { KindIcon, ReasonDialog } from "@/components/treasury/TreasuryKit";
import TransferDialog from "./TransferDialog";
import { Milestone } from "./ReceiptDetail";

type TabKey = "details" | "documents" | "approvals" | "activity";
const LIST = "/dashboard/treasury/transfers";

export default function TransferDetail() {
  const { transferId } = useParams();
  const { can } = usePermissions();
  const [tab, setTab] = React.useState<TabKey>("details");
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
      toast.success(`${q.data?.t.number || "Transfer"} sent for approval`);
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
          <EmptyState icon={ArrowRightLeft} text="This transfer is not available. It may have been deleted, or your role cannot see it." action={<ButtonLink to={LIST}>Back to transfers</ButtonLink>} />
        </Card>
      </Page>
    );
  }
  const { t, entries } = q.data;
  const from = t.expand?.from_account;
  const to = t.expand?.to_account;
  const editable = ["draft", "returned"].includes(t.status);
  const open = ["draft", "pending_approval", "returned"].includes(t.status);
  const matched = entries.some((e) => !e.reversal_of && e.match_group);
  const canEdit = editable && can("manage_treasury");
  const status = TREASURY_DOC_STATUS[t.status];
  const returnNote = t.status === "returned" ? [...trail.actions].reverse().find((x: any) => x.action === "return")?.comment : null;

  const more: MenuItem[] = [
    { label: "Reverse transfer", icon: Undo2, danger: true, onSelect: () => setAsk("reverse"), hidden: !(t.status === "approved" && can("approve_treasury") && !matched) },
    { label: "Cancel transfer", icon: Ban, danger: true, onSelect: () => setAsk("cancel"), hidden: !(open && can(["manage_treasury", "approve_treasury"])) },
  ];

  return (
    <Page>
      <DetailHeader
        back={{ label: "Back to transfers", to: LIST }}
        number={t.number}
        type="Transfer between accounts"
        status={status?.label || t.status}
        statusNote={status?.note}
        title={
          <span className="inline-flex flex-wrap items-center gap-x-2">
            {from?.code || "—"} <ArrowRight size={22} className="text-ims-faint" aria-label="to" /> {to?.code || "—"}
          </span>
        }
        facts={[
          <strong key="amount" className="font-bold text-ims-text">{fmtMoney(t.amount)}</strong>,
          fmtDate(t.transfer_date),
          `${METHOD_LABELS[t.method] || t.method}${t.reference ? ` · ${t.reference}` : ""}`,
          { label: "Prepared by", value: t.expand?.prepared_by?.name || "—" },
        ]}
        actions={
          <>
            <MoreMenu items={more} />
            {canEdit && <Button icon={Pencil} onClick={() => setEditing(true)}>Edit</Button>}
            {canEdit && <Button variant="primary" icon={Send} loading={busy} onClick={submit}>Submit for approval</Button>}
            <DecisionButtons approval={t.expand?.approval} number={t.number} onDone={refresh} />
          </>
        }
      />

      {t.status === "returned" && (
        <p role="status" className="flex items-start gap-2 rounded-card border border-ims-orange/30 bg-ims-orange-bg px-4 py-3 text-t-body text-ims-orange">
          <CornerUpLeft size={16} className="mt-0.5 shrink-0" aria-hidden />
          <span>Returned for changes{returnNote ? `: “${returnNote}”` : ""}. Correct it and submit it again.</span>
        </p>
      )}
      {t.cancel_reason && (
        <p className="rounded-card border border-ims-border bg-ims-card px-4 py-3 text-t-body text-ims-body">
          <span className="font-semibold text-ims-text">Cancelled.</span> {t.cancel_reason}
        </p>
      )}

      <Tabs
        label="Transfer sections"
        active={tab}
        onChange={(k) => setTab(k as TabKey)}
        tabs={[
          { key: "details", label: "Details" },
          { key: "documents", label: "Documents", count: (t.attachments || []).length },
          { key: "approvals", label: "Approvals" },
          { key: "activity", label: "Activity" },
        ]}
      />

      {tab === "details" && (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
          <Card className="xl:col-span-2">
            <CardHeader title="Transfer" />
            <div className="mb-5 grid gap-3 sm:grid-cols-2">
              {[from, to].map((a, i) => (
                <Link key={i} to={a ? `/dashboard/treasury/accounts/${a.id}` : LIST} className="flex min-w-0 items-center gap-3 rounded-control border border-ims-border px-3.5 py-3 hover:bg-ims-hover">
                  <KindIcon kind={a?.kind} />
                  <span className="min-w-0">
                    <span className="block text-t-small text-ims-muted">{i === 0 ? "From" : "To"}</span>
                    <span className="block truncate text-t-body font-semibold text-ims-text">{a?.code} · {a?.name}</span>
                  </span>
                </Link>
              ))}
            </div>
            <Details
              items={[
                { label: "Amount", value: fmtMoney(t.amount) },
                { label: "Date", value: fmtDate(t.transfer_date) },
                { label: "Method", value: METHOD_LABELS[t.method] || t.method },
                { label: "Reference", value: t.reference ? <span className="font-mono">{t.reference}</span> : null },
                { label: "Prepared by", value: t.expand?.prepared_by?.name, hint: fmtDateTime(t.created) },
                ...(t.status === "reversed" ? [{ label: "Reversed", value: `${fmtDate(t.reversed_at)} by ${t.expand?.reversed_by?.name || "the DAF"}`, hint: t.reversal_reason }] : []),
                { label: "Why", value: t.description ? <span className="whitespace-pre-line">{t.description}</span> : null, wide: true },
              ]}
            />
          </Card>
          <Card>
            <CardHeader title="Cash book" subtitle="The entries posted out of one account and into the other." />
            <ol className="space-y-4">
              {entries.length ? (
                entries.map((e) => (
                  <Milestone
                    key={e.id}
                    done
                    tone={e.reversal_of ? "danger" : undefined}
                    title={`${e.direction === "in" ? "+" : "−"}${fmtMoney(e.amount)} in ${e.expand?.account?.code} on ${fmtDate(e.entry_date)}${e.reversal_of ? " (reversal)" : ""}`}
                    text={e.match_group ? "Matched to the bank statement" : e.expand?.account?.kind === "cash" ? "Petty cash book" : "Not yet on a bank statement"}
                  />
                ))
              ) : (
                <Milestone done={false} title="Not posted yet" text="The transfer is posted out of one account and into the other once it is approved." />
              )}
            </ol>
          </Card>
        </div>
      )}

      {tab === "documents" && (
        <Card>
          <CardHeader title="Documents" subtitle="Signed transfer instruction, cheque stub or bank advice." />
          <DocumentUploads collection="bank_transfers" record={t} canAdd={can(["manage_treasury", "approve_treasury"])} canRemove={editable && can("manage_treasury")} onChange={refresh} hint="Signed transfer instruction, cheque stub or bank advice" />
        </Card>
      )}

      {tab === "approvals" && <ApprovalTracker approval={t.expand?.approval} actions={trail.actions} />}

      {tab === "activity" && <Activity actions={trail.actions} audit={trail.audit} loading={trail.loading} />}

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
            throw e;
          }
        }}
      />
      <ReasonDialog
        open={ask === "reverse"}
        title={`Reverse ${t.number}?`}
        description={`The money goes back: ${fmtMoney(t.amount)} out of ${to?.code} and into ${from?.code}, dated today.`}
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
            throw e;
          }
        }}
      />
    </Page>
  );
}
