/**
 * Budget → Revisions: supplementary budgets, reductions, virements and re-phasing of approved lines.
 * Prepared by the Budget Officer, approved by DAF and SG; the approved change is applied to the lines.
 */
import * as React from "react";
import { useNavigate } from "react-router-dom";
import { GitCompareArrows, Plus } from "lucide-react";
import { usePermissions } from "@/context/auth.context";
import { REVISION_TYPES } from "@/lib/budget";
import { rwf, rwfSigned, showDay } from "@/lib/ims";
import { DOC_STATUS } from "@/lib/procurement";
import { Button } from "@/components/ui/button";
import { PageHeader, StatusBadge } from "@/components/enterprise/ui";
import RecordTable from "@/components/enterprise/RecordTable";
import { cn } from "@/utils";

export default function BudgetRevisions() {
  const navigate = useNavigate();
  const { can } = usePermissions();
  const [view, setView] = React.useState("all");
  return (
    <div className="space-y-4 px-3 sm:px-4">
      <PageHeader
        title="Budget revisions"
        description="Supplementary budgets, reductions, virements between lines and re-phasing. A revision changes approved lines only after its own approval."
        breadcrumbs={[{ title: "Budget", link: "/dashboard/budget" }, { title: "Revisions", link: "/dashboard/budget/revisions" }]}
        actions={can("manage_budgets") && <Button onClick={() => navigate("/dashboard/budget/revisions/new")}><Plus size={15} /> New revision</Button>}
      />
      <RecordTable<any>
        collection="budget_revisions"
        expand="fiscal_year,prepared_by"
        views={[
          { key: "all", label: "All" },
          { key: "draft", label: "Drafts", filter: 'status = "draft" || status = "returned"' },
          { key: "pending", label: "Waiting for approval", filter: 'status = "pending_approval"' },
          { key: "approved", label: "Applied", filter: 'status = "approved"' },
        ]}
        activeView={view}
        onViewChange={setView}
        searchFields={["number", "title", "reason"]}
        filters={[
          { field: "type", label: "Type", options: Object.entries(REVISION_TYPES).map(([value, t]) => ({ value, label: t.label })) },
          { field: "fiscal_year", label: "Fiscal year", collection: "fiscal_years" },
        ]}
        dateField="created"
        exportName="budget-revisions"
        exportTitle="Budget revisions"
        exportPermission={["export_budgets", "export_reports"]}
        onRowClick={(r) => navigate(`/dashboard/budget/revisions/${r.id}`)}
        empty={{ icon: GitCompareArrows, title: "No revisions", text: "Revisions appear here once the Budget Officer prepares one." }}
        columns={[
          { key: "number", header: "Number", sortField: "number", cell: (r) => <span className="font-mono text-[12.5px] font-semibold text-slate-800">{r.number}</span> },
          { key: "title", header: "Revision", sortField: "title", cell: (r) => <span className="font-medium text-slate-900">{r.title}</span> },
          { key: "type", header: "Type", sortField: "type", csv: (r) => REVISION_TYPES[r.type]?.label || r.type, cell: (r) => <span className="text-[12.5px]">{REVISION_TYPES[r.type]?.label || r.type}</span> },
          { key: "inc", header: "Increases", sortField: "total_increase", align: "right", format: "money", cell: (r) => <span className="tabular-nums">{rwf(r.total_increase)}</span> },
          { key: "dec", header: "Decreases", sortField: "total_decrease", align: "right", format: "money", cell: (r) => <span className="tabular-nums">{rwf(r.total_decrease)}</span> },
          {
            key: "net", header: "Net change", sortField: "net_change", align: "right", format: "money",
            cell: (r) => <span className={cn("font-medium tabular-nums", r.net_change > 0 ? "text-slate-900" : r.net_change < 0 ? "text-red-700" : "text-slate-500")}>{rwfSigned(r.net_change)}</span>,
          },
          { key: "date", header: "Created", sortField: "created", format: "date", csv: (r) => showDay(r.created), cell: (r) => <span className="text-[12.5px] text-slate-600">{showDay(r.created)}</span> },
          { key: "status", header: "Status", sortField: "status", cell: (r) => <StatusBadge status={r.status} map={DOC_STATUS} /> },
        ]}
      />
    </div>
  );
}
