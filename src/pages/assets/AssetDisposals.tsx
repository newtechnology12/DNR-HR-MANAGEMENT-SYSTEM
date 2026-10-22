/**
 * Fixed assets → Disposals: sales, auctions, donations, scrapping and write-offs. Prepared by the Store & Asset
 * Officer, reviewed by the DAF, approved by the SG; posted to the GL with the gain or loss when approved.
 */
import { useNavigate, useSearchParams } from "react-router-dom";
import { ExternalLink, Trash2 } from "lucide-react";
import { usePermissions } from "@/context/auth.context";
import { DISPOSAL_METHODS, DOC_STATUS } from "@/lib/assets";
import { StatusBadge } from "@/components/enterprise/ui";
import RecordTable, { RecordColumn, RecordView } from "@/components/enterprise/RecordTable";
import { WithPeople } from "@/components/enterprise/WithCell";
import { DocNo, Num, Page, PageHeader, Person, fmtDate, fmtNumber, statusText } from "@/components/ims";
import { cn } from "@/utils";

/** Gain positive, loss in brackets and red: "(250,000)". */
function GainLoss({ value, strong }: { value?: number | null; strong?: boolean }) {
  const n = Number(value) || 0;
  return <span className={cn("tabular-nums", strong && "font-semibold", n < 0 ? "text-ims-danger" : n > 0 ? "text-ims-success" : "text-ims-muted")}>{n < 0 ? `(${fmtNumber(-n)})` : fmtNumber(n)}</span>;
}

export default function AssetDisposals() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const { can } = usePermissions();
  const view = params.get("view") || (can("approve_asset_disposals") && !can("manage_fixed_assets") ? "pending" : "all");
  const views: RecordView[] = [
    { key: "all", label: "All disposals" },
    { key: "draft", label: "Being prepared", filter: 'status = "draft" || status = "returned"' },
    { key: "pending", label: "Pending approval", filter: 'status = "pending_approval"' },
    { key: "approved", label: "Disposed", filter: 'status = "approved"' },
    { key: "closed", label: "Rejected or cancelled", filter: 'status = "rejected" || status = "cancelled"' },
  ];
  const open = (r: any) => navigate(`/dashboard/assets/disposals/${r.id}`);

  /** Who must act now: the approvers while it is in approval, the Store & Asset Officer while it is prepared. */
  const withCell = (r: any) => {
    if (r.status === "pending_approval") return <WithPeople ids={r.expand?.approval?.pending_approvers} />;
    if (r.status === "draft" || r.status === "returned") return <Person name={r.expand?.prepared_by?.name} detail="To complete and submit" />;
    return <span className="text-ims-faint">—</span>;
  };

  const columns: RecordColumn<any>[] = [
    { key: "number", header: "Disposal", sortField: "number", nowrap: true, cell: (r) => <DocNo value={r.number} />, sub: (r) => fmtDate(r.disposal_date) },
    { key: "date", header: "Date", sortField: "disposal_date", exportOnly: true, format: "date", csv: (r) => (r.disposal_date ? r.disposal_date.slice(0, 10) : ""), cell: (r) => fmtDate(r.disposal_date) },
    {
      key: "asset",
      header: "Asset",
      clamp: true,
      csv: (r) => `${r.expand?.asset?.code} ${r.expand?.asset?.name}`,
      cell: (r) => <span className="font-semibold">{r.expand?.asset?.name}</span>,
      sub: (r) => <span className="whitespace-nowrap font-mono">{r.expand?.asset?.code}</span>,
    },
    {
      key: "method",
      header: "Method",
      sortField: "method",
      className: "max-w-[170px]",
      csv: (r) => DISPOSAL_METHODS[r.method] || r.method,
      cell: (r) => DISPOSAL_METHODS[r.method] || r.method,
      sub: (r) => (r.buyer ? <span className="block truncate">{r.buyer}</span> : null),
    },
    { key: "nbv", header: "Book value (RWF)", sortField: "net_book_value", align: "right", sum: "net_book_value", format: "money", csv: (r) => r.net_book_value, cell: (r) => <Num value={r.net_book_value} /> },
    { key: "proceeds", header: "Proceeds (RWF)", sortField: "proceeds", exportOnly: true, format: "money", csv: (r) => r.proceeds, cell: (r) => (r.proceeds ? <Num value={r.proceeds} /> : <span className="text-ims-faint">—</span>) },
    { key: "gain", header: "Gain/(loss) (RWF)", sortField: "gain_loss", align: "right", sum: "gain_loss", format: "money", csv: (r) => r.gain_loss, cell: (r) => <GainLoss value={r.gain_loss} strong />, sub: (r) => (r.proceeds ? `Proceeds ${fmtNumber(r.proceeds)}` : null) },
    { key: "status", header: "Status", sortField: "status", csv: (r) => statusText(DOC_STATUS[r.status], r.status), cell: (r) => <StatusBadge status={r.status} map={DOC_STATUS} /> },
    { key: "with", header: "With", className: "max-w-[170px]", cell: withCell },
  ];

  return (
    <Page>
      <PageHeader
        breadcrumbs={[{ label: "Fixed assets", to: "/dashboard/assets" }, { label: "Disposals" }]}
        title="Asset disposals"
        subtitle="Assets leaving the register: sold, auctioned, donated, scrapped or written off."
      />
      <RecordTable<any>
        collection="asset_disposals"
        expand="asset,prepared_by,approval"
        views={views}
        activeView={view}
        onViewChange={(v) => setParams(v === "all" ? {} : { view: v })}
        searchFields={["number", "reason", "buyer", "asset.code", "asset.name"]}
        searchPlaceholder="Search number, asset, buyer or reason"
        filters={[{ field: "method", label: "Method", options: Object.entries(DISPOSAL_METHODS).map(([value, label]) => ({ value, label })) }]}
        dateField="disposal_date"
        dateLabel="Date"
        defaultSort="-created"
        exportName="asset-disposals"
        exportTitle="Asset disposals"
        exportPermission={["export_assets", "view_fixed_assets", "approve_asset_disposals"]}
        onRowClick={open}
        rowActions={() => [{ label: "Open", icon: ExternalLink, onSelect: open }]}
        empty={{ icon: Trash2, title: "No disposals", text: view === "pending" ? "No disposal is pending approval." : "No disposals yet. A disposal is prepared from the asset's page." }}
        columns={columns}
      />
    </Page>
  );
}
