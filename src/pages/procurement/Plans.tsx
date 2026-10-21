import * as React from "react";
import { useMutation, useQuery } from "react-query";
import { useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { CalendarRange, ExternalLink, Plus } from "lucide-react";
import pocketbase from "@/lib/pocketbase";
import { useRoles } from "@/context/roles.context";
import RecordTable, { RecordColumn, RecordFilter, RecordView } from "@/components/enterprise/RecordTable";
import { StatusBadge } from "@/components/enterprise/ui";
import { Button, DocNo, Field, Input, Modal, Num, Page, PageHeader, Person, Select, fmtNumber } from "@/components/ims";
import { PLAN_STATUS, errorMessage } from "@/lib/procurement";
import { useMe } from "@/components/portal/kit";
import { fyLabel, useFiscalYears } from "@/lib/fiscal";

export default function Plans() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const { canPerform } = useRoles();
  const [creating, setCreating] = React.useState(false);
  const view = params.get("view") || "all";
  const years = useFiscalYears();
  const current = years.data?.find((f) => f.is_current);
  const views: RecordView[] = [
    { key: "all", label: "All plans" },
    ...(current ? [{ key: "current", label: current.name, filter: `fiscal_year = ${current.year}` }, { key: "next", label: fyLabel(current.year + 1), filter: `fiscal_year = ${current.year + 1}` }] : []),
    { key: "approval", label: "In approval", filter: `status = "pending_approval"` },
    { key: "approved", label: "Approved", filter: `status = "approved"` },
  ];
  const filters: RecordFilter[] = [
    { field: "status", label: "Status", options: Object.entries(PLAN_STATUS).map(([value, m]) => ({ value, label: m.label })) },
    { field: "department", label: "Department", collection: "departments" },
    { field: "fiscal_year", label: "Fiscal year", options: (years.data || []).map((f) => ({ value: String(f.year), label: f.name })), filterFor: (v) => `fiscal_year = ${Number(v)}` },
  ];
  const columns: RecordColumn<any>[] = [
    { key: "number", header: "Number", sortField: "number", nowrap: true, cell: (r) => <DocNo value={r.number} />, csv: (r) => r.number },
    { key: "name", header: "Name", sortField: "name", clamp: true, cell: (r) => r.name || "—", sub: (r) => r.expand?.department?.name, csv: (r) => r.name },
    { key: "department", header: "Department", exportOnly: true, cell: (r) => r.expand?.department?.name || "—", csv: (r) => r.expand?.department?.name },
    { key: "year", header: "Fiscal year", sortField: "fiscal_year", nowrap: true, cell: (r) => fyLabel(r.fiscal_year), csv: (r) => fyLabel(r.fiscal_year) },
    { key: "lines", header: "Planned purchases", align: "right", cell: (r) => fmtNumber(r.lines_count), csv: (r) => r.lines_count },
    { key: "total", header: "Estimated total (RWF)", sortField: "total_estimated", align: "right", sum: "total_estimated", format: "money", cell: (r) => <Num value={r.total_estimated} />, csv: (r) => r.total_estimated },
    { key: "by", header: "Prepared by", className: "max-w-[180px]", cell: (r) => <Person name={r.expand?.created_by?.name} />, csv: (r) => r.expand?.created_by?.name },
    { key: "status", header: "Status", sortField: "status", cell: (r) => <StatusBadge status={r.status} map={PLAN_STATUS} />, csv: (r) => PLAN_STATUS[r.status]?.label },
  ];
  const canCreate = canPerform("manage_procurement_plan");
  const open = (r: any) => navigate(`/dashboard/procurement/plans/${r.id}`);
  return (
    <Page>
      <PageHeader
        breadcrumbs={[{ label: "Procurement", to: "/dashboard/procurement" }, { label: "Procurement plans" }]}
        title="Procurement plans"
        subtitle="Each department's yearly plan of what will be bought, when, how and for how much."
        primary={canCreate ? { label: "New plan", icon: Plus, onClick: () => setCreating(true) } : undefined}
      />
      <RecordTable
        collection="procurement_plans"
        columns={columns}
        views={views}
        activeView={view}
        onViewChange={(v) => setParams(v === "all" ? {} : { view: v })}
        searchFields={["number", "name", "department.name"]}
        searchPlaceholder="Search number, name or department"
        filters={filters}
        expand="department,created_by"
        defaultSort="-fiscal_year,department.name"
        exportName="procurement-plans"
        exportTitle="Procurement plans"
        onRowClick={open}
        rowActions={() => [{ label: "Open", icon: ExternalLink, onSelect: open }]}
        empty={{
          icon: CalendarRange,
          title: "No procurement plan yet",
          text: "No procurement plan yet. Create your department's plan for the coming year and list the planned purchases.",
          action: canCreate ? <Button variant="primary" icon={Plus} onClick={() => setCreating(true)}>New plan</Button> : undefined,
        }}
      />
      {creating && <NewPlanDialog onClose={() => setCreating(false)} />}
    </Page>
  );
}

function NewPlanDialog({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate();
  const me = useMe();
  const years = useFiscalYears();
  const [v, setV] = React.useState({ fiscal_year: 0, department: "", notes: "" });
  React.useEffect(() => {
    const open = (years.data || []).filter((f) => f.status === "open");
    if (!v.fiscal_year && open.length) setV((x) => ({ ...x, fiscal_year: (open.find((f) => f.is_current) || open[0]).year }));
  }, [years.data]); // eslint-disable-line react-hooks/exhaustive-deps
  const depts = useQuery(["departments-simple"], () => pocketbase.collection("departments").getFullList({ sort: "name", fields: "id,name" }));
  React.useEffect(() => {
    if (me.data && !v.department) setV((x) => ({ ...x, department: me.data!.department }));
  }, [me.data]); // eslint-disable-line react-hooks/exhaustive-deps
  const save = useMutation(() => pocketbase.collection("procurement_plans").create(v), {
    onSuccess: (p: any) => {
      toast.success(`${p.number} created; add the planned purchases`);
      navigate(`/dashboard/procurement/plans/${p.id}`);
    },
    onError: (e) => {
      toast.error(errorMessage(e));
    },
  });
  return (
    <Modal
      open
      onClose={onClose}
      title="New procurement plan"
      description="One plan per department and fiscal year. Each planned purchase is charged to a budget line."
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" loading={save.isLoading} disabled={!v.department || !v.fiscal_year} onClick={() => v.department && v.fiscal_year && save.mutate()}>Create plan</Button>
        </>
      }
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Fiscal year" required htmlFor="plan-fy" hint="Only open fiscal years are listed.">
          <Select id="plan-fy" value={v.fiscal_year} onChange={(e) => setV((x) => ({ ...x, fiscal_year: Number(e.target.value) }))}>
            {(years.data || []).filter((f) => f.status === "open").map((f) => <option key={f.id} value={f.year}>{f.name}{f.is_current ? " (current)" : ""}</option>)}
          </Select>
        </Field>
        <Field label="Department" required htmlFor="plan-dept">
          <Select id="plan-dept" value={v.department} onChange={(e) => setV((x) => ({ ...x, department: e.target.value }))}>
            {(depts.data || []).map((d: any) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </Select>
        </Field>
        <Field label="Notes" htmlFor="plan-notes" className="sm:col-span-2">
          <Input id="plan-notes" value={v.notes} onChange={(e) => setV((x) => ({ ...x, notes: e.target.value }))} placeholder="e.g. Based on the department's action plan and budget ceiling" />
        </Field>
      </div>
    </Modal>
  );
}
