/**
 * New or edited action plan (employee portal): personal, a contribution to a department plan, or — for
 * heads of department — a department plan; with its dates, priority, time spent and documents.
 */
import * as React from "react";
import { useQuery, useQueryClient } from "react-query";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";
import pocketbase from "@/lib/pocketbase";
import { Skeleton } from "@/components/ui/skeleton";
import { errorMessage } from "@/lib/procurement";
import { cn } from "@/utils";
import { Attachments, ChoiceCards, FileDrop, Segmented, toFormData, toInputDate, toPbDate, useMe } from "@/components/portal/kit";
import {
  Button,
  DatePicker,
  Details,
  ErrorSummary,
  Field,
  FormActions,
  FormBody,
  FormError,
  FormSection,
  Input,
  Page,
  PageHeader,
  Select,
  SummaryPanel,
  Textarea,
  fmtDate,
} from "@/components/ims";
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
      toast.error("Correct the fields shown in red, then save again.");
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
      toast.success(editing ? `${rec.title || "Plan"} updated` : `${rec.title || "Plan"} created`);
      navigate(`/dashboard/employee-portal/plans/${rec.id}`, { replace: true });
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  if ((editing && existing.isLoading) || me.isLoading) {
    return (
      <Page narrow>
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-96 w-full" />
      </Page>
    );
  }
  const staffName = (existing.data as any)?.expand?.staff_id?.name || me.data?.name;
  const deptName = (existing.data as any)?.expand?.department_id?.name || me.data?.departmentName;
  const title = editing ? "Edit action plan" : kind === "department" ? "New department plan" : "New action plan";
  const back = editing ? `/dashboard/employee-portal/plans/${planId}` : "/dashboard/employee-portal?tab=Action Plans";
  const logged = totalHours(hours.map((h) => ({ ...h, hours: hoursBetween(h.startTime, h.endTime) })));
  const summaryErrors: FormError[] = [
    ...(errors.parent ? [{ field: "ap-parent", message: errors.parent }] : []),
    ...(errors.title ? [{ field: "ap-title", message: errors.title }] : []),
    ...(errors.description ? [{ field: "ap-description", message: errors.description }] : []),
    ...(errors.end ? [{ field: "ap-end", message: errors.end }] : []),
    ...(errors.deadline ? [{ field: "ap-deadline", message: errors.deadline }] : []),
    ...(errors.hours ? [{ field: "ap-hours-0-date", message: errors.hours }] : []),
  ];

  return (
    <Page narrow>
      <PageHeader
        breadcrumbs={[
          { label: "My workspace", to: "/dashboard/my" },
          { label: "My plans & reports", to: "/dashboard/my/plans?tab=department" },
          ...(editing ? [{ label: (existing.data as any)?.title || "Action plan", to: back }] : []),
          { label: editing ? "Edit" : title },
        ]}
        title={title}
        subtitle={kind === "department" ? "Everyone in the department sees a department plan; staff link their personal plans to it." : "Plan what you will do, by when, and how you will know it is done."}
      />

      <ErrorSummary errors={tried ? summaryErrors : []} title="Check these fields before you save" />

      <form onSubmit={submit} noValidate className="flex flex-col gap-4">
        <FormBody
          aside={
            <SummaryPanel
              rows={[
                ["Period", `${fmtDate(v.start_date).replace(/ \d{4}$/, "")} – ${fmtDate(v.end_date)}`],
                ["Deadline", fmtDate(v.deadline)],
                ["Hours logged", `${logged} h`],
                ...(parent ? [["Contributes to", parent.title] as [string, React.ReactNode]] : []),
              ]}
              checklist={[
                ...(kind === "contribution" ? [{ label: "Department plan chosen", done: !errors.parent }] : []),
                { label: "Title", done: !errors.title },
                { label: "What you will do", done: !errors.description },
                { label: "Dates in order", done: !errors.end && !errors.deadline },
                ...(hours.length ? [{ label: "Time entries complete", done: !errors.hours }] : []),
              ]}
            />
          }
        >
          <FormSection title="Who" description="Filled in from your profile.">
            <div className="rounded-control bg-ims-subtle px-4 py-3">
              <Details columns={2} items={[{ label: "Staff name", value: staffName }, { label: "Department", value: deptName }]} />
            </div>
          </FormSection>

          <FormSection title="What kind of plan?">
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
              <Field
                label="Department plan"
                required
                htmlFor="ap-parent"
                error={tried && errors.parent}
                hint={!deptPlans.isLoading && !deptPlans.data?.length ? "Your department has no open plan yet. Ask your department head to record one." : undefined}
              >
                <Select id="ap-parent" value={v.parent_plan} onChange={set("parent_plan")} invalid={Boolean(tried && errors.parent)}>
                  <option value="">{deptPlans.isLoading ? "Loading…" : "Choose a plan"}</option>
                  {(deptPlans.data || []).map((p: any) => (
                    <option key={p.id} value={p.id}>{p.title} (until {fmtDate(p.end_date).replace(/ \d{4}$/, "")})</option>
                  ))}
                </Select>
                {parent && (
                  <div className="mt-2 rounded-control bg-ims-subtle px-3 py-2 text-t-small text-ims-body">
                    <p className="font-semibold text-ims-text">{parent.title}</p>
                    <p>{parent.task_description}</p>
                    {parent.expected_output && <p className="mt-1"><span className="font-semibold">Expected output:</span> {parent.expected_output}</p>}
                  </div>
                )}
              </Field>
            )}
          </FormSection>

          <FormSection title="The plan">
            <Field label="Plan type">
              <Segmented value={v.planType} onChange={setType} options={PLAN_TYPES} ariaLabel="Plan type" />
            </Field>
            <Field label="Title" required htmlFor="ap-title" error={tried && errors.title}>
              <Input id="ap-title" value={v.title} onChange={set("title")} placeholder="e.g. Prepare training materials for district councillors" invalid={Boolean(tried && errors.title)} />
            </Field>
            <Field label="What will you do?" required htmlFor="ap-description" error={tried && errors.description} hint="Main tasks and steps.">
              <Textarea id="ap-description" rows={4} value={v.task_description} onChange={set("task_description")} invalid={Boolean(tried && errors.description)} />
            </Field>
            <Field label="Expected output" htmlFor="ap-output" hint="How will you and your supervisor know it is done?">
              <Input id="ap-output" value={v.expected_output} onChange={set("expected_output")} placeholder="e.g. Training slides approved by the head of department" />
            </Field>
          </FormSection>

          <FormSection title="Timing and priority">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <Field label="Start" required htmlFor="ap-start">
                <DatePicker id="ap-start" value={v.start_date} onChange={(d) => setV((x) => ({ ...x, start_date: d, end_date: x.end_date < d ? d : x.end_date }))} />
              </Field>
              <Field label="End" required htmlFor="ap-end" error={tried && errors.end}>
                <DatePicker id="ap-end" value={v.end_date} min={v.start_date} invalid={Boolean(tried && errors.end)} onChange={(d) => setV((x) => ({ ...x, end_date: d }))} />
              </Field>
              <Field label="Deadline" htmlFor="ap-deadline" error={tried && errors.deadline}>
                <DatePicker id="ap-deadline" value={v.deadline} min={v.start_date} invalid={Boolean(tried && errors.deadline)} onChange={(d) => setV((x) => ({ ...x, deadline: d }))} />
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
                    options={[{ value: "not_started", label: "Not started" }, { value: "in_progress", label: "In progress" }, { value: "completed", label: "Completed" }]}
                    ariaLabel="Status"
                  />
                </Field>
                {v.status === "in_progress" && (
                  <Field label={`Progress: ${v.progress}%`} htmlFor="ap-progress">
                    <input id="ap-progress" type="range" min={0} max={100} step={5} value={v.progress} onChange={(e) => setV((x) => ({ ...x, progress: Number(e.target.value) }))} className="w-full accent-ims-primary" />
                  </Field>
                )}
                {v.status === "completed" && (
                  <Field label="Completion note" htmlFor="ap-note" hint="What was delivered?">
                    <Textarea id="ap-note" rows={2} className="min-h-[72px]" value={v.completion_note} onChange={set("completion_note")} />
                  </Field>
                )}
              </>
            )}
          </FormSection>

          {kind !== "department" && (
            <FormSection title="Time spent" description="Record the hours you worked on this plan.">
              {hours.length > 0 && (
                <ul className="divide-y divide-ims-divider rounded-control border border-ims-border">
                  {hours.map((h, i) => {
                    const up = (k: keyof HourEntry, val: string) => setHours((xs) => xs.map((x, j) => (j === i ? { ...x, [k]: val } : x)));
                    const hrs = hoursBetween(h.startTime, h.endTime);
                    return (
                      <li key={i} className="grid grid-cols-2 gap-3 px-3 py-3 sm:grid-cols-[1.3fr_0.9fr_0.9fr_1.5fr_auto] sm:items-end sm:px-4">
                        <Field label="Date" htmlFor={`ap-hours-${i}-date`} className="col-span-2 sm:col-span-1">
                          <DatePicker id={`ap-hours-${i}-date`} value={h.date} min={v.start_date} max={today()} invalid={Boolean(tried && !h.date)} onChange={(d) => up("date", d)} />
                        </Field>
                        <Field label="From" htmlFor={`ap-hours-${i}-from`}>
                          <Input id={`ap-hours-${i}-from`} type="time" value={h.startTime} onChange={(e) => up("startTime", e.target.value)} />
                        </Field>
                        <Field label="To" htmlFor={`ap-hours-${i}-to`}>
                          <Input id={`ap-hours-${i}-to`} type="time" value={h.endTime} invalid={Boolean(tried && !(hrs > 0))} onChange={(e) => up("endTime", e.target.value)} />
                        </Field>
                        <Field label="Note" htmlFor={`ap-hours-${i}-note`} className="col-span-2 sm:col-span-1">
                          <Input id={`ap-hours-${i}-note`} value={h.note || ""} onChange={(e) => up("note", e.target.value)} placeholder="Optional" />
                        </Field>
                        <div className="col-span-2 flex items-center justify-end gap-1 sm:col-span-1 sm:h-control">
                          <span className={cn("w-14 text-right text-t-body font-semibold tabular-nums", hrs ? "text-ims-text" : "text-ims-danger")}>{hrs} h</span>
                          <Button size="icon-sm" variant="ghost" icon={Trash2} aria-label={`Remove time entry ${i + 1}`} className="hover:bg-ims-danger-bg hover:text-ims-danger" onClick={() => setHours((xs) => xs.filter((_, j) => j !== i))} />
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
              {tried && errors.hours && <p className="text-t-hint text-ims-danger" role="alert">{errors.hours}</p>}
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Button icon={Plus} onClick={() => setHours((xs) => [...xs, { date: today() < v.start_date ? v.start_date : today(), startTime: "08:00", endTime: "12:00", hours: 4 }])}>Add time</Button>
                <span className="text-t-body text-ims-body">Total <b className="tabular-nums text-ims-text">{logged} h</b></span>
              </div>
            </FormSection>
          )}

          <FormSection title="Documents" description="Terms of reference, drafts, evidence.">
            {editing && existing.data && ((existing.data as any).files || []).length > 0 && <Attachments record={existing.data} names={(existing.data as any).files} />}
            <FileDrop files={files} onChange={setFiles} max={10} label={editing ? "Add more files" : "Attach files"} />
          </FormSection>
        </FormBody>

        <FormActions submitType="submit" submitLabel={editing ? "Save changes" : "Create plan"} onCancel={() => navigate(-1)} busy={saving ? "submit" : null} note={editing ? undefined : "The plan is saved when you create it; you can edit it later."} />
      </form>
    </Page>
  );
}
