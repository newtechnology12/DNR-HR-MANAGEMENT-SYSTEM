import * as React from "react";
import { useQuery, useQueryClient } from "react-query";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { Bell, Building2, CalendarDays, ClipboardList, Lightbulb, Paperclip, User, Users, X } from "lucide-react";
import pocketbase from "@/lib/pocketbase";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import AsyncSelectField from "@/components/AsyncSelectField";
import { errorMessage } from "@/lib/procurement";
import { Attachments, AutoValue, Field, FileDrop, FormPage, FormSection, Segmented, inputCls, showDate, textareaCls, toFormData, toInputDate, toPbDate, useMe } from "@/components/portal/kit";
import { REPORT_TYPES } from "./shared";

const today = () => new Date().toISOString().slice(0, 10);
const TEMPLATE = "• Activity: \n• Result / output: \n• Evidence (attached): ";
const PROMPTS: Record<string, string> = {
  tasksCompleted: "What did you do? Mention activities, results and numbers (e.g. 3 districts visited, 45 participants trained).",
  challengesFaced: "What slowed you down, and what did you do about it?",
  nextSteps: "What will you do next period? Any deadline?",
  additionalComments: "Support you need from your supervisor, or anything else to note.",
};

export default function ReportForm() {
  const { reportId } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const me = useMe();
  const editing = Boolean(reportId);
  const existing = useQuery(["employee-report", reportId], () => pocketbase.collection("employeeReports").getOne(reportId!, { expand: "recipients,employee.department" }), { enabled: editing });

  const [v, setV] = React.useState({
    reportType: "weekly",
    title: "",
    action_plan: params.get("plan") || "",
    reportDate: today(),
    dateHappened: today(),
    tasksCompleted: "",
    challengesFaced: "",
    nextSteps: "",
    additionalComments: "",
  });
  const [readers, setReaders] = React.useState<{ id: string; name: string; auto?: boolean }[]>([]);
  const [files, setFiles] = React.useState<File[]>([]);
  const [tried, setTried] = React.useState(false);
  const [saving, setSaving] = React.useState(false);

  const plans = useQuery(["my-open-plans", me.data?.id], () => pocketbase.collection("actionPlans").getFullList({ filter: `staff_id = "${me.data!.id}" && scope != "department" && status != "cancelled"`, sort: "-start_date" }), { enabled: Boolean(me.data) });
  const head = useQuery(
    ["dept-head", me.data?.department],
    async () => {
      const d: any = await pocketbase.collection("departments").getOne(me.data!.department, { expand: "head" });
      return d.expand?.head && d.head !== me.data!.id ? { id: d.head, name: d.expand.head.name } : null;
    },
    { enabled: Boolean(me.data?.department) && !editing }
  );

  React.useEffect(() => {
    if (!editing && head.data && !readers.length) setReaders([{ ...head.data, auto: true }]);
  }, [head.data, editing]); // eslint-disable-line react-hooks/exhaustive-deps

  React.useEffect(() => {
    const r: any = existing.data;
    if (!r) return;
    setV({
      reportType: r.reportType || "weekly",
      title: r.title || "",
      action_plan: r.action_plan || "",
      reportDate: toInputDate(r.reportDate) || today(),
      dateHappened: toInputDate(r.dateHappened) || today(),
      tasksCompleted: r.tasksCompleted || "",
      challengesFaced: r.challengesFaced || "",
      nextSteps: r.nextSteps || "",
      additionalComments: r.additionalComments || "",
    });
    setReaders((r.expand?.recipients || []).map((u: any) => ({ id: u.id, name: u.name })));
  }, [existing.data]);

  const plan: any = (plans.data || []).find((p: any) => p.id === v.action_plan);
  React.useEffect(() => {
    if (plan && !v.title) setV((x) => ({ ...x, title: `Progress on: ${plan.title}` }));
  }, [plan]); // eslint-disable-line react-hooks/exhaustive-deps

  const set = (k: keyof typeof v) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setV((x) => ({ ...x, [k]: e.target.value }));
  const errors = {
    title: v.title.trim().length < 5 && "Give the report a title (at least 5 characters).",
    tasksCompleted: v.tasksCompleted.trim().length < 20 && "Describe the work you completed (at least 20 characters).",
    dates: v.dateHappened > v.reportDate && "The period covered cannot be after the report date.",
    readers: !readers.length && "Choose at least one person who should read this report.",
  };
  const invalid = Object.values(errors).some(Boolean);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setTried(true);
    if (invalid) {
      toast.error("Please complete the highlighted fields.");
      return;
    }
    setSaving(true);
    const data: Record<string, unknown> = {
      ...v,
      title: v.title.trim(),
      reportDate: toPbDate(v.reportDate),
      dateHappened: toPbDate(v.dateHappened),
      recipients: readers.map((r) => r.id),
    };
    if (!editing) data.employee = me.data!.id;
    try {
      const fd = toFormData(data, { attachments: files });
      const rec = editing ? await pocketbase.collection("employeeReports").update(reportId!, fd) : await pocketbase.collection("employeeReports").create(fd);
      queryClient.invalidateQueries(["reports-mine"]);
      queryClient.invalidateQueries(["employee-report", rec.id]);
      toast.success(editing ? "Report updated" : `Report sent to ${readers.map((r) => r.name).join(", ")}`);
      navigate(`/dashboard/employee-portal/reports/${rec.id}`, { replace: true });
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  if ((editing && existing.isLoading) || me.isLoading) return <div className="mx-auto max-w-5xl space-y-3 p-4"><Skeleton className="h-10 w-64" /><Skeleton className="h-96 w-full" /></div>;

  const textArea = (k: "tasksCompleted" | "challengesFaced" | "nextSteps" | "additionalComments", label: string, required = false, rows = 4) => (
    <Field
      label={label}
      required={required}
      error={tried && k === "tasksCompleted" && errors.tasksCompleted}
      hint={
        <span className="flex items-center justify-between gap-2">
          <span>{PROMPTS[k]}</span>
          <span className="shrink-0 tabular-nums">{v[k].length}</span>
        </span>
      }
    >
      <div className="relative">
        <textarea className={textareaCls} rows={rows} value={v[k]} onChange={set(k)} aria-invalid={Boolean(tried && k === "tasksCompleted" && errors.tasksCompleted)} />
        {!v[k] && k === "tasksCompleted" && (
          <button type="button" onClick={() => setV((x) => ({ ...x, tasksCompleted: TEMPLATE }))} className="absolute bottom-2 right-2 rounded-md bg-slate-100 px-2 py-1 text-[11.5px] font-medium text-slate-600 hover:bg-slate-200">
            Use a template
          </button>
        )}
      </div>
    </Field>
  );

  return (
    <form onSubmit={submit} noValidate>
      <FormPage
        title={editing ? "Edit report" : "Write a work report"}
        description="Tell your supervisor what you achieved. They are notified by e-mail and in the system, and can comment or ask for more information."
        back={editing ? `/dashboard/employee-portal/reports/${reportId}` : "/dashboard/employee-portal?tab=Reports"}
        actions={
          <>
            <Button type="button" variant="outline" className="h-11 sm:h-10" onClick={() => navigate(-1)}>Cancel</Button>
            <Button type="submit" className="h-11 sm:h-10" disabled={saving}>{saving ? "Sending…" : editing ? "Save changes" : "Send report"}</Button>
          </>
        }
        aside={
          <FormSection icon={Lightbulb} title="Tips for a good report">
            <ul className="list-disc space-y-1.5 pl-4 text-[12.5px] text-slate-600">
              <li>Start with results, not only activities.</li>
              <li>Use numbers: districts, participants, documents, amounts.</li>
              <li>Attach evidence — attendance lists, photos, drafts.</li>
              <li>Be honest about delays and say what support you need.</li>
            </ul>
            {plan?.expected_output && (
              <div className="rounded-lg bg-primary/5 px-3 py-2 text-[12.5px] text-slate-700">
                <p className="font-medium text-primaryDark">Expected output of your plan</p>
                {plan.expected_output}
              </div>
            )}
          </FormSection>
        }
      >
        <FormSection icon={User} title="Author" description="Filled in from your profile.">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <AutoValue label="Employee" value={(existing.data as any)?.employeeName || me.data?.name} icon={User} />
            <AutoValue label="Department" value={(existing.data as any)?.department || me.data?.departmentName} icon={Building2} />
          </div>
        </FormSection>

        <FormSection icon={CalendarDays} title="About this report">
          <Field label="Report type">
            <Segmented value={v.reportType} onChange={(t) => setV((x) => ({ ...x, reportType: t }))} options={REPORT_TYPES.slice(0, 3)} ariaLabel="Report type" />
            <div className="mt-1.5 flex gap-1.5">
              {REPORT_TYPES.slice(3).map((t) => (
                <button key={t.value} type="button" onClick={() => setV((x) => ({ ...x, reportType: t.value }))} className={`h-8 rounded-full border px-3 text-[12.5px] ${v.reportType === t.value ? "border-primary bg-primary/5 text-primaryDark" : "border-slate-200 text-slate-600"}`}>{t.label}</button>
              ))}
            </div>
          </Field>
          <Field label="Action plan" hint="Link the report to the plan it is about (optional).">
            <select className={inputCls} value={v.action_plan} onChange={set("action_plan")}>
              <option value="">Not linked to a plan</option>
              {(plans.data || []).map((p: any) => <option key={p.id} value={p.id}>{p.title} ({showDate(p.start_date, "d MMM")} – {showDate(p.end_date, "d MMM")})</option>)}
            </select>
          </Field>
          <Field label="Title" required error={tried && errors.title}>
            <input className={inputCls} value={v.title} onChange={set("title")} placeholder="e.g. Week 38 — councillor training preparation" aria-invalid={Boolean(tried && errors.title)} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Work done on / from" error={tried && errors.dates}>
              <input type="date" className={inputCls} value={v.dateHappened} max={v.reportDate} onChange={set("dateHappened")} />
            </Field>
            <Field label="Report date" required>
              <input type="date" className={inputCls} value={v.reportDate} max={today()} onChange={set("reportDate")} />
            </Field>
          </div>
        </FormSection>

        <FormSection icon={ClipboardList} title="Your report">
          {textArea("tasksCompleted", "Work completed and results", true, 6)}
          {textArea("challengesFaced", "Challenges")}
          {textArea("nextSteps", "Next steps", false, 3)}
          {textArea("additionalComments", "Support needed / other comments", false, 2)}
        </FormSection>

        <FormSection icon={Users} title="Who should read it?" description="Your department head is added automatically. Add others if needed (e.g. project lead).">
          {readers.length > 0 && (
            <ul className="flex flex-wrap gap-2">
              {readers.map((r) => (
                <li key={r.id} className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 py-1 pl-3 pr-1 text-[13px]">
                  {r.name}
                  {r.auto && <span className="text-[11px] text-slate-500">(department head)</span>}
                  <button type="button" onClick={() => setReaders((xs) => xs.filter((x) => x.id !== r.id))} className="rounded-full p-1 text-slate-400 hover:bg-slate-200 hover:text-slate-700" aria-label={`Remove ${r.name}`}><X size={13} /></button>
                </li>
              ))}
            </ul>
          )}
          <Field label="Add a reader" error={tried && errors.readers}>
            <AsyncSelectField
              name="report-reader"
              value=""
              placeholder="Search a colleague by name"
              onChange={(o: any) => o && !readers.some((r) => r.id === o.value) && o.value !== me.data?.id && setReaders((xs) => [...xs, { id: o.value, name: o.label }])}
              loader={({ search }: any) =>
                pocketbase.collection("users").getList(1, 20, { filter: `status = "Active"${search ? ` && name ~ "${String(search).replace(/"/g, "")}"` : ""}`, sort: "name", fields: "id,name" }).then((r) => r.items.filter((u: any) => u.id !== me.data?.id).map((u: any) => ({ label: u.name, value: u.id })))
              }
            />
          </Field>
          <p className="flex items-center gap-1.5 text-[12px] text-slate-500"><Bell size={13} /> Readers get a notification and an e-mail, and can comment, ask for more information or mark the report as reviewed.</p>
        </FormSection>

        <FormSection icon={Paperclip} title="Attachments" description="Evidence: attendance lists, photos, minutes, drafts…">
          {editing && existing.data && ((existing.data as any).attachments || []).length > 0 && <Attachments record={existing.data} names={(existing.data as any).attachments} />}
          <FileDrop files={files} onChange={setFiles} max={10} label={editing ? "Add more files" : "Attach files"} />
        </FormSection>
      </FormPage>
    </form>
  );
}
