/**
 * New plan, edit a draft, or assign work (supervisors). Three numbered steps — what is planned, the period
 * and the plan it carries out, then the activities with what that level needs (indicator, unit, target,
 * weight, due date, evidence, cost) — with the department's activities to contribute to, and a live plan
 * check and summary beside the form. A new plan is kept on this device while it is being filled, so
 * nothing is lost.
 */
import * as React from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "react-query";
import { format } from "date-fns";
import { toast } from "sonner";
import { AlertTriangle, ArrowDown, ArrowUp, ClipboardList, CornerUpLeft, Info, ListPlus, Plus, RotateCcw, X } from "lucide-react";
import pocketbase from "@/lib/pocketbase";
import { useAuth } from "@/context/auth.context";
import { errorMessage } from "@/lib/procurement";
import {
  CONTRIBUTES, DepartmentActivity, EVIDENCE, NEEDS, PRIORITY, Period, PlanItem, PlanKind, TYPE_INFO, UNITS, WEEKDAYS, WHO, blankItem, dayOf, plansApi, qty,
} from "@/lib/plans";
import { Skeleton } from "@/components/ui/skeleton";
import { ChoiceCards } from "@/components/portal/kit";
import { DepartmentActivitiesCard } from "@/components/workspace/DepartmentActivities";
import {
  Button,
  ButtonLink,
  Card,
  Checkbox,
  DatePicker,
  EmptyState,
  ErrorSummary,
  Field,
  FormActions,
  FormBody,
  FormError,
  FormSection,
  Input,
  Modal,
  MoneyInput,
  Page,
  PageHeader,
  Select,
  SummaryPanel,
  fmtDate,
  fmtDateTime,
  fmtMoney,
} from "@/components/ims";
import { cn } from "@/utils";

const today = () => format(new Date(), "yyyy-MM-dd");
const LIST = "/dashboard/my/plans";
const FOCUS_MAX = 120;
const OWN_KINDS: PlanKind[] = ["weekly", "monthly", "quarterly", "annual", "department"];
const ASSIGN_KINDS: PlanKind[] = ["task", "weekly", "monthly", "quarterly", "annual"];
const PERIOD_LABEL: Record<PlanKind, string> = { weekly: "Week", monthly: "Month", quarterly: "Quarter", annual: "Fiscal year", department: "Month", task: "Dates" };
const GUIDE: Record<PlanKind, string> = {
  weekly: "List what you will do each day of the week, from your monthly plan. Keep it realistic: meetings, travel and reporting take time too.",
  monthly: "Each activity needs a measurable indicator, a target and a due date inside the month. Weights must add up to 100%.",
  quarterly: "Each output needs an indicator, a target and a weight; the weights add up to 100%.",
  annual: "3 to 6 SMART objectives, each with an indicator, the baseline, the target for the year, a weight (100% in total) and the evidence.",
  department: "Each department activity needs a target in a unit (people, districts…) and a due date in the month. Staff contribute to it from their monthly plans; their results add up here.",
  task: "Give the task its dates and its deliverables. It starts approved; the staff member records progress and reports to you.",
};
const SHORT_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/** Item fields in the order they appear in the form (for the error summary). */
const ITEM_FIELDS: (keyof PlanItem)[] = ["title", "due", "output", "objective", "indicator", "target", "weight"];

/** "19–23 Oct 2026", "26 Oct – 6 Nov 2026". */
function rangeLabel(a: string, b: string) {
  const [ya, ma, da] = a.split("-").map(Number);
  const [yb, mb, db] = b.split("-").map(Number);
  if (ya !== yb) return `${da} ${SHORT_MONTHS[ma - 1]} ${ya} – ${db} ${SHORT_MONTHS[mb - 1]} ${yb}`;
  if (ma !== mb) return `${da} ${SHORT_MONTHS[ma - 1]} – ${db} ${SHORT_MONTHS[mb - 1]} ${yb}`;
  return da === db ? `${da} ${SHORT_MONTHS[ma - 1]} ${ya}` : `${da}–${db} ${SHORT_MONTHS[ma - 1]} ${ya}`;
}

/** A line of guidance or warning inside the form. */
function Notice({ tone, icon: Icon, children, role }: { tone: "info" | "warning" | "orange"; icon: typeof Info; children: React.ReactNode; role?: string }) {
  const cls = { info: "border-ims-info/20 bg-ims-info-bg text-ims-info", warning: "border-ims-warning/30 bg-ims-warning-bg text-ims-warning", orange: "border-ims-orange/30 bg-ims-orange-bg text-ims-orange" }[tone];
  return (
    <div role={role} className={cn("flex items-start gap-2 rounded-control border px-3 py-2.5 text-t-body", cls)}>
      <Icon size={16} className="mt-0.5 shrink-0" aria-hidden />
      <div className="min-w-0">{children}</div>
    </div>
  );
}

/** Day / quarter toggles: several can be on. */
function Toggle({ on, onClick, children, label }: { on: boolean; onClick: () => void; children: React.ReactNode; label?: string }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      aria-label={label}
      onClick={onClick}
      className={cn(
        "h-control min-w-0 flex-1 rounded-control border text-t-small font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ims-focus",
        on ? "border-ims-link bg-ims-info-bg text-ims-primary" : "border-ims-field bg-ims-card text-ims-muted hover:bg-ims-hover"
      )}
    >
      {children}
    </button>
  );
}

type ItemErrors = Partial<Record<keyof PlanItem, string>>;

export default function PlanEditor() {
  const { planId } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { user }: any = useAuth();
  const uid: string = user?.id || "";
  const editing = Boolean(planId);
  const assignMode = !editing && params.has("assign");
  const draftKey = `ims.plan-draft.${uid}.${assignMode ? "assign" : "own"}`;
  const urlKind = params.get("type") as PlanKind | null;
  const kinds = assignMode ? ASSIGN_KINDS : OWN_KINDS;

  const ctx = useQuery(["plan-context", uid], () => plansApi.context(), { enabled: Boolean(uid), staleTime: 300_000 });
  const existing = useQuery(["work-plan", planId], () => pocketbase.collection("work_plans").getOne(planId!), { enabled: editing });
  const team = useQuery(["plans-team", uid], () => plansApi.team(), { enabled: assignMode });
  const objectives = useQuery(["strategic-objectives-active"], () => pocketbase.collection("strategic_objectives").getFullList({ filter: "active = true", sort: "sort,code" }), { staleTime: 600_000 });

  const [kind, setKind] = React.useState<PlanKind>(urlKind && kinds.includes(urlKind) ? urlKind : assignMode ? "task" : "monthly");
  const [staffId, setStaffId] = React.useState(assignMode && params.get("assign") !== "1" ? params.get("assign") || "" : "");
  const [periodStart, setPeriodStart] = React.useState(params.get("date") || "");
  const [taskStart, setTaskStart] = React.useState(today());
  const [taskEnd, setTaskEnd] = React.useState("");
  const [parent, setParent] = React.useState("");
  const [focus, setFocus] = React.useState("");
  const [title, setTitle] = React.useState("");
  const [source, setSource] = React.useState("");
  const [instructions, setInstructions] = React.useState("");
  const [items, setItems] = React.useState<PlanItem[]>([blankItem()]);
  const [tried, setTried] = React.useState(false);
  const [busy, setBusy] = React.useState<"" | "draft" | "send">("");
  const [savedAt, setSavedAt] = React.useState<Date | null>(null);
  const [restoredAt, setRestoredAt] = React.useState<Date | null>(null);
  const loadedExisting = React.useRef(false);
  const periodTouched = React.useRef(Boolean(params.get("date")));
  const restored = React.useRef(false);

  // an existing draft / returned plan
  React.useEffect(() => {
    const p: any = existing.data;
    if (!p || loadedExisting.current) return;
    loadedExisting.current = true;
    setKind(p.plan_type);
    setPeriodStart(dayOf(p.period_start));
    setTaskStart(dayOf(p.period_start));
    setTaskEnd(dayOf(p.period_end));
    setParent(p.parent || "");
    setFocus(p.focus || "");
    setTitle(p.plan_type === "task" ? p.title || "" : "");
    setItems((p.items || []).length ? (p.items || []).map((i: any) => ({ ...blankItem(), ...i, actual: i.actual ?? null })) : [blankItem()]);
  }, [existing.data]);

  // a new plan left unfinished on this device
  React.useEffect(() => {
    if (editing || restored.current || !uid) return;
    restored.current = true;
    if (params.get("type") || params.get("date")) return;
    try {
      const raw = localStorage.getItem(draftKey);
      if (!raw) return;
      const d = JSON.parse(raw);
      if (!d || Date.now() - Number(d.at) > 14 * 864e5) {
        localStorage.removeItem(draftKey);
        return;
      }
      if (d.kind && kinds.includes(d.kind)) setKind(d.kind);
      setStaffId(d.staffId || staffId);
      setPeriodStart(d.periodStart || "");
      setTaskStart(d.taskStart || today());
      setTaskEnd(d.taskEnd || "");
      setParent(d.parent || "");
      setFocus(d.focus || "");
      setTitle(d.title || "");
      setSource(d.source || "");
      setInstructions(d.instructions || "");
      if (Array.isArray(d.items) && d.items.length) setItems(d.items.map((i: any) => ({ ...blankItem(), ...i })));
      setRestoredAt(new Date(Number(d.at)));
    } catch (_) {
      // nothing saved, or storage unavailable
    }
  }, [uid]); // eslint-disable-line react-hooks/exhaustive-deps

  // keep the form on this device while it is filled
  React.useEffect(() => {
    if (editing || !uid) return;
    const touched = items.some((i) => i.title.trim() || i.indicator.trim()) || focus.trim() || title.trim();
    if (!touched) return;
    const t = window.setTimeout(() => {
      try {
        localStorage.setItem(draftKey, JSON.stringify({ kind, staffId, periodStart, taskStart, taskEnd, parent, focus, title, source, instructions, items, at: Date.now() }));
        setSavedAt(new Date());
      } catch (_) {
        // storage full or blocked: the form still works
      }
    }, 800);
    return () => window.clearTimeout(t);
  }, [kind, staffId, periodStart, taskStart, taskEnd, parent, focus, title, source, instructions, items]); // eslint-disable-line react-hooks/exhaustive-deps

  const forget = () => {
    try {
      localStorage.removeItem(draftKey);
    } catch (_) {
      // ignore
    }
  };
  function discard() {
    forget();
    setItems([blankItem()]);
    setFocus("");
    setTitle("");
    setSource("");
    setInstructions("");
    setParent("");
    setPeriodStart("");
    setRestoredAt(null);
    setSavedAt(null);
    setTried(false);
  }

  // whose plan it is, and their department
  const subject: string = assignMode ? staffId : editing ? (existing.data as any)?.staff || uid : uid;
  const subjectUser = useQuery(["plan-subject-user", subject], () => pocketbase.collection("users").getOne(subject, { fields: "id,name,department" }), { enabled: Boolean(subject) && subject !== uid });
  const deptId: string | undefined = subject === uid ? ctx.data?.department?.id : (subjectUser.data as any)?.department;
  const staffName = assignMode ? (team.data || []).find((m) => m.id === staffId)?.name || (subjectUser.data as any)?.name || "" : "";

  // periods on offer and the subject's plans (to avoid duplicates and to align with higher plans)
  const periods = useQuery(["plan-periods", kind], () => plansApi.periods(kind), { enabled: kind !== "task", staleTime: 600_000 });
  const plans = useQuery(["plan-subject-plans", subject, deptId], () => pocketbase.collection("work_plans").getFullList({
    filter: `staff = "${subject}"${deptId ? ` || (plan_type = "department" && department = "${deptId}")` : ""}`,
    sort: "-period_start", fields: "id,number,plan_type,period_start,period_end,period_label,status,items,staff,department",
  }), { enabled: Boolean(subject) });
  const all = (plans.data || []) as any[];
  const sameKind = (p: any) => (kind === "department" ? p.plan_type === "department" && p.department === deptId : p.plan_type === kind && p.staff === subject);

  React.useEffect(() => {
    if (kind === "task" || !periods.data?.length || (subject && !plans.data)) return;
    const list = periods.data;
    const free = (start: string) => !all.some((p) => p.id !== planId && sameKind(p) && dayOf(p.period_start) === start);
    if (periodStart && list.some((p) => p.start === periodStart) && (periodTouched.current || editing || free(periodStart))) return;
    const containing = periodStart ? list.find((p) => p.start <= periodStart && p.end >= periodStart) : undefined;
    if (containing) return setPeriodStart(containing.start);
    if (editing && periodStart) return;
    const taken = new Set(all.filter((p) => sameKind(p) && p.id !== planId).map((p) => dayOf(p.period_start)));
    const cur = Math.max(0, list.findIndex((p) => p.current));
    const pick = list.slice(cur).find((p) => !taken.has(p.start)) || list[cur];
    setPeriodStart(pick.start);
  }, [periods.data, kind, plans.data]); // eslint-disable-line react-hooks/exhaustive-deps

  const period: Period | null = kind === "task"
    ? (taskStart && taskEnd && taskEnd >= taskStart ? { start: taskStart, end: taskEnd, label: rangeLabel(taskStart, taskEnd), fiscal_year: 0 } : null)
    : (periods.data || []).find((p) => p.start === periodStart)
      || (editing && existing.data ? { start: dayOf((existing.data as any).period_start), end: dayOf((existing.data as any).period_end), label: (existing.data as any).period_label, fiscal_year: 0 } : null);
  const clash = kind === "task" || !period ? null : all.find((p) => p.id !== planId && sameKind(p) && dayOf(p.period_start) === period.start);

  const info = TYPE_INFO[kind];
  const need = NEEDS[kind];
  const noun = info.item;
  const parents = period ? all.filter((p) => p.staff === subject && info.parent.includes(p.plan_type) && p.id !== planId && !["draft", "returned"].includes(p.status) && dayOf(p.period_start) <= period.end && dayOf(p.period_end) >= period.start) : [];
  parents.sort((a, b) => ["monthly", "quarterly", "annual"].indexOf(a.plan_type) - ["monthly", "quarterly", "annual"].indexOf(b.plan_type));
  React.useEffect(() => {
    if (!plans.data) return;
    if (parent && !parents.some((p) => p.id === parent)) setParent("");
    if (!parent && parents.length && !editing) setParent(parents[0].id);
  }, [period?.start, plans.data, kind]); // eslint-disable-line react-hooks/exhaustive-deps
  const parentPlan = parents.find((p) => p.id === parent);

  // the department's activities for the period (monthly plans and tasks contribute to them)
  const showDept = CONTRIBUTES.includes(kind) && Boolean(period) && Boolean(deptId);
  const dept = useQuery(["plan-dept-view", deptId, period?.start], () => plansApi.department(period!.start, deptId), { enabled: showDept });
  const das = dept.data?.plan ? dept.data.activities : [];
  const linked = new Set(items.filter((i) => i.department_activity).map((i) => i.department_activity));
  const daOf = (id: string) => das.find((a) => a.id === id);

  const set = (i: number, patch: Partial<PlanItem>) => setItems((xs) => xs.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  const move = (i: number, d: -1 | 1) => setItems((xs) => {
    const n = [...xs];
    const [a] = n.splice(i, 1);
    n.splice(Math.max(0, Math.min(n.length, i + d)), 0, a);
    return n;
  });
  const empty = (i: PlanItem) => !i.title.trim() && !i.output.trim() && !i.indicator.trim();
  function contribute(a: DepartmentActivity) {
    if (!dept.data?.plan || !period) return;
    const due = a.due && a.due >= period.start && a.due <= period.end ? a.due : period.end;
    setItems((xs) => [...xs.filter((x) => !empty(x)), {
      ...blankItem(), title: a.title, output: a.output, indicator: a.indicator, unit: a.unit, target: a.remaining !== null ? String(a.remaining) : a.target, due, objective: a.objective,
      department_plan: dept.data!.plan!.id, department_activity: a.id,
    }]);
    toast.success(`${a.code} added to your plan — set your share and the weight.`);
  }
  function linkActivity(i: number, id: string) {
    const a = daOf(id);
    if (!a) return set(i, { department_plan: "", department_activity: "" });
    set(i, { department_plan: dept.data!.plan!.id, department_activity: a.id, unit: items[i].unit || a.unit, indicator: items[i].indicator || a.indicator, objective: items[i].objective || a.objective });
  }

  // ---------------------------------------------------------------- checks
  const live = items.filter((i) => !empty(i));
  const itemErrors: ItemErrors[] = items.map((it) => {
    const e: ItemErrors = {};
    if (empty(it) && items.length > 1) return e;
    if (it.title.trim().length < 3) e.title = `Describe the ${noun.toLowerCase()} (at least 3 characters).`;
    if (need.due && !it.due) e.due = "Give the due date.";
    if (it.due && period && (it.due < period.start || it.due > period.end)) e.due = `Between ${fmtDate(period.start)} and ${fmtDate(period.end)}.`;
    if (need.output && !it.output.trim()) e.output = "Say what it will produce.";
    if (need.objective && !it.objective) e.objective = "Choose the strategic objective.";
    if (need.measure && !it.indicator.trim()) e.indicator = "Say how it is measured.";
    if (need.measure && !String(it.target).trim()) e.target = "Give the target.";
    if (need.weights && !(Number(it.weight) > 0)) e.weight = "Give its weight.";
    return e;
  });
  const topErrors: Record<string, string> = {};
  if (assignMode && !staffId) topErrors.staff = "Choose the person.";
  if (kind === "task" && title.trim().length < 5) topErrors.title = "Name the task (at least 5 characters).";
  if (kind === "task" && (!taskStart || !taskEnd)) topErrors.dates = "Give the start and end dates.";
  else if (kind === "task" && taskEnd < taskStart) topErrors.dates = "The task ends before it starts.";
  if (kind !== "task" && !period) topErrors.period = "Choose the period.";
  const fieldsToFix = itemErrors.reduce((n, e) => n + Object.keys(e).length, 0) + Object.keys(topErrors).length;
  const weightTotal = live.reduce((s, i) => s + (Number(i.weight) || 0), 0);
  const weightsOk = !need.weights || weightTotal === 100;
  const measured = live.filter((i) => i.indicator.trim() && String(i.target).trim()).length;
  const linkedCount = live.filter((i) => i.department_activity).length;
  const cost = live.reduce((s, i) => s + (Number(i.cost) || 0), 0);
  const shown = (e?: string) => (tried ? e : undefined);

  async function save(send: boolean) {
    setTried(true);
    const cleaned = items.filter((i) => !empty(i));
    if (!period) return toast.error(topErrors.dates || "Choose the period.");
    if (clash) return toast.error(`There is already a ${info.label.toLowerCase()} for ${period.label} (${clash.number}).`);
    if (!cleaned.length) return toast.error(`Add at least one ${noun.toLowerCase()}.`);
    if (cleaned.some((i) => i.title.trim().length < 3)) return toast.error(`Name each ${noun.toLowerCase()} (at least 3 characters).`);
    if ((send || assignMode) && (fieldsToFix || !weightsOk)) return toast.error(!weightsOk && !fieldsToFix ? `The weights add up to ${weightTotal}%; they must add up to 100%.` : `${fieldsToFix} field${fieldsToFix === 1 ? "" : "s"} to fix — shown in red.`);
    const body = cleaned.map((i) => ({ ...i, weight: Number(i.weight) || 0, cost: Number(i.cost) || 0 }));
    setBusy(send || assignMode ? "send" : "draft");
    try {
      if (assignMode) {
        const r = await plansApi.assign({ staff: staffId, plan_type: kind, start: period.start, end: period.end, date: period.start, title: title.trim(), focus: focus.trim(), parent, source: source.trim(), instructions: instructions.trim(), items: body });
        forget();
        toast.success(`${r.number} assigned to ${staffName || "the staff member"}`);
        qc.invalidateQueries(["team-plans"]);
        navigate(`/dashboard/my/plans/${r.id}`);
        return;
      }
      const data = { staff: uid, plan_type: kind, period_start: `${period.start} 12:00:00.000Z`, parent, focus: focus.trim(), items: body };
      const r: any = editing ? await pocketbase.collection("work_plans").update(planId!, data) : await pocketbase.collection("work_plans").create(data);
      if (send) {
        const s = await plansApi.act(r.id, "submit");
        toast.success(s.status === "approved" ? `${r.number} saved and approved` : `${r.number} sent to ${ctx.data?.supervisor?.name || "your supervisor"}`);
      } else toast.success(`${r.number} saved as a draft`);
      forget();
      qc.invalidateQueries(["my-plans"]);
      navigate(`/dashboard/my/plans/${r.id}`);
    } catch (e: any) {
      // one plan per kind and period: the database refuses a second one before any rule runs
      if (e?.response?.data?.period_start?.code === "validation_not_unique") toast.error(`There is already a ${info.label.toLowerCase()} for ${period.label}. Open it from My plans.`);
      else toast.error(errorMessage(e));
    } finally {
      setBusy("");
    }
  }
  const back = assignMode ? `${LIST}?tab=team` : LIST;
  if (editing && existing.isLoading) {
    return (
      <Page>
        <Skeleton className="h-10 w-72" />
        <Skeleton className="h-[480px] w-full" />
      </Page>
    );
  }
  const existingPlan: any = existing.data;
  if (editing && existingPlan && !["draft", "returned"].includes(existingPlan.status)) {
    return (
      <Page>
        <Card>
          <EmptyState
            icon={ClipboardList}
            text={`${existingPlan.number} has been sent, so it can no longer be edited. Open it to record progress.`}
            action={<ButtonLink to={`${LIST}/${existingPlan.id}`} variant="primary">Open {existingPlan.number}</ButtonLink>}
          />
        </Card>
      </Page>
    );
  }

  const supervisor = ctx.data?.supervisor;
  const route: string[] = assignMode ? ["You", staffName || "Staff member"] : kind === "department" ? ["You", supervisor?.name || "Secretary General"] : supervisor ? ["You", supervisor.name] : ["You"];
  const sendLabel = assignMode ? (staffName ? `Assign to ${staffName.split(" ")[0]}` : "Assign") : supervisor ? `Save and send to ${kind === "department" ? supervisor.name.split(" ")[0] : "my supervisor"}` : "Save and approve";
  const linkedHint = (it: PlanItem) => {
    const a = it.department_activity ? daOf(it.department_activity) : undefined;
    return a ? `${a.title}: ${a.progress}% achieved${a.remaining !== null ? ` · ${qty(a.remaining, a.unit)} still to do` : ""}. Your result will count towards it.` : "";
  };
  const pageTitle = assignMode ? "Assign work" : editing ? `Edit ${existingPlan?.number || "plan"}` : "New plan";

  // what to fix, with links to each field (shown after the first save or send)
  const summaryErrors: FormError[] = [
    ...(topErrors.staff ? [{ field: "pl-staff", message: topErrors.staff }] : []),
    ...(topErrors.title ? [{ field: "pl-title", message: topErrors.title }] : []),
    ...(topErrors.dates ? [{ field: "pl-start", message: topErrors.dates }] : []),
    ...(topErrors.period ? [{ field: "pl-period", message: topErrors.period }] : []),
    ...(clash ? [{ field: "pl-period", message: `There is already a ${info.label.toLowerCase()} for ${period?.label} (${clash.number}). Choose another period.` }] : []),
    ...itemErrors.flatMap((e, i) => ITEM_FIELDS.filter((k) => e[k]).map((k) => ({ field: `it-${i}-${k}`, message: `${noun} ${i + 1}: ${e[k]}` }))),
    ...(need.weights && !weightsOk && live.length ? [{ field: "it-0-weight", message: `The weights add up to ${weightTotal}%; they must add up to 100%.` }] : []),
  ];

  const levelCheck =
    kind === "annual" ? { label: "Top of the cycle: your quarterly plans carry it out", done: true }
    : kind === "department" ? { label: "Department level: staff contribute from their monthly plans", done: true }
    : kind === "task" ? { label: staffId ? `For ${staffName || "the staff member"} · starts approved` : "Choose the person", done: Boolean(staffId) }
    : { label: parentPlan ? "Linked to a higher plan" : parents.length ? "Choose the plan it carries out" : "No approved higher plan for this period", done: Boolean(parentPlan) };

  return (
    <Page>
      <PageHeader
        breadcrumbs={[{ label: "My workspace", to: "/dashboard/my" }, { label: assignMode ? "My team's plans" : "My plans & reports", to: back }, { label: pageTitle }]}
        title={pageTitle}
        subtitle={assignMode ? "Give a member of your team a task with its own dates, or set one of their plans. It starts approved." : "Plan from the top down. Your supervisor approves the plan before you start."}
      />

      {!editing && restoredAt && (
        <Notice tone="info" icon={RotateCcw} role="status">
          <span className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <span>Draft restored from this device · saved {fmtDateTime(restoredAt)}.</span>
            <Button size="sm" onClick={discard}>Discard it</Button>
          </span>
        </Notice>
      )}
      {editing && existingPlan?.status === "returned" && (
        <Notice tone="orange" icon={CornerUpLeft} role="status">
          Your supervisor returned this plan{existingPlan.review_comment ? `: “${existingPlan.review_comment}”` : ""}. Correct it and send it again.
        </Notice>
      )}

      <ErrorSummary errors={tried ? summaryErrors : []} title="Check these fields before you send" />

      <FormBody
        aside={
          <SummaryPanel
            title="Plan check"
            rows={[
              ["Plan", info.label],
              ["Period", period?.label || "—"],
              [info.items, String(live.length)],
              ...(showDept && das.length ? [["Linked to department", `${linkedCount} of ${live.length}`] as [string, React.ReactNode]] : []),
              ...(kind !== "weekly" && kind !== "annual" ? [["Estimated cost", fmtMoney(cost)] as [string, React.ReactNode]] : []),
            ]}
            checklist={[
              { label: clash ? `Period already planned (${clash.number})` : period ? `Period: ${period.label}` : "Choose the period", done: Boolean(period) && !clash },
              levelCheck,
              {
                label: !live.length ? `Add at least one ${noun.toLowerCase()}` : `${live.length} ${live.length === 1 ? noun.toLowerCase() : info.items.toLowerCase()}${need.measure ? (measured === live.length ? ", each with indicator and target" : ` · ${live.length - measured} without indicator or target`) : ""}`,
                done: live.length > 0 && (!need.measure || measured === live.length),
              },
              ...(need.weights ? [{ label: `Weights total ${weightTotal}%${weightTotal < 100 ? ` · ${100 - weightTotal}% still to assign` : weightTotal > 100 ? ` · ${weightTotal - 100}% too much` : ""}`, done: weightTotal === 100 }] : []),
              { label: fieldsToFix ? `${fieldsToFix} field${fieldsToFix === 1 ? "" : "s"} to fix${tried ? ", shown in red" : ""}` : "Required fields filled", done: fieldsToFix === 0 },
              ...(showDept && das.length > 0 ? [{ label: `${linkedCount} linked to department activities`, done: linkedCount > 0 }] : []),
            ]}
          >
            <div className="mt-4 border-t border-ims-divider pt-4">
              <p className="mb-2 text-t-small font-bold text-ims-muted">{assignMode ? "Assigned to" : "Approval route"}</p>
              <div className="flex flex-wrap items-center gap-1.5">
                {route.map((r, k) => (
                  <React.Fragment key={k}>
                    {k > 0 && <span className="text-ims-faint" aria-hidden>→</span>}
                    <span className="rounded-control border border-ims-field bg-ims-thead px-2 py-0.5 text-t-small font-bold text-ims-text">{r}</span>
                  </React.Fragment>
                ))}
                {!assignMode && !supervisor && ctx.data && <span className="text-t-small text-ims-muted">approved when you send it</span>}
              </div>
            </div>
          </SummaryPanel>
        }
      >
        {/* 1 · what */}
        <FormSection title={assignMode ? "What are you assigning?" : "What are you planning?"} description={assignMode ? "The person, then a task or one of their plans." : "Each level carries out the one above it."}>
          {assignMode && (
            <Field label="Assign to" required error={shown(topErrors.staff)} className="max-w-md" htmlFor="pl-staff">
              <Select id="pl-staff" invalid={Boolean(shown(topErrors.staff))} value={staffId} onChange={(e) => { setStaffId(e.target.value); setParent(""); }}>
                <option value="">Choose a member of your team</option>
                {(team.data || []).map((m) => <option key={m.id} value={m.id}>{m.name}{m.designation ? ` — ${m.designation}` : ""}{m.department ? ` (${m.department})` : ""}</option>)}
              </Select>
            </Field>
          )}
          <ChoiceCards<PlanKind>
            value={kind}
            columns={3}
            onChange={(k) => { setKind(k); setPeriodStart(""); setParent(""); periodTouched.current = false; }}
            options={kinds.map((k) => ({
              value: k,
              label: TYPE_INFO[k].label,
              description: `${TYPE_INFO[k].hint} Who: ${assignMode ? (k === "task" ? "you assign it" : "you set it") : WHO[k].toLowerCase()}.`,
              disabled: (k === "department" && !ctx.data?.is_head) || (editing && k !== kind),
            }))}
          />
        </FormSection>

        {/* 2 · when and aligned with what */}
        <FormSection title="Period and alignment" description={kind === "task" ? "The task's own dates." : "The period, and the approved plan this one carries out."}>
          {kind === "task" ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Task" required error={shown(topErrors.title)} className="sm:col-span-2" htmlFor="pl-title">
                <Input id="pl-title" invalid={Boolean(shown(topErrors.title))} value={title} maxLength={200} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Support Gakenke district budget hearings" />
              </Field>
              <Field label="Starts" required htmlFor="pl-start" error={shown(topErrors.dates)}>
                <DatePicker id="pl-start" invalid={Boolean(shown(topErrors.dates))} value={taskStart} onChange={setTaskStart} />
              </Field>
              <Field label="Ends" required htmlFor="pl-end" hint={period ? period.label : undefined}>
                <DatePicker id="pl-end" invalid={Boolean(shown(topErrors.dates))} value={taskEnd} min={taskStart || undefined} onChange={setTaskEnd} />
              </Field>
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-3">
              <Field label={PERIOD_LABEL[kind]} required htmlFor="pl-period" error={shown(topErrors.period)} hint={period ? `${fmtDate(period.start)} – ${fmtDate(period.end)}` : undefined}>
                <Select id="pl-period" invalid={Boolean(shown(topErrors.period)) || Boolean(clash)} value={periodStart} onChange={(e) => { periodTouched.current = true; setPeriodStart(e.target.value); }}>
                  {!periods.data && <option value="">Loading…</option>}
                  {(periods.data || []).map((p) => {
                    const has = all.some((x) => x.id !== planId && sameKind(x) && dayOf(x.period_start) === p.start);
                    return <option key={p.start} value={p.start}>{p.label}{p.current ? " (current)" : ""}{has ? " — planned" : ""}</option>;
                  })}
                  {period && !(periods.data || []).some((p) => p.start === period.start) && <option value={period.start}>{period.label}</option>}
                </Select>
              </Field>
              {kind !== "annual" ? (
                <Field
                  label="Contributes to"
                  required={info.parent.length > 0 && parents.length > 0 && kind !== "department"}
                  htmlFor="pl-parent"
                  hint={parents.length ? "The approved plan for a longer period that this one carries out." : `No approved ${info.parent.map((k) => TYPE_INFO[k].short.toLowerCase()).join(" or ")} plan covers this period yet.`}
                >
                  <Select id="pl-parent" value={parent} onChange={(e) => setParent(e.target.value)}>
                    <option value="">{parents.length ? "Not linked" : "—"}</option>
                    {parents.map((p) => <option key={p.id} value={p.id}>{TYPE_INFO[p.plan_type as PlanKind].label} · {p.period_label.split(" · ")[0]} ({p.status === "approved" ? "approved" : p.status})</option>)}
                  </Select>
                </Field>
              ) : (
                <Field label="Contributes to" htmlFor="pl-parent" hint="The top of your cycle: your quarterly plans carry it out.">
                  <Input id="pl-parent" value={ctx.data?.department ? `${ctx.data.department.name} objectives` : "RALGA strategic objectives"} disabled readOnly />
                </Field>
              )}
              <Field label="Main focus of the period" htmlFor="pl-focus" hint={`${focus.length} of ${FOCUS_MAX} characters`}>
                <Input id="pl-focus" value={focus} maxLength={FOCUS_MAX} onChange={(e) => setFocus(e.target.value)} placeholder={kind === "annual" ? "e.g. Councillors' leadership and district PFM" : "e.g. Gakenke training and the budgeting guide"} />
              </Field>
            </div>
          )}
          {assignMode && (
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Where it comes from" htmlFor="pl-source" hint="Optional, e.g. the strategic plan or a request from the Secretary General.">
                <Input id="pl-source" value={source} maxLength={200} onChange={(e) => setSource(e.target.value)} placeholder="e.g. RALGA Strategic Plan · Capacity Building" />
              </Field>
              <Field label="Instructions" htmlFor="pl-instr" hint="What the person should know before starting.">
                <Input id="pl-instr" value={instructions} maxLength={1000} onChange={(e) => setInstructions(e.target.value)} placeholder="e.g. Coordinate with the district planner; report by Friday 6 Nov" />
              </Field>
            </div>
          )}
          <Notice tone="info" icon={Info}>{GUIDE[kind]}</Notice>
          {clash && (
            <Notice tone="warning" icon={AlertTriangle} role="alert">
              There is already a {info.label.toLowerCase()} for {period?.label} ({clash.number}).{" "}
              <Link to={`${LIST}/${clash.id}`} className="font-bold text-ims-link hover:underline">Open it</Link> or choose another period.
            </Notice>
          )}
        </FormSection>

        {/* department activities to contribute to */}
        {showDept && (
          <DepartmentActivitiesCard
            view={dept.data}
            loading={dept.isLoading}
            linked={linked}
            onContribute={kind === "department" ? undefined : contribute}
            empty={`No department plan shared for ${period?.label} yet — your head of department prepares it. You can still plan your own activities.`}
          />
        )}

        {/* 3 · activities */}
        <FormSection title={info.items} description={`${live.length} ${live.length === 1 ? noun.toLowerCase() : info.items.toLowerCase()} · ${need.weights ? "weights add up to 100%" : "in the order you will do them"}`}>
          <ol className="divide-y divide-ims-divider rounded-control border border-ims-border">
            {items.map((it, i) => {
              const e = itemErrors[i];
              const a = it.department_activity ? daOf(it.department_activity) : undefined;
              const id = (k: string) => `it-${i}-${k}`;
              const measureWide = kind === "annual" || kind === "quarterly";
              return (
                <li key={i} className="px-3 py-4 sm:px-4">
                  <div className="mb-3 flex flex-wrap items-center gap-2">
                    <span className="text-t-body font-extrabold text-ims-primary">{noun} {i + 1}</span>
                    {(a || it.department_activity) && <span className="rounded-pill bg-ims-orange-bg px-2 py-0.5 text-t-hint font-bold text-ims-orange">Contributes to {a?.code || "a department activity"}</span>}
                    {kind === "department" && it.code && <span className="rounded-pill bg-ims-orange-bg px-2 py-0.5 text-t-hint font-bold text-ims-orange">{it.code}</span>}
                    <span className="ml-auto flex gap-0.5">
                      <Button size="icon-sm" variant="ghost" icon={ArrowUp} aria-label={`Move ${noun.toLowerCase()} ${i + 1} up`} disabled={i === 0} onClick={() => move(i, -1)} />
                      <Button size="icon-sm" variant="ghost" icon={ArrowDown} aria-label={`Move ${noun.toLowerCase()} ${i + 1} down`} disabled={i === items.length - 1} onClick={() => move(i, 1)} />
                      <Button size="icon-sm" variant="ghost" icon={X} aria-label={`Remove ${noun.toLowerCase()} ${i + 1}`} className="text-ims-danger hover:bg-ims-danger-bg hover:text-ims-danger" disabled={items.length === 1} onClick={() => setItems((xs) => xs.filter((_, j) => j !== i))} />
                    </span>
                  </div>

                  <div className="grid gap-4 md:grid-cols-12">
                    <Field label={noun} required className="md:col-span-8" error={shown(e.title)} htmlFor={id("title")}>
                      <Input
                        id={id("title")}
                        invalid={Boolean(shown(e.title))}
                        value={it.title}
                        maxLength={200}
                        onChange={(ev) => set(i, { title: ev.target.value })}
                        placeholder={kind === "annual" ? "e.g. Train newly elected councillors on their roles" : kind === "quarterly" ? "e.g. Induction training for councillors of 4 districts" : kind === "task" ? "e.g. Draft the hearing agenda with the district" : "e.g. Train Gakenke district finance staff"}
                      />
                    </Field>
                    {kind === "weekly" ? (
                      <Field label="Days" className="md:col-span-4">
                        <div className="flex gap-1" role="group" aria-label={`Days of ${noun.toLowerCase()} ${i + 1}`}>
                          {WEEKDAYS.map(([k, l]) => (
                            <Toggle key={k} on={it.days.includes(k)} onClick={() => set(i, { days: it.days.includes(k) ? it.days.filter((d) => d !== k) : [...it.days, k] })}>{l}</Toggle>
                          ))}
                        </div>
                      </Field>
                    ) : kind === "annual" ? (
                      <Field label="Quarters" className="md:col-span-4">
                        <div className="flex gap-1" role="group" aria-label={`Quarters of ${noun.toLowerCase()} ${i + 1}`}>
                          {[1, 2, 3, 4].map((qn) => (
                            <Toggle key={qn} on={it.quarters.includes(qn)} onClick={() => set(i, { quarters: it.quarters.includes(qn) ? it.quarters.filter((x) => x !== qn) : [...it.quarters, qn].sort() })}>Q{qn}</Toggle>
                          ))}
                        </div>
                      </Field>
                    ) : (
                      <Field label="Due date" required={need.due} className="md:col-span-4" error={shown(e.due)} hint={period ? `Between ${fmtDate(period.start)} and ${fmtDate(period.end)}` : undefined} htmlFor={id("due")}>
                        <DatePicker id={id("due")} invalid={Boolean(shown(e.due))} value={it.due} min={period?.start} max={period?.end} onChange={(v) => set(i, { due: v })} />
                      </Field>
                    )}

                    <Field label={kind === "annual" ? "Key result" : "Expected output"} required={need.output} className="md:col-span-5" error={shown(e.output)} htmlFor={id("output")}>
                      <Input id={id("output")} invalid={Boolean(shown(e.output))} value={it.output} maxLength={500} onChange={(ev) => set(i, { output: ev.target.value })} placeholder="What will exist when it is done" />
                    </Field>
                    <Field label="Priority" className="md:col-span-3" htmlFor={id("priority")}>
                      <Select id={id("priority")} value={it.priority} onChange={(ev) => set(i, { priority: ev.target.value })}>
                        {Object.entries(PRIORITY).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                      </Select>
                    </Field>
                    <Field label="Strategic objective" required={need.objective} className="md:col-span-4" error={shown(e.objective)} htmlFor={id("objective")}>
                      <Select id={id("objective")} invalid={Boolean(shown(e.objective))} value={it.objective} onChange={(ev) => set(i, { objective: ev.target.value })}>
                        <option value="">Choose an objective</option>
                        {((objectives.data || []) as any[]).map((o) => <option key={o.id} value={o.id}>{o.code} · {o.name}</option>)}
                      </Select>
                    </Field>

                    {kind !== "weekly" && (
                      <div className="grid gap-4 rounded-control bg-ims-subtle p-4 md:col-span-12 md:grid-cols-12">
                        <Field label="Indicator" required={need.measure} className={measureWide ? "md:col-span-4" : "md:col-span-5"} error={shown(e.indicator)} htmlFor={id("indicator")}>
                          <Input id={id("indicator")} invalid={Boolean(shown(e.indicator))} value={it.indicator} maxLength={300} onChange={(ev) => set(i, { indicator: ev.target.value })} placeholder="e.g. Number of finance staff trained" />
                        </Field>
                        <Field label="Unit" className={measureWide ? "md:col-span-2" : "md:col-span-3"} htmlFor={id("unit")} hint={a ? "From the department activity" : undefined}>
                          <Select id={id("unit")} value={it.unit} onChange={(ev) => set(i, { unit: ev.target.value })} disabled={Boolean(a)}>
                            <option value="">—</option>
                            {UNITS.concat(it.unit && !UNITS.includes(it.unit) ? [it.unit] : []).map((u) => <option key={u} value={u}>{u}</option>)}
                          </Select>
                        </Field>
                        {measureWide && (
                          <Field label="Baseline" className="md:col-span-2" htmlFor={id("baseline")}>
                            <Input id={id("baseline")} value={it.baseline} maxLength={100} onChange={(ev) => set(i, { baseline: ev.target.value })} placeholder="Today" />
                          </Field>
                        )}
                        <Field label="Target" required={need.measure} className="md:col-span-2" error={shown(e.target)} htmlFor={id("target")}>
                          <Input id={id("target")} invalid={Boolean(shown(e.target))} value={it.target} maxLength={100} onChange={(ev) => set(i, { target: ev.target.value })} placeholder="e.g. 24" />
                        </Field>
                        {need.weights ? (
                          <Field label="Weight (%)" required className="md:col-span-2" error={shown(e.weight)} htmlFor={id("weight")}>
                            <Input id={id("weight")} type="number" min={0} max={100} inputMode="numeric" className="text-right tabular-nums" invalid={Boolean(shown(e.weight))} value={it.weight || ""} onChange={(ev) => set(i, { weight: Math.max(0, Math.min(100, Math.round(Number(ev.target.value) || 0))) })} />
                          </Field>
                        ) : <div className="hidden md:col-span-2 md:block" />}
                      </div>
                    )}

                    {CONTRIBUTES.includes(kind) && das.length > 0 && (
                      <Field label="Department activity it contributes to" className="md:col-span-12" hint={a ? linkedHint(it) : undefined} htmlFor={id("da")}>
                        <Select id={id("da")} value={it.department_activity} onChange={(ev) => linkActivity(i, ev.target.value)}>
                          <option value="">Not linked</option>
                          {das.map((d) => <option key={d.id} value={d.id}>{d.code} · {d.title} — {100 - d.progress}% remaining</option>)}
                        </Select>
                      </Field>
                    )}
                    {kind !== "weekly" && (
                      <Field label="Evidence (means of verification)" className="md:col-span-6" htmlFor={id("evidence")}>
                        <Select id={id("evidence")} value={it.verification} onChange={(ev) => set(i, { verification: ev.target.value })}>
                          <option value="">Choose the evidence</option>
                          {EVIDENCE.concat(it.verification && !EVIDENCE.includes(it.verification) ? [it.verification] : []).map((v) => <option key={v} value={v}>{v}</option>)}
                        </Select>
                      </Field>
                    )}
                    {kind !== "weekly" && kind !== "annual" && (
                      <Field label="Estimated cost" className="md:col-span-6" htmlFor={id("cost")} hint="0 if there is no cost">
                        <MoneyInput id={id("cost")} value={it.cost || ""} onChange={(v) => set(i, { cost: v === "" ? 0 : Math.max(0, Math.round(v)) })} />
                      </Field>
                    )}
                  </div>
                </li>
              );
            })}
          </ol>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap gap-2">
              <Button icon={Plus} onClick={() => setItems((xs) => [...xs, blankItem()])}>Add {noun.toLowerCase()}</Button>
              {kind === "weekly" && parentPlan && (parentPlan.items || []).length > 0 && (
                <AddFromParent
                  items={parentPlan.items}
                  label={TYPE_INFO[parentPlan.plan_type as PlanKind].label}
                  onAdd={(src) => setItems((xs) => [...xs.filter((x) => !empty(x)), ...src.map((s) => ({ ...blankItem(), title: s.title, output: s.output || "", objective: s.objective || "", priority: s.priority || "medium" }))])}
                />
              )}
            </div>
            {need.weights && (
              <div className="w-full sm:w-[230px]">
                <div className="flex items-center justify-between text-t-small">
                  <span className="font-bold text-ims-text">Total weight</span>
                  <b className={weightTotal === 100 ? "text-ims-success" : weightTotal > 100 ? "text-ims-danger" : "text-ims-warning"}>{weightTotal}% of 100%</b>
                </div>
                <div className="mt-1 h-[7px] overflow-hidden rounded-full bg-ims-neutral-bg" aria-hidden>
                  <div className={cn("h-full rounded-full", weightTotal === 100 ? "bg-ims-success" : weightTotal > 100 ? "bg-ims-danger" : "bg-ims-priority-high")} style={{ width: `${Math.min(100, weightTotal)}%` }} />
                </div>
              </div>
            )}
          </div>
          {tried && !weightsOk && <p className="text-t-hint text-ims-danger" role="alert">The weights add up to {weightTotal}%; they must add up to 100%.</p>}
        </FormSection>
      </FormBody>

      <FormActions
        submitLabel={sendLabel}
        onSubmit={() => save(true)}
        onSaveDraft={assignMode ? undefined : () => save(false)}
        onCancel={() => navigate(-1)}
        busy={busy === "send" ? "submit" : busy === "draft" ? "draft" : null}
        disabled={Boolean(clash)}
        note={editing ? "Save a draft to finish later, or send it for approval." : savedAt ? `Kept on this device at ${format(savedAt, "HH:mm")}. Save it to keep it in the system.` : "Your entries are kept on this device until you save."}
      />
    </Page>
  );
}

function AddFromParent({ items, label, onAdd }: { items: any[]; label: string; onAdd: (items: any[]) => void }) {
  const [open, setOpen] = React.useState(false);
  const [picked, setPicked] = React.useState<Set<string>>(new Set());
  const live = items.filter((i) => i.status !== "done" && i.status !== "dropped");
  return (
    <>
      <Button icon={ListPlus} onClick={() => setOpen(true)}>From {label.toLowerCase()}</Button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        size="sm"
        title={`Add from your ${label.toLowerCase()}`}
        description="The open activities of the plan this week carries out."
        footer={
          <>
            <Button onClick={() => setOpen(false)}>Cancel</Button>
            <Button variant="primary" disabled={!picked.size} onClick={() => { onAdd(live.filter((i) => picked.has(i.id))); setPicked(new Set()); setOpen(false); }}>
              Add {picked.size || ""}
            </Button>
          </>
        }
      >
        {live.length ? (
          <ul className="space-y-2.5">
            {live.map((i) => (
              <li key={i.id}>
                <Checkbox
                  id={`from-${i.id}`}
                  label={i.title}
                  checked={picked.has(i.id)}
                  onChange={() => setPicked((s) => { const n = new Set(s); if (n.has(i.id)) n.delete(i.id); else n.add(i.id); return n; })}
                />
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-t-body text-ims-muted">Everything in that plan is completed.</p>
        )}
      </Modal>
    </>
  );
}
