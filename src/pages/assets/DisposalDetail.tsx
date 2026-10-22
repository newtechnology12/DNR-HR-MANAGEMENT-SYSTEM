/**
 * One asset disposal: the asset, the method and the figures (net book value, proceeds, gain or loss), the approval
 * (DAF then SG), the documents (committee minutes, valuation, receipt) and the GL posting.
 */
import * as React from "react";
import { Link, useParams } from "react-router-dom";
import { useQuery } from "react-query";
import { toast } from "sonner";
import { Ban, Clock, Pencil, Send, Trash2 } from "lucide-react";
import pocketbase from "@/lib/pocketbase";
import { usePermissions } from "@/context/auth.context";
import { DISPOSAL_METHODS, DOC_STATUS, assetsApi } from "@/lib/assets";
import { errorMessage } from "@/lib/procurement";
import { Skeleton } from "@/components/ui/skeleton";
import { Activity, ApprovalTracker } from "@/components/enterprise/Approval";
import { DecisionButtons, useApprovalTrail } from "@/components/enterprise/useApprovalTrail";
import DocumentUploads from "@/components/enterprise/Attachments";
import { Button, ButtonLink, Card, CardHeader, ConfirmDialog, DetailHeader, Details, EmptyState, KpiBand, MenuItem, MoreMenu, Page, Tabs, fmtDate, fmtDateTime, fmtMoney, statusText } from "@/components/ims";
import { DisposalDialog } from "@/components/assets/AssetDialogs";

const LIST = "/dashboard/assets/disposals";

export default function DisposalDetail() {
  const { disposalId } = useParams();
  const { can } = usePermissions();
  const [tab, setTab] = React.useState("details");
  const [editing, setEditing] = React.useState(false);
  const [cancelling, setCancelling] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const q = useQuery(["asset-disposal", disposalId], () => pocketbase.collection("asset_disposals").getOne(disposalId!, { expand: "asset,asset.category,asset.department,prepared_by,approval,journal" }));
  const trail = useApprovalTrail("asset_disposal", "asset_disposals", disposalId);
  const refresh = () => {
    q.refetch();
    trail.refresh();
  };
  if (q.isLoading) {
    return (
      <Page>
        <Skeleton className="h-5 w-48" />
        <Skeleton className="h-16 w-full max-w-2xl" />
        <Skeleton className="h-24 w-full rounded-card" />
        <Skeleton className="h-64 w-full rounded-card" />
      </Page>
    );
  }
  if (!q.data) {
    return (
      <Page>
        <Card>
          <EmptyState icon={Trash2} text="This disposal is not available. It may not exist, or it is outside what your role can see." action={<ButtonLink to={LIST}>Back to disposals</ButtonLink>} />
        </Card>
      </Page>
    );
  }
  const d: any = q.data;
  const x = d.expand || {};
  const a = x.asset || {};
  const approval = x.approval;
  const editable = ["draft", "returned"].includes(d.status) && can("manage_fixed_assets");
  const open = ["draft", "returned", "pending_approval"].includes(d.status) && can("manage_fixed_assets");
  const stepName = approval?.status === "pending" ? approval.steps?.[approval.current_level]?.name : null;
  const submit = async () => {
    setBusy(true);
    try {
      await assetsApi.disposal(d.id, "submit");
      toast.success(`${d.number} sent to the Director of Finance for approval`);
      refresh();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  const more: MenuItem[] = [{ label: "Cancel disposal", icon: Ban, danger: true, onSelect: () => setCancelling(true), hidden: !open }];
  const journal = x.journal ? (
    can(["view_journals", "export_ledger", "approve_journals"]) ? (
      <Link className="whitespace-nowrap font-mono font-semibold text-ims-link hover:underline" to={`/dashboard/finance/journals/${d.journal}`}>{x.journal.number}</Link>
    ) : (
      <span className="whitespace-nowrap font-mono">{x.journal.number}</span>
    )
  ) : d.status === "approved" ? "Not capitalised, nothing to post" : "Posted when approved";

  return (
    <Page>
      <DetailHeader
        back={{ label: "Back to disposals", to: LIST }}
        number={d.number}
        type={`Asset disposal · ${DISPOSAL_METHODS[d.method] || d.method}`}
        status={DOC_STATUS[d.status]?.label || d.status}
        statusNote={stepName ? `At “${stepName}”` : DOC_STATUS[d.status]?.note}
        title={a.name || d.number}
        facts={[
          a.code ? <Link key="asset" to={`/dashboard/assets/register/${d.asset}`} className="whitespace-nowrap font-mono text-t-small font-semibold text-ims-link hover:underline">{a.code}</Link> : null,
          a.expand?.department?.name,
          d.disposal_date ? { label: "Date", value: fmtDate(d.disposal_date) } : null,
          x.prepared_by?.name ? { label: "Prepared by", value: x.prepared_by.name } : null,
        ]}
        actions={
          <>
            <MoreMenu items={more} />
            {editable && <Button icon={Pencil} onClick={() => setEditing(true)}>Edit</Button>}
            {editable && <Button variant="primary" icon={Send} onClick={submit} loading={busy}>Submit for approval</Button>}
            <DecisionButtons approval={approval} number={d.number} onDone={refresh} />
          </>
        }
      />

      {stepName && (
        <p role="status" className="flex items-start gap-2 rounded-card border border-ims-warning/30 bg-ims-warning-bg px-4 py-3 text-t-body text-ims-warning">
          <Clock size={16} className="mt-0.5 shrink-0" aria-hidden />
          <span>Pending approval at step “{stepName}”. The asset leaves the register and the general ledger when the disposal is approved.</span>
        </p>
      )}
      {d.cancel_reason && (
        <p className="rounded-card border border-ims-border bg-ims-card px-4 py-3 text-t-body text-ims-body">
          <span className="font-semibold text-ims-text">Cancelled.</span> {d.cancel_reason}
        </p>
      )}

      <KpiBand
        items={[
          { label: "Cost", value: fmtMoney(d.cost) },
          { label: "Accumulated depreciation", value: fmtMoney(d.accumulated) },
          { label: "Net book value", value: fmtMoney(d.net_book_value) },
          { label: "Proceeds", value: fmtMoney(d.proceeds), sub: d.buyer || undefined },
          { label: d.gain_loss < 0 ? "Loss on disposal" : "Gain on disposal", value: fmtMoney(Math.abs(d.gain_loss || 0)), tone: d.gain_loss < 0 ? "danger" : d.gain_loss > 0 ? "success" : "default" },
        ]}
      />

      <Tabs
        label="Disposal sections"
        active={tab}
        onChange={setTab}
        tabs={[
          { key: "details", label: "Details" },
          { key: "approvals", label: "Approvals" },
          { key: "documents", label: "Documents", count: (d.attachments || []).length },
          { key: "activity", label: "Activity" },
        ]}
      />

      {tab === "details" && (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
          <Card className="xl:col-span-2">
            <CardHeader title="Disposal" />
            <Details
              items={[
                { label: "Method", value: DISPOSAL_METHODS[d.method] },
                { label: "Date", value: d.disposal_date ? fmtDate(d.disposal_date) : null },
                { label: "Buyer", value: d.buyer },
                { label: "Prepared by", value: x.prepared_by?.name, hint: fmtDateTime(d.created) },
                { label: "Approval", value: approval ? approval.workflow_name : "Not submitted yet", hint: approval ? statusText(DOC_STATUS[d.status], d.status) : undefined },
                { label: "General ledger", value: journal, hint: d.status !== "approved" && !x.journal ? "The gain or loss is posted with the disposal" : undefined },
                { label: "Why", value: d.reason ? <span className="whitespace-pre-line">{d.reason}</span> : null, wide: true },
                ...(d.cancel_reason ? [{ label: "Cancelled because", value: d.cancel_reason, wide: true }] : []),
              ]}
            />
            <p className="mt-5 border-t border-ims-divider pt-4 text-t-small text-ims-muted">
              Figures use the depreciation posted so far. They are recalculated when the disposal is submitted and when it is finally approved. Proceeds are recorded as receivable until the Cashier records the receipt.
            </p>
          </Card>
          <Card>
            <CardHeader title="Asset" link={{ label: "Open the asset", to: `/dashboard/assets/register/${d.asset}` }} />
            <Details
              columns={1}
              items={[
                { label: "Asset", value: a.name, hint: a.code ? <span className="whitespace-nowrap font-mono">{a.code}</span> : undefined },
                { label: "Category", value: a.expand?.category?.name },
                { label: "Department", value: a.expand?.department?.name },
                { label: "Acquired", value: a.purchased_at ? fmtDate(a.purchased_at) : null },
              ]}
            />
          </Card>
        </div>
      )}

      {tab === "approvals" && <ApprovalTracker approval={approval} actions={trail.actions} />}

      {tab === "documents" && (
        <Card>
          <CardHeader title="Documents" subtitle="Disposal committee minutes, valuation, auction report, buyer's receipt, police report for a loss." />
          <DocumentUploads collection="asset_disposals" record={d} canAdd={can(["manage_fixed_assets", "approve_asset_disposals"])} canRemove={editable} onChange={refresh} hint="PDF, images, Word or Excel, up to 20 MB each" />
        </Card>
      )}

      {tab === "activity" && <Activity actions={trail.actions} audit={trail.audit} loading={trail.loading} />}

      {editing && <DisposalDialog asset={a} disposal={d} onClose={() => setEditing(false)} onSaved={() => { setEditing(false); refresh(); }} />}
      <ConfirmDialog
        open={cancelling}
        onClose={() => setCancelling(false)}
        title={`Cancel ${d.number}?`}
        description="The asset stays in the register."
        confirmLabel="Cancel disposal"
        danger
        reason={{ label: "Reason", min: 5, placeholder: "Why the disposal is stopped" }}
        onConfirm={async (reason) => {
          try {
            await assetsApi.disposal(d.id, "cancel", { reason });
            toast.success(`${d.number} cancelled`);
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
