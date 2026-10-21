/**
 * Fixed assets → Transfers between departments. The Store & Asset Officer or the head of the department holding
 * the asset asks; the Director of Finance approves; the asset moves when it is approved.
 */
import * as React from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useQuery } from "react-query";
import { toast } from "sonner";
import { ArrowRight, ArrowRightLeft, XCircle } from "lucide-react";
import pocketbase from "@/lib/pocketbase";
import { useAuth, usePermissions } from "@/context/auth.context";
import { DOC_STATUS, assetsApi } from "@/lib/assets";
import { showDay } from "@/lib/ims";
import { errorMessage } from "@/lib/procurement";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PageHeader, StatusBadge } from "@/components/enterprise/ui";
import RecordTable, { RecordView } from "@/components/enterprise/RecordTable";
import { ApprovalTracker } from "@/components/enterprise/Approval";
import { DecisionButtons, useApprovalTrail } from "@/components/enterprise/useApprovalTrail";
import { ReasonDialog } from "@/components/treasury/TreasuryKit";

export default function AssetTransfers() {
  const [params, setParams] = useSearchParams();
  const { can } = usePermissions();
  const [refresh, setRefresh] = React.useState(0);
  const view = params.get("view") || (can("approve_asset_disposals") ? "pending" : "all");
  const open = params.get("open") || "";
  const setOpen = (id: string) => {
    const next = new URLSearchParams(params);
    if (id) next.set("open", id);
    else next.delete("open");
    setParams(next, { replace: true });
  };
  const views: RecordView[] = [
    { key: "all", label: "All" },
    { key: "pending", label: "Waiting for approval", filter: 'status = "pending_approval"' },
    { key: "approved", label: "Approved", filter: 'status = "approved"' },
    { key: "closed", label: "Rejected or cancelled", filter: 'status = "rejected" || status = "cancelled" || status = "returned"' },
  ];
  return (
    <div className="space-y-4 px-3 sm:px-4">
      <PageHeader
        title="Asset transfers"
        description="Assets moving to another department. Requested by the Store & Asset Officer or the department head; approved by the Director of Finance. Depreciation follows the asset to its new department."
        breadcrumbs={[{ title: "Fixed assets", link: "/dashboard/assets" }, { title: "Transfers", link: "/dashboard/assets/transfers" }]}
      />
      <RecordTable<any>
        collection="asset_movements"
        baseFilter='kind = "transfer"'
        expand="asset,from_department,to_department,to_custodian,requested_by"
        views={views}
        activeView={view}
        onViewChange={(v) => setParams(v === "all" ? {} : { view: v })}
        searchFields={["number", "reason", "asset.code", "asset.name"]}
        filters={[{ field: "to_department", label: "To", collection: "departments" }, { field: "from_department", label: "From", collection: "departments" }]}
        defaultSort="-created"
        refreshKey={refresh}
        exportName="asset-transfers"
        exportTitle="Asset transfers"
        exportPermission={["export_assets", "view_fixed_assets"]}
        onRowClick={(r) => setOpen(r.id)}
        empty={{ icon: ArrowRightLeft, title: "No transfers", text: "Transfers are requested from an asset's page." }}
        columns={[
          { key: "number", header: "Transfer", sortField: "number", cell: (r) => <span className="whitespace-nowrap font-mono text-[12.5px] font-semibold text-slate-800">{r.number}</span> },
          { key: "date", header: "Requested", sortField: "created", format: "date", csv: (r) => showDay(r.created), cell: (r) => <span className="whitespace-nowrap text-[12.5px] text-slate-600">{showDay(r.created)}</span> },
          { key: "asset", header: "Asset", csv: (r) => `${r.expand?.asset?.code} ${r.expand?.asset?.name}`, cell: (r) => <span className="block min-w-[220px]"><span className="block font-mono text-[12px] text-slate-500">{r.expand?.asset?.code}</span><span className="block font-medium text-slate-900">{r.expand?.asset?.name}</span></span> },
          { key: "route", header: "From → to", csv: (r) => `${r.expand?.from_department?.name || ""} → ${r.expand?.to_department?.name || ""}`, cell: (r) => <span className="flex min-w-[220px] flex-wrap items-center gap-1.5 text-[12.5px]">{r.expand?.from_department?.name || "—"} <ArrowRight size={13} className="text-slate-400" /> <b className="font-medium text-slate-900">{r.expand?.to_department?.name}</b></span> },
          { key: "by", header: "Requested by", csv: (r) => r.expand?.requested_by?.name || "", cell: (r) => <span className="whitespace-nowrap text-[12.5px] text-slate-600">{r.expand?.requested_by?.name}</span> },
          { key: "status", header: "Status", sortField: "status", csv: (r) => DOC_STATUS[r.status]?.label || r.status, cell: (r) => <StatusBadge status={r.status} map={DOC_STATUS} /> },
        ]}
      />
      {open && <TransferPanel id={open} onClose={() => setOpen("")} onChanged={() => setRefresh((n) => n + 1)} />}
    </div>
  );
}

function TransferPanel({ id, onClose, onChanged }: { id: string; onClose: () => void; onChanged: () => void }) {
  const { user }: any = useAuth();
  const { can } = usePermissions();
  const [cancelling, setCancelling] = React.useState(false);
  const q = useQuery(["asset-transfer", id], () => pocketbase.collection("asset_movements").getOne(id, { expand: "asset,from_department,to_department,from_custodian,to_custodian,requested_by,approval" }));
  const trail = useApprovalTrail("asset_transfer", "asset_movements", id);
  const m: any = q.data;
  const refresh = () => {
    q.refetch();
    trail.refresh();
    onChanged();
  };
  const x = m?.expand || {};
  const canCancel = m && ["pending_approval", "returned", "draft"].includes(m.status) && (m.requested_by === user?.id || can("manage_fixed_assets"));
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[92vh] max-w-2xl overflow-y-auto bg-white">
        <DialogHeader>
          <DialogTitle className="flex flex-wrap items-center gap-2"><span className="font-mono">{m?.number || "Transfer"}</span>{m && <StatusBadge status={m.status} map={DOC_STATUS} />}</DialogTitle>
          <DialogDescription>{m ? <>Requested by {x.requested_by?.name} on {showDay(m.created)}</> : q.isError ? errorMessage(q.error) : "Loading…"}</DialogDescription>
        </DialogHeader>
        {m && (
          <div className="space-y-4 text-[13px]">
            <Link to={`/dashboard/assets/register/${m.asset}`} className="block rounded-md border border-slate-200 px-3 py-2 hover:bg-slate-50">
              <span className="block font-mono text-[12px] text-slate-500">{x.asset?.code}</span>
              <span className="block font-medium text-slate-900">{x.asset?.name}</span>
            </Link>
            <div className="grid items-center gap-3 rounded-lg border border-slate-100 bg-slate-50/70 px-4 py-3 sm:grid-cols-[1fr_auto_1fr]">
              <div><p className="text-[11.5px] text-slate-500">From</p><p className="font-semibold">{x.from_department?.name || "—"}</p><p className="text-[12px] text-slate-500">{[x.from_custodian?.name, m.from_location].filter(Boolean).join(" · ") || "—"}</p></div>
              <ArrowRight className="hidden text-slate-400 sm:block" size={18} aria-hidden />
              <div><p className="text-[11.5px] text-slate-500">To</p><p className="font-semibold">{x.to_department?.name}</p><p className="text-[12px] text-slate-500">{[x.to_custodian?.name, m.to_location].filter(Boolean).join(" · ") || "custodian to be named"}</p></div>
            </div>
            <div><p className="text-[11.5px] text-slate-500">Why</p><p className="text-slate-800">{m.reason}</p><p className="mt-1 text-[12px] text-slate-500">From {showDay(m.effective_date)}{m.cancel_reason ? ` · cancelled: ${m.cancel_reason}` : ""}</p></div>
            <ApprovalTracker approval={x.approval} actions={trail.actions} />
          </div>
        )}
        <DialogFooter className="gap-2">
          {canCancel && <Button variant="ghost" className="mr-auto text-red-700" onClick={() => setCancelling(true)}><XCircle size={14} /> Cancel transfer</Button>}
          {m && <DecisionButtons approval={x.approval} number={m.number} onDone={refresh} />}
          <Button variant="outline" onClick={onClose}>Close</Button>
        </DialogFooter>
        {m && (
          <ReasonDialog
            open={cancelling}
            title={`Cancel ${m.number}?`}
            description="The asset stays where it is."
            confirmLabel="Cancel transfer"
            min={5}
            onClose={() => setCancelling(false)}
            onConfirm={async (reason) => {
              try {
                await assetsApi.cancelTransfer(m.id, reason);
                toast.success(`${m.number} cancelled`);
                setCancelling(false);
                refresh();
              } catch (e) {
                toast.error(errorMessage(e));
              }
            }}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
