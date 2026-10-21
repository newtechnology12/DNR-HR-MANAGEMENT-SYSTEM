/**
 * Setup → funding sources, projects and cost centres (IMS M1). Finance (DAF) maintains them;
 * every transaction later carries budget line, funding source, department and project.
 */
import { CalendarRange, FolderKanban, Info, Landmark, Network, Wallet } from "lucide-react";
import MasterDataPage from "@/components/enterprise/MasterDataPage";
import { Badge } from "@/components/enterprise/ui";
import { rwf, showDay } from "@/lib/ims";

const FUNDING_TYPES = [
  { value: "member_contributions", label: "Member contributions" },
  { value: "government", label: "Government" },
  { value: "donor", label: "Donor / development partner" },
  { value: "own_revenue", label: "Own revenue (fees)" },
  { value: "other", label: "Other" },
];
const typeLabel = (v: string) => FUNDING_TYPES.find((t) => t.value === v)?.label || v;
const ActiveBadge = ({ active }: { active: boolean }) => <Badge tone={active ? "success" : "neutral"}>{active ? "Active" : "Inactive"}</Badge>;

export function FundingSources() {
  return (
    <MasterDataPage<any>
      title="Funding sources"
      description="Member contributions, government transfers and each donor programme. Restricted funds are reported separately (donor report)."
      icon={Landmark}
      collection="funding_sources"
      managePermission="manage_funding_sources"
      exportPermission={["export_reports", "view_master_data"]}
      itemLabel="funding source"
      searchFields={["code", "name", "donor_name", "agreement_reference"]}
      views={[{ key: "active", label: "Active", filter: "active = true" }, { key: "all", label: "All" }]}
      filters={[{ field: "type", label: "Type", options: FUNDING_TYPES }]}
      columns={[
        { key: "code", header: "Code", sortField: "code", cell: (r) => <span className="font-mono text-[12.5px] font-semibold text-slate-800">{r.code}</span> },
        { key: "name", header: "Funding source", sortField: "name", cell: (r) => (
          <span className="block min-w-0">
            <span className="block truncate font-medium text-slate-900">{r.name}</span>
            {r.donor_name && <span className="block truncate text-[12px] text-slate-500">{r.donor_name}{r.agreement_reference ? ` · ${r.agreement_reference}` : ""}</span>}
          </span>
        ) },
        { key: "type", header: "Type", sortField: "type", csv: (r) => typeLabel(r.type), cell: (r) => <Badge tone={r.type === "donor" ? "violet" : r.type === "member_contributions" ? "info" : "neutral"}>{typeLabel(r.type)}</Badge> },
        { key: "restricted", header: "Restricted", csv: (r) => (r.restricted ? "Yes" : "No"), cell: (r) => (r.restricted ? <Badge tone="warning">Restricted</Badge> : <span className="text-slate-400">—</span>) },
        { key: "committed_amount", header: "Committed", sortField: "committed_amount", align: "right", format: "money", cell: (r) => (r.committed_amount ? <span className="tabular-nums">{rwf(r.committed_amount)}</span> : <span className="text-slate-400">—</span>) },
        { key: "period", header: "Period", csv: (r) => `${showDay(r.start_date)} – ${r.end_date ? showDay(r.end_date) : "open"}`, cell: (r) => <span className="text-[12.5px] text-slate-600">{showDay(r.start_date)} – {r.end_date ? showDay(r.end_date) : "open"}</span> },
        { key: "active", header: "Status", sortField: "active", csv: (r) => (r.active ? "Active" : "Inactive"), cell: (r) => <ActiveBadge active={r.active} /> },
      ]}
      defaults={{ type: "donor", active: true, restricted: true, currency: "RWF" }}
      sections={[
        { title: "Funding source", icon: Landmark, fields: [
          { name: "code", label: "Code", type: "text", required: true, half: true, upper: true, placeholder: "DP-LED" },
          { name: "type", label: "Type", type: "select", required: true, half: true, options: FUNDING_TYPES },
          { name: "name", label: "Name", type: "text", required: true },
          { name: "donor_name", label: "Donor / partner", type: "text", half: true },
          { name: "agreement_reference", label: "Agreement reference", type: "text", half: true },
          { name: "restricted", label: "Restricted funds", type: "bool", placeholder: "Use only for the agreed purpose (reported separately)" },
          { name: "active", label: "Active", type: "bool", placeholder: "Available on new transactions" },
        ] },
        { title: "Period and amount", icon: CalendarRange, fields: [
          { name: "start_date", label: "Start date", type: "date", half: true },
          { name: "end_date", label: "End date", type: "date", half: true },
          { name: "committed_amount", label: "Committed amount (RWF)", type: "money", half: true, hint: "Total pledged under the agreement" },
          { name: "contact", label: "Contact", type: "text", half: true },
          { name: "description", label: "Notes", type: "textarea" },
        ] },
      ]}
    />
  );
}

export function Projects() {
  return (
    <MasterDataPage<any>
      title="Projects"
      description="Projects and programmes, each linked to a funding source and a lead department."
      icon={FolderKanban}
      collection="projects"
      managePermission="manage_projects"
      exportPermission={["export_reports", "view_master_data"]}
      itemLabel="project"
      expand="funding_source,department,manager"
      searchFields={["code", "name", "description"]}
      views={[{ key: "active", label: "Active", filter: 'status = "active"' }, { key: "planned", label: "Planned", filter: 'status = "planned"' }, { key: "closed", label: "Closed", filter: 'status = "closed"' }, { key: "all", label: "All" }]}
      filters={[{ field: "funding_source", label: "Funding source", collection: "funding_sources" }, { field: "department", label: "Department", collection: "departments" }]}
      columns={[
        { key: "code", header: "Code", sortField: "code", cell: (r) => <span className="font-mono text-[12.5px] font-semibold text-slate-800">{r.code}</span> },
        { key: "name", header: "Project", sortField: "name", cell: (r) => <span className="font-medium text-slate-900">{r.name}</span> },
        { key: "funding", header: "Funding source", csv: (r) => r.expand?.funding_source?.name || "", cell: (r) => <span className="text-[12.5px] text-slate-700">{r.expand?.funding_source?.code || "—"}</span> },
        { key: "department", header: "Department", csv: (r) => r.expand?.department?.name || "", cell: (r) => <span className="text-[12.5px] text-slate-700">{r.expand?.department?.name || "—"}</span> },
        { key: "manager", header: "Manager", csv: (r) => r.expand?.manager?.name || "", cell: (r) => <span className="text-[12.5px] text-slate-700">{r.expand?.manager?.name || "—"}</span> },
        { key: "budget_amount", header: "Budget", sortField: "budget_amount", align: "right", format: "money", cell: (r) => <span className="tabular-nums">{rwf(r.budget_amount)}</span> },
        { key: "status", header: "Status", sortField: "status", cell: (r) => <Badge tone={r.status === "active" ? "success" : r.status === "planned" ? "info" : "neutral"}>{r.status}</Badge> },
      ]}
      defaults={{ status: "active", budget_amount: 0 }}
      sections={[
        { title: "Project", icon: FolderKanban, fields: [
          { name: "code", label: "Code", type: "text", required: true, half: true, upper: true, placeholder: "CB-02" },
          { name: "status", label: "Status", type: "select", required: true, half: true, options: [{ value: "planned", label: "Planned" }, { value: "active", label: "Active" }, { value: "closed", label: "Closed" }] },
          { name: "name", label: "Name", type: "text", required: true },
          { name: "funding_source", label: "Funding source", type: "relation", collection: "funding_sources", required: true, half: true },
          { name: "department", label: "Lead department", type: "relation", collection: "departments", half: true },
          { name: "manager", label: "Project manager", type: "relation", collection: "users", optionFilter: 'status = "Active"', optionLabel: (u) => u.name, half: true },
        ] },
        { title: "Budget and dates", icon: Wallet, fields: [
          { name: "budget_amount", label: "Project budget (RWF)", type: "money", half: true },
          { name: "start_date", label: "Start date", type: "date", half: true },
          { name: "end_date", label: "End date", type: "date", half: true },
          { name: "description", label: "Description", type: "textarea" },
        ] },
      ]}
    />
  );
}

export function CostCentres() {
  return (
    <MasterDataPage<any>
      title="Cost centres"
      description="Responsibility centres for cost reporting — one per department by default."
      icon={Network}
      collection="cost_centres"
      managePermission="manage_chart_of_accounts"
      exportPermission={["export_reports", "view_master_data"]}
      itemLabel="cost centre"
      expand="department"
      searchFields={["code", "name"]}
      views={[{ key: "active", label: "Active", filter: "active = true" }, { key: "all", label: "All" }]}
      columns={[
        { key: "code", header: "Code", sortField: "code", cell: (r) => <span className="font-mono text-[12.5px] font-semibold text-slate-800">{r.code}</span> },
        { key: "name", header: "Cost centre", sortField: "name", cell: (r) => <span className="font-medium text-slate-900">{r.name}</span> },
        { key: "department", header: "Department", csv: (r) => r.expand?.department?.name || "", cell: (r) => <span className="text-[12.5px] text-slate-700">{r.expand?.department?.name || "—"}</span> },
        { key: "active", header: "Status", sortField: "active", csv: (r) => (r.active ? "Active" : "Inactive"), cell: (r) => <ActiveBadge active={r.active} /> },
      ]}
      defaults={{ active: true }}
      sections={[
        { title: "Cost centre", icon: Network, fields: [
          { name: "code", label: "Code", type: "text", required: true, half: true, upper: true },
          { name: "department", label: "Department", type: "relation", collection: "departments", half: true },
          { name: "name", label: "Name", type: "text", required: true },
          { name: "active", label: "Active", type: "bool", placeholder: "Available on new transactions" },
          { name: "description", label: "Notes", type: "textarea" },
        ] },
      ]}
      aside={
        <p className="flex items-start gap-2 rounded-lg border border-blue-100 bg-blue-50/60 px-3 py-2 text-[12.5px] text-blue-900">
          <Info size={14} className="mt-0.5 shrink-0" /> Cost centres are maintained by Finance together with the chart of accounts.
        </p>
      }
    />
  );
}
