/**
 * Fixed assets → Disposals: sales, auctions, donations, scrapping and write-offs. Prepared by the Store & Asset
 * Officer, reviewed by the DAF, approved by the SG; posted to the GL with the gain or loss when approved.
 */
import { useNavigate, useSearchParams } from "react-router-dom";
import { Trash2 } from "lucide-react";
import { usePermissions } from "@/context/auth.context";
import { DISPOSAL_METHODS, DOC_STATUS, money } from "@/lib/assets";
import { showDay } from "@/lib/ims";
import { PageHeader, StatusBadge } from "@/components/enterprise/ui";
import RecordTable, { RecordView } from "@/components/enterprise/RecordTable";
import { cn } from "@/utils";

export default function AssetDisposals() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const { can } = usePermissions();
  const view = params.get("view") || (can("approve_asset_disposals") && !can("manage_fixed_assets") ? "pending" : "all");
  const views: RecordView[] = [
    { key: "all", label: "All" },
    { key: "draft", label: "Being prepared", filter: 'status = "draft" || status = "returned"' },
    { key: "pending", label: "Waiting for approval", filter: 'status = "pending_approval"' },
    { key: "approved", label: "Disposed", filter: 'status = "approved"' },
    { key: "closed", label: "Rejected or cancelled", filter: 'status = "rejected" || status = "cancelled"' },
  ];
  return (
    <div className="space-y-4 px-3 sm:px-4">
      <PageHeader
        title="Asset disposals"
        description="Assets leaving the register: sold, auctioned, donated, scrapped or written off. Prepared by the Store & Asset Officer with the committee's minutes; reviewed by the DAF; approved by the Secretary General."
        breadcrumbs={[{ title: "Fixed assets", link: "/dashboard/assets" }, { title: "Disposals", link: "/dashboard/assets/disposals" }]}
      />
      <RecordTable<any>
        collection="asset_disposals"
        expand="asset,prepared_by"
        views={views}
        activeView={view}
        onViewChange={(v) => setParams(v === "all" ? {} : { view: v })}
        searchFields={["number", "reason", "buyer", "asset.code", "asset.name"]}
        filters={[{ field: "method", label: "Method", options: Object.entries(DISPOSAL_METHODS).map(([value, label]) => ({ value, label })) }]}
        dateField="disposal_date"
        dateLabel="Date"
        defaultSort="-created"
        exportName="asset-disposals"
        exportTitle="Asset disposals"
        exportPermission={["export_assets", "view_fixed_assets", "approve_asset_disposals"]}
        onRowClick={(r) => navigate(`/dashboard/assets/disposals/${r.id}`)}
        empty={{ icon: Trash2, title: "No disposals", text: "A disposal is prepared from the asset's page." }}
        columns={[
          { key: "number", header: "Disposal", sortField: "number", cell: (r) => <span className="whitespace-nowrap font-mono text-[12.5px] font-semibold text-slate-800">{r.number}</span> },
          { key: "date", header: "Date", sortField: "disposal_date", format: "date", csv: (r) => showDay(r.disposal_date), cell: (r) => <span className="whitespace-nowrap text-[12.5px] text-slate-600">{showDay(r.disposal_date)}</span> },
          { key: "asset", header: "Asset", csv: (r) => `${r.expand?.asset?.code} ${r.expand?.asset?.name}`, cell: (r) => <span className="block min-w-[220px]"><span className="block font-mono text-[12px] text-slate-500">{r.expand?.asset?.code}</span><span className="block font-medium text-slate-900">{r.expand?.asset?.name}</span></span> },
          { key: "method", header: "Method", sortField: "method", csv: (r) => DISPOSAL_METHODS[r.method] || r.method, cell: (r) => <span className="block text-[12.5px]"><span className="block text-slate-800">{DISPOSAL_METHODS[r.method]}</span>{r.buyer && <span className="block max-w-[200px] truncate text-[12px] text-slate-500">{r.buyer}</span>}</span> },
          { key: "nbv", header: "Net book value", sortField: "net_book_value", align: "right", format: "money", csv: (r) => r.net_book_value, cell: (r) => <span className="tabular-nums">{money(r.net_book_value)}</span> },
          { key: "proceeds", header: "Proceeds", sortField: "proceeds", align: "right", format: "money", csv: (r) => r.proceeds, cell: (r) => <span className="tabular-nums">{r.proceeds ? money(r.proceeds) : "—"}</span> },
          { key: "gain", header: "Gain / (loss)", sortField: "gain_loss", align: "right", format: "money", csv: (r) => r.gain_loss, cell: (r) => <span className={cn("font-semibold tabular-nums", r.gain_loss < 0 ? "text-red-700" : r.gain_loss > 0 ? "text-emerald-700" : "text-slate-500")}>{r.gain_loss < 0 ? `(${money(-r.gain_loss)})` : money(r.gain_loss)}</span> },
          { key: "status", header: "Status", sortField: "status", csv: (r) => DOC_STATUS[r.status]?.label || r.status, cell: (r) => <StatusBadge status={r.status} map={DOC_STATUS} /> },
        ]}
      />
    </div>
  );
}
