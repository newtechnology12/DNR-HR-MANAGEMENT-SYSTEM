import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "react-query";
import { Link, useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import { ArrowLeft, CheckCircle2, Clock, FilePlus2, Flag, Pencil, Printer, Users } from "lucide-react";
import pocketbase from "@/lib/pocketbase";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge, EmptyState, StatusBadge } from "@/components/enterprise/ui";
import { errorMessage } from "@/lib/procurement";
import { cn } from "@/utils";
import { Attachments, Field, Progress, showDate, textareaCls, useMe } from "@/components/portal/kit";
import { PLAN_PRIORITY, PLAN_STATUS, REPORT_STATUS, isOverdue, reportTypeLabel, totalHours } from "./shared";

export default function ActionPlanDetail() {
  const { planId } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const me = useMe();
  const [completing, setCompleting] = React.useState(false);

  const q = useQuery(["action-plan", planId], async () => {
    const plan: any = await pocketbase.collection("actionPlans").getOne(planId!, { expand: "staff_id,department_id,parent_plan,created_by" });
    const [children, reports] = await Promise.all([
      plan.scope === "department" ? pocketbase.collection("actionPlans").getFullList({ filter: `parent_plan = "${plan.id}"`, sort: "staff_id.name", expand: "staff_id" }) : Promise.resolve([]),
      pocketbase.collection("employeeReports").getFullList({ filter: `action_plan = "${plan.id}"`, sort: "-reportDate", expand: "employee" }),
    ]);
    return { plan, children, reports };
  });
  const refresh = () => {
    queryClient.invalidateQueries(["action-plan", planId]);
    queryClient.invalidateQueries(["action-plans"]);
  };
  const quick = useMutation((data: Record<string, unknown>) => pocketbase.collection("actionPlans").update(planId!, data), {
    onSuccess: () => {
      toast.success("Plan updated");
      refresh();
    },
    onError: (e) => {
      toast.error(errorMessage(e));
    },
  });

  if (q.isLoading) return <div className="mx-auto max-w-5xl space-y-3 p-4"><Skeleton className="h-10 w-72" /><Skeleton className="h-80 w-full" /></div>;
  if (!q.data) return <div className="p-4"><EmptyState icon={Flag} title="Plan not available" text="It may have been removed, or it belongs to someone else." /></div>;
  const { plan: p, children, reports } = q.data;
  const isDept = p.scope === "department";
  const isOwner = me.data?.id === p.staff_id || me.data?.id === p.created_by;
  const canEdit = isOwner || me.data?.hrScope === "all";
  const inDept = me.data?.department === p.department_id;
  const hours = Array.isArray(p.hoursPerDay) ? p.hoursPerDay : [];
  const progress = isDept && children.length ? Math.round(children.reduce((a: number, c: any) => a + (c.status === "completed" ? 100 : c.progress || 0), 0) / children.length) : p.status === "completed" ? 100 : p.progress || 0;

  return (
    <div className="mx-auto w-full max-w-5xl px-3 pb-10 pt-3 sm:px-6 sm:pt-5">
      <button type="button" onClick={() => navigate("/dashboard/employee-portal?tab=Action Plans")} className="mb-2 inline-flex items-center gap-1.5 text-[13px] font-medium text-slate-600 hover:text-slate-900 print:hidden">
        <ArrowLeft size={15} /> Action plans
      </button>

      <div className="rounded-xl border border-slate-200 bg-white shadow-card">
        <header className="border-b border-slate-100 p-4 sm:p-6">
          <p className="text-[12px] font-medium uppercase tracking-wider text-slate-500">{isDept ? "Department plan" : p.parent_plan ? "Contribution to a department plan" : "Personal plan"} · {p.planType}</p>
          <h1 className="mt-1 text-[20px] font-semibold leading-tight tracking-tight text-slate-900 sm:text-[24px]">{p.title}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <StatusBadge status={p.status} map={PLAN_STATUS} />
            <Badge tone={PLAN_PRIORITY[p.priority]?.tone}>{PLAN_PRIORITY[p.priority]?.label || p.priority} priority</Badge>
            {isOverdue(p) && <Badge tone="danger">Overdue</Badge>}
          </div>
          <div className="mt-4 flex flex-wrap gap-2 print:hidden">
            {isOwner && !isDept && p.status !== "completed" && <Button className="h-10" onClick={() => setCompleting(true)}><CheckCircle2 size={16} /> Mark as done</Button>}
            {isOwner && !isDept && p.status === "not_started" && <Button variant="outline" className="h-10" onClick={() => quick.mutate({ status: "in_progress", progress: 10 })}>Start working</Button>}
            {isDept && inDept && !isOwner && <Button className="h-10" onClick={() => navigate(`/dashboard/employee-portal/plans/new?parent=${p.id}`)}><Flag size={16} /> Contribute to this plan</Button>}
            {me.data?.id === p.staff_id && !isDept && <Button variant="outline" className="h-10" onClick={() => navigate(`/dashboard/employee-portal/reports/new?plan=${p.id}`)}><FilePlus2 size={16} /> Write a report</Button>}
            {canEdit && <Button variant="outline" className="h-10" onClick={() => navigate(`/dashboard/employee-portal/plans/${p.id}/edit`)}><Pencil size={15} /> Edit</Button>}
            <Button variant="ghost" className="h-10" onClick={() => window.print()}><Printer size={15} /> Print</Button>
          </div>
        </header>

        <div className="grid grid-cols-2 gap-px bg-slate-100 sm:grid-cols-4">
          {[
            ["Staff", p.expand?.staff_id?.name],
            ["Department", p.expand?.department_id?.name],
            ["Period", `${showDate(p.start_date, "d MMM")} – ${showDate(p.end_date, "d MMM yyyy")}`],
            ["Deadline", showDate(p.deadline)],
          ].map(([k, val]) => (
            <div key={k} className="bg-white px-4 py-3">
              <p className="text-[11.5px] text-slate-500">{k}</p>
              <p className="truncate text-[13.5px] font-medium text-slate-900">{val || "—"}</p>
            </div>
          ))}
        </div>

        <div className="space-y-6 p-4 sm:p-6">
          <section>
            <div className="mb-1.5 flex items-center justify-between text-[13px]">
              <span className="font-semibold text-slate-900">Progress{isDept && children.length ? " (average of contributions)" : ""}</span>
            </div>
            <Progress value={progress} />
            {isOwner && !isDept && p.status === "in_progress" && (
              <div className="mt-2 flex flex-wrap gap-1.5 print:hidden">
                {[25, 50, 75].map((n) => (
                  <button key={n} type="button" onClick={() => quick.mutate({ progress: n })} className={cn("h-8 rounded-full border px-3 text-[12.5px]", p.progress === n ? "border-primary bg-primary/5 text-primaryDark" : "border-slate-200 text-slate-600 hover:border-slate-300")}>{n}%</button>
                ))}
              </div>
            )}
          </section>

          {p.expand?.parent_plan && (
            <section className="rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-3 text-[13px]">
              <p className="text-[11.5px] font-medium uppercase tracking-wider text-slate-500">Contributes to</p>
              <Link to={`/dashboard/employee-portal/plans/${p.parent_plan}`} className="font-medium text-primaryDark hover:underline">{p.expand.parent_plan.title}</Link>
            </section>
          )}

          <section className="grid grid-cols-1 gap-5 md:grid-cols-2">
            <div>
              <h2 className="mb-1 text-[13px] font-semibold text-slate-900">What will be done</h2>
              <p className="whitespace-pre-line text-[13.5px] leading-relaxed text-slate-700">{p.task_description || "—"}</p>
            </div>
            <div>
              <h2 className="mb-1 text-[13px] font-semibold text-slate-900">Expected output</h2>
              <p className="text-[13.5px] leading-relaxed text-slate-700">{p.expected_output || "—"}</p>
              {p.completion_note && (
                <>
                  <h2 className="mb-1 mt-3 text-[13px] font-semibold text-slate-900">Delivered</h2>
                  <p className="text-[13.5px] leading-relaxed text-slate-700">{p.completion_note}</p>
                </>
              )}
            </div>
          </section>

          {isDept && (
            <section>
              <h2 className="mb-2 flex items-center gap-2 text-[13px] font-semibold text-slate-900"><Users size={15} className="text-slate-400" /> Staff contributions ({children.length})</h2>
              {!children.length ? (
                <p className="text-[13px] text-slate-500">No one has linked a personal plan yet.</p>
              ) : (
                <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
                  {children.map((c: any) => (
                    <li key={c.id}>
                      <Link to={`/dashboard/employee-portal/plans/${c.id}`} className="grid grid-cols-1 gap-1 px-3 py-2.5 hover:bg-slate-50 sm:grid-cols-[1fr_140px_160px] sm:items-center sm:gap-3">
                        <span className="min-w-0">
                          <span className="block truncate text-[13.5px] font-medium text-slate-900">{c.title}</span>
                          <span className="text-[12px] text-slate-500">{c.expand?.staff_id?.name} · due {showDate(c.deadline, "d MMM")}</span>
                        </span>
                        <StatusBadge status={c.status} map={PLAN_STATUS} />
                        <Progress value={c.status === "completed" ? 100 : c.progress || 0} />
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}

          {!isDept && (
            <section>
              <h2 className="mb-2 flex items-center gap-2 text-[13px] font-semibold text-slate-900"><Clock size={15} className="text-slate-400" /> Time spent · {totalHours(hours)} h</h2>
              {!hours.length ? (
                <p className="text-[13px] text-slate-500">No time recorded yet.</p>
              ) : (
                <div className="overflow-x-auto rounded-lg border border-slate-200">
                  <table className="dnr-grid w-full min-w-[420px] text-[13px]">
                    <thead><tr className="bg-slate-50 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500"><th className="px-3 py-2">Date</th><th className="px-3 py-2">From – to</th><th className="px-3 py-2">Note</th><th className="px-3 py-2 text-right">Hours</th></tr></thead>
                    <tbody className="divide-y divide-slate-100">
                      {hours.map((h: any, i: number) => (
                        <tr key={i}><td className="whitespace-nowrap px-3 py-2">{showDate(h.date, "EEE d MMM")}</td><td className="whitespace-nowrap px-3 py-2 tabular-nums">{h.startTime} – {h.endTime}</td><td className="px-3 py-2 text-slate-600">{h.note || "—"}</td><td className="px-3 py-2 text-right tabular-nums">{h.hours}</td></tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          )}

          <section>
            <h2 className="mb-2 text-[13px] font-semibold text-slate-900">Documents</h2>
            <Attachments record={p} names={p.files || []} empty="No documents attached." />
          </section>

          <section>
            <h2 className="mb-2 text-[13px] font-semibold text-slate-900">Reports on this plan ({reports.length})</h2>
            {!reports.length ? (
              <p className="text-[13px] text-slate-500">No report yet.</p>
            ) : (
              <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
                {reports.map((r: any) => (
                  <li key={r.id}>
                    <Link to={`/dashboard/employee-portal/reports/${r.id}`} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5 hover:bg-slate-50">
                      <span className="min-w-0">
                        <span className="block truncate text-[13.5px] font-medium text-slate-900">{r.title || `${reportTypeLabel(r.reportType)} report`}</span>
                        <span className="text-[12px] text-slate-500">{r.expand?.employee?.name || r.employeeName} · {showDate(r.reportDate)}</span>
                      </span>
                      <StatusBadge status={r.status} map={REPORT_STATUS} />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
          <p className="text-[11.5px] text-slate-400">Recorded by {p.expand?.created_by?.name || "—"} on {showDate(p.created, "d MMM yyyy, HH:mm")} · last updated {showDate(p.updated, "d MMM yyyy, HH:mm")}</p>
        </div>
      </div>

      <CompleteDialog open={completing} onClose={() => setCompleting(false)} onConfirm={(note) => quick.mutateAsync({ status: "completed", progress: 100, completion_note: note }).then(() => setCompleting(false))} />
    </div>
  );
}

function CompleteDialog({ open, onClose, onConfirm }: { open: boolean; onClose: () => void; onConfirm: (note: string) => Promise<unknown> }) {
  const [note, setNote] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md bg-white">
        <DialogHeader>
          <DialogTitle>Mark the plan as done</DialogTitle>
          <DialogDescription>Say briefly what was delivered. You can then write a report for your supervisor.</DialogDescription>
        </DialogHeader>
        <Field label="What was delivered?">
          <textarea className={textareaCls} rows={3} value={note} onChange={(e) => setNote(e.target.value)} autoFocus />
        </Field>
        <DialogFooter className="flex-row gap-2">
          <Button variant="outline" className="flex-1 sm:flex-none" onClick={onClose}>Cancel</Button>
          <Button className="flex-1 sm:flex-none" disabled={busy} onClick={() => { setBusy(true); onConfirm(note).finally(() => setBusy(false)); }}>Mark as done</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
