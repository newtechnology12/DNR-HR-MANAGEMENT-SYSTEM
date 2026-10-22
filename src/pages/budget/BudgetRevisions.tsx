/**
 * Budget → Revisions: supplementary budgets, reductions, virements and re-phasing of approved lines.
 * Prepared by the Budget Officer, approved by DAF and SG; the approved change is applied to the lines.
 */
import * as React from "react";
import { useNavigate } from "react-router-dom";
import { ExternalLink, GitCompareArrows, Plus } from "lucide-react";
import { usePermissions } from "@/context/auth.context";
import { REVISION_TYPES } from "@/lib/budget";
import { DOC_STATUS } from "@/lib/procurement";
import { StatusBadge } from "@/components/enterprise/ui";
import RecordTable, { RecordColumn } from "@/components/enterprise/RecordTable";
import { Button, DocNo, Num, Page, PageHeader, fmtDate, fmtNumber, statusText } from "@/components/ims";
import { cn } from "@/utils";

/** An approved revision has been applied to the budget lines. */
export const REVISION_STATUS = { ...DOC_STATUS, approved: { ...DOC_STATUS.approved, note: "Applied to the lines" } };

/** Change amounts in tables: "+1,000,000" / "−1,000,000" (the header says RWF). */
export function Signed({ value }: { value?: number | null }) {
  const v = Math.round(Number(value) || 0);
  return <span className={cn("tabular-nums", v < 0 ? "text-ims-danger" : v === 0 && "text-ims-muted")}>{v > 0 ? "+" : v < 0 ? "−" : ""}{fmtNumber(Math.abs(v))}</span>;
}

export default function BudgetRevisions() {
  const navigate = useNavigate();
  const { can } = usePermissions();
  const [view, setView] = React.useState("all");
  const canCreate = can("manage_budgets");
  const open = (r: any) => navigate(`/dashboard/budget/revisions/${r.id}`);

  const columns: RecordColumn<any>[] = [
    { key: "number", header: "Number", sortField: "number", nowrap: true, cell: (r) => <DocNo value={r.number} /> },
    { key: "title", header: "Revision", sortField: "title", clamp: true, cell: (r) => <span className="font-semibold text-ims-text">{r.title}</span>, sub: (r) => r.expand?.fiscal_year?.name, csv: (r) => r.title },
    { key: "type", header: "Type", sortField: "type", nowrap: true, csv: (r) => REVISION_TYPES[r.type]?.label || r.type, cell: (r) => REVISION_TYPES[r.type]?.label || r.type },
    { key: "inc", header: "Increases (RWF)", sortField: "total_increase", align: "right", format: "money", sum: "total_increase", cell: (r) => <Num value={r.total_increase} />, csv: (r) => r.total_increase },
    { key: "dec", header: "Decreases (RWF)", sortField: "total_decrease", align: "right", format: "money", sum: "total_decrease", cell: (r) => <Num value={r.total_decrease} />, csv: (r) => r.total_decrease },
    { key: "net", header: "Net change (RWF)", sortField: "net_change", align: "right", format: "money", sum: "net_change", cell: (r) => <span className="font-semibold"><Signed value={r.net_change} /></span>, csv: (r) => r.net_change },
    { key: "date", header: "Created", sortField: "created", nowrap: true, format: "date", csv: (r) => (r.created ? r.created.slice(0, 10) : ""), cell: (r) => fmtDate(r.created) },
    { key: "status", header: "Status", sortField: "status", cell: (r) => <StatusBadge status={r.status} map={REVISION_STATUS} />, csv: (r) => statusText(REVISION_STATUS[r.status], r.status) },
  ];

  return (
    <Page>
      <PageHeader
        breadcrumbs={[{ label: "Budget", to: "/dashboard/budget" }, { label: "Budget revisions" }]}
        title="Budget revisions"
        subtitle="Supplementary budgets, reductions, virements and re-phasing. Lines change only once a revision is approved."
        primary={canCreate ? { label: "New revision", icon: Plus, to: "/dashboard/budget/revisions/new" } : undefined}
      />
      <RecordTable<any>
        collection="budget_revisions"
        expand="fiscal_year,prepared_by"
        views={[
          { key: "all", label: "All revisions" },
          { key: "draft", label: "Drafts", filter: 'status = "draft" || status = "returned"' },
          { key: "pending", label: "Pending approval", filter: 'status = "pending_approval"' },
          { key: "approved", label: "Approved", filter: 'status = "approved"' },
        ]}
        activeView={view}
        onViewChange={setView}
        searchFields={["number", "title", "reason"]}
        searchPlaceholder="Search number, title or reason"
        filters={[
          { field: "type", label: "Type", options: Object.entries(REVISION_TYPES).map(([value, t]) => ({ value, label: t.label })) },
          { field: "fiscal_year", label: "Fiscal year", collection: "fiscal_years" },
        ]}
        dateField="created"
        dateLabel="Created"
        exportName="budget-revisions"
        exportTitle="Budget revisions"
        exportPermission={["export_budgets", "export_reports"]}
        onRowClick={open}
        rowActions={() => [{ label: "Open", icon: ExternalLink, onSelect: open }]}
        empty={{
          icon: GitCompareArrows,
          title: "No revisions yet.",
          text: canCreate ? "No revisions yet. Prepare one with New revision." : "No revisions yet. They appear here once the Budget Officer prepares one.",
          action: canCreate && view === "all" ? <Button variant="primary" icon={Plus} onClick={() => navigate("/dashboard/budget/revisions/new")}>New revision</Button> : undefined,
        }}
        columns={columns}
      />
    </Page>
  );
}
