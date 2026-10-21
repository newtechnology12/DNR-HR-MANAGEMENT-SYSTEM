/**
 * Fixed assets → Asset register: every asset with its tag, category, department and location, custodian, cost and
 * net book value. Assets received on a GRN wait here for their card (capitalisation).
 */
import * as React from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Boxes, Plus } from "lucide-react";
import { usePermissions } from "@/context/auth.context";
import { ASSET_STATUS, CONDITIONS, money } from "@/lib/assets";
import { showDay } from "@/lib/ims";
import { Button } from "@/components/ui/button";
import { PageHeader, StatusBadge } from "@/components/enterprise/ui";
import RecordTable, { RecordView } from "@/components/enterprise/RecordTable";
import { AssetCardDialog } from "@/components/assets/AssetDialogs";

export default function AssetRegister() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const { can } = usePermissions();
  const [registering, setRegistering] = React.useState(false);
  const view = params.get("view") || "all";
  const category = params.get("category") || "";
  const views: RecordView[] = [
    { key: "all", label: "In the register", filter: 'status != "disposed"' },
    { key: "to_capitalise", label: "To capitalise", filter: 'capitalised = false && status != "disposed"' },
    { key: "in_use", label: "In use", filter: 'status = "in_use"' },
    { key: "in_store", label: "In store", filter: 'status = "in_stock"' },
    { key: "attention", label: "Maintenance, damaged, lost", filter: 'status = "under_maintenance" || status = "damaged" || status = "lost"' },
    { key: "disposed", label: "Disposed", filter: 'status = "disposed"' },
  ];
  return (
    <div className="space-y-4 px-3 sm:px-4">
      <PageHeader
        title="Asset register"
        description="Every fixed asset with its tag, location and custodian, what it cost and what it is still worth. Assets received on a delivery note wait under “To capitalise” for their card."
        breadcrumbs={[{ title: "Fixed assets", link: "/dashboard/assets" }, { title: "Asset register", link: "/dashboard/assets/register" }]}
        actions={can("manage_fixed_assets") && <Button onClick={() => setRegistering(true)}><Plus size={15} /> Register an asset</Button>}
      />
      <RecordTable<any>
        collection="assets"
        expand="category,type,department,assigned_to,funding_source"
        views={views}
        activeView={view}
        onViewChange={(v) => setParams(v === "all" ? {} : { view: v })}
        baseFilter={category ? `category = "${category.replace(/[^a-z0-9]/gi, "")}"` : undefined}
        searchFields={["code", "name", "serial_number", "location_name", "assigned_to.name"]}
        filters={[
          { field: "category", label: "Category", collection: "assets_categories" },
          { field: "department", label: "Department", collection: "departments" },
          { field: "funding_source", label: "Funding", collection: "funding_sources", optionLabel: (f) => `${f.code} · ${f.name}` },
        ]}
        dateField="purchased_at"
        dateLabel="Acquired"
        defaultSort="code"
        exportName="asset-register"
        exportTitle="Fixed asset register"
        exportPermission={["export_assets", "view_fixed_assets", "manage_fixed_assets"]}
        onRowClick={(r) => navigate(`/dashboard/assets/register/${r.id}`)}
        empty={{ icon: Boxes, title: "No assets here", text: "Assets come from deliveries of capital items, from the opening register, or are registered by the Store & Asset Officer." }}
        columns={[
          { key: "code", header: "Tag", sortField: "code", cell: (r) => <span className="block whitespace-nowrap"><span className="block font-mono text-[12.5px] font-semibold text-slate-800">{r.code}</span>{r.serial_number && <span className="block max-w-[150px] truncate font-mono text-[11px] text-slate-400">{r.serial_number}</span>}</span> },
          {
            key: "name", header: "Asset", sortField: "name", csv: (r) => r.name,
            cell: (r) => (
              <span className="block min-w-[220px]">
                <span className="block font-medium text-slate-900">{r.name}</span>
                <span className="block text-[12px] text-slate-500">{r.expand?.category?.name || "No category"}{r.expand?.type?.name ? ` · ${r.expand.type.name}` : ""}{!r.capitalised && r.status !== "disposed" ? <span className="ml-1.5 rounded bg-amber-50 px-1.5 py-px text-[11px] font-semibold text-amber-800">to capitalise</span> : null}</span>
              </span>
            ),
          },
          { key: "category", header: "Category", exportOnly: true, csv: (r) => r.expand?.category?.name || "", cell: () => null },
          {
            key: "where", header: "Department / location", csv: (r) => `${r.expand?.department?.name || ""}${r.location_name ? ` — ${r.location_name}` : ""}`,
            cell: (r) => <span className="block min-w-[160px]"><span className="block text-[12.5px] text-slate-800">{r.expand?.department?.name || "—"}</span><span className="block max-w-[220px] truncate text-[12px] text-slate-500">{r.location_name}</span></span>,
          },
          { key: "custodian", header: "Custodian", csv: (r) => r.expand?.assigned_to?.name || "", cell: (r) => <span className="whitespace-nowrap text-[12.5px] text-slate-700">{r.expand?.assigned_to?.name || <span className="text-slate-400">—</span>}</span> },
          { key: "acquired", header: "Acquired", sortField: "purchased_at", format: "date", csv: (r) => showDay(r.purchased_at), cell: (r) => <span className="whitespace-nowrap text-[12.5px] text-slate-600">{showDay(r.purchased_at)}</span> },
          { key: "funding", header: "Funding", exportOnly: true, csv: (r) => r.expand?.funding_source?.code || "", cell: () => null },
          { key: "cost", header: "Cost", sortField: "cost", align: "right", format: "money", csv: (r) => Math.round(r.cost), cell: (r) => <span className="whitespace-nowrap tabular-nums text-slate-700">{money(r.cost)}</span> },
          { key: "accumulated", header: "Accumulated depreciation", exportOnly: true, format: "money", csv: (r) => r.accumulated_depreciation || 0, cell: () => null },
          {
            key: "nbv", header: "Net book value", sortField: "net_book_value", align: "right", format: "money", csv: (r) => (r.capitalised ? r.net_book_value : ""),
            cell: (r) => r.capitalised ? (
              <span className="block min-w-[110px] text-right">
                <span className="block font-semibold tabular-nums text-slate-900">{money(r.net_book_value)}</span>
                <span className="mt-1 block h-1 w-full overflow-hidden rounded-full bg-slate-100"><span className="block h-full rounded-full bg-primary" style={{ width: `${r.cost ? Math.max(0, Math.min(100, (r.net_book_value / r.cost) * 100)) : 0}%` }} /></span>
              </span>
            ) : <span className="text-slate-400">—</span>,
          },
          { key: "status", header: "Status", sortField: "status", csv: (r) => ASSET_STATUS[r.status]?.label || r.status, cell: (r) => <span className="block whitespace-nowrap"><StatusBadge status={r.status} map={ASSET_STATUS} />{r.condition && r.status !== "disposed" ? <span className="mt-0.5 block text-[11px] text-slate-500">{CONDITIONS[r.condition]}</span> : null}</span> },
        ]}
      />
      {registering && <AssetCardDialog onClose={() => setRegistering(false)} onSaved={(id) => { setRegistering(false); navigate(`/dashboard/assets/register/${id}`); }} />}
    </div>
  );
}
