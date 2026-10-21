import * as React from "react";
import { useMutation, useQuery } from "react-query";
import { useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { CalendarRange, ClipboardList, Plus } from "lucide-react";
import pocketbase from "@/lib/pocketbase";
import { useRoles } from "@/context/roles.context";
import { Button } from "@/components/ui/button";
import RecordTable, { RecordColumn, RecordView } from "@/components/enterprise/RecordTable";
import { PageHeader, StatusBadge } from "@/components/enterprise/ui";
import { PLAN_STATUS, errorMessage, money } from "@/lib/procurement";
import { Field, FormBlock, FormDialog, inputCls, useMe } from "@/components/portal/kit";

export default function Plans() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const { canPerform } = useRoles();
  const [creating, setCreating] = React.useState(false);
  const view = params.get("view") || "all";
  const y = new Date().getFullYear();
  const views: RecordView[] = [
    { key: "all", label: "All plans" },
    { key: "next", label: `${y + 1}`, filter: `fiscal_year = ${y + 1}` },
    { key: "current", label: `${y}`, filter: `fiscal_year = ${y}` },
    { key: "approval", label: "In approval", filter: `status = "pending_approval"` },
    { key: "approved", label: "Approved", filter: `status = "approved"` },
  ];
  const columns: RecordColumn<any>[] = [
    { key: "number", header: "Plan", sortField: "number", cell: (r) => <span className="whitespace-nowrap font-medium">{r.number}</span> },
    { key: "name", header: "Name", className: "max-w-[320px]", cell: (r) => <span className="line-clamp-1">{r.name}</span>, csv: (r) => r.name },
    { key: "year", header: "Year", sortField: "fiscal_year", cell: (r) => r.fiscal_year, csv: (r) => r.fiscal_year },
    { key: "department", header: "Department", cell: (r) => <span className="whitespace-nowrap">{r.expand?.department?.name}</span>, csv: (r) => r.expand?.department?.name },
    { key: "lines", header: "Planned purchases", align: "right", cell: (r) => <span className="tabular-nums">{r.lines_count}</span>, csv: (r) => r.lines_count },
    { key: "total", header: "Estimated total", sortField: "total_estimated", align: "right", cell: (r) => <span className="whitespace-nowrap font-medium tabular-nums">{money(r.total_estimated)}</span>, csv: (r) => r.total_estimated },
    { key: "by", header: "Prepared by", cell: (r) => <span className="whitespace-nowrap text-slate-600">{r.expand?.created_by?.name}</span>, csv: (r) => r.expand?.created_by?.name },
    { key: "status", header: "Status", sortField: "status", cell: (r) => <StatusBadge status={r.status} map={PLAN_STATUS} />, csv: (r) => PLAN_STATUS[r.status]?.label },
  ];
  return (
    <div className="space-y-4 px-4 py-4 sm:px-6">
      <PageHeader
        title="Procurement plans"
        description="Each department's annual procurement plan: what will be bought, when, how and for how much. Requisitions are raised against approved plan lines."
        breadcrumbs={[{ title: "Procurement", link: "/dashboard/procurement" }, { title: "Plans", link: "/dashboard/procurement/plans" }]}
        actions={canPerform("manage_procurement_plan") && <Button size="sm" onClick={() => setCreating(true)}><Plus size={14} /> New plan</Button>}
      />
      <RecordTable
        collection="procurement_plans"
        columns={columns}
        views={views}
        activeView={view}
        onViewChange={(v) => setParams(v === "all" ? {} : { view: v })}
        searchFields={["number", "name", "department.name"]}
        expand="department,created_by"
        defaultSort="-fiscal_year,department.name"
        exportName="procurement-plans"
        onRowClick={(r) => navigate(`/dashboard/procurement/plans/${r.id}`)}
        empty={{ icon: CalendarRange, title: "No procurement plan yet", text: "Create your department's plan for the coming year and list the planned purchases." }}
      />
      {creating && <NewPlanDialog onClose={() => setCreating(false)} />}
    </div>
  );
}

function NewPlanDialog({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate();
  const me = useMe();
  const y = new Date().getFullYear();
  const [v, setV] = React.useState({ fiscal_year: y + 1, department: "", notes: "" });
  const depts = useQuery(["departments-simple"], () => pocketbase.collection("departments").getFullList({ sort: "name", fields: "id,name" }));
  React.useEffect(() => {
    if (me.data && !v.department) setV((x) => ({ ...x, department: me.data!.department }));
  }, [me.data]); // eslint-disable-line react-hooks/exhaustive-deps
  const save = useMutation(() => pocketbase.collection("procurement_plans").create(v), {
    onSuccess: (p: any) => {
      toast.success(`${p.number} created — add the planned purchases`);
      navigate(`/dashboard/procurement/plans/${p.id}`);
    },
    onError: (e) => {
      toast.error(errorMessage(e));
    },
  });
  return (
    <FormDialog open onClose={onClose} icon={CalendarRange} title="New procurement plan" description="One plan per department and year." submitLabel="Create plan" busy={save.isLoading} onSubmit={() => v.department && save.mutate()}>
      <FormBlock icon={ClipboardList} title="Plan">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Fiscal year" required>
            <select className={inputCls} value={v.fiscal_year} onChange={(e) => setV((x) => ({ ...x, fiscal_year: Number(e.target.value) }))}>{[y, y + 1, y + 2].map((n) => <option key={n}>{n}</option>)}</select>
          </Field>
          <Field label="Department" required>
            <select className={inputCls} value={v.department} onChange={(e) => setV((x) => ({ ...x, department: e.target.value }))}>{(depts.data || []).map((d: any) => <option key={d.id} value={d.id}>{d.name}</option>)}</select>
          </Field>
          <Field label="Notes" className="sm:col-span-2"><input className={inputCls} value={v.notes} onChange={(e) => setV((x) => ({ ...x, notes: e.target.value }))} placeholder="e.g. Based on the department's action plan and budget ceiling" /></Field>
        </div>
      </FormBlock>
    </FormDialog>
  );
}
