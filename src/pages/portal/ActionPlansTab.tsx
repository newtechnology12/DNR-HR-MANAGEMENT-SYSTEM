import * as React from "react";
import { useQuery } from "react-query";
import { useNavigate } from "react-router-dom";
import { CalendarClock, Clock, Flag, Layers, ListTodo, Plus, Target } from "lucide-react";
import pocketbase from "@/lib/pocketbase";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge, StatusBadge } from "@/components/enterprise/ui";
import { cn } from "@/utils";
import { Chip, ListToolbar, Progress, showDate, useMe } from "@/components/portal/kit";
import { PLAN_PRIORITY, PLAN_STATUS, isOverdue, totalHours } from "./shared";

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

  return (
    <div className="space-y-4">
      <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1">
        <Chip active={view === "mine"} onClick={() => setView("mine")}>{isSelf ? "My plans" : "Personal plans"}</Chip>
        <Chip active={view === "department"} onClick={() => setView("department")}>Department plans</Chip>
        {manages && <Chip active={view === "team"} onClick={() => setView("team")}>My team</Chip>}
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {[
          { icon: ListTodo, label: "Open", value: stats.open },
          { icon: CalendarClock, label: "Overdue", value: stats.overdue, tone: stats.overdue ? "text-red-600" : "" },
          { icon: Target, label: "Completed", value: stats.completed, tone: "text-emerald-700" },
          { icon: Clock, label: "Hours logged", value: stats.hours },
        ].map((s) => (
          <div key={s.label} className="flex items-center gap-2.5 rounded-xl border border-slate-200 bg-white px-3 py-2.5">
            <s.icon size={17} className="shrink-0 text-slate-400" />
            <div>
              <p className={cn("text-[17px] font-semibold leading-tight tabular-nums text-slate-900", s.tone)}>{q.isLoading ? "…" : s.value}</p>
              <p className="text-[11.5px] text-slate-500">{s.label}</p>
            </div>
          </div>
        ))}
      </div>

      <ListToolbar
        search={search}
        onSearch={setSearch}
        placeholder="Search plans"
        filters={[
          ["open", "Open"],
          ["overdue", "Overdue"],
          ["completed", "Completed"],
          ["all", "All"],
        ].map(([k, l]) => <Chip key={k} active={status === k} onClick={() => setStatus(k)}>{l}</Chip>)}
        action={
          isSelf && (
            <Button className="h-10" onClick={() => navigate(`/dashboard/employee-portal/plans/new${view === "department" ? "?scope=department" : ""}`)}>
              <Plus size={16} /> {view === "department" && manages ? "New department plan" : "New plan"}
            </Button>
          )
        }
      />

      {view === "department" && !manages && (
        <p className="rounded-lg bg-slate-50 px-3 py-2 text-[12.5px] text-slate-600">
          Department plans are recorded by your department head. Open one and choose <span className="font-medium">“Contribute to this plan”</span> to create your personal plan under it.
        </p>
      )}

      {q.isLoading ? (
        <div className="space-y-2">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-16 rounded-xl" />)}</div>
      ) : !shown.length ? (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-slate-200 px-4 py-10 text-center">
          <Layers size={26} className="text-slate-400" />
          <p className="text-[14px] font-medium text-slate-800">No plans here</p>
          <p className="max-w-sm text-[12.5px] text-slate-500">{rows.length ? "Change the filter to see other plans." : view === "mine" ? "Create a personal plan or contribute to one of your department's plans." : "Nothing has been recorded yet."}</p>
        </div>
      ) : (
        <>
          {/* Phones: cards */}
          <ul className="space-y-2 md:hidden">
            {shown.map((p) => (
              <li key={p.id}>
                <button type="button" onClick={() => open(p)} className="w-full rounded-xl border border-slate-200 bg-white p-3.5 text-left shadow-card active:bg-slate-50">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-[14px] font-semibold leading-snug text-slate-900">{p.title}</p>
                    <StatusBadge status={p.status} map={PLAN_STATUS} />
                  </div>
                  {p.expand?.parent_plan && <p className="mt-0.5 flex items-center gap-1 text-[12px] text-slate-500"><Flag size={11} /> {p.expand.parent_plan.title}</p>}
                  {view !== "mine" && <p className="mt-0.5 text-[12px] text-slate-500">{p.expand?.staff_id?.name}</p>}
                  <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-slate-600">
                    <span>{showDate(p.start_date, "d MMM")} – {showDate(p.end_date, "d MMM")}</span>
                    <span className={cn(isOverdue(p) && "font-medium text-red-600")}>Due {showDate(p.deadline, "d MMM")}{isOverdue(p) && " · overdue"}</span>
                    <Badge tone={PLAN_PRIORITY[p.priority]?.tone}>{PLAN_PRIORITY[p.priority]?.label || p.priority}</Badge>
                  </div>
                  <Progress value={p.progress || (p.status === "completed" ? 100 : 0)} className="mt-2.5" />
                </button>
              </li>
            ))}
          </ul>
          {/* Tablets and desktop: table */}
          <div className="hidden overflow-x-auto rounded-xl border border-slate-200 bg-white md:block">
            <table className="dnr-grid w-full min-w-[860px] text-[13px]">
              <thead>
                <tr className="bg-slate-50 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                  <th className="px-3 py-2.5">Plan</th>
                  {view !== "mine" && <th className="px-3 py-2.5">{view === "department" ? "Recorded by" : "Staff"}</th>}
                  <th className="px-3 py-2.5">Type</th>
                  <th className="px-3 py-2.5">Period</th>
                  <th className="px-3 py-2.5">Deadline</th>
                  <th className="px-3 py-2.5">Priority</th>
                  <th className="px-3 py-2.5">Status</th>
                  <th className="w-40 px-3 py-2.5">Progress</th>
                  <th className="px-3 py-2.5 text-right">Hours</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {shown.map((p) => (
                  <tr key={p.id} onClick={() => open(p)} className="cursor-pointer hover:bg-slate-50">
                    <td className="max-w-[300px] px-3 py-2.5">
                      <p className="truncate font-medium text-slate-900">{p.title}</p>
                      <p className="truncate text-[12px] text-slate-500">{p.expand?.parent_plan ? <>↳ {p.expand.parent_plan.title}</> : p.task_description}</p>
                    </td>
                    {view !== "mine" && <td className="whitespace-nowrap px-3 py-2.5">{p.expand?.staff_id?.name}</td>}
                    <td className="px-3 py-2.5 capitalize text-slate-600">{p.planType}</td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-slate-600">{showDate(p.start_date, "d MMM")} – {showDate(p.end_date, "d MMM yyyy")}</td>
                    <td className={cn("whitespace-nowrap px-3 py-2.5", isOverdue(p) ? "font-medium text-red-600" : "text-slate-600")}>{showDate(p.deadline)}{isOverdue(p) && " · late"}</td>
                    <td className="px-3 py-2.5"><Badge tone={PLAN_PRIORITY[p.priority]?.tone}>{PLAN_PRIORITY[p.priority]?.label || p.priority}</Badge></td>
                    <td className="px-3 py-2.5"><StatusBadge status={p.status} map={PLAN_STATUS} /></td>
                    <td className="px-3 py-2.5"><Progress value={p.progress || (p.status === "completed" ? 100 : 0)} /></td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{totalHours(p.hoursPerDay) || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
