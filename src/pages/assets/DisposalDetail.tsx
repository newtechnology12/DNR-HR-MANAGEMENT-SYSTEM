/**
 * One asset disposal: the asset, the method and the figures (net book value, proceeds, gain or loss), the approval
 * (DAF then SG), the documents (committee minutes, valuation, receipt) and the GL posting.
 */
import * as React from "react";
import { Link, useParams } from "react-router-dom";
import { useQuery } from "react-query";
import { toast } from "sonner";
import { Pencil, Send, Trash2, XCircle } from "lucide-react";
import pocketbase from "@/lib/pocketbase";
import { usePermissions } from "@/context/auth.context";
import { DISPOSAL_METHODS, DOC_STATUS, assetsApi, money } from "@/lib/assets";
import { showDay } from "@/lib/ims";
import { errorMessage } from "@/lib/procurement";
import { Button } from "@/components/ui/button";
import { EmptyState, ListSkeleton, StatusBadge } from "@/components/enterprise/ui";
import { Chatter, ControlBar, DocumentPage, FieldGrid, Notebook, Sheet, SheetTitle, toChatter } from "@/components/enterprise/DocumentLayout";
import { ApprovalTracker } from "@/components/enterprise/Approval";
import { DecisionButtons, useApprovalTrail } from "@/components/enterprise/useApprovalTrail";
import DocumentUploads from "@/components/enterprise/Attachments";
import { ReasonDialog } from "@/components/treasury/TreasuryKit";
import { DisposalDialog } from "@/components/assets/AssetDialogs";
import { cn } from "@/utils";

const STEPS = [{ key: "draft", label: "Prepared" }, { key: "pending_approval", label: "Approval" }, { key: "approved", label: "Disposed" }];
const RIBBON: Record<string, { label: string; tone: "success" | "danger" | "warning" | "neutral" }> = {
  approved: { label: "Disposed", tone: "success" }, rejected: { label: "Rejected", tone: "danger" }, cancelled: { label: "Cancelled", tone: "neutral" },
};

export default function DisposalDetail() {
  const { disposalId } = useParams();
  const { can } = usePermissions();
  const [tab, setTab] = React.useState("figures");
  const [editing, setEditing] = React.useState(false);
  const [cancelling, setCancelling] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const q = useQuery(["asset-disposal", disposalId], () => pocketbase.collection("asset_disposals").getOne(disposalId!, { expand: "asset,asset.category,asset.department,prepared_by,approval,journal" }));
  const trail = useApprovalTrail("asset_disposal", "asset_disposals", disposalId);
  const refresh = () => {
    q.refetch();
    trail.refresh();
  };
  if (q.isLoading) return <div className="p-6"><ListSkeleton rows={6} /></div>;
  if (!q.data) return <div className="p-6"><EmptyState icon={Trash2} title="Disposal not found" text="It may not exist, or it is outside what your role can see." /></div>;
  const d: any = q.data;
  const x = d.expand || {};
  const a = x.asset || {};
  const editable = ["draft", "returned"].includes(d.status) && can("manage_fixed_assets");
  const open = ["draft", "returned", "pending_approval"].includes(d.status) && can("manage_fixed_assets");
  const submit = async () => {
    setBusy(true);
    try {
      await assetsApi.disposal(d.id, "submit");
      toast.success("Sent to the Director of Finance");
      refresh();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <DocumentPage chatter={<Chatter items={toChatter(trail.actions, trail.audit)} />}>
      <ControlBar
        breadcrumbs={[{ title: "Fixed assets", link: "/dashboard/assets" }, { title: "Disposals", link: "/dashboard/assets/disposals" }, { title: d.number }]}
        steps={STEPS}
        current={d.status === "returned" ? "draft" : ["rejected", "cancelled"].includes(d.status) ? "draft" : d.status}
        actions={
          <>
            {editable && <Button size="sm" onClick={submit} disabled={busy}><Send size={14} /> Send for approval</Button>}
            {editable && <Button size="sm" variant="outline" onClick={() => setEditing(true)}><Pencil size={14} /> Edit</Button>}
            <DecisionButtons approval={x.approval} number={d.number} onDone={refresh} />
            {open && <Button size="sm" variant="ghost" className="text-red-700" onClick={() => setCancelling(true)}><XCircle size={14} /> Cancel</Button>}
          </>
        }
      />
      <Sheet ribbon={RIBBON[d.status]}>
        <SheetTitle kicker={`Disposal — ${DISPOSAL_METHODS[d.method] || d.method}`} title={d.number} badges={<StatusBadge status={d.status} map={DOC_STATUS} />} />
        <Link to={`/dashboard/assets/register/${d.asset}`} className="mb-5 block rounded-lg border border-slate-100 bg-slate-50/70 px-4 py-3 hover:bg-slate-100/70">
          <span className="block font-mono text-[12px] text-slate-500">{a.code}</span>
          <span className="block text-[15px] font-semibold text-slate-900">{a.name}</span>
          <span className="block text-[12.5px] text-slate-500">{a.expand?.category?.name} · {a.expand?.department?.name} · acquired {showDay(a.purchased_at)}</span>
        </Link>
        <FieldGrid
          left={[
            { label: "Method", value: DISPOSAL_METHODS[d.method] },
            { label: "Date", value: showDay(d.disposal_date) },
            { label: "Buyer", value: d.buyer },
            { label: "Why", value: d.reason },
          ]}
          right={[
            { label: "Prepared by", value: x.prepared_by?.name, hint: showDay(d.created) },
            { label: "Approval", value: x.approval ? `${x.approval.workflow_name} — ${x.approval.status}` : "Not sent yet" },
            { label: "General ledger", value: x.journal ? (can(["view_journals", "export_ledger", "approve_journals"]) ? <Link className="font-mono text-primaryDark hover:underline" to={`/dashboard/finance/journals/${d.journal}`}>{x.journal.number}</Link> : x.journal.number) : d.status === "approved" ? "Not capitalised — nothing to post" : "Posted when approved" },
            { label: "Cancelled because", value: d.cancel_reason },
          ]}
        />
        <Notebook tabs={[{ key: "figures", label: "Figures" }, { key: "documents", label: "Documents", count: (d.attachments || []).length }, { key: "approval", label: "Approval" }]} active={tab} onChange={setTab} />
        <div className="pt-4">
          {tab === "figures" && (
            <div className="max-w-xl rounded-md border border-slate-200">
              {[
                ["Cost", d.cost],
                ["Accumulated depreciation", -d.accumulated],
                ["Net book value", d.net_book_value, true],
                ["Proceeds", d.proceeds],
              ].map(([label, value, bold]) => (
                <div key={String(label)} className={cn("flex justify-between border-b border-slate-100 px-3 py-2 text-[13px]", bold && "font-semibold")}>
                  <span>{label}</span><span className="tabular-nums">{Number(value) < 0 ? `(${money(-Number(value))})` : money(Number(value))}</span>
                </div>
              ))}
              <div className={cn("flex justify-between px-3 py-2.5 text-[14px] font-semibold", d.gain_loss < 0 ? "bg-red-50 text-red-800" : "bg-emerald-50 text-emerald-800")}>
                <span>{d.gain_loss < 0 ? "Loss on disposal" : "Gain on disposal"}</span><span className="tabular-nums">RWF {money(Math.abs(d.gain_loss))}</span>
              </div>
              <p className="px-3 py-2 text-[12px] text-slate-500">Figures use the depreciation posted so far; they are recalculated when the disposal is sent and when it is finally approved. Proceeds are recorded as receivable until the Cashier records the receipt.</p>
            </div>
          )}
          {tab === "documents" && <DocumentUploads collection="asset_disposals" record={d} canAdd={can(["manage_fixed_assets", "approve_asset_disposals"])} canRemove={editable} onChange={refresh} hint="Disposal committee minutes, valuation, auction report, buyer's receipt, police report for a loss" />}
          {tab === "approval" && <ApprovalTracker approval={x.approval} actions={trail.actions} />}
        </div>
      </Sheet>
      {editing && <DisposalDialog asset={a} disposal={d} onClose={() => setEditing(false)} onSaved={() => { setEditing(false); refresh(); }} />}
      <ReasonDialog
        open={cancelling}
        title={`Cancel ${d.number}?`}
        description="The asset stays in the register."
        confirmLabel="Cancel disposal"
        min={5}
        onClose={() => setCancelling(false)}
        onConfirm={async (reason) => {
          try {
            await assetsApi.disposal(d.id, "cancel", { reason });
            toast.success(`${d.number} cancelled`);
            setCancelling(false);
            refresh();
          } catch (e) {
            toast.error(errorMessage(e));
          }
        }}
      />
    </DocumentPage>
  );
}
