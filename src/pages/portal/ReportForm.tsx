/**
 * Write or edit a work report (daily, weekly, monthly, mission or activity): what was done, challenges,
 * next steps, who should read it (the department head is added automatically) and the evidence.
 */
import * as React from "react";
import { useQuery, useQueryClient } from "react-query";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { Bell, X } from "lucide-react";
import pocketbase from "@/lib/pocketbase";
import { Skeleton } from "@/components/ui/skeleton";
import AsyncSelectField from "@/components/AsyncSelectField";
import { errorMessage } from "@/lib/procurement";
import { Attachments, FileDrop, toFormData, toInputDate, toPbDate, useMe } from "@/components/portal/kit";
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
      toast.error("Complete the fields shown in red, then send again.");
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
      toast.success(editing ? `${v.title.trim()} updated` : `Report sent to ${readers.map((r) => r.name).join(", ")}`);
      navigate(`/dashboard/employee-portal/reports/${rec.id}`, { replace: true });
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

  const textArea = (k: "tasksCompleted" | "challengesFaced" | "nextSteps" | "additionalComments", label: string, required = false, rows = 4) => {
    const bad = Boolean(tried && k === "tasksCompleted" && errors.tasksCompleted);
    return (
      <Field
        label={label}
        required={required}
        htmlFor={`rf-${k}`}
        error={tried && k === "tasksCompleted" && errors.tasksCompleted}
        hint={
          <span className="flex items-center justify-between gap-2">
            <span>{PROMPTS[k]}</span>
            <span className="shrink-0 tabular-nums">{v[k].length}</span>
          </span>
        }
      >
        <div className="relative">
          <Textarea id={`rf-${k}`} rows={rows} className={rows < 4 ? "min-h-[72px]" : undefined} value={v[k]} onChange={set(k)} invalid={bad} />
          {!v[k] && k === "tasksCompleted" && (
            <Button size="sm" className="absolute bottom-2 right-2" onClick={() => setV((x) => ({ ...x, tasksCompleted: TEMPLATE }))}>
              Use a template
            </Button>
          )}
        </div>
      </Field>
    );
  };

  const title = editing ? "Edit report" : "Write a work report";
  const back = editing ? `/dashboard/employee-portal/reports/${reportId}` : "/dashboard/employee-portal?tab=Reports";
  const summaryErrors: FormError[] = [
    ...(errors.title ? [{ field: "rf-title", message: errors.title }] : []),
    ...(errors.dates ? [{ field: "rf-from", message: errors.dates }] : []),
    ...(errors.tasksCompleted ? [{ field: "rf-tasksCompleted", message: errors.tasksCompleted }] : []),
    ...(errors.readers ? [{ field: "rf-readers", message: errors.readers }] : []),
  ];

  return (
    <Page narrow>
      <PageHeader
        breadcrumbs={[
          { label: "My workspace", to: "/dashboard/my" },
          { label: "My plans & reports", to: "/dashboard/my/plans?tab=reports" },
          ...(editing ? [{ label: v.title || "Report", to: back }] : []),
          { label: editing ? "Edit" : title },
        ]}
        title={title}
        subtitle="Tell your supervisor what you achieved. Readers are notified by e-mail and in the system, and can comment or ask for more information."
      />

      <ErrorSummary errors={tried ? summaryErrors : []} title="Check these fields before you send" />

      <form onSubmit={submit} noValidate className="flex flex-col gap-4">
        <FormBody
          aside={
            <SummaryPanel
              title="Before you send"
              checklist={[
                { label: "A clear title", done: !errors.title },
                { label: "Work completed, with results", done: !errors.tasksCompleted },
                { label: "Dates in order", done: !errors.dates },
                { label: "At least one reader", done: !errors.readers },
              ]}
            >
              <ul className="mt-4 list-disc space-y-1.5 border-t border-ims-divider pl-4 pt-4 text-t-small text-ims-body">
                <li>Start with results, not only activities.</li>
                <li>Use numbers: districts, participants, documents, amounts.</li>
                <li>Attach evidence: attendance lists, photos, drafts.</li>
                <li>Be honest about delays and say what support you need.</li>
              </ul>
              {plan?.expected_output && (
                <div className="mt-3 rounded-control bg-ims-info-bg px-3 py-2 text-t-small text-ims-body">
                  <p className="font-semibold text-ims-info">Expected output of your plan</p>
                  {plan.expected_output}
                </div>
              )}
            </SummaryPanel>
          }
        >
          <FormSection title="Author" description="Filled in from your profile.">
            <div className="rounded-control bg-ims-subtle px-4 py-3">
              <Details
                columns={2}
                items={[
                  { label: "Employee", value: (existing.data as any)?.employeeName || me.data?.name },
                  { label: "Department", value: (existing.data as any)?.department || me.data?.departmentName },
                ]}
              />
            </div>
          </FormSection>

          <FormSection title="About this report">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Report type" htmlFor="rf-type">
                <Select id="rf-type" value={v.reportType} onChange={set("reportType")}>
                  {REPORT_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                </Select>
              </Field>
              <Field label="Action plan" htmlFor="rf-plan" hint="Link the report to the plan it is about (optional).">
                <Select id="rf-plan" value={v.action_plan} onChange={set("action_plan")}>
                  <option value="">Not linked to a plan</option>
                  {(plans.data || []).map((p: any) => <option key={p.id} value={p.id}>{p.title} ({fmtDate(p.start_date).replace(/ \d{4}$/, "")} – {fmtDate(p.end_date).replace(/ \d{4}$/, "")})</option>)}
                </Select>
              </Field>
              <Field label="Title" required htmlFor="rf-title" error={tried && errors.title} className="sm:col-span-2">
                <Input id="rf-title" value={v.title} onChange={set("title")} placeholder="e.g. Week 38 — councillor training preparation" invalid={Boolean(tried && errors.title)} />
              </Field>
              <Field label="Work done on / from" htmlFor="rf-from" error={tried && errors.dates}>
                <DatePicker id="rf-from" value={v.dateHappened} max={v.reportDate} invalid={Boolean(tried && errors.dates)} onChange={(d) => setV((x) => ({ ...x, dateHappened: d }))} />
              </Field>
              <Field label="Report date" required htmlFor="rf-date">
                <DatePicker id="rf-date" value={v.reportDate} max={today()} onChange={(d) => setV((x) => ({ ...x, reportDate: d }))} />
              </Field>
            </div>
          </FormSection>

          <FormSection title="Your report">
            {textArea("tasksCompleted", "Work completed and results", true, 6)}
            {textArea("challengesFaced", "Challenges")}
            {textArea("nextSteps", "Next steps", false, 3)}
            {textArea("additionalComments", "Support needed / other comments", false, 2)}
          </FormSection>

          <FormSection title="Who should read it?" description="Your department head is added automatically. Add others if needed (e.g. the project lead).">
            {readers.length > 0 && (
              <ul className="flex flex-wrap gap-2" aria-label="Readers">
                {readers.map((r) => (
                  <li key={r.id} className="inline-flex items-center gap-1.5 rounded-pill border border-ims-border bg-ims-thead py-1 pl-3 pr-1 text-t-body text-ims-text">
                    {r.name}
                    {r.auto && <span className="text-t-hint text-ims-muted">(department head)</span>}
                    <button type="button" onClick={() => setReaders((xs) => xs.filter((x) => x.id !== r.id))} className="rounded-full p-1 text-ims-faint hover:bg-ims-subtle hover:text-ims-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ims-focus" aria-label={`Remove ${r.name}`}>
                      <X size={13} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <div id="rf-readers" tabIndex={-1} className="outline-none">
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
            </div>
            <p className="flex items-start gap-1.5 text-t-small text-ims-muted"><Bell size={13} className="mt-0.5 shrink-0" aria-hidden /> Readers get a notification and an e-mail, and can comment, ask for more information or mark the report as reviewed.</p>
          </FormSection>

          <FormSection title="Attachments" description="Evidence: attendance lists, photos, minutes, drafts.">
            {editing && existing.data && ((existing.data as any).attachments || []).length > 0 && <Attachments record={existing.data} names={(existing.data as any).attachments} />}
            <FileDrop files={files} onChange={setFiles} max={10} label={editing ? "Add more files" : "Attach files"} />
          </FormSection>
        </FormBody>

        <FormActions submitType="submit" submitLabel={editing ? "Save changes" : "Send report"} onCancel={() => navigate(-1)} busy={saving ? "submit" : null} note={readers.length ? `Goes to ${readers.map((r) => r.name).join(", ")}.` : "Choose at least one reader."} />
      </form>
    </Page>
  );
}
