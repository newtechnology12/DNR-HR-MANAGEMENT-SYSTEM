import * as React from "react";
import { useQuery } from "react-query";
import { useNavigate } from "react-router-dom";
import { ExternalLink, Layers, Plus } from "lucide-react";
import pocketbase from "@/lib/pocketbase";
import { StatusBadge } from "@/components/enterprise/ui";
import { Progress, useMe } from "@/components/portal/kit";
import { Button, Card, Column, DataTable, EmptyState, FilterBar, FilterSelect, KpiBand, Num, Person, Priority, Tabs, TwoLine, fmtDate, overdue } from "@/components/ims";
import { PLAN_STATUS, isOverdue, totalHours } from "./shared";

type View = "mine" | "department" | "team";

export default function ActionPlansTab({ employeeId }: { employeeId: string }) {
  const navigate = useNavigate();
  const me = useMe();
  const employee = useQuery(["plan-employee", employeeId], () => pocketbase.collection("users").getOne(employeeId, { fields: "id,name,department" }));
  const isSelf = me.data?.id === employeeId;
  const manages = isSelf && me.data && (me.data.isHead || me.data.hrScope !== "own");
  const [view, setView] = React.useState<View>("mine");
  const [status, setStatus] = React.useState("open");
  const [search, setSearch] = React.useState("");
  const dept = (employee.data as any)?.department;

  const filter =
    view === "mine" ? `staff_id = "${employeeId}" && scope != "department"`
    : view === "department" ? `scope = "department" && department_id = "${dept}"`
    : `scope != "department" && department_id = "${dept}" && staff_id != "${employeeId}"`;
  const q = useQuery(["action-plans", employeeId, view, dept], () => pocketbase.collection("actionPlans").getFullList({ filter, sort: "-start_date", expand: "staff_id,parent_plan" }), { enabled: Boolean(dept) || view === "mine" });

  const rows = (q.data || []) as any[];
  const stats = {
    open: rows.filter((p) => !["completed", "cancelled"].includes(p.status)).length,
    overdue: rows.filter(isOverdue).length,
    completed: rows.filter((p) => p.status === "completed").length,
    hours: totalHours(rows.flatMap((p) => p.hoursPerDay || [])),
  };
  const shown = rows.filter((p) => {
    const s = status === "all" || (status === "open" ? !["completed", "cancelled"].includes(p.status) : status === "overdue" ? isOverdue(p) : p.status === status);
    return s && `${p.title} ${p.task_description} ${p.expand?.staff_id?.name || ""} ${p.expand?.parent_plan?.title || ""}`.toLowerCase().includes(search.trim().toLowerCase());
  });
  const open = (p: any) => navigate(`/dashboard/employee-portal/plans/${p.id}`);
  const create = () => navigate(`/dashboard/employee-portal/plans/new${view === "department" ? "?scope=department" : ""}`);

  const columns: Column<any>[] = [
    {
      key: "plan",
      header: "Plan",
      className: "min-w-[240px] max-w-[320px]",
      cell: (p) => <TwoLine main={p.title} sub={p.expand?.parent_plan ? `Contributes to ${p.expand.parent_plan.title}` : p.task_description} />,
    },
    ...(view !== "mine" ? [{ key: "staff", header: view === "department" ? "Recorded by" : "Staff", className: "min-w-[140px]", cell: (p: any) => <Person name={p.expand?.staff_id?.name} /> }] : []),
    { key: "type", header: "Type", nowrap: true, cell: (p) => (p.planType ? p.planType[0].toUpperCase() + p.planType.slice(1) : "—") },
    { key: "period", header: "Period", nowrap: true, cell: (p) => `${fmtDate(p.start_date).replace(/ \d{4}$/, "")} – ${fmtDate(p.end_date)}` },
    {
      key: "deadline",
      header: "Deadline",
      nowrap: true,
      cell: (p) => fmtDate(p.deadline),
      sub: (p) => (isOverdue(p) ? <span className="font-semibold text-ims-danger">{overdue(p.deadline) || "Overdue"}</span> : null),
    },
    { key: "priority", header: "Priority", nowrap: true, cell: (p) => <Priority value={p.priority} /> },
    { key: "status", header: "Status", nowrap: true, cell: (p) => <StatusBadge status={p.status} map={PLAN_STATUS} /> },
    { key: "progress", header: "Progress", className: "w-40", cell: (p) => <Progress value={p.progress || (p.status === "completed" ? 100 : 0)} /> },
    { key: "hours", header: "Hours", numeric: true, cell: (p) => (totalHours(p.hoursPerDay) ? <Num value={totalHours(p.hoursPerDay)} decimals /> : <span className="text-ims-faint">—</span>) },
  ];

  return (
    <div className="flex flex-col gap-4">
      <KpiBand
        loading={q.isLoading}
        items={[
          { label: "Open", value: stats.open },
          { label: "Overdue", value: stats.overdue, tone: stats.overdue ? "danger" : "default" },
          { label: "Completed", value: stats.completed, tone: "success" },
          { label: "Hours logged", value: stats.hours },
        ]}
      />

      <Card padded={false} className="overflow-hidden">
        <Tabs
          inset
          label="Action plans"
          active={view}
          onChange={(k) => setView(k as View)}
          tabs={[
            { key: "mine", label: isSelf ? "My plans" : "Personal plans" },
            { key: "department", label: "Department plans" },
            ...(manages ? [{ key: "team", label: "My team" }] : []),
          ]}
        />
        <FilterBar
          search={{ value: search, onChange: setSearch, placeholder: "Search plans or staff" }}
          right={isSelf && <Button variant="primary" icon={Plus} onClick={create}>{view === "department" && manages ? "New department plan" : "New plan"}</Button>}
        >
          <FilterSelect
            label="Show"
            all={false}
            value={status}
            onChange={setStatus}
            options={[
              { value: "open", label: "Open" },
              { value: "overdue", label: "Overdue" },
              { value: "completed", label: "Completed" },
              { value: "all", label: "All plans" },
            ]}
          />
        </FilterBar>
        {view === "department" && !manages && (
          <p className="mx-4 mb-3 rounded-control bg-ims-thead px-3 py-2 text-t-small text-ims-body sm:mx-5">
            Department plans are recorded by your department head. Open one and choose <b>Contribute to this plan</b> to create your personal plan under it.
          </p>
        )}
        <DataTable
          columns={columns}
          rows={shown}
          rowKey={(p) => p.id}
          onRowClick={open}
          loading={q.isLoading}
          error={q.isError ? q.error : undefined}
          onRetry={() => q.refetch()}
          minWidth={940}
          caption="Action plans"
          rowActions={(p) => [{ label: "Open", icon: ExternalLink, onSelect: () => open(p) }]}
          empty={
            <EmptyState
              compact
              icon={Layers}
              text={rows.length ? "No plan matches. Change the filter or the search." : view === "mine" ? "No plans here. Create a personal plan or contribute to one of your department's plans." : "Nothing has been recorded yet."}
            />
          }
        />
      </Card>
    </div>
  );
}
