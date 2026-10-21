/**
 * Budget → Budgets: budget documents per fiscal year. The Budget Officer prepares lines (or imports
 * them from Excel), submits; DAF and Secretary General approve; approved lines drive budget control.
 */
import * as React from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "react-query";
import { toast } from "sonner";
import { FileText, Plus } from "lucide-react";
import pocketbase from "@/lib/pocketbase";
import { usePermissions } from "@/context/auth.context";
import { rwf } from "@/lib/ims";
import { DOC_STATUS, errorMessage } from "@/lib/procurement";
import { Button } from "@/components/ui/button";
import { PageHeader, StatusBadge } from "@/components/enterprise/ui";
import RecordTable from "@/components/enterprise/RecordTable";
import { Field, FormBlock, FormDialog, inputCls, textareaCls } from "@/components/portal/kit";

export default function Budgets() {
  const navigate = useNavigate();
  const { can } = usePermissions();
  const [view, setView] = React.useState("all");
  const [form, setForm] = React.useState<any>(null);
  const [busy, setBusy] = React.useState(false);
  const years = useQuery(["fiscal-years-open"], () => pocketbase.collection("fiscal_years").getFullList({ sort: "-start_date" }));

  async function create() {
    if (!form?.fiscal_year || !form?.name?.trim()) return toast.error("Choose the fiscal year and name the budget.");
    setBusy(true);
    try {
      const b = await pocketbase.collection("budgets").create({ name: form.name.trim(), fiscal_year: form.fiscal_year, description: form.description || "" });
      toast.success(`${b.number} created — add its lines`);
      navigate(`/dashboard/budget/budgets/${b.id}`);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4 px-3 sm:px-4">
      <PageHeader
        title="Budgets"
        description="Annual budgets by line (account × department × funding source × project) with monthly phasing. Approved budgets drive budget control."
        breadcrumbs={[{ title: "Budget", link: "/dashboard/budget" }, { title: "Budgets", link: "/dashboard/budget/budgets" }]}
        actions={can("manage_budgets") && (
          <Button onClick={() => setForm({ fiscal_year: (years.data || []).find((y: any) => y.is_current)?.id || "", name: "" })}><Plus size={15} /> New budget</Button>
        )}
      />
      <RecordTable<any>
        collection="budgets"
        expand="fiscal_year,prepared_by"
        views={[
          { key: "all", label: "All" },
          { key: "draft", label: "Drafts", filter: 'status = "draft" || status = "returned"' },
          { key: "pending", label: "Waiting for approval", filter: 'status = "pending_approval"' },
          { key: "approved", label: "Approved", filter: 'status = "approved"' },
        ]}
        activeView={view}
        onViewChange={setView}
        searchFields={["number", "name"]}
        filters={[{ field: "fiscal_year", label: "Fiscal year", collection: "fiscal_years" }]}
        exportName="budgets"
        exportTitle="Budgets"
        exportPermission={["export_budgets", "export_reports"]}
        onRowClick={(r) => navigate(`/dashboard/budget/budgets/${r.id}`)}
        empty={{ icon: FileText, title: "No budgets yet", text: "The Budget Officer prepares the annual budget here." }}
        columns={[
          { key: "number", header: "Number", sortField: "number", cell: (r) => <span className="font-mono text-[12.5px] font-semibold text-slate-800">{r.number}</span> },
          { key: "name", header: "Budget", sortField: "name", cell: (r) => <span className="font-medium text-slate-900">{r.name}</span> },
          { key: "fy", header: "Fiscal year", csv: (r) => r.expand?.fiscal_year?.name || "", cell: (r) => r.expand?.fiscal_year?.name || "—" },
          { key: "lines", header: "Lines", sortField: "line_count", align: "right", format: "number", cell: (r) => <span className="tabular-nums">{r.line_count}</span> },
          { key: "total", header: "Spending total", sortField: "total", align: "right", format: "money", cell: (r) => <span className="font-medium tabular-nums">{rwf(r.total)}</span> },
          { key: "by", header: "Prepared by", csv: (r) => r.expand?.prepared_by?.name || "", cell: (r) => <span className="text-[12.5px] text-slate-600">{r.expand?.prepared_by?.name || "—"}</span> },
          { key: "status", header: "Status", sortField: "status", cell: (r) => <StatusBadge status={r.status} map={DOC_STATUS} /> },
        ]}
      />
      <FormDialog open={Boolean(form)} onClose={() => setForm(null)} icon={FileText} title="New budget" description="Lines are added next (one by one or from the Excel template)." submitLabel="Create budget" busy={busy} onSubmit={create}>
        {form && (
          <FormBlock icon={FileText} title="Budget">
            <Field label="Fiscal year" required>
              <select value={form.fiscal_year} onChange={(e) => setForm({ ...form, fiscal_year: e.target.value })} className={inputCls}>
                <option value="">Choose…</option>
                {(years.data || []).filter((y: any) => y.status === "open").map((y: any) => <option key={y.id} value={y.id}>{y.name}{y.is_current ? " (current)" : ""}</option>)}
              </select>
            </Field>
            <Field label="Name" required><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={inputCls} placeholder="e.g. FY 2027/28 budget — General Secretariat" /></Field>
            <Field label="Description"><textarea value={form.description || ""} onChange={(e) => setForm({ ...form, description: e.target.value })} className={textareaCls} /></Field>
          </FormBlock>
        )}
      </FormDialog>
    </div>
  );
}
