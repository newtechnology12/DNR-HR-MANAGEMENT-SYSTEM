/**
 * Setup → funding sources, projects, cost centres and strategic objectives (IMS M1). Finance (DAF) maintains them;
 * every transaction later carries budget line, funding source, department and project.
 */
import { CalendarRange, FolderKanban, Info, Landmark, Network, Target, Wallet } from "lucide-react";
import MasterDataPage from "@/components/enterprise/MasterDataPage";
import { Num, StatusPill, fmtDate } from "@/components/ims";

const FUNDING_TYPES = [
  { value: "member_contributions", label: "Member contributions" },
  { value: "government", label: "Government" },
  { value: "donor", label: "Donor / development partner" },
  { value: "own_revenue", label: "Own revenue (fees)" },
  { value: "other", label: "Other" },
];
const typeLabel = (v: string) => FUNDING_TYPES.find((t) => t.value === v)?.label || v;
const ActiveBadge = ({ active }: { active: boolean }) => <StatusPill status={active ? "Active" : "Inactive"} />;
/** Short codes (DP-LED, CB-02) never wrap. */
const Code = ({ value }: { value?: string }) => <span className="whitespace-nowrap font-mono text-t-small font-semibold text-ims-text">{value || "—"}</span>;
const Dash = () => <span className="text-ims-faint">—</span>;
/** Projects in the record vocabulary: active, planned (not started yet), closed. */
const PROJECT_STATUS: Record<string, { word: string; note?: string }> = { active: { word: "Active" }, planned: { word: "Inactive", note: "Planned" }, closed: { word: "Closed" } };

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
        { key: "code", header: "Code", sortField: "code", nowrap: true, cell: (r) => <Code value={r.code} /> },
        {
          key: "name", header: "Funding source", sortField: "name", clamp: true, csv: (r) => r.name,
          cell: (r) => <span className="font-semibold">{r.name}</span>,
          sub: (r) => (r.donor_name ? `${r.donor_name}${r.agreement_reference ? ` · ${r.agreement_reference}` : ""}` : null),
        },
        { key: "type", header: "Type", sortField: "type", csv: (r) => typeLabel(r.type), cell: (r) => typeLabel(r.type) },
        { key: "restricted", header: "Restricted", csv: (r) => (r.restricted ? "Yes" : "No"), cell: (r) => (r.restricted ? "Yes" : <Dash />) },
        { key: "committed_amount", header: "Committed (RWF)", sortField: "committed_amount", align: "right", format: "money", sum: "committed_amount", cell: (r) => (r.committed_amount ? <Num value={r.committed_amount} /> : <Dash />) },
        { key: "period", header: "Period", nowrap: true, csv: (r) => `${fmtDate(r.start_date)} – ${r.end_date ? fmtDate(r.end_date) : "open"}`, cell: (r) => `${fmtDate(r.start_date)} – ${r.end_date ? fmtDate(r.end_date) : "open"}` },
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
        { key: "code", header: "Code", sortField: "code", nowrap: true, cell: (r) => <Code value={r.code} /> },
        { key: "name", header: "Project", sortField: "name", clamp: true, csv: (r) => r.name, cell: (r) => <span className="font-semibold">{r.name}</span> },
        {
          key: "funding", header: "Funding source", csv: (r) => r.expand?.funding_source?.name || "",
          cell: (r) => (r.expand?.funding_source ? <Code value={r.expand.funding_source.code} /> : <Dash />),
          sub: (r) => r.expand?.funding_source?.name,
        },
        { key: "department", header: "Department", csv: (r) => r.expand?.department?.name || "", cell: (r) => r.expand?.department?.name || <Dash /> },
        { key: "manager", header: "Manager", csv: (r) => r.expand?.manager?.name || "", cell: (r) => r.expand?.manager?.name || <Dash /> },
        { key: "budget_amount", header: "Budget (RWF)", sortField: "budget_amount", align: "right", format: "money", sum: "budget_amount", cell: (r) => <Num value={r.budget_amount} /> },
        {
          key: "status", header: "Status", sortField: "status", csv: (r) => PROJECT_STATUS[r.status]?.note || PROJECT_STATUS[r.status]?.word || r.status,
          cell: (r) => <StatusPill status={PROJECT_STATUS[r.status]?.word || r.status} sub={PROJECT_STATUS[r.status]?.note} />,
        },
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
        { key: "code", header: "Code", sortField: "code", nowrap: true, cell: (r) => <Code value={r.code} /> },
        { key: "name", header: "Cost centre", sortField: "name", clamp: true, csv: (r) => r.name, cell: (r) => <span className="font-semibold">{r.name}</span> },
        { key: "department", header: "Department", csv: (r) => r.expand?.department?.name || "", cell: (r) => r.expand?.department?.name || <Dash /> },
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
        <p className="flex items-start gap-2 rounded-control bg-ims-info-bg px-3.5 py-2.5 text-t-small text-ims-info">
          <Info size={15} className="mt-px shrink-0" aria-hidden /> Cost centres are maintained by Finance together with the chart of accounts.
        </p>
      }
    />
  );
}


export function StrategicObjectives() {
  return (
    <MasterDataPage<any>
      title="Strategic objectives"
      description="RALGA's strategic objectives. Staff link each objective of their annual performance contract, and each activity of their plans, to one of them."
      icon={Target}
      collection="strategic_objectives"
      managePermission="manage_projects"
      exportPermission={["export_reports", "view_master_data"]}
      itemLabel="strategic objective"
      searchFields={["code", "name", "description"]}
      defaultSort="sort"
      views={[{ key: "active", label: "Active", filter: "active = true" }, { key: "all", label: "All" }]}
      columns={[
        { key: "code", header: "Code", sortField: "code", nowrap: true, cell: (r) => <Code value={r.code} /> },
        { key: "name", header: "Strategic objective", sortField: "name", clamp: true, csv: (r) => r.name, cell: (r) => <span className="font-semibold">{r.name}</span>, sub: (r) => r.description },
        { key: "sort", header: "Order", sortField: "sort", align: "right", cell: (r) => <Num value={r.sort} /> },
        { key: "active", header: "Status", sortField: "active", csv: (r) => (r.active ? "Active" : "Inactive"), cell: (r) => <ActiveBadge active={r.active} /> },
      ]}
      defaults={{ active: true, sort: 0 }}
      sections={[
        { title: "Strategic objective", icon: Target, fields: [
          { name: "code", label: "Code", type: "text", required: true, half: true, upper: true, placeholder: "SO1" },
          { name: "sort", label: "Order", type: "number", half: true, hint: "Position in lists" },
          { name: "name", label: "Objective", type: "text", required: true },
          { name: "description", label: "What it covers", type: "textarea" },
          { name: "active", label: "Active", type: "bool", placeholder: "Staff can link new plans to it" },
        ] },
      ]}
      aside={
        <p className="flex items-start gap-2 rounded-control bg-ims-info-bg px-3.5 py-2.5 text-t-small text-ims-info">
          <Info size={15} className="mt-px shrink-0" aria-hidden /> Keep these in line with the approved Strategic Plan. A deactivated objective stays on the plans that already use it.
        </p>
      }
    />
  );
}
