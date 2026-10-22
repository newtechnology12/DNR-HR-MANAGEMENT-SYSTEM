/**
 * One work plan: where it comes from (own, assigned, cascaded), its period, the plan it carries out and its
 * health (achievement against the time passed); the activities with their progress and quantities; issues
 * and risks; the supervisor's approval and assessment; the report; evidence and history. The owner records
 * progress and reports; the supervisor approves, assesses and can plan the next level down. A department
 * plan shows what the staff results add up to.
 */
import * as React from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useQuery } from "react-query";
import { format } from "date-fns";
import { toast } from "sonner";
import {
  AlertTriangle, Check, CheckCircle2, ClipboardList, Clock, Copy, CornerUpLeft, FileSpreadsheet, FileText, GitBranch, Info, Pencil, Plus, RotateCcw, Send, Sheet, Star, Undo2,
} from "lucide-react";
import pocketbase from "@/lib/pocketbase";
import { useAuth } from "@/context/auth.context";
import { errorMessage } from "@/lib/procurement";
import { exportReport } from "@/lib/exporter";
import {
  HEALTH, ITEM_STATUS, PRIORITY, PlanIssue, PlanKind, RATING, SEVERITY, TYPE_INFO, WEEKDAYS, expectedOf, healthOf, numberIn, openIssues, originOf, plansApi, qty, statusChoice, statusOf,
} from "@/lib/plans";
import { Skeleton } from "@/components/ui/skeleton";
import { Chatter, toChatter } from "@/components/enterprise/DocumentLayout";
import { useApprovalTrail } from "@/components/enterprise/useApprovalTrail";
import DocumentUploads from "@/components/enterprise/Attachments";
import { remainingTone, teamText } from "@/components/workspace/DepartmentActivities";
import {
  Button,
  ButtonLink,
  Card,
  CardHeader,
  Column,
  ConfirmDialog,
  DataTable,
  DetailHeader,
  Details,
  EmptyState,
  Field,
  Input,
  Kpi,
  KpiBand,
  MenuItem,
  Modal,
  ModalSection,
  MoreMenu,
  Num,
  Page,
  Person,
  Priority,
  Select,
  StatusPill,
  Tabs,
  Textarea,
  fmtDate,
} from "@/components/ims";
import { cn } from "@/utils";

const STEPS = [["draft", "Prepared"], ["submitted", "Approved by the supervisor"], ["approved", "Work and progress"], ["reported", "Report"], ["assessed", "Assessment"]];
const stepIndex = (s: string) => (s === "returned" ? 0 : Math.max(0, STEPS.findIndex(([k]) => k === s)));
const today = () => format(new Date(), "yyyy-MM-dd");
const LIST = "/dashboard/my/plans";
type TabKey = "details" | "items" | "issues" | "documents" | "activity";

export function Stars({ value, size = 15 }: { value: number; size?: number }) {
  return (
    <span className="inline-flex items-center gap-0.5" role="img" aria-label={`${value} of 5 — ${RATING[value] || ""}`}>
      {[1, 2, 3, 4, 5].map((i) => <Star key={i} size={size} className={i <= value ? "fill-ims-priority-high text-ims-priority-high" : "text-ims-priority-low"} aria-hidden />)}
    </span>
  );
}

/** Thin progress bar with the percentage after it. */
function ProgressBar({ value, color }: { value: number; color?: string }) {
  const v = Math.max(0, Math.min(100, Number(value) || 0));
  return (
    <span className="flex items-center gap-2">
      <span className="block h-[6px] w-[72px] overflow-hidden rounded-full bg-ims-neutral-bg" aria-hidden>
        <span className={cn("block h-full rounded-full", !color && (v >= 100 ? "bg-ims-success" : "bg-ims-link"))} style={{ width: `${v}%`, background: color }} />
      </span>
      <b className="w-10 text-right tabular-nums">{v}%</b>
    </span>
  );
}

/** A line of context under the page header (waiting for you, returned, instructions). */
function Notice({ tone, icon: Icon, children }: { tone: "warning" | "orange" | "info"; icon: typeof Info; children: React.ReactNode }) {
  const cls = { warning: "border-ims-warning/30 bg-ims-warning-bg text-ims-warning", orange: "border-ims-orange/30 bg-ims-orange-bg text-ims-orange", info: "border-ims-info/20 bg-ims-info-bg text-ims-info" }[tone];
  return (
    <p role="status" className={cn("flex items-start gap-2 rounded-card border px-4 py-3 text-t-body", cls)}>
      <Icon size={16} className="mt-0.5 shrink-0" aria-hidden />
      <span>{children}</span>
    </p>
  );
}

/** Days before the end of the period when the report becomes the main action. */
const REPORT_WINDOW_DAYS: Record<PlanKind, number> = { weekly: 1, monthly: 5, department: 5, quarterly: 10, annual: 30, task: 2 };
const NEXT_LEVEL: Partial<Record<PlanKind, string>> = { annual: "Plan a quarter", quarterly: "Plan a month", monthly: "Plan a week" };
const HEALTH_KPI: Record<keyof typeof HEALTH, Kpi["tone"]> = { not_started: "default", on_track: "default", at_risk: "warning", off_track: "danger", completed: "success" };

export default function PlanDetail() {
  const { planId } = useParams();
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const { user }: any = useAuth();
  const uid: string = user?.id || "";
  const q = useQuery(["work-plan", planId], () => pocketbase.collection("work_plans").getOne(planId!, { expand: "staff,supervisor,approved_by,assessed_by,parent,department,assigned_by,assigned_by.designation" }));
  const ref = useQuery(["plan-names"], async () => ({
    objectives: Object.fromEntries((await pocketbase.collection("strategic_objectives").getFullList({ fields: "id,code,name" })).map((o: any) => [o.id, o])),
  }));
  const p0: any = q.data;
  // the department activities this plan's items contribute to (codes and titles)
  const deptIds = Array.from(new Set(((p0?.items || []) as any[]).map((i) => i.department_plan).filter(Boolean))) as string[];
  const depts = useQuery(["plan-dept-refs", deptIds.join()], async () => {
    const rows = await pocketbase.collection("work_plans").getFullList({ filter: deptIds.map((id) => `id = "${id}"`).join(" || "), fields: "id,number,items" });
    const out: Record<string, any> = {};
    for (const r of rows as any[]) for (const i of r.items || []) out[`${r.id}:${i.id}`] = { ...i, plan: r.number };
    return out;
  }, { enabled: deptIds.length > 0 });
  const trail = useApprovalTrail("work_plan", "work_plans", planId);
  const [items, setItems] = React.useState<any[]>([]);
  const [dirty, setDirty] = React.useState(false);
  const [tab, setTab] = React.useState<TabKey>("details");
  const [dialog, setDialog] = React.useState<"" | "approve" | "return" | "report" | "assess" | "sendback">("");
  const [busy, setBusy] = React.useState(false);
  React.useEffect(() => {
    if (q.data) {
      setItems(((q.data as any).items || []).map((i: any) => ({ ...i })));
      setDirty(false);
    }
  }, [q.data]);
  const refresh = () => {
    q.refetch();
    trail.refresh();
  };

  const p: any = q.data;
  const type = (p?.plan_type || "weekly") as PlanKind;
  const mine = Boolean(p) && p.staff === uid;
  const supervisor = Boolean(p) && (p.supervisor || p.approved_by) === uid && !mine;
  const canProgress = mine && p?.status === "approved" && type !== "department";
  const canReport = mine && p?.status === "approved";

  // "Submit report" from the plans list opens the report straight away
  React.useEffect(() => {
    if (params.get("report") === "1" && canReport) {
      setDialog("report");
      setParams({}, { replace: true });
    }
  }, [canReport]); // eslint-disable-line react-hooks/exhaustive-deps

  if (q.isLoading) {
    return (
      <Page>
        <Skeleton className="h-5 w-48" />
        <Skeleton className="h-16 w-full max-w-2xl" />
        <Skeleton className="h-64 w-full" />
      </Page>
    );
  }
  if (!p) {
    return (
      <Page>
        <Card>
          <EmptyState icon={ClipboardList} text="This plan is not available. It may have been deleted, or it is not one you can see." action={<ButtonLink to={LIST}>Back to my plans</ButtonLink>} />
        </Card>
      </Page>
    );
  }
  const info = TYPE_INFO[type];
  const reportDue = Date.now() >= new Date(String(p.period_end).replace(" ", "T")).getTime() - REPORT_WINDOW_DAYS[type] * 86_400_000;
  const idx = stepIndex(p.status);
  const health = healthOf(p);
  const expected = expectedOf(p);
  const origin = originOf(p);
  const st = statusOf(p);
  const canCascade = Boolean(NEXT_LEVEL[type]) && (mine || supervisor) && ["approved", "reported", "assessed"].includes(p.status);
  const deptItem = (it: any) => (it.department_plan && it.department_activity ? depts.data?.[`${it.department_plan}:${it.department_activity}`] : undefined);
  const issuesOpen = openIssues(p);
  const owner = type === "department" ? p.expand?.department?.name : p.expand?.staff?.name;

  async function act(action: "submit" | "progress" | "copy" | "cascade", body: Record<string, unknown> = {}) {
    setBusy(true);
    try {
      const r = await plansApi.act(p.id, action, body);
      if (action === "copy" || action === "cascade") {
        toast.success(action === "copy" ? `${r.number} started for the next period` : `${r.number} prepared — complete it and send it`);
        navigate(mine ? `/dashboard/my/plans/${r.id}/edit` : `/dashboard/my/plans/${r.id}`);
      } else {
        toast.success(action === "submit" ? (r.status === "approved" ? `${p.number} saved and approved` : `${p.number} sent to your supervisor`) : `Progress saved · ${r.progress}%`);
        refresh();
      }
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  const setItem = (i: number, patch: Record<string, any>) => {
    setItems((xs) => xs.map((x, j) => {
      if (j !== i) return x;
      const n = { ...x, ...patch };
      if (patch.actual !== undefined) {
        const t = numberIn(n.target);
        if (n.actual !== null && t) n.progress = Math.min(100, Math.round((Number(n.actual) / t) * 100));
        if (n.progress > 0 && n.status === "not_started") n.status = "in_progress";
      }
      if (n.status === "done") n.progress = 100;
      return n;
    }));
    setDirty(true);
  };

  const doExport = (formatKind: "xlsx" | "pdf" | "csv") =>
    exportReport({
      title: `${p.plan_type === "task" ? p.title : info.label} — ${p.expand?.staff?.name || ""}`,
      subtitle: `${p.number} · ${p.period_label} · ${st.label}${p.expand?.supervisor ? ` · supervisor ${p.expand.supervisor.name}` : ""}${p.approved_at ? ` · approved ${fmtDate(p.approved_at)}` : ""}${p.focus ? ` · focus: ${p.focus}` : ""} · ${p.progress}% achieved`,
      rows: items, format: formatKind, what: `work_plan:${p.number}`, orientation: "landscape",
      totals: ["Weight %", "Cost (RWF)"].filter((h) => (h === "Weight %" ? items.some((i) => i.weight) : items.some((i) => i.cost))),
      columns: [
        ...(type === "department" ? [{ header: "Code", value: (i: any) => i.code, width: 8 }] : []),
        { header: info.item, value: (i: any) => i.title, width: 34 },
        { header: type === "annual" ? "Key result" : "Expected output", value: (i: any) => i.output, width: 24 },
        { header: "Indicator", value: (i: any) => i.indicator, width: 22 },
        { header: "Unit", value: (i: any) => i.unit, width: 10 },
        ...(type === "annual" || type === "quarterly" ? [{ header: "Baseline", value: (i: any) => i.baseline, width: 10 }] : []),
        { header: "Target", value: (i: any) => i.target, width: 10 },
        ...(items.some((i) => i.actual !== null && i.actual !== undefined) ? [{ header: "Achieved", value: (i: any) => i.actual ?? null, format: "number" as const, width: 10 }] : []),
        ...(items.some((i) => i.weight) ? [{ header: "Weight %", value: (i: any) => i.weight || null, format: "number" as const, width: 9 }] : []),
        ...(type === "annual" ? [{ header: "Quarters", value: (i: any) => (i.quarters || []).map((x: number) => `Q${x}`).join(" "), width: 10 }] : []),
        ...(type === "weekly" ? [{ header: "Days", value: (i: any) => (i.days || []).map((d: string) => WEEKDAYS.find(([k]) => k === d)?.[1]).join(" "), width: 14 }] : []),
        ...(items.some((i) => i.due) ? [{ header: "Due", value: (i: any) => i.due, format: "date" as const, width: 11 }] : []),
        { header: "Evidence", value: (i: any) => i.verification, width: 16 },
        ...(items.some((i) => i.cost) ? [{ header: "Cost (RWF)", value: (i: any) => i.cost || null, format: "money" as const, width: 13 }] : []),
        ...(type === "department" ? [{ header: "People contributing", value: (i: any) => i.team || 0, format: "number" as const, width: 10 }] : []),
        { header: "Status", value: (i: any) => statusChoice(ITEM_STATUS[i.status]) || i.status, width: 12 },
        { header: "Progress %", value: (i: any) => i.progress, format: "number" as const, width: 9 },
        { header: "Achieved / reason", value: (i: any) => i.achieved, width: 28 },
      ],
    });
  const runExport = async (f: "xlsx" | "pdf" | "csv") => {
    try {
      await doExport(f);
    } catch (e: any) {
      toast.error(e?.message || "The export could not be prepared. Try again.");
    }
  };

  // ---------------------------------------------------------------- actions: the next step is the primary button
  const editable = mine && ["draft", "returned"].includes(p.status);
  let primary: React.ReactNode = null;
  const secondary: { key: string; node: React.ReactNode; menu: MenuItem }[] = [];
  const reportBtn = { label: "Write the report", icon: Check, onSelect: () => setDialog("report") };
  const cascadeBtn = { label: NEXT_LEVEL[type] || "", icon: GitBranch, onSelect: () => act("cascade", { date: today() }) };
  const copyBtn = { label: `Next ${info.short.toLowerCase()}`, icon: Copy, onSelect: () => act("copy") };
  const asButton = (m: MenuItem, title?: string) => <Button key={m.label} icon={m.icon} disabled={busy} onClick={m.onSelect} title={title}>{m.label}</Button>;

  if (editable) {
    primary = <Button variant="primary" icon={Send} loading={busy} onClick={() => act("submit")}>Send to my supervisor</Button>;
    secondary.push({ key: "edit", node: <ButtonLink key="edit" to={`${LIST}/${p.id}/edit`} icon={Pencil}>Edit</ButtonLink>, menu: { label: "Edit", icon: Pencil, onSelect: () => navigate(`${LIST}/${p.id}/edit`) } });
  } else if (supervisor && p.status === "submitted") {
    primary = <Button variant="primary" icon={CheckCircle2} onClick={() => setDialog("approve")}>Approve</Button>;
    secondary.push({ key: "return", node: <Button key="return" icon={Undo2} onClick={() => setDialog("return")}>Return</Button>, menu: { label: "Return", icon: Undo2, onSelect: () => setDialog("return") } });
  } else if (supervisor && p.status === "reported") {
    primary = <Button variant="primary" icon={Star} onClick={() => setDialog("assess")}>Assess</Button>;
    secondary.push({ key: "sendback", node: <Button key="sendback" icon={Undo2} onClick={() => setDialog("sendback")}>Send the report back</Button>, menu: { label: "Send the report back", icon: Undo2, onSelect: () => setDialog("sendback") } });
  } else if (canReport && reportDue) {
    primary = <Button variant="primary" icon={Check} onClick={() => setDialog("report")}>Write the report</Button>;
  }
  if (canReport && !reportDue) secondary.push({ key: "report", node: asButton(reportBtn, "Usually written at the end of the period"), menu: reportBtn });
  if (canCascade) secondary.push({ key: "cascade", node: asButton(cascadeBtn, "Prepare the next level down from this plan"), menu: cascadeBtn });
  if (mine && type !== "task") secondary.push({ key: "copy", node: asButton(copyBtn, "Start the next period's plan with the activities still open"), menu: copyBtn });
  const more: MenuItem[] = [
    ...secondary.slice(2).map((s) => ({ ...s.menu, disabled: busy })),
    { label: "Export to Excel", icon: FileSpreadsheet, onSelect: () => runExport("xlsx") },
    { label: "Export to PDF", icon: FileText, onSelect: () => runExport("pdf") },
    { label: "Export to CSV", icon: Sheet, onSelect: () => runExport("csv") },
  ];

  const kpis: Kpi[] = [
    { label: "Achieved", value: `${p.progress}%`, tone: HEALTH_KPI[health], sub: HEALTH[health].label },
    { label: "Expected by today", value: `${expected}%`, sub: "Share of the period passed" },
    { label: info.items, value: items.length, sub: `${items.filter((i) => i.status === "done").length} completed` },
    { label: "Open issues", value: issuesOpen, tone: issuesOpen ? "danger" : "default", sub: `${(p.issues || []).length} raised` },
    ...(p.supervisor_rating ? [{ label: "Rating", value: `${p.supervisor_rating} of 5`, sub: RATING[p.supervisor_rating] }] : p.self_rating ? [{ label: "Self-rating", value: `${p.self_rating} of 5`, sub: RATING[p.self_rating] }] : []),
  ];

  return (
    <Page>
      <DetailHeader
        back={mine ? { label: "Back to my plans", to: LIST } : { label: "Back to my team's plans", to: `${LIST}?tab=team` }}
        number={p.number}
        type={info.label}
        status={st.label}
        statusNote={st.note}
        title={type === "task" ? p.title : p.focus || p.period_label}
        facts={[
          !mine && owner ? { label: type === "department" ? "Department" : "Staff", value: owner } : null,
          { label: "Period", value: p.period_label },
          { label: "Supervisor", value: p.expand?.supervisor?.name || p.expand?.approved_by?.name || "Assigned when sent" },
          <span key="origin" className={origin.assigned ? "font-semibold text-ims-text" : undefined}>{origin.text}</span>,
        ]}
        actions={
          <>
            <MoreMenu items={more} />
            {secondary.slice(0, 2).map((s) => <React.Fragment key={s.key}>{s.node}</React.Fragment>)}
            {primary}
          </>
        }
      />

      {supervisor && p.status === "submitted" && <Notice tone="warning" icon={Clock}>Waiting for your approval. Approve it so the work can start, or return it with what to change.</Notice>}
      {supervisor && p.status === "reported" && <Notice tone="warning" icon={Clock}>The report is waiting for your assessment. Rate the work and give feedback, or send the report back.</Notice>}
      {p.status === "returned" && p.review_comment && (
        <Notice tone="orange" icon={CornerUpLeft}>Returned by your supervisor: “{p.review_comment}”. {mine ? "Edit the plan and send it again." : ""}</Notice>
      )}
      {p.status !== "returned" && p.review_comment && (
        <Notice tone="info" icon={Info}>{p.origin === "assigned" ? "Instructions" : "Supervisor"}: “{p.review_comment}”</Notice>
      )}
      {p.status === "approved" && p.supervisor_feedback && <Notice tone="warning" icon={CornerUpLeft}>Report sent back: “{p.supervisor_feedback}”. Complete it and send it again.</Notice>}

      <KpiBand items={kpis} />

      <Tabs
        label="Plan sections"
        active={tab}
        onChange={(k) => setTab(k as TabKey)}
        tabs={[
          { key: "details", label: "Details" },
          { key: "items", label: info.items, count: items.length },
          { key: "issues", label: "Issues", count: issuesOpen },
          { key: "documents", label: "Documents", count: (p.attachments || []).length },
          { key: "activity", label: "Activity" },
        ]}
      />

      {tab === "details" && (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
          {(p.status === "reported" || p.status === "assessed") && (
            <Card className="xl:col-span-3">
              <CardHeader
                title="Report"
                subtitle={`Written ${fmtDate(p.reported_at)}`}
                action={p.self_rating ? <span className="inline-flex items-center gap-2 text-t-small text-ims-muted">Self-rating <Stars value={p.self_rating} /></span> : undefined}
              />
              <p className="whitespace-pre-line text-t-body text-ims-text">{p.report_summary}</p>
              {[p.challenges, p.next_steps, p.support_needed].some(Boolean) && (
                <Details
                  columns={3}
                  className="mt-4 border-t border-ims-divider pt-4"
                  items={[
                    { label: "Challenges", value: p.challenges ? <span className="whitespace-pre-line">{p.challenges}</span> : null },
                    { label: "Next steps", value: p.next_steps ? <span className="whitespace-pre-line">{p.next_steps}</span> : null },
                    { label: "Support needed", value: p.support_needed ? <span className="whitespace-pre-line">{p.support_needed}</span> : null },
                  ]}
                />
              )}
              {p.status === "assessed" && (
                <div className="mt-4 rounded-control border border-ims-success/30 bg-ims-success-bg px-4 py-3">
                  <p className="flex flex-wrap items-center gap-2 text-t-body font-bold text-ims-success">
                    Assessment by {p.expand?.assessed_by?.name || "the supervisor"} · <Stars value={p.supervisor_rating} /> {RATING[p.supervisor_rating]}
                  </p>
                  <p className="mt-1 whitespace-pre-line text-t-body text-ims-text">{p.supervisor_feedback}</p>
                </div>
              )}
            </Card>
          )}
          <Card className="xl:col-span-2">
            <CardHeader title="Plan" subtitle={info.hint} />
            <Details
              items={[
                { label: type === "department" ? "Department" : "Staff member", value: owner, hint: type !== "department" ? p.expand?.department?.name : undefined },
                { label: "Supervisor", value: p.expand?.supervisor?.name || p.expand?.approved_by?.name || "Assigned when sent" },
                { label: "Period", value: p.period_label, hint: type === "weekly" || type === "task" ? undefined : `${fmtDate(p.period_start)} – ${fmtDate(p.period_end)}` },
                {
                  label: "Contributes to",
                  value: p.expand?.parent ? (
                    <Link className="font-semibold text-ims-link hover:underline" to={`${LIST}/${p.parent}`}>
                      {TYPE_INFO[p.expand.parent.plan_type as PlanKind]?.label} · {String(p.expand.parent.period_label).split(" · ")[0]}
                    </Link>
                  ) : null,
                },
                { label: "Origin", value: origin.text },
                ...(p.origin === "assigned"
                  ? [{ label: "Assigned by", value: `${p.expand?.assigned_by?.name || "—"}${p.expand?.assigned_by?.expand?.designation?.name ? `, ${p.expand.assigned_by.expand.designation.name}` : ""}`, hint: p.source || undefined }]
                  : []),
                { label: "Main focus", value: type === "task" ? null : p.focus },
                ...(type === "department" ? [{ label: "How it is measured", value: "From the staff plans that contribute to each activity" }] : []),
                { label: "Created", value: fmtDate(p.created) },
                { label: "Sent for approval", value: p.submitted_at ? fmtDate(p.submitted_at) : null },
              ]}
            />
          </Card>
          <Card>
            <CardHeader title="Approval and reporting" subtitle="Each plan is approved before the work, then reported and assessed." />
            <ol className="space-y-3">
              {STEPS.map(([k, label], i) => {
                const done = i < idx || (i === idx && p.status === "assessed");
                const current = i === idx && p.status !== "assessed";
                const detail =
                  k === "draft" ? `${fmtDate(p.created)}${p.status === "returned" ? " · returned for changes" : ""}`
                  : k === "submitted" ? (p.approved_at ? `${fmtDate(p.approved_at)} · ${p.expand?.approved_by?.name || p.expand?.supervisor?.name || ""}` : p.submitted_at ? `Sent ${fmtDate(p.submitted_at)} · with ${p.expand?.supervisor?.name || "the supervisor"}` : "Not sent yet")
                  : k === "approved" ? `Until ${fmtDate(p.period_end)}`
                  : k === "reported" ? (p.reported_at ? `Written ${fmtDate(p.reported_at)}` : `Due by ${fmtDate(p.period_end)}`)
                  : p.assessed_at ? `${fmtDate(p.assessed_at)} · ${p.expand?.assessed_by?.name || "the supervisor"}` : "After the report";
                return (
                  <li key={k} className="flex gap-3" aria-current={current ? "step" : undefined}>
                    <span
                      className={cn(
                        "flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-t-small font-bold",
                        done ? "border-ims-success bg-ims-success-bg text-ims-success" : current ? "border-ims-primary bg-ims-primary text-white" : "border-ims-field text-ims-muted"
                      )}
                      aria-hidden
                    >
                      {done ? <Check size={13} strokeWidth={3} /> : i + 1}
                    </span>
                    <div className="min-w-0 text-t-body">
                      <p className={cn("font-semibold", current || done ? "text-ims-text" : "text-ims-muted")}>{label}</p>
                      <p className="text-t-small text-ims-muted">{detail}</p>
                    </div>
                  </li>
                );
              })}
            </ol>
          </Card>

        </div>
      )}

      {tab === "items" && (
        <ItemsCard
          type={type}
          items={items}
          canProgress={canProgress}
          busy={busy}
          dirty={dirty}
          setItem={setItem}
          deptItem={deptItem}
          objectives={ref.data?.objectives}
          onSave={() => act("progress", { items: items.map((i) => ({ id: i.id, status: i.status, progress: i.progress, actual: i.actual ?? null, achieved: i.achieved, comment: i.comment })) })}
        />
      )}

      {tab === "issues" && <IssuesCard plan={p} items={items} canManage={mine || supervisor || p.assigned_by === uid} onChange={refresh} />}

      {tab === "documents" && (
        <Card>
          <CardHeader title="Evidence and documents" subtitle="Means of verification: attendance lists, reports, photos, mission orders." />
          <DocumentUploads collection="work_plans" record={p} canAdd={mine} canRemove={mine && ["draft", "returned", "approved"].includes(p.status)} onChange={refresh} hint="Evidence of what was achieved" />
        </Card>
      )}

      {tab === "activity" && <Chatter items={toChatter(trail.actions, trail.audit)} title="Activity" />}

      {dialog === "approve" && <ApproveDialog plan={p} onClose={() => setDialog("")} onDone={() => { setDialog(""); refresh(); }} />}
      <ConfirmDialog
        open={dialog === "return"}
        onClose={() => setDialog("")}
        title={`Return ${p.number}?`}
        description="The plan goes back to the staff member, who corrects it and sends it again."
        confirmLabel="Return"
        reason={{ label: "What to change", placeholder: "Say what to change in the plan", min: 5, required: true }}
        onConfirm={async (comment) => {
          try {
            await plansApi.act(p.id, "review", { decision: "return", comment });
            toast.success(`${p.number} returned for changes`);
            refresh();
          } catch (e) {
            toast.error(errorMessage(e));
            throw e;
          }
        }}
      />
      {dialog === "assess" && <AssessDialog plan={p} onClose={() => setDialog("")} onDone={() => { setDialog(""); refresh(); }} />}
      <ConfirmDialog
        open={dialog === "sendback"}
        onClose={() => setDialog("")}
        title={`Send the report on ${p.number} back?`}
        description="The staff member completes the report and sends it again."
        confirmLabel="Send back"
        reason={{ label: "What to complete in the report", placeholder: "Say what is missing", min: 5, required: true }}
        onConfirm={async (feedback) => {
          try {
            await plansApi.act(p.id, "assess", { decision: "return", rating: 0, feedback });
            toast.success(`Report on ${p.number} sent back`);
            refresh();
          } catch (e) {
            toast.error(errorMessage(e));
            throw e;
          }
        }}
      />
      {dialog === "report" && <ReportDialog plan={p} items={items} onClose={() => setDialog("")} onDone={() => { setDialog(""); refresh(); }} />}
    </Page>
  );
}

// ------------------------------------------------------------------ activities
function ItemsCard({ type, items, canProgress, busy, dirty, setItem, deptItem, objectives, onSave }: {
  type: PlanKind;
  items: any[];
  canProgress: boolean;
  busy: boolean;
  dirty: boolean;
  setItem: (i: number, patch: Record<string, any>) => void;
  deptItem: (it: any) => any;
  objectives?: Record<string, any>;
  onSave: () => void;
}) {
  const info = TYPE_INFO[type];
  const rows = items.map((it, i) => ({ it, i }));
  const hasWeights = items.some((i) => Number(i.weight) > 0);
  const hasCost = items.some((i) => Number(i.cost) > 0);
  const hasActual = items.some((i) => numberIn(i.target) !== null);
  const hasTarget = items.some((i) => String(i.target || "").trim() || String(i.baseline || "").trim());
  type Row = { it: any; i: number };

  const meta = (it: any) => {
    const bits: string[] = [];
    if (it.output) bits.push(`${type === "annual" ? "Key result" : "Output"}: ${it.output}`);
    if (it.indicator) bits.push(`Indicator: ${it.indicator}`);
    if (it.verification) bits.push(`Evidence: ${it.verification}`);
    if (it.priority && it.priority !== "medium") bits.push(`${PRIORITY[it.priority] || it.priority} priority`);
    const o = it.objective && objectives?.[it.objective];
    if (o) bits.push(`${o.code} ${o.name}`);
    return bits.join(" · ");
  };
  const when = (it: any) =>
    type === "weekly" ? (it.days || []).map((d: string) => WEEKDAYS.find(([k]) => k === d)?.[1]).join(" · ") || "—"
    : type === "annual" ? (it.quarters || []).map((x: number) => `Q${x}`).join(" ") || "—"
    : it.due ? fmtDate(it.due) : "—";

  const titleCol: Column<Row> = {
    key: "title",
    header: info.item,
    className: "min-w-[260px] max-w-[360px]",
    cell: ({ it }) => {
      const da = deptItem(it);
      return (
        <span className="block">
          <span className="font-semibold text-ims-text">{type === "department" && it.code ? `${it.code} · ` : ""}{it.title}</span>
          {da && <span className="ml-2 inline-flex whitespace-nowrap rounded-pill bg-ims-orange-bg px-2 py-0.5 align-middle text-t-hint font-bold text-ims-orange">Contributes to {da.code}</span>}
        </span>
      );
    },
    sub: ({ it }) => meta(it) || null,
  };
  const targetCol: Column<Row> = {
    key: "target",
    header: "Target",
    numeric: true,
    cell: ({ it }) => {
      const t = numberIn(it.target);
      return t !== null ? qty(t, it.unit) : it.target || "—";
    },
    sub: ({ it }) => (it.baseline ? `Baseline ${it.baseline}` : null),
  };

  let columns: Column<Row>[];
  if (type === "department") {
    columns = [
      titleCol,
      targetCol,
      { key: "achieved", header: "Achieved", numeric: true, cell: ({ it }) => <b>{numberIn(it.target) !== null ? qty(it.actual ?? 0, it.unit) : `${it.progress}%`}</b> },
      {
        key: "remaining",
        header: "Remaining",
        numeric: true,
        cell: ({ it }) => {
          const t = numberIn(it.target);
          return <span className={cn("font-bold", remainingTone(it.progress))}>{it.progress >= 100 ? "None" : t !== null ? qty(Math.max(0, t - (it.actual || 0)), it.unit) : `${100 - it.progress}%`}</span>;
        },
      },
      { key: "team", header: "Team", nowrap: true, cell: ({ it }) => teamText(it.team || 0, false) },
      { key: "due", header: "Due", nowrap: true, cell: ({ it }) => (it.due ? fmtDate(it.due) : "—") },
      { key: "progress", header: "Progress", nowrap: true, cell: ({ it }) => <ProgressBar value={it.progress} /> },
    ];
  } else {
    columns = [
      { key: "n", header: "#", width: "48px", cell: ({ i }) => <span className="text-ims-muted">{i + 1}</span> },
      titleCol,
      ...(hasTarget ? [targetCol] : []),
      ...(hasActual
        ? [{
            key: "actual",
            header: "Achieved",
            numeric: true,
            cell: ({ it, i }: Row) => {
              const t = numberIn(it.target);
              if (t === null) return <span className="text-ims-faint">—</span>;
              if (!canProgress) return it.actual !== null && it.actual !== undefined ? qty(it.actual, it.unit) : <span className="text-ims-faint">—</span>;
              return (
                <Input
                  type="number"
                  min={0}
                  aria-label={`Quantity achieved of ${it.title}`}
                  className="ml-auto h-9 w-24 text-right tabular-nums"
                  value={it.actual ?? ""}
                  onChange={(e) => setItem(i, { actual: e.target.value === "" ? null : Math.max(0, Number(e.target.value) || 0) })}
                />
              );
            },
            sub: ({ it }: Row) => (canProgress && numberIn(it.target) !== null ? `of ${qty(numberIn(it.target), it.unit)}` : null),
          } as Column<Row>]
        : []),
      ...(hasWeights ? [{ key: "weight", header: "Weight (%)", numeric: true, cell: ({ it }: Row) => (it.weight ? <Num value={it.weight} /> : "—"), total: <Num value={items.reduce((s, x) => s + (Number(x.weight) || 0), 0)} /> } as Column<Row>] : []),
      { key: "when", header: type === "weekly" ? "Days" : type === "annual" ? "Quarters" : "Due", nowrap: true, cell: ({ it }) => when(it) },
      ...(hasCost ? [{ key: "cost", header: "Cost (RWF)", numeric: true, cell: ({ it }: Row) => (it.cost ? <Num value={it.cost} /> : "—"), total: <Num value={items.reduce((s, x) => s + (Number(x.cost) || 0), 0)} /> } as Column<Row>] : []),
      {
        key: "status",
        header: "Status",
        nowrap: true,
        cell: ({ it, i }) =>
          canProgress ? (
            <Select aria-label={`Status of ${it.title}`} className="h-9 w-[170px]" value={it.status} onChange={(e) => setItem(i, { status: e.target.value })}>
              {Object.entries(ITEM_STATUS).map(([k, s]) => <option key={k} value={k}>{statusChoice(s)}</option>)}
            </Select>
          ) : (
            <StatusPill status={ITEM_STATUS[it.status]?.label || it.status} sub={ITEM_STATUS[it.status]?.note} />
          ),
      },
      {
        key: "progress",
        header: "Progress",
        nowrap: true,
        cell: ({ it, i }) =>
          canProgress ? (
            <span className="relative block w-[88px]">
              <Input
                type="number"
                min={0}
                max={100}
                aria-label={`Progress percent of ${it.title}`}
                className="h-9 pr-8 text-right tabular-nums [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                value={it.progress}
                onChange={(e) => setItem(i, { progress: Math.max(0, Math.min(100, Number(e.target.value) || 0)) })}
              />
              <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-t-small text-ims-muted">%</span>
            </span>
          ) : (
            <ProgressBar value={it.progress} />
          ),
      },
      {
        key: "achieved",
        header: "Achieved / reason",
        className: "min-w-[220px]",
        clamp: !canProgress,
        cell: ({ it, i }) =>
          canProgress ? (
            <Input aria-label={`Achieved or reason for ${it.title}`} className="h-9" value={it.achieved} placeholder="What was achieved, or why not" onChange={(e) => setItem(i, { achieved: e.target.value })} />
          ) : (
            it.achieved || <span className="text-ims-faint">—</span>
          ),
      },
    ];
  }

  return (
    <Card padded={false} className="overflow-hidden">
      <div className="px-[18px] pt-[18px] sm:px-5 sm:pt-5">
        <CardHeader
          title={info.items}
          subtitle={
            type === "department"
              ? "Targets, what the staff results add up to, and what remains."
              : canProgress
              ? "Update the status and progress as you go; enter the quantity achieved where the target is a number."
              : `${items.length} ${items.length === 1 ? info.item.toLowerCase() : info.items.toLowerCase()}`
          }
          action={canProgress ? <Button variant="primary" disabled={!dirty} loading={busy} onClick={onSave}>Save progress</Button> : undefined}
        />
      </div>
      <DataTable
        columns={columns}
        rows={rows}
        rowKey={({ it, i }) => it.id || String(i)}
        minWidth={canProgress ? 1080 : 960}
        caption={info.items}
        empty={<EmptyState compact text={`No ${info.items.toLowerCase()} in this plan yet.`} />}
      />
      {canProgress && dirty && <p className="border-t border-ims-divider px-5 py-3 text-t-small text-ims-warning">You have changes that are not saved yet. Save the progress before you leave the page.</p>}
    </Card>
  );
}

// ------------------------------------------------------------------ issues
function IssuesCard({ plan, items, canManage, onChange }: { plan: any; items: any[]; canManage: boolean; onChange: () => void }) {
  const issues = ((plan.issues || []) as PlanIssue[]).slice().sort((a, b) => (a.status === b.status ? String(b.raised_at).localeCompare(String(a.raised_at)) : a.status === "open" ? -1 : 1));
  const [adding, setAdding] = React.useState(false);
  const [form, setForm] = React.useState({ title: "", detail: "", severity: "medium", item: "" });
  const [triedAdd, setTriedAdd] = React.useState(false);
  const [resolving, setResolving] = React.useState<PlanIssue | null>(null);
  const [resolution, setResolution] = React.useState("");
  const [triedResolve, setTriedResolve] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const canAdd = canManage && ["submitted", "approved", "returned", "reported"].includes(plan.status);
  const open = issues.filter((i) => i.status === "open").length;

  async function send(body: Record<string, unknown>, done: string) {
    setBusy(true);
    try {
      await plansApi.act(plan.id, "issues", body);
      toast.success(done);
      onChange();
      return true;
    } catch (e) {
      toast.error(errorMessage(e));
      return false;
    } finally {
      setBusy(false);
    }
  }

  const columns: Column<PlanIssue>[] = [
    { key: "title", header: "Issue", className: "min-w-[240px] max-w-[380px]", cell: (x) => <span className="font-semibold">{x.title}</span>, sub: (x) => x.detail || null },
    { key: "severity", header: "Severity", nowrap: true, cell: (x) => <Priority value={x.severity} /> },
    { key: "item", header: "Activity concerned", clamp: true, className: "max-w-[220px]", cell: (x) => items.find((i) => i.id === x.item)?.title || <span className="text-ims-muted">The whole plan</span> },
    { key: "raised", header: "Raised", className: "min-w-[150px]", cell: (x) => <Person name={x.raised_by_name} detail={fmtDate(x.raised_at)} /> },
    {
      key: "status",
      header: "Status",
      nowrap: true,
      cell: (x) => <StatusPill status={x.status === "open" ? "In progress" : "Closed"} sub={x.status === "open" ? "Open" : `Resolved ${fmtDate(x.resolved_at)}`} />,
    },
    ...(issues.some((x) => x.status === "resolved")
      ? [{ key: "resolution", header: "Resolution", clamp: true, className: "min-w-[200px]", cell: (x: PlanIssue) => x.resolution || <span className="text-ims-faint">—</span>, sub: (x: PlanIssue) => (x.resolved_by_name ? `By ${x.resolved_by_name}` : null) }]
      : []),
  ];

  return (
    <Card padded={false} className="overflow-hidden">
      <div className="px-[18px] pt-[18px] sm:px-5 sm:pt-5">
        <CardHeader
          title="Issues and risks"
          subtitle={open ? `${open} open · raised so the supervisor can help in time` : "Problems that could stop the plan; the supervisor is told when one is raised."}
          action={canAdd ? <Button icon={Plus} onClick={() => { setAdding(true); setTriedAdd(false); }}>Raise an issue</Button> : undefined}
        />
      </div>
      <DataTable
        columns={columns}
        rows={issues}
        rowKey={(x) => x.id}
        minWidth={900}
        caption="Issues and risks"
        rowActions={
          canManage
            ? (x) =>
                x.status === "open"
                  ? [{ label: "Resolve", icon: Check, onSelect: () => { setResolving(x); setResolution(""); setTriedResolve(false); } }]
                  : [{ label: "Reopen", icon: RotateCcw, disabled: busy, onSelect: () => send({ action: "reopen", id: x.id }, `Issue “${x.title}” reopened`) }]
            : undefined
        }
        empty={<EmptyState compact icon={AlertTriangle} text="No issue raised." />}
      />

      <Modal
        open={adding}
        onClose={() => setAdding(false)}
        title="Raise an issue"
        description="A problem that could stop the plan. The supervisor is told so they can help in time."
        footer={
          <>
            <Button onClick={() => setAdding(false)} disabled={busy}>Cancel</Button>
            <Button
              variant="primary"
              icon={AlertTriangle}
              loading={busy}
              onClick={async () => {
                setTriedAdd(true);
                if (form.title.trim().length < 5) return;
                if (await send({ action: "add", ...form, title: form.title.trim(), detail: form.detail.trim() }, "Issue raised")) {
                  setAdding(false);
                  setForm({ title: "", detail: "", severity: "medium", item: "" });
                }
              }}
            >
              Raise the issue
            </Button>
          </>
        }
      >
        <Field label="Issue" required htmlFor="iss-title" error={triedAdd && form.title.trim().length < 5 ? "Describe the issue in a few words (at least 5 characters)." : null}>
          <Input id="iss-title" value={form.title} maxLength={160} invalid={triedAdd && form.title.trim().length < 5} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="e.g. Venue not confirmed by Rulindo district" />
        </Field>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Severity" htmlFor="iss-severity">
            <Select id="iss-severity" value={form.severity} onChange={(e) => setForm({ ...form, severity: e.target.value })}>
              {Object.entries(SEVERITY).map(([k, s]) => <option key={k} value={k}>{s.label}</option>)}
            </Select>
          </Field>
          <Field label="Activity concerned" htmlFor="iss-item">
            <Select id="iss-item" value={form.item} onChange={(e) => setForm({ ...form, item: e.target.value })}>
              <option value="">The whole plan</option>
              {items.map((i) => <option key={i.id} value={i.id}>{i.code ? `${i.code} · ` : ""}{i.title}</option>)}
            </Select>
          </Field>
        </div>
        <Field label="Details" htmlFor="iss-detail" hint="What happened, what it affects, what help is needed.">
          <Textarea id="iss-detail" className="min-h-[80px]" value={form.detail} maxLength={1000} onChange={(e) => setForm({ ...form, detail: e.target.value })} />
        </Field>
      </Modal>

      <Modal
        open={Boolean(resolving)}
        onClose={() => setResolving(null)}
        size="sm"
        title={`Resolve “${resolving?.title || ""}”?`}
        description="Say how it was resolved; the note stays on the plan."
        footer={
          <>
            <Button onClick={() => setResolving(null)} disabled={busy}>Cancel</Button>
            <Button
              variant="primary"
              icon={Check}
              loading={busy}
              onClick={async () => {
                setTriedResolve(true);
                if (!resolving || resolution.trim().length < 5) return;
                if (await send({ action: "resolve", id: resolving.id, resolution: resolution.trim() }, "Issue resolved")) setResolving(null);
              }}
            >
              Mark resolved
            </Button>
          </>
        }
      >
        <Field label="How it was resolved" required htmlFor="iss-resolution" error={triedResolve && resolution.trim().length < 5 ? "Write at least 5 characters on how it was resolved." : null}>
          <Textarea id="iss-resolution" autoFocus className="min-h-[80px]" value={resolution} invalid={triedResolve && resolution.trim().length < 5} onChange={(e) => setResolution(e.target.value)} placeholder="e.g. Rulindo confirmed the district hall for 10–11 November" />
        </Field>
      </Modal>
    </Card>
  );
}

// ------------------------------------------------------------------ dialogs
function ApproveDialog({ plan, onClose, onDone }: { plan: any; onClose: () => void; onDone: () => void }) {
  const [comment, setComment] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const info = TYPE_INFO[plan.plan_type as PlanKind];
  async function approve() {
    setBusy(true);
    try {
      await plansApi.act(plan.id, "review", { decision: "approve", comment: comment.trim() });
      toast.success(`${plan.number} approved`);
      onDone();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      open
      onClose={onClose}
      size="sm"
      title={`Approve ${plan.number}?`}
      description={`${plan.plan_type === "department" ? plan.expand?.department?.name : plan.expand?.staff?.name} · ${info.label} · ${plan.period_label} · ${(plan.items || []).length} ${info.items.toLowerCase()}. The work can start once it is approved.`}
      footer={
        <>
          <Button onClick={onClose} disabled={busy}>Cancel</Button>
          <Button variant="primary" icon={CheckCircle2} loading={busy} onClick={approve}>Approve</Button>
        </>
      }
    >
      <Field label="Comment" htmlFor="approve-comment" hint="Optional. The staff member sees it on the plan.">
        <Textarea id="approve-comment" className="min-h-[90px]" value={comment} onChange={(e) => setComment(e.target.value)} />
      </Field>
    </Modal>
  );
}

function AssessDialog({ plan, onClose, onDone }: { plan: any; onClose: () => void; onDone: () => void }) {
  const [rating, setRating] = React.useState(0);
  const [feedback, setFeedback] = React.useState("");
  const [tried, setTried] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const errors = { rating: !rating && "Choose a rating.", feedback: feedback.trim().length < 5 && "Give feedback to the staff member (at least 5 characters)." };
  async function send() {
    setTried(true);
    if (errors.rating || errors.feedback) return;
    setBusy(true);
    try {
      await plansApi.act(plan.id, "assess", { decision: "assess", rating, feedback: feedback.trim() });
      toast.success(`${plan.number} assessed · ${rating} of 5`);
      onDone();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      open
      onClose={onClose}
      title={`Assess the report on ${plan.number}`}
      description={`${plan.plan_type === "department" ? plan.expand?.department?.name : plan.expand?.staff?.name} · ${TYPE_INFO[plan.plan_type as PlanKind].label} · ${plan.period_label} · ${plan.progress}% achieved${plan.self_rating ? ` · self-rating ${plan.self_rating} of 5` : ""}`}
      footer={
        <>
          <Button onClick={onClose} disabled={busy}>Cancel</Button>
          <Button variant="primary" icon={Star} loading={busy} onClick={send}>Save assessment</Button>
        </>
      }
    >
      <fieldset>
        <legend className="mb-1.5 block text-t-label text-ims-text">Rating<span className="ml-0.5 text-ims-danger" aria-hidden>*</span></legend>
        <div className="space-y-1.5" role="radiogroup" aria-label="Rating">
          {[5, 4, 3, 2, 1].map((r) => (
            <label key={r} className={cn("flex cursor-pointer items-center gap-3 rounded-control border px-3 py-2", rating === r ? "border-ims-link bg-ims-info-bg" : "border-ims-field hover:bg-ims-hover")}>
              <input type="radio" name="rating" className="accent-ims-primary" checked={rating === r} onChange={() => setRating(r)} />
              <Stars value={r} /> <span className="text-t-small font-semibold text-ims-text">{RATING[r]}</span>
            </label>
          ))}
        </div>
        {tried && errors.rating && <p className="mt-1.5 text-t-hint text-ims-danger" role="alert">{errors.rating}</p>}
      </fieldset>
      <Field label="Feedback" required htmlFor="assess-feedback" error={tried ? errors.feedback : null}>
        <Textarea id="assess-feedback" className="min-h-[80px]" value={feedback} invalid={Boolean(tried && errors.feedback)} onChange={(e) => setFeedback(e.target.value)} placeholder="What went well, what to improve" />
      </Field>
    </Modal>
  );
}

function ReportDialog({ plan, items, onClose, onDone }: { plan: any; items: any[]; onClose: () => void; onDone: () => void }) {
  const department = plan.plan_type === "department";
  const [f, setF] = React.useState({ report_summary: "", challenges: "", next_steps: "", support_needed: "", self_rating: 0 });
  const [rows, setRows] = React.useState(items.map((i) => ({ ...i })));
  const [tried, setTried] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const open = rows.filter((i) => i.status !== "done" && i.status !== "dropped");
  const ended = new Date() >= new Date(String(plan.period_end).replace(" ", "T"));
  const summaryError = f.report_summary.trim().length < 20 ? "Summarise what was achieved (at least 20 characters)." : null;
  const missing = open.filter((i) => !String(i.achieved || "").trim());
  async function send() {
    setTried(true);
    if (summaryError) return toast.error(summaryError);
    if (missing.length) return toast.error("Say what was achieved, or why not, for each open activity.");
    setBusy(true);
    try {
      await plansApi.act(plan.id, "report", { ...f, items: rows.map((i) => (department ? { id: i.id, achieved: i.achieved } : { id: i.id, status: i.status, progress: i.progress, achieved: i.achieved })) });
      toast.success(`Report on ${plan.number} sent to your supervisor`);
      onDone();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title={plan.plan_type === "task" ? `Report on “${plan.title}”` : `Report on the ${TYPE_INFO[plan.plan_type as PlanKind].label.toLowerCase()} · ${plan.period_label}`}
      description={`${ended ? "The period is over: report what was achieved." : "The period is not over yet; you can still report early."} ${plan.progress}% achieved. Your supervisor assesses it.`}
      footer={
        <>
          <Button onClick={onClose} disabled={busy}>Cancel</Button>
          <Button variant="primary" icon={Send} loading={busy} onClick={send}>Send the report</Button>
        </>
      }
    >
      <ModalSection title="Results">
        <Field label="What was achieved" required htmlFor="rep-summary" error={tried ? summaryError : null} hint="Results against the plan, with figures.">
          <Textarea id="rep-summary" className="min-h-[110px]" value={f.report_summary} invalid={Boolean(tried && summaryError)} onChange={(e) => setF({ ...f, report_summary: e.target.value })} placeholder="e.g. 58 of 60 councillors trained; satisfaction 87%" />
        </Field>
        {open.length > 0 && (
          <div className="rounded-control border border-ims-warning/30 bg-ims-warning-bg p-3">
            <p className="mb-2 text-t-small font-bold text-ims-warning">{department ? "Activities not completed: what was achieved, or why not" : "Activities not done: what was achieved, or why not"}</p>
            <div className="space-y-2">
              {open.map((i) => (
                <div key={i.id} className={cn("grid gap-2", !department && "sm:grid-cols-[1fr_200px]")}>
                  <Input
                    value={i.achieved}
                    placeholder={`${i.code ? `${i.code} · ` : ""}${i.title}`}
                    invalid={tried && !String(i.achieved || "").trim()}
                    onChange={(e) => setRows((xs) => xs.map((x) => (x.id === i.id ? { ...x, achieved: e.target.value } : x)))}
                    aria-label={`Achieved: ${i.title}`}
                  />
                  {!department && (
                    <Select value={i.status} onChange={(e) => setRows((xs) => xs.map((x) => (x.id === i.id ? { ...x, status: e.target.value } : x)))} aria-label={`Status: ${i.title}`}>
                      {Object.entries(ITEM_STATUS).map(([k, s]) => <option key={k} value={k}>{statusChoice(s)}</option>)}
                    </Select>
                  )}
                </div>
              ))}
            </div>
            {tried && missing.length > 0 && <p className="mt-2 text-t-hint text-ims-danger" role="alert">Say what was achieved, or why not, for each one ({missing.length} left).</p>}
          </div>
        )}
      </ModalSection>
      <ModalSection title="Challenges and next steps">
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Challenges" htmlFor="rep-challenges"><Textarea id="rep-challenges" className="min-h-[80px]" value={f.challenges} onChange={(e) => setF({ ...f, challenges: e.target.value })} /></Field>
          <Field label="Next steps" htmlFor="rep-next"><Textarea id="rep-next" className="min-h-[80px]" value={f.next_steps} onChange={(e) => setF({ ...f, next_steps: e.target.value })} /></Field>
          <Field label="Support needed" htmlFor="rep-support"><Textarea id="rep-support" className="min-h-[80px]" value={f.support_needed} onChange={(e) => setF({ ...f, support_needed: e.target.value })} /></Field>
        </div>
      </ModalSection>
      <ModalSection title="Self-rating" description="How would you rate your own work? Optional.">
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Self-rating">
          {[1, 2, 3, 4, 5].map((r) => (
            <button
              key={r}
              type="button"
              aria-pressed={f.self_rating === r}
              onClick={() => setF({ ...f, self_rating: r })}
              className={cn(
                "rounded-control border px-2.5 py-1.5 text-t-small font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ims-focus",
                f.self_rating === r ? "border-ims-link bg-ims-info-bg text-ims-primary" : "border-ims-field text-ims-muted hover:bg-ims-hover"
              )}
            >
              {r} · {RATING[r]}
            </button>
          ))}
        </div>
      </ModalSection>
    </Modal>
  );
}
