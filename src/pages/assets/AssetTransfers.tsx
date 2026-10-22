/**
 * Fixed assets → Transfers between departments. The Store & Asset Officer or the head of the department holding
 * the asset asks; the Director of Finance approves; the asset moves when it is approved.
 */
import * as React from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useQuery } from "react-query";
import { toast } from "sonner";
import { ArrowRight, ArrowRightLeft, ExternalLink, XCircle } from "lucide-react";
import pocketbase from "@/lib/pocketbase";
import { useAuth, usePermissions } from "@/context/auth.context";
import { DOC_STATUS, assetsApi } from "@/lib/assets";
import { errorMessage } from "@/lib/procurement";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/enterprise/ui";
import RecordTable, { RecordColumn, RecordView } from "@/components/enterprise/RecordTable";
import { ApprovalTracker } from "@/components/enterprise/Approval";
import { DecisionButtons, useApprovalTrail } from "@/components/enterprise/useApprovalTrail";
import { WithPeople } from "@/components/enterprise/WithCell";
import { Button, ConfirmDialog, Details, DocNo, Modal, Page, PageHeader, Person, StatusPill, fmtDate, statusText } from "@/components/ims";

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
    { key: "all", label: "All transfers" },
    { key: "pending", label: "Pending approval", filter: 'status = "pending_approval"' },
    { key: "approved", label: "Approved", filter: 'status = "approved"' },
    { key: "closed", label: "Returned, rejected or cancelled", filter: 'status = "rejected" || status = "cancelled" || status = "returned"' },
  ];

  /** Who must act now: the approvers while it is in approval, the requester when it is back with them. */
  const withCell = (r: any) => {
    if (r.status === "pending_approval") return <WithPeople ids={r.expand?.approval?.pending_approvers} fallback={<Person name="Director of Finance" detail="To approve" />} />;
    if (r.status === "returned" || r.status === "draft") return <Person name={r.expand?.requested_by?.name} detail="Requester" />;
    return <span className="text-ims-faint">—</span>;
  };

  const columns: RecordColumn<any>[] = [
    { key: "number", header: "Transfer", sortField: "number", nowrap: true, cell: (r) => <DocNo value={r.number} />, sub: (r) => fmtDate(r.created) },
    { key: "date", header: "Requested", sortField: "created", exportOnly: true, format: "date", csv: (r) => (r.created ? r.created.slice(0, 10) : ""), cell: (r) => fmtDate(r.created) },
    {
      key: "asset",
      header: "Asset",
      clamp: true,
      csv: (r) => `${r.expand?.asset?.code} ${r.expand?.asset?.name}`,
      cell: (r) => <span className="font-semibold">{r.expand?.asset?.name}</span>,
      sub: (r) => <span className="whitespace-nowrap font-mono">{r.expand?.asset?.code}</span>,
    },
    {
      key: "route",
      header: "Moving to",
      className: "max-w-[220px]",
      csv: (r) => `${r.expand?.from_department?.name || ""} → ${r.expand?.to_department?.name || ""}`,
      cell: (r) => <span className="font-semibold text-ims-text">{r.expand?.to_department?.name}</span>,
      sub: (r) => `From ${r.expand?.from_department?.name || "—"}`,
    },
    { key: "by", header: "Requested by", className: "max-w-[180px]", csv: (r) => r.expand?.requested_by?.name || "", cell: (r) => <Person name={r.expand?.requested_by?.name} /> },
    { key: "status", header: "Status", sortField: "status", csv: (r) => statusText(DOC_STATUS[r.status], r.status), cell: (r) => <StatusBadge status={r.status} map={DOC_STATUS} /> },
    { key: "with", header: "With", className: "max-w-[180px]", cell: withCell },
  ];

  return (
    <Page>
      <PageHeader
        breadcrumbs={[{ label: "Fixed assets", to: "/dashboard/assets" }, { label: "Transfers" }]}
        title="Asset transfers"
        subtitle="Assets moving to another department, approved by the Director of Finance."
      />
      <RecordTable<any>
        collection="asset_movements"
        baseFilter='kind = "transfer"'
        expand="asset,from_department,to_department,to_custodian,requested_by,approval"
        views={views}
        activeView={view}
        onViewChange={(v) => setParams(v === "all" ? {} : { view: v })}
        searchFields={["number", "reason", "asset.code", "asset.name"]}
        searchPlaceholder="Search number, asset or reason"
        filters={[{ field: "to_department", label: "To", collection: "departments" }, { field: "from_department", label: "From", collection: "departments" }]}
        dateField="created"
        dateLabel="Requested"
        defaultSort="-created"
        refreshKey={refresh}
        exportName="asset-transfers"
        exportTitle="Asset transfers"
        exportPermission={["export_assets", "view_fixed_assets"]}
        onRowClick={(r) => setOpen(r.id)}
        rowActions={() => [{ label: "Open", icon: ExternalLink, onSelect: (r: any) => setOpen(r.id) }]}
        empty={{ icon: ArrowRightLeft, title: "No transfers", text: view === "pending" ? "No transfer is pending approval." : "No transfers yet. A transfer is requested from the asset's page." }}
        columns={columns}
      />
      {open && <TransferPanel id={open} onClose={() => setOpen("")} onChanged={() => setRefresh((n) => n + 1)} />}
    </Page>
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
    <Modal
      open
      onClose={onClose}
      size="lg"
      title={
        <span className="flex flex-wrap items-center gap-2">
          <span className="whitespace-nowrap">{m?.number || "Transfer"}</span>
          {m && <StatusPill status={DOC_STATUS[m.status]?.label || m.status} />}
        </span>
      }
      description={m ? `Requested by ${x.requested_by?.name || "—"} on ${fmtDate(m.created)}` : q.isError ? errorMessage(q.error) : "Loading the transfer"}
      footer={
        <>
          {canCancel && <Button variant="ghost" icon={XCircle} className="text-ims-danger hover:text-ims-danger sm:mr-auto" onClick={() => setCancelling(true)}>Cancel transfer</Button>}
          <Button variant="secondary" onClick={onClose}>Close</Button>
          {m && <DecisionButtons approval={x.approval} number={m.number} onDone={refresh} />}
        </>
      }
    >
      {q.isLoading && (
        <div className="space-y-3">
          <Skeleton className="h-14 w-full" />
          <Skeleton className="h-20 w-full" />
        </div>
      )}
      {m && (
        <>
          <Link to={`/dashboard/assets/register/${m.asset}`} className="block rounded-card border border-ims-border px-4 py-3 hover:bg-ims-hover">
            <span className="block text-t-body font-semibold text-ims-text">{x.asset?.name}</span>
            <span className="block whitespace-nowrap font-mono text-t-small text-ims-muted">{x.asset?.code}</span>
          </Link>
          <div className="grid items-center gap-3 rounded-card bg-ims-thead px-4 py-3 sm:grid-cols-[1fr_auto_1fr]">
            <div className="min-w-0">
              <p className="text-t-small text-ims-muted">From</p>
              <p className="text-t-body font-semibold text-ims-text">{x.from_department?.name || "—"}</p>
              <p className="text-t-small text-ims-muted">{[x.from_custodian?.name, m.from_location].filter(Boolean).join(" · ") || "—"}</p>
            </div>
            <ArrowRight className="hidden text-ims-faint sm:block" size={18} aria-hidden />
            <div className="min-w-0">
              <p className="text-t-small text-ims-muted">To</p>
              <p className="text-t-body font-semibold text-ims-text">{x.to_department?.name}</p>
              <p className="text-t-small text-ims-muted">{[x.to_custodian?.name, m.to_location].filter(Boolean).join(" · ") || "Custodian to be named"}</p>
            </div>
          </div>
          <Details
            items={[
              { label: "Why", value: m.reason ? <span className="whitespace-pre-line">{m.reason}</span> : null, wide: true },
              { label: "Moves from", value: m.effective_date ? fmtDate(m.effective_date) : null },
              ...(m.cancel_reason ? [{ label: "Cancelled because", value: m.cancel_reason }] : []),
            ]}
          />
          <ApprovalTracker approval={x.approval} actions={trail.actions} />
          <ConfirmDialog
            open={cancelling}
            onClose={() => setCancelling(false)}
            title={`Cancel ${m.number}?`}
            description="The asset stays where it is."
            confirmLabel="Cancel transfer"
            danger
            reason={{ label: "Reason", min: 5, placeholder: "Why the transfer is no longer needed" }}
            onConfirm={async (reason) => {
              try {
                await assetsApi.cancelTransfer(m.id, reason);
                toast.success(`${m.number} cancelled`);
                refresh();
              } catch (e) {
                toast.error(errorMessage(e));
                throw e;
              }
            }}
          />
        </>
      )}
    </Modal>
  );
}
