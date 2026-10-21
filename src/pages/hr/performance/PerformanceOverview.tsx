import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "react-query";
import { useNavigate } from "react-router-dom";
import * as XLSX from "xlsx";
import { toast } from "sonner";
import { Award, ClipboardCheck, Download, LayoutTemplate, Plus, Rocket } from "lucide-react";
import pocketbase from "@/lib/pocketbase";
import { useRoles } from "@/context/roles.context";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge, MetricGroup, PageHeader, StatusBadge } from "@/components/enterprise/ui";
import { errorMessage } from "@/lib/procurement";
import { APPRAISAL_STATUS, GRADE_TONE, appraisalApi } from "@/lib/hr";
import { Chip, Field, inputCls, showDate, toPbDate, useMe } from "@/components/portal/kit";
import { cn } from "@/utils";

const GRADE_COLORS: Record<string, string> = { A: "bg-emerald-600", B: "bg-emerald-400", C: "bg-sky-500", D: "bg-amber-500", E: "bg-red-500" };

export default function PerformanceOverview() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const me = useMe();
  const { canPerform } = useRoles();
  const canManage = canPerform("manage_appraisals");
  const [cycleId, setCycleId] = React.useState("");
  const [view, setView] = React.useState<"mine" | "all">("all");
  const [status, setStatus] = React.useState("");
  const [department, setDepartment] = React.useState("");
  const [search, setSearch] = React.useState("");
  const [creating, setCreating] = React.useState(false);

  const cycles = useQuery(["appraisal-cycles"], () => pocketbase.collection("appraisal_cycles").getFullList({ sort: "-period_start", expand: "template" }));
  React.useEffect(() => {
    if (!cycleId && cycles.data?.length) setCycleId((cycles.data.find((c: any) => c.status === "open") || cycles.data[0]).id);
  }, [cycles.data, cycleId]);
  const cycle: any = (cycles.data || []).find((c: any) => c.id === cycleId);
  const q = useQuery(["appraisals", cycleId], () => pocketbase.collection("appraisals").getFullList({ filter: `cycle = "${cycleId}"`, sort: "department.name,employee.name", expand: "employee,department,evaluators" }), { enabled: Boolean(cycleId) });
  const myReviews = useQuery(["my-reviews", cycleId, me.data?.id], () => pocketbase.collection("appraisal_reviews").getFullList({ filter: `evaluator = "${me.data!.id}" && appraisal.cycle = "${cycleId}"`, fields: "appraisal,status" }), { enabled: Boolean(cycleId && me.data) });
  const launch = useMutation(() => appraisalApi.launch(cycleId), {
    onSuccess: (r) => {
      toast.success(`${r.created} appraisal${r.created === 1 ? "" : "s"} created; evaluators have been notified`);
      queryClient.invalidateQueries(["appraisal-cycles"]);
      queryClient.invalidateQueries(["appraisals"]);
    },
    onError: (e) => {
      toast.error(errorMessage(e));
    },
  });

  const all = (q.data || []) as any[];
  const submittedByMe = new Set((myReviews.data || []).filter((r: any) => r.status === "submitted").map((r: any) => r.appraisal));
  const toDo = all.filter((a) => (a.evaluators || []).includes(me.data?.id) && !submittedByMe.has(a.id) && !["shared", "acknowledged", "finalized"].includes(a.status));
  const rows = (view === "mine" ? toDo : all).filter(
    (a) => (!status || a.status === status) && (!department || a.department === department) && `${a.expand?.employee?.name} ${a.expand?.department?.name}`.toLowerCase().includes(search.trim().toLowerCase())
  );
  const scored = all.filter((a) => a.final_score > 0);
  const avg = scored.length ? Math.round((scored.reduce((s, a) => s + a.final_score, 0) / scored.length) * 10) / 10 : 0;
  const grades = ["A", "B", "C", "D", "E"].map((g) => ({ g, n: scored.filter((a) => a.grade === g).length }));
  const departments = Array.from(new Map(all.map((a) => [a.department, a.expand?.department?.name])).entries());
  const bands = cycle?.expand?.template?.grade_bands || [];

  function exportExcel() {
    const data = [["Employee", "Department", "Evaluators", "Activity score", "Evaluator score", "Self-assessment", "Final score", "Grade", "Status"], ...all.map((a) => [a.expand?.employee?.name, a.expand?.department?.name, (a.expand?.evaluators || []).map((u: any) => u.name).join(", "), a.activity_score, a.evaluator_score || "", a.self_score || "", a.final_score || "", a.grade ? `${a.grade} — ${a.grade_label}` : "", APPRAISAL_STATUS[a.status]?.label])];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(data), "Appraisals");
    XLSX.writeFile(wb, `${cycle?.name || "appraisals"}.xlsx`);
  }

  return (
    <div className="space-y-4 px-4 py-4 sm:px-6">
      <PageHeader
        title="Performance appraisals"
        description="Each department evaluates its staff; the system adds an activity score from action plans and reports and calculates the grade. Staff see their results and can comment or raise a claim."
        breadcrumbs={[{ title: "HR", link: "/dashboard/hr/employees" }, { title: "Performance", link: "/dashboard/hr/performance" }]}
        actions={
          <>
            {canManage && <Button size="sm" variant="outline" onClick={() => navigate("/dashboard/hr/performance/templates")}><LayoutTemplate size={14} /> Templates</Button>}
            <Button size="sm" variant="outline" onClick={exportExcel} disabled={!all.length}><Download size={14} /> Export</Button>
            {canManage && <Button size="sm" onClick={() => setCreating(true)}><Plus size={14} /> New cycle</Button>}
          </>
        }
      />

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <select className={cn(inputCls, "sm:w-80")} value={cycleId} onChange={(e) => setCycleId(e.target.value)} aria-label="Appraisal cycle">
          {(cycles.data || []).map((c: any) => <option key={c.id} value={c.id}>{c.name} ({c.status})</option>)}
        </select>
        {cycle && <span className="text-[12.5px] text-slate-500">{showDate(cycle.period_start)} – {showDate(cycle.period_end)} · due {showDate(cycle.due_date)} · template “{cycle.expand?.template?.name}”</span>}
        {cycle?.status === "draft" && canManage && <Button size="sm" className="sm:ml-auto" disabled={launch.isLoading} onClick={() => launch.mutate()}><Rocket size={14} /> Launch cycle</Button>}
      </div>

      {!cycles.isLoading && !cycles.data?.length ? (
        <div className="rounded-xl border border-dashed border-slate-200 px-4 py-10 text-center text-[13px] text-slate-500">No appraisal cycle yet.{canManage && " Create one with “New cycle”."}</div>
      ) : (
        <>
          <div className="grid gap-3 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
            <MetricGroup
              title={cycle?.name || "Cycle"}
              icon={Award}
              columns={4}
              loading={q.isLoading}
              metrics={[
                { label: "Staff", value: all.length },
                { label: "Evaluated", value: `${all.filter((a) => a.evaluator_score > 0).length}`, sub: `${Math.round((all.filter((a) => a.evaluator_score > 0).length / Math.max(1, all.length)) * 100)}% done` },
                { label: "Average score", value: avg || "—", sub: scored.length ? `${scored.length} scored` : "" },
                { label: "Open claims", value: all.filter((a) => a.status === "disputed").length, tone: all.some((a) => a.status === "disputed") ? "warning" : "default" },
              ]}
            />
            <div className="rounded-lg border border-slate-200 bg-white p-3.5 shadow-card">
              <p className="text-[11.5px] font-semibold uppercase tracking-wider text-slate-500">Grade distribution</p>
              <div className="mt-2 flex h-4 overflow-hidden rounded-full bg-slate-100" role="img" aria-label={grades.map((g) => `${g.g}: ${g.n}`).join(", ")}>
                {grades.filter((g) => g.n).map((g) => <div key={g.g} className={cn(GRADE_COLORS[g.g], "border-r-2 border-white last:border-r-0")} style={{ width: `${(g.n / Math.max(1, scored.length)) * 100}%` }} title={`${g.g}: ${g.n}`} />)}
              </div>
              <div className="mt-2 grid grid-cols-5 gap-1 text-center text-[11.5px]">
                {grades.map((g) => (
                  <div key={g.g}>
                    <span className={cn("mx-auto mb-0.5 block h-2 w-2 rounded-full", GRADE_COLORS[g.g])} />
                    <span className="font-semibold text-slate-900">{g.g}</span> <span className="tabular-nums text-slate-600">{g.n}</span>
                    <span className="block truncate text-[10.5px] text-slate-500">{bands.find((b: any) => b.grade === g.g)?.label}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
            <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1">
              <Chip active={view === "all"} onClick={() => setView("all")} count={all.length}>All staff</Chip>
              <Chip active={view === "mine"} onClick={() => setView("mine")} count={toDo.length}>To evaluate by me</Chip>
            </div>
            <select className={cn(inputCls, "lg:ml-auto lg:w-56")} value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status">
              <option value="">All statuses</option>
              {Object.entries(APPRAISAL_STATUS).map(([k, s]) => <option key={k} value={k}>{s.label}</option>)}
            </select>
            <select className={cn(inputCls, "lg:w-64")} value={department} onChange={(e) => setDepartment(e.target.value)} aria-label="Department">
              <option value="">All departments</option>
              {departments.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
            </select>
            <input type="search" className={cn(inputCls, "lg:w-56")} placeholder="Search staff" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>

          {q.isLoading ? <Skeleton className="h-80 w-full" /> : (
            <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white shadow-card">
              <table className="dnr-grid w-full min-w-[1080px] text-[13px]">
                <thead><tr className="bg-slate-50 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                  <th className="px-3 py-2">Staff</th><th className="px-3 py-2">Evaluators</th><th className="px-3 py-2 text-right" title="From action plans and reports">Activity</th><th className="px-3 py-2 text-right">Evaluators</th><th className="px-3 py-2 text-right">Self</th><th className="w-44 px-3 py-2">Final score</th><th className="px-3 py-2">Grade</th><th className="px-3 py-2">Status</th><th className="px-3 py-2" />
                </tr></thead>
                <tbody className="divide-y divide-slate-100">
                  {rows.map((a) => {
                    const mine = (a.evaluators || []).includes(me.data?.id) && !submittedByMe.has(a.id) && !["shared", "acknowledged", "finalized"].includes(a.status);
                    return (
                      <tr key={a.id} className="cursor-pointer hover:bg-slate-50" onClick={() => navigate(`/dashboard/hr/performance/appraisals/${a.id}`)}>
                        <td className="px-3 py-2"><p className="font-medium text-slate-900">{a.expand?.employee?.name}</p><p className="text-[12px] text-slate-500">{a.expand?.department?.name}</p></td>
                        <td className="max-w-[200px] truncate px-3 py-2 text-[12.5px] text-slate-600">{(a.expand?.evaluators || []).map((u: any) => u.name).join(", ") || <span className="text-amber-700">None — HR evaluates</span>}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-slate-600">{a.activity_score ?? "—"}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{a.evaluator_score || "—"}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-slate-500">{a.self_score || "—"}</td>
                        <td className="px-3 py-2">
                          {a.final_score > 0 ? (
                            <div className="flex items-center gap-2">
                              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100"><div className={cn("h-full rounded-full", GRADE_COLORS[a.grade] || "bg-slate-400")} style={{ width: `${a.final_score}%` }} /></div>
                              <span className="w-10 text-right font-semibold tabular-nums">{a.final_score}</span>
                            </div>
                          ) : <span className="text-slate-400">—</span>}
                        </td>
                        <td className="px-3 py-2">{a.grade ? <Badge tone={GRADE_TONE[a.grade]}>{a.grade} · {a.grade_label}</Badge> : "—"}</td>
                        <td className="px-3 py-2"><StatusBadge status={a.status} map={APPRAISAL_STATUS} /></td>
                        <td className="px-3 py-2 text-right">{mine && <span className="inline-flex items-center gap-1 rounded-md bg-primary px-2 py-1 text-[12px] font-medium text-white"><ClipboardCheck size={13} /> Evaluate</span>}</td>
                      </tr>
                    );
                  })}
                  {!rows.length && <tr><td colSpan={9} className="px-3 py-8 text-center text-slate-500">{view === "mine" ? "Nothing waiting for your evaluation." : "No appraisal matches."}</td></tr>}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
      {creating && <NewCycleDialog onClose={() => setCreating(false)} onCreated={(id) => { setCreating(false); setCycleId(id); }} />}
    </div>
  );
}

function NewCycleDialog({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string) => void }) {
  const queryClient = useQueryClient();
  const y = new Date().getFullYear();
  const [v, setV] = React.useState({ name: `Annual performance review ${y}`, template: "", period_start: `${y}-01-01`, period_end: `${y}-12-31`, due_date: `${y}-12-20`, departments: [] as string[] });
  const templates = useQuery(["appraisal-templates"], () => pocketbase.collection("appraisal_templates").getFullList({ filter: "active = true", sort: "name" }));
  const depts = useQuery(["departments-simple"], () => pocketbase.collection("departments").getFullList({ sort: "name", fields: "id,name" }));
  React.useEffect(() => {
    if (!v.template && templates.data?.[0]) setV((x) => ({ ...x, template: templates.data![0].id }));
  }, [templates.data, v.template]);
  const save = useMutation(() => pocketbase.collection("appraisal_cycles").create({ ...v, period_start: toPbDate(v.period_start), period_end: toPbDate(v.period_end), due_date: toPbDate(v.due_date), status: "draft" }), {
    onSuccess: (c: any) => {
      toast.success("Cycle created — review it, then launch it to create the appraisals");
      queryClient.invalidateQueries(["appraisal-cycles"]);
      onCreated(c.id);
    },
    onError: (e) => {
      toast.error(errorMessage(e));
    },
  });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[92vh] max-w-xl overflow-y-auto bg-white">
        <DialogHeader><DialogTitle>New appraisal cycle</DialogTitle><DialogDescription>Launching the cycle creates one appraisal per employee and notifies the evaluators.</DialogDescription></DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Name" required className="col-span-2"><input className={inputCls} value={v.name} onChange={(e) => setV((x) => ({ ...x, name: e.target.value }))} /></Field>
          <Field label="Template" required className="col-span-2"><select className={inputCls} value={v.template} onChange={(e) => setV((x) => ({ ...x, template: e.target.value }))}>{(templates.data || []).map((t: any) => <option key={t.id} value={t.id}>{t.name}</option>)}</select></Field>
          <Field label="Period from" required><input type="date" className={inputCls} value={v.period_start} onChange={(e) => setV((x) => ({ ...x, period_start: e.target.value }))} /></Field>
          <Field label="Period to" required><input type="date" className={inputCls} value={v.period_end} onChange={(e) => setV((x) => ({ ...x, period_end: e.target.value }))} /></Field>
          <Field label="Evaluations due" className="col-span-2"><input type="date" className={inputCls} value={v.due_date} onChange={(e) => setV((x) => ({ ...x, due_date: e.target.value }))} /></Field>
          <div className="col-span-2">
            <p className="mb-1.5 text-[13px] font-medium text-slate-700">Departments <span className="font-normal text-slate-500">(none selected = all)</span></p>
            <div className="grid max-h-44 grid-cols-1 gap-1 overflow-y-auto rounded-lg border border-slate-200 p-2 sm:grid-cols-2">
              {(depts.data || []).map((d: any) => (
                <label key={d.id} className="flex items-center gap-2 text-[13px]"><input type="checkbox" checked={v.departments.includes(d.id)} onChange={(e) => setV((x) => ({ ...x, departments: e.target.checked ? [...x.departments, d.id] : x.departments.filter((i) => i !== d.id) }))} /> {d.name}</label>
              ))}
            </div>
          </div>
        </div>
        <DialogFooter><Button variant="outline" onClick={onClose}>Cancel</Button><Button disabled={!v.name.trim() || !v.template || save.isLoading} onClick={() => save.mutate()}>Create cycle</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
