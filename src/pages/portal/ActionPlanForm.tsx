import * as React from "react";
import { useQuery, useQueryClient } from "react-query";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { Briefcase, Building2, CalendarRange, Clock, Flag, Paperclip, Plus, Target, Trash2, User } from "lucide-react";
import pocketbase from "@/lib/pocketbase";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { errorMessage } from "@/lib/procurement";
import { cn } from "@/utils";
import {
  Attachments, AutoValue, ChoiceCards, Field, FileDrop, FormPage, FormSection, Segmented, inputCls, showDate, textareaCls, toFormData, toInputDate, toPbDate, useMe,
} from "@/components/portal/kit";
import { HourEntry, PLAN_TYPES, hoursBetween, totalHours } from "./shared";

type Kind = "personal" | "contribution" | "department";
const today = () => new Date().toISOString().slice(0, 10);
const plusDays = (d: string, n: number) => {
  const x = new Date(`${d}T12:00:00`);
  x.setDate(x.getDate() + n);
  return x.toISOString().slice(0, 10);
};
const SPAN: Record<string, number> = { daily: 0, weekly: 4, monthly: 29 };

export default function ActionPlanForm() {
  const { planId } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const me = useMe();
  const editing = Boolean(planId);
  const existing = useQuery(["action-plan", planId], () => pocketbase.collection("actionPlans").getOne(planId!, { expand: "staff_id,department_id" }), { enabled: editing });
  const canDepartment = Boolean(me.data && (me.data.isHead || me.data.hrScope !== "own"));

  const [kind, setKind] = React.useState<Kind>(params.get("parent") ? "contribution" : params.get("scope") === "department" ? "department" : "personal");
  const [v, setV] = React.useState({
    parent_plan: params.get("parent") || "",
    planType: "weekly",
    title: "",
    task_description: "",
    expected_output: "",
    start_date: today(),
    end_date: plusDays(today(), 4),
    deadline: plusDays(today(), 4),
    priority: "medium",
    status: "not_started",
    progress: 0,
    completion_note: "",
  });
  const [hours, setHours] = React.useState<HourEntry[]>([]);
  const [files, setFiles] = React.useState<File[]>([]);
  const [tried, setTried] = React.useState(false);
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    const p: any = existing.data;
    if (!p) return;
    setKind(p.scope === "department" ? "department" : p.parent_plan ? "contribution" : "personal");
    setV({
      parent_plan: p.parent_plan || "",
      planType: p.planType || "weekly",
      title: p.title || "",
      task_description: p.task_description || "",
      expected_output: p.expected_output || "",
      start_date: toInputDate(p.start_date),
      end_date: toInputDate(p.end_date),
      deadline: toInputDate(p.deadline),
      priority: p.priority || "medium",
      status: p.status || "not_started",
      progress: p.progress || 0,
      completion_note: p.completion_note || "",
    });
    setHours(Array.isArray(p.hoursPerDay) ? p.hoursPerDay : []);
  }, [existing.data]);

  const deptId = (existing.data as any)?.department_id || me.data?.department;
  const deptPlans = useQuery(["dept-plans", deptId], () => pocketbase.collection("actionPlans").getFullList({ filter: `scope = "department" && department_id = "${deptId}" && status != "completed" && status != "cancelled"`, sort: "-start_date", expand: "staff_id" }), { enabled: Boolean(deptId) });
  const parent = (deptPlans.data || []).find((p: any) => p.id === v.parent_plan) as any;

  const set = (k: keyof typeof v) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setV((x) => ({ ...x, [k]: e.target.value }));
  const setType = (t: string) =>
    setV((x) => {
      const end = plusDays(x.start_date, SPAN[t] ?? 4);
      return { ...x, planType: t, end_date: end, deadline: x.deadline < end ? end : x.deadline };
    });

  const errors = {
    parent: kind === "contribution" && !v.parent_plan && "Choose the department plan you contribute to.",
    title: v.title.trim().length < 5 && "Give the plan a clear title (at least 5 characters).",
    description: v.task_description.trim().length < 10 && "Describe what you will do (at least 10 characters).",
    end: v.end_date < v.start_date && "The end date must be on or after the start date.",
    deadline: v.deadline && v.deadline < v.start_date && "The deadline cannot be before the start date.",
    hours: hours.some((h) => !h.date || !(hoursBetween(h.startTime, h.endTime) > 0)) && "Each time entry needs a date and an end time after the start time.",
  };
  const invalid = Object.values(errors).some(Boolean);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setTried(true);
    if (invalid) {
      toast.error("Please correct the highlighted fields.");
      return;
    }
    setSaving(true);
    const data: Record<string, unknown> = {
      scope: kind === "department" ? "department" : "personal",
      parent_plan: kind === "contribution" ? v.parent_plan : "",
      planType: v.planType,
      title: v.title.trim(),
      task_description: v.task_description.trim(),
      expected_output: v.expected_output.trim(),
      start_date: toPbDate(v.start_date),
      end_date: toPbDate(v.end_date),
      deadline: toPbDate(v.deadline),
      priority: v.priority,
      status: v.status,
      progress: v.status === "completed" ? 100 : Number(v.progress) || 0,
      completion_note: v.completion_note.trim(),
      hoursPerDay: JSON.stringify(hours.map((h) => ({ ...h, hours: hoursBetween(h.startTime, h.endTime) }))),
    };
    if (!editing) {
      data.staff_id = me.data!.id;
      data.department_id = me.data!.department;
    }
    try {
      const fd = toFormData(data, { files });
      const rec = editing ? await pocketbase.collection("actionPlans").update(planId!, fd) : await pocketbase.collection("actionPlans").create(fd);
      queryClient.invalidateQueries(["action-plans"]);
      queryClient.invalidateQueries(["action-plan", rec.id]);
      toast.success(editing ? "Plan updated" : "Plan created");
      navigate(`/dashboard/employee-portal/plans/${rec.id}`, { replace: true });
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  if ((editing && existing.isLoading) || me.isLoading) return <div className="mx-auto max-w-5xl space-y-3 p-4"><Skeleton className="h-10 w-64" /><Skeleton className="h-96 w-full" /></div>;
  const staffName = (existing.data as any)?.expand?.staff_id?.name || me.data?.name;
  const deptName = (existing.data as any)?.expand?.department_id?.name || me.data?.departmentName;

  return (
    <form onSubmit={submit} noValidate>
      <FormPage
        title={editing ? "Edit action plan" : kind === "department" ? "New department plan" : "New action plan"}
        description={kind === "department" ? "A department plan is visible to everyone in the department; staff link their personal plans to it." : "Plan what you will do, by when, and how you will know it is done."}
        back={editing ? `/dashboard/employee-portal/plans/${planId}` : "/dashboard/employee-portal?tab=Action Plans"}
        actions={
          <>
            <Button type="button" variant="outline" className="h-11 sm:h-10" onClick={() => navigate(-1)}>Cancel</Button>
            <Button type="submit" className="h-11 sm:h-10" disabled={saving}>{saving ? "Saving…" : editing ? "Save changes" : "Create plan"}</Button>
          </>
        }
        aside={
          <FormSection icon={Clock} title="Summary">
            <dl className="space-y-2 text-[13px]">
              <div className="flex justify-between gap-3"><dt className="text-slate-500">Period</dt><dd className="text-right">{showDate(v.start_date, "d MMM")} – {showDate(v.end_date, "d MMM yyyy")}</dd></div>
              <div className="flex justify-between gap-3"><dt className="text-slate-500">Deadline</dt><dd>{showDate(v.deadline)}</dd></div>
              <div className="flex justify-between gap-3"><dt className="text-slate-500">Hours logged</dt><dd className="tabular-nums">{totalHours(hours.map((h) => ({ ...h, hours: hoursBetween(h.startTime, h.endTime) })))} h</dd></div>
              {parent && <div className="border-t border-slate-100 pt-2"><dt className="text-slate-500">Contributes to</dt><dd className="font-medium">{parent.title}</dd></div>}
            </dl>
          </FormSection>
        }
      >
        <FormSection icon={User} title="Who" description="Filled in from your profile.">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <AutoValue label="Staff name" value={staffName} icon={User} />
            <AutoValue label="Department" value={deptName} icon={Building2} />
          </div>
        </FormSection>

        <FormSection icon={Flag} title="What kind of plan?">
          <ChoiceCards<Kind>
            value={kind}
            onChange={setKind}
            columns={canDepartment ? 3 : 2}
            options={[
              { value: "personal" as Kind, label: "My own plan", description: "Work you plan for yourself" },
              { value: "contribution" as Kind, label: "Contribution", description: "Your part of a recorded department plan" },
              ...(canDepartment ? [{ value: "department" as Kind, label: "Department plan", description: "Recorded for the whole department" }] : []),
            ].map((o) => ({ ...o, disabled: editing && (o.value === "department") !== (kind === "department") }))}
          />
          {kind === "contribution" && (
            <Field label="Department plan" required error={tried && errors.parent} hint={!deptPlans.isLoading && !deptPlans.data?.length ? "Your department has no open plan yet — ask your department head to record one." : undefined}>
              <select className={inputCls} value={v.parent_plan} onChange={set("parent_plan")} aria-invalid={Boolean(tried && errors.parent)}>
                <option value="">{deptPlans.isLoading ? "Loading…" : "Choose a plan"}</option>
                {(deptPlans.data || []).map((p: any) => (
                  <option key={p.id} value={p.id}>{p.title} (until {showDate(p.end_date, "d MMM")})</option>
                ))}
              </select>
              {parent && (
                <div className="mt-2 rounded-lg bg-slate-50 px-3 py-2 text-[12.5px] text-slate-600">
                  <p className="font-medium text-slate-800">{parent.title}</p>
                  <p>{parent.task_description}</p>
                  {parent.expected_output && <p className="mt-1"><span className="font-medium">Expected output:</span> {parent.expected_output}</p>}
                </div>
              )}
            </Field>
          )}
        </FormSection>

        <FormSection icon={Target} title="The plan">
          <Field label="Plan type">
            <Segmented value={v.planType} onChange={setType} options={PLAN_TYPES} ariaLabel="Plan type" />
          </Field>
          <Field label="Title" required error={tried && errors.title}>
            <input className={inputCls} value={v.title} onChange={set("title")} placeholder="e.g. Prepare training materials for district councillors" aria-invalid={Boolean(tried && errors.title)} />
          </Field>
          <Field label="What will you do?" required error={tried && errors.description}>
            <textarea className={textareaCls} rows={4} value={v.task_description} onChange={set("task_description")} placeholder="Main tasks and steps" aria-invalid={Boolean(tried && errors.description)} />
          </Field>
          <Field label="Expected output" hint="How will you and your supervisor know it is done?">
            <input className={inputCls} value={v.expected_output} onChange={set("expected_output")} placeholder="e.g. Training slides approved by the head of department" />
          </Field>
        </FormSection>

        <FormSection icon={CalendarRange} title="Timing and priority">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <Field label="Start" required>
              <input type="date" className={inputCls} value={v.start_date} onChange={(e) => setV((x) => ({ ...x, start_date: e.target.value, end_date: x.end_date < e.target.value ? e.target.value : x.end_date }))} />
            </Field>
            <Field label="End" required error={tried && errors.end}>
              <input type="date" className={inputCls} value={v.end_date} min={v.start_date} onChange={set("end_date")} />
            </Field>
            <Field label="Deadline" error={tried && errors.deadline} className="col-span-2 sm:col-span-1">
              <input type="date" className={inputCls} value={v.deadline} min={v.start_date} onChange={set("deadline")} />
            </Field>
          </div>
          <Field label="Priority">
            <Segmented value={v.priority} onChange={(p) => setV((x) => ({ ...x, priority: p }))} options={[{ value: "low", label: "Low" }, { value: "medium", label: "Medium" }, { value: "high", label: "High" }]} ariaLabel="Priority" />
          </Field>
          {editing && (
            <>
              <Field label="Status">
                <Segmented
                  value={v.status}
                  onChange={(s) => setV((x) => ({ ...x, status: s, progress: s === "completed" ? 100 : s === "not_started" ? 0 : x.progress }))}
                  options={[{ value: "not_started", label: "Not started" }, { value: "in_progress", label: "In progress" }, { value: "completed", label: "Done" }]}
                  ariaLabel="Status"
                />
              </Field>
              {v.status === "in_progress" && (
                <Field label={`Progress: ${v.progress}%`}>
                  <input type="range" min={0} max={100} step={5} value={v.progress} onChange={(e) => setV((x) => ({ ...x, progress: Number(e.target.value) }))} className="w-full accent-[#16a34a]" />
                </Field>
              )}
              {v.status === "completed" && (
                <Field label="Completion note" hint="What was delivered?">
                  <textarea className={textareaCls} rows={2} value={v.completion_note} onChange={set("completion_note")} />
                </Field>
              )}
            </>
          )}
        </FormSection>

        {kind !== "department" && (
          <FormSection icon={Briefcase} title="Time spent" description="Record the hours you worked on this plan.">
            {hours.length > 0 && (
              <ul className="space-y-2">
                {hours.map((h, i) => {
                  const up = (k: keyof HourEntry, val: string) => setHours((xs) => xs.map((x, j) => (j === i ? { ...x, [k]: val } : x)));
                  const hrs = hoursBetween(h.startTime, h.endTime);
                  return (
                    <li key={i} className="grid grid-cols-[1fr_auto] gap-2 rounded-lg border border-slate-200 p-2.5 sm:grid-cols-[1.2fr_1fr_1fr_1.6fr_auto] sm:items-end">
                      <Field label="Date" className="col-span-2 sm:col-span-1"><input type="date" className={inputCls} value={h.date} min={v.start_date} max={today()} onChange={(e) => up("date", e.target.value)} /></Field>
                      <div className="col-span-2 grid grid-cols-2 gap-2 sm:col-span-2">
                        <Field label="From"><input type="time" className={inputCls} value={h.startTime} onChange={(e) => up("startTime", e.target.value)} /></Field>
                        <Field label="To"><input type="time" className={inputCls} value={h.endTime} onChange={(e) => up("endTime", e.target.value)} /></Field>
                      </div>
                      <Field label="Note"><input className={inputCls} value={h.note || ""} onChange={(e) => up("note", e.target.value)} placeholder="Optional" /></Field>
                      <div className="flex items-center gap-1 self-end">
                        <span className={cn("w-14 text-right text-[13px] font-semibold tabular-nums", hrs ? "text-slate-900" : "text-red-600")}>{hrs} h</span>
                        <button type="button" onClick={() => setHours((xs) => xs.filter((_, j) => j !== i))} className="rounded-md p-2 text-slate-400 hover:bg-slate-100 hover:text-red-600" aria-label="Remove time entry"><Trash2 size={16} /></button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
            {tried && errors.hours && <p className="text-[12px] text-red-600">{errors.hours}</p>}
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Button type="button" variant="outline" className="h-10" onClick={() => setHours((xs) => [...xs, { date: today() < v.start_date ? v.start_date : today(), startTime: "08:00", endTime: "12:00", hours: 4 }])}>
                <Plus size={15} /> Add time
              </Button>
              <span className="text-[13px] text-slate-600">Total: <span className="font-semibold tabular-nums text-slate-900">{totalHours(hours.map((h) => ({ ...h, hours: hoursBetween(h.startTime, h.endTime) })))} h</span></span>
            </div>
          </FormSection>
        )}

        <FormSection icon={Paperclip} title="Documents" description="Terms of reference, drafts, evidence…">
          {editing && existing.data && ((existing.data as any).files || []).length > 0 && <Attachments record={existing.data} names={(existing.data as any).files} />}
          <FileDrop files={files} onChange={setFiles} max={10} label={editing ? "Add more files" : "Attach files"} />
        </FormSection>
      </FormPage>
    </form>
  );
}
