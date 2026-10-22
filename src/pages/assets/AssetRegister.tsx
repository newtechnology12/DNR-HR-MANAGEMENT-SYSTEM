/**
 * Fixed assets → Asset register: every asset with its tag, category, department and location, custodian, cost and
 * net book value. Assets received on a GRN wait here for their card (capitalisation).
 */
import * as React from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Boxes, ExternalLink, Plus } from "lucide-react";
import { usePermissions } from "@/context/auth.context";
import { ASSET_STATUS, CONDITIONS } from "@/lib/assets";
import { StatusBadge } from "@/components/enterprise/ui";
import RecordTable, { RecordColumn, RecordView } from "@/components/enterprise/RecordTable";
import { Button, DocNo, Num, Page, PageHeader, Person, fmtDate, statusText } from "@/components/ims";
import { AssetCardDialog } from "@/components/assets/AssetDialogs";

/** Conditions that need attention (conditions are tags, not statuses). */
const POOR = ["poor", "damaged"];

export default function AssetRegister() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const { can } = usePermissions();
  const [registering, setRegistering] = React.useState(false);
  const view = params.get("view") || "all";
  const category = params.get("category") || "";
  const manage = can("manage_fixed_assets");
  // At most five tabs: "in use" and "in store" are a status filter.
  const views: RecordView[] = [
    { key: "all", label: "In the register", filter: 'status != "disposed"' },
    { key: "to_capitalise", label: "To capitalise", filter: 'capitalised = false && status != "disposed"' },
    { key: "attention", label: "Maintenance, damaged, lost", filter: 'status = "under_maintenance" || status = "damaged" || status = "lost"' },
    { key: "disposed", label: "Disposed", filter: 'status = "disposed"' },
  ];
  const open = (r: any) => navigate(`/dashboard/assets/register/${r.id}`);

  const columns: RecordColumn<any>[] = [
    { key: "code", header: "Tag", sortField: "code", nowrap: true, cell: (r) => <DocNo value={r.code} className="font-semibold text-ims-text" />, sub: (r) => (r.serial_number ? <span className="block max-w-[150px] truncate font-mono">{r.serial_number}</span> : null) },
    {
      key: "name",
      header: "Asset",
      sortField: "name",
      clamp: true,
      csv: (r) => r.name,
      cell: (r) => <span className="font-semibold">{r.name}</span>,
      sub: (r) => (
        <>
          {!r.capitalised && r.status !== "disposed" ? <span className="font-semibold text-ims-warning">To capitalise · </span> : null}
          {r.expand?.category?.name || "No category"}
          {r.expand?.type?.name ? ` · ${r.expand.type.name}` : ""}
        </>
      ),
    },
    { key: "category", header: "Category", exportOnly: true, csv: (r) => r.expand?.category?.name || "", cell: () => null },
    {
      key: "where",
      header: "Department",
      className: "max-w-[180px]",
      csv: (r) => `${r.expand?.department?.name || ""}${r.location_name ? ` — ${r.location_name}` : ""}`,
      cell: (r) => r.expand?.department?.name || <span className="text-ims-faint">—</span>,
      sub: (r) => (r.location_name ? <span className="block truncate">{r.location_name}</span> : null),
    },
    { key: "custodian", header: "Custodian", className: "max-w-[150px]", csv: (r) => r.expand?.assigned_to?.name || "", cell: (r) => (r.expand?.assigned_to ? <Person name={r.expand.assigned_to.name} /> : <span className="text-ims-faint">—</span>) },
    { key: "acquired", header: "Acquired", sortField: "purchased_at", exportOnly: true, format: "date", csv: (r) => (r.purchased_at ? r.purchased_at.slice(0, 10) : ""), cell: (r) => fmtDate(r.purchased_at) },
    { key: "funding", header: "Funding", exportOnly: true, csv: (r) => r.expand?.funding_source?.code || "", cell: () => null },
    { key: "cost", header: "Cost (RWF)", sortField: "cost", align: "right", sum: "cost", format: "money", csv: (r) => Math.round(r.cost), cell: (r) => <Num value={r.cost} /> },
    { key: "accumulated", header: "Accumulated depreciation (RWF)", exportOnly: true, format: "money", csv: (r) => r.accumulated_depreciation || 0, cell: () => null },
    {
      key: "nbv",
      header: "Book value (RWF)",
      sortField: "net_book_value",
      align: "right",
      sum: "net_book_value",
      format: "money",
      csv: (r) => (r.capitalised ? r.net_book_value : ""),
      cell: (r) => (r.capitalised ? <span className="font-semibold text-ims-text"><Num value={r.net_book_value} /></span> : <span className="text-ims-faint">—</span>),
    },
    {
      key: "status",
      header: "Status",
      sortField: "status",
      nowrap: true,
      csv: (r) => statusText(ASSET_STATUS[r.status], r.status),
      cell: (r) => <StatusBadge status={r.status} map={ASSET_STATUS} />,
      // Condition is a tag, not a status: shown here only when it needs attention.
      sub: (r) => (r.status !== "disposed" && POOR.includes(r.condition) ? <span className="font-semibold text-ims-warning">{CONDITIONS[r.condition]} condition</span> : null),
    },
    { key: "condition", header: "Condition", exportOnly: true, csv: (r) => CONDITIONS[r.condition] || "", cell: () => null },
  ];

  return (
    <Page>
      <PageHeader
        breadcrumbs={[{ label: "Fixed assets", to: "/dashboard/assets" }, { label: "Asset register" }]}
        title="Asset register"
        subtitle="Every fixed asset with its tag, location and custodian, what it cost and what it is still worth."
        primary={manage ? { label: "Register an asset", icon: Plus, onClick: () => setRegistering(true) } : undefined}
      />
      <RecordTable<any>
        collection="assets"
        expand="category,type,department,assigned_to,funding_source"
        views={views}
        activeView={view}
        onViewChange={(v) => setParams(v === "all" ? {} : { view: v })}
        baseFilter={category ? `category = "${category.replace(/[^a-z0-9]/gi, "")}"` : undefined}
        searchFields={["code", "name", "serial_number", "location_name", "assigned_to.name"]}
        searchPlaceholder="Search tag, name, serial or custodian"
        filters={[
          { field: "status", label: "Status", options: ["in_use", "in_stock", "under_maintenance", "damaged", "lost"].map((value) => ({ value, label: statusText(ASSET_STATUS[value], value) })) },
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
        onRowClick={open}
        rowActions={() => [{ label: "Open", icon: ExternalLink, onSelect: open }]}
        empty={{
          icon: Boxes,
          title: "No assets here",
          text: view === "to_capitalise" ? "Nothing is waiting for its asset card." : "Assets come from deliveries of capital items or the opening register, or are registered by the Store & Asset Officer.",
          action: manage && view === "all" ? <Button variant="primary" icon={Plus} onClick={() => setRegistering(true)}>Register an asset</Button> : undefined,
        }}
        columns={columns}
      />
      {registering && <AssetCardDialog onClose={() => setRegistering(false)} onSaved={(id) => { setRegistering(false); navigate(`/dashboard/assets/register/${id}`); }} />}
    </Page>
  );
}
