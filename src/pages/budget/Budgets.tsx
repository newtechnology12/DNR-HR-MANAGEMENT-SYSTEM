/**
 * Budget → Budgets: budget documents per fiscal year. The Budget Officer prepares lines (or imports
 * them from Excel), submits; DAF and Secretary General approve; approved lines drive budget control.
 */
import * as React from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "react-query";
import { toast } from "sonner";
import { ExternalLink, FileText, Plus } from "lucide-react";
import pocketbase from "@/lib/pocketbase";
import { usePermissions } from "@/context/auth.context";
import { DOC_STATUS, errorMessage } from "@/lib/procurement";
import { StatusBadge } from "@/components/enterprise/ui";
import RecordTable, { RecordColumn } from "@/components/enterprise/RecordTable";
import { Button, DocNo, Field, Input, Modal, Num, Page, PageHeader, Person, Select, Textarea, fmtNumber, statusText } from "@/components/ims";

export default function Budgets() {
  const navigate = useNavigate();
  const { can } = usePermissions();
  const [view, setView] = React.useState("all");
  const [form, setForm] = React.useState<any>(null);
  const [busy, setBusy] = React.useState(false);
  const [tried, setTried] = React.useState(false);
  const years = useQuery(["fiscal-years-open"], () => pocketbase.collection("fiscal_years").getFullList({ sort: "-start_date" }));

  async function create() {
    setTried(true);
    // The fields say what is missing.
    if (!form?.fiscal_year || !form?.name?.trim()) return;
    setBusy(true);
    try {
      const b = await pocketbase.collection("budgets").create({ name: form.name.trim(), fiscal_year: form.fiscal_year, description: form.description || "" });
      toast.success(`${b.number} created. Add its lines next.`);
      navigate(`/dashboard/budget/budgets/${b.id}`);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  const openNew = () => {
    setTried(false);
    setForm({ fiscal_year: (years.data || []).find((y: any) => y.is_current)?.id || "", name: "" });
  };
  const open = (r: any) => navigate(`/dashboard/budget/budgets/${r.id}`);
  const canCreate = can("manage_budgets");

  const columns: RecordColumn<any>[] = [
    { key: "number", header: "Number", sortField: "number", nowrap: true, cell: (r) => <DocNo value={r.number} /> },
    { key: "name", header: "Budget", sortField: "name", clamp: true, cell: (r) => <span className="font-semibold text-ims-text">{r.name}</span>, sub: (r) => r.description, csv: (r) => r.name },
    { key: "fy", header: "Fiscal year", nowrap: true, csv: (r) => r.expand?.fiscal_year?.name || "", cell: (r) => r.expand?.fiscal_year?.name || "—" },
    { key: "lines", header: "Lines", sortField: "line_count", align: "right", format: "number", cell: (r) => <span className="tabular-nums">{fmtNumber(r.line_count)}</span>, csv: (r) => r.line_count },
    { key: "total", header: "Spending total (RWF)", sortField: "total", align: "right", format: "money", sum: "total", cell: (r) => <Num value={r.total} />, csv: (r) => r.total },
    { key: "by", header: "Prepared by", className: "max-w-[200px]", csv: (r) => r.expand?.prepared_by?.name || "", cell: (r) => <Person name={r.expand?.prepared_by?.name} /> },
    { key: "status", header: "Status", sortField: "status", cell: (r) => <StatusBadge status={r.status} map={DOC_STATUS} />, csv: (r) => statusText(DOC_STATUS[r.status], r.status) },
  ];

  const fyMissing = tried && !form?.fiscal_year;
  const nameMissing = tried && !form?.name?.trim();

  return (
    <Page>
      <PageHeader
        breadcrumbs={[{ label: "Budget", to: "/dashboard/budget" }, { label: "Budgets" }]}
        title="Budgets"
        subtitle="Annual budgets by line with monthly phasing. Approved budgets drive budget control."
        primary={canCreate ? { label: "New budget", icon: Plus, onClick: openNew } : undefined}
      />
      <RecordTable<any>
        collection="budgets"
        expand="fiscal_year,prepared_by"
        views={[
          { key: "all", label: "All budgets" },
          { key: "draft", label: "Drafts", filter: 'status = "draft" || status = "returned"' },
          { key: "pending", label: "Pending approval", filter: 'status = "pending_approval"' },
          { key: "approved", label: "Approved", filter: 'status = "approved"' },
        ]}
        activeView={view}
        onViewChange={setView}
        searchFields={["number", "name"]}
        searchPlaceholder="Search number or name"
        filters={[{ field: "fiscal_year", label: "Fiscal year", collection: "fiscal_years" }]}
        exportName="budgets"
        exportTitle="Budgets"
        exportPermission={["export_budgets", "export_reports"]}
        onRowClick={open}
        rowActions={() => [{ label: "Open", icon: ExternalLink, onSelect: open }]}
        empty={{
          icon: FileText,
          title: "No budgets yet.",
          text: canCreate ? "No budgets yet. Prepare the annual budget with New budget." : "No budgets yet. The Budget Officer prepares the annual budget here.",
          action: canCreate && view === "all" ? <Button variant="primary" icon={Plus} onClick={openNew}>New budget</Button> : undefined,
        }}
        columns={columns}
      />
      <Modal
        open={Boolean(form)}
        onClose={() => (busy ? undefined : setForm(null))}
        title="New budget"
        description="You add the lines next, one by one or from the Excel template."
        footer={
          <>
            <Button onClick={() => setForm(null)} disabled={busy}>Cancel</Button>
            <Button variant="primary" onClick={create} loading={busy}>Create budget</Button>
          </>
        }
      >
        {form && (
          <>
            <Field label="Fiscal year" required htmlFor="budget-fy" error={fyMissing && "Choose the fiscal year this budget is for."}>
              <Select id="budget-fy" value={form.fiscal_year} invalid={fyMissing} onChange={(e) => setForm({ ...form, fiscal_year: e.target.value })}>
                <option value="">Choose the fiscal year…</option>
                {(years.data || []).filter((y: any) => y.status === "open").map((y: any) => <option key={y.id} value={y.id}>{y.name}{y.is_current ? " (current)" : ""}</option>)}
              </Select>
            </Field>
            <Field label="Name" required htmlFor="budget-name" error={nameMissing && "Name the budget, for example “FY 2027/28 budget — General Secretariat”."}>
              <Input id="budget-name" value={form.name} invalid={nameMissing} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. FY 2027/28 budget — General Secretariat" />
            </Field>
            <Field label="Description" htmlFor="budget-description" hint="Optional. Assumptions or the council resolution it follows.">
              <Textarea id="budget-description" value={form.description || ""} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </Field>
          </>
        )}
      </Modal>
    </Page>
  );
}
