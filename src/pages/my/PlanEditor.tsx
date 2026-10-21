/**
 * New plan, edit a draft, or assign work (supervisors). Three steps — what is planned, the period and the
 * plan it carries out, then the activities with what that level needs (indicator, unit, target, weight, due
 * date, evidence, cost) — with the department's activities to contribute to, a live plan check and a summary
 * beside the form. A new plan is kept on this device while it is being filled, so nothing is lost.
 */
import * as React from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "react-query";
import { format } from "date-fns";
import { toast } from "sonner";
import { AlertTriangle, ArrowDown, ArrowLeft, ArrowUp, Check, Info, ListPlus, Plus, X } from "lucide-react";
import pocketbase from "@/lib/pocketbase";
import { useAuth } from "@/context/auth.context";
import { errorMessage } from "@/lib/procurement";
import {
  CONTRIBUTES, DepartmentActivity, EVIDENCE, NEEDS, PRIORITY, Period, PlanItem, PlanKind, TYPE_INFO, UNITS, WEEKDAYS, WHO, blankItem, dayOf, dmy, plansApi, qty,
} from "@/lib/plans";
import { Skeleton } from "@/components/ui/skeleton";
import { WCard, btnOutline, btnPrimary } from "@/components/workspace/WorkspaceKit";
import { DepartmentActivitiesCard } from "@/components/workspace/DepartmentActivities";
import { cn } from "@/utils";

const today = () => format(new Date(), "yyyy-MM-dd");
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

/** "19–23 Oct 2026", "26 Oct – 6 Nov 2026". */
function rangeLabel(a: string, b: string) {
  const [ya, ma, da] = a.split("-").map(Number);
  const [yb, mb, db] = b.split("-").map(Number);
  if (ya !== yb) return `${da} ${SHORT_MONTHS[ma - 1]} ${ya} – ${db} ${SHORT_MONTHS[mb - 1]} ${yb}`;
  if (ma !== mb) return `${da} ${SHORT_MONTHS[ma - 1]} – ${db} ${SHORT_MONTHS[mb - 1]} ${yb}`;
  return da === db ? `${da} ${SHORT_MONTHS[ma - 1]} ${ya}` : `${da}–${db} ${SHORT_MONTHS[ma - 1]} ${ya}`;
}

const inputCls = (bad?: boolean) =>
  cn("h-11 w-full rounded-[9px] border bg-white px-3 text-[14px] text-[#14213D] outline-none placeholder:text-[#8A94A6] focus:ring-2 focus:ring-[#1466C0]/15 disabled:cursor-not-allowed disabled:bg-[#F4F6F9]",
    bad ? "border-[#D92D20] focus:border-[#D92D20]" : "border-[#DDE3EC] focus:border-[#1466C0]");

function F({ label, required, hint, error, className, htmlFor, children }: { label: React.ReactNode; required?: boolean; hint?: React.ReactNode; error?: string; className?: string; htmlFor?: string; children: React.ReactNode }) {
  return (
    <div className={cn("min-w-0", className)}>
      <label htmlFor={htmlFor} className="mb-1.5 block text-[13.5px] font-bold text-[#14213D]">{label}{required && <span className="text-[#D92D20]"> *</span>}</label>
      {children}
      {error ? <p className="mt-1 text-[12.5px] font-semibold text-[#B42318]">{error}</p> : hint ? <p className="mt-1 text-[12.5px] leading-snug text-[#5B6577]">{hint}</p> : null}
    </div>
  );
}

function Section({ n, title, subtitle, right, children, flush }: { n?: number; title: string; subtitle?: React.ReactNode; right?: React.ReactNode; children: React.ReactNode; flush?: boolean }) {
  return (
    <WCard flush={flush} className={flush ? "overflow-hidden" : undefined}>
      <div className={cn("flex flex-wrap items-center justify-between gap-3", flush ? "px-5 py-4" : "mb-4")}>
        <div className="min-w-0">
          <h2 className="text-[17px] font-extrabold">{n ? `${n} · ` : ""}{title}</h2>
          {subtitle && <p className="text-[13px] text-[#5B6577]">{subtitle}</p>}
        </div>
        {right}
      </div>
      {children}
    </WCard>
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
    if (it.due && period && (it.due < period.start || it.due > period.end)) e.due = `Between ${dmy(period.start)} and ${dmy(period.end)}.`;
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

  if (editing && existing.isLoading) return <main className="mx-auto w-full max-w-[1320px] px-4 py-6 sm:px-8"><Skeleton className="h-[480px] w-full" /></main>;
  const existingPlan: any = existing.data;
  if (editing && existingPlan && !["draft", "returned"].includes(existingPlan.status)) {
    return (
      <main className="mx-auto w-full max-w-[1320px] px-4 py-6 sm:px-8">
        <WCard><p className="text-[14px]">{existingPlan.number} is {existingPlan.status}: it can no longer be edited. <Link className="font-bold text-[#1466C0]" to={`/dashboard/my/plans/${existingPlan.id}`}>Open it</Link> to record progress.</p></WCard>
      </main>
    );
  }

  const supervisor = ctx.data?.supervisor;
  const route: string[] = assignMode ? ["You", staffName || "Staff member"] : kind === "department" ? ["You", supervisor?.name || "Secretary General"] : supervisor ? ["You", supervisor.name] : ["You"];
  const sendLabel = assignMode ? (staffName ? `Assign to ${staffName.split(" ")[0]}` : "Assign") : supervisor ? `Save and send to ${kind === "department" ? supervisor.name.split(" ")[0] : "my supervisor"}` : "Save and approve";
  const linkedHint = (it: PlanItem) => {
    const a = it.department_activity ? daOf(it.department_activity) : undefined;
    return a ? `${a.title}: ${a.progress}% achieved${a.remaining !== null ? ` · ${qty(a.remaining, a.unit)} still to do` : ""}. Your result will count towards it.` : "";
  };

  return (
    <main className="mx-auto w-full max-w-[1320px] px-4 pb-14 pt-[22px] text-[#14213D] sm:px-8 sm:pt-[26px]">
      <div className="mb-[18px] flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <Link to={assignMode ? "/dashboard/my/plans?tab=team" : "/dashboard/my/plans"} className="inline-flex items-center gap-1 text-[13px] font-bold text-[#1466C0] hover:underline"><ArrowLeft size={13} aria-hidden /> My plans & reports</Link>
          <h1 className="mt-1 text-[28px] font-extrabold tracking-[-0.01em]">{assignMode ? "Assign work" : editing ? `Edit ${existingPlan?.number || "plan"}` : "New plan"}</h1>
          <p className="text-[13.5px] text-[#5B6577]">{assignMode ? "Give a member of your team a task with its own dates, or set one of their plans. It starts approved." : "Plan from the top down. Your supervisor approves it before you start."}</p>
        </div>
        {!editing && (
          <p className="text-[12.5px] text-[#5B6577]" aria-live="polite">
            {restoredAt ? <>Draft restored · saved {format(restoredAt, "d MMM HH:mm")} · <button type="button" onClick={discard} className="font-bold text-[#1466C0] hover:underline">Discard</button></> : savedAt ? `Draft saved automatically · ${format(savedAt, "HH:mm")}` : "Your entries are kept on this device until you save"}
          </p>
        )}
      </div>

      <div className="grid items-start gap-[18px] lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="flex min-w-0 flex-col gap-[18px]">
          {/* 1 · what */}
          <Section n={1} title={assignMode ? "What are you assigning?" : "What are you planning?"}>
            {assignMode && (
              <F label="Assign to" required error={shown(topErrors.staff)} className="mb-4 max-w-md" htmlFor="pl-staff">
                <select id="pl-staff" className={inputCls(Boolean(shown(topErrors.staff)))} value={staffId} onChange={(e) => { setStaffId(e.target.value); setParent(""); }}>
                  <option value="">Choose a member of your team…</option>
                  {(team.data || []).map((m) => <option key={m.id} value={m.id}>{m.name}{m.designation ? ` — ${m.designation}` : ""}{m.department ? ` (${m.department})` : ""}</option>)}
                </select>
              </F>
            )}
            <div role="radiogroup" aria-label="Kind of plan" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {kinds.map((k) => {
                const locked = (k === "department" && !ctx.data?.is_head) || (editing && k !== kind);
                const on = kind === k;
                return (
                  <button key={k} type="button" role="radio" aria-checked={on} disabled={locked} onClick={() => { setKind(k); setPeriodStart(""); setParent(""); periodTouched.current = false; }}
                    className={cn("flex flex-col items-start gap-1.5 rounded-xl border px-4 py-3.5 text-left transition-colors", on ? "border-[#1466C0] bg-[#EAF2FC] ring-1 ring-[#1466C0]" : "border-[#E3E8EF] bg-white hover:bg-[#F8FAFD]", locked && "cursor-not-allowed opacity-60 hover:bg-white")}>
                    <span className="flex items-start gap-2 text-[15px] font-extrabold leading-snug">
                      <span className={cn("mt-[3px] flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2", on ? "border-[#1466C0]" : "border-[#B8C2D1]")}>{on && <span className="h-2 w-2 rounded-full bg-[#1466C0]" />}</span>
                      {TYPE_INFO[k].label}
                    </span>
                    <span className="text-[13px] leading-snug text-[#5B6577]">{TYPE_INFO[k].hint}</span>
                    <span className={cn("mt-auto pt-1 text-[12px] font-bold", k === "department" ? "text-[#6B2FA3]" : "text-[#36435A]")}>Who: {assignMode ? (k === "task" ? "You assign it" : "You set it") : WHO[k]}</span>
                  </button>
                );
              })}
            </div>
          </Section>

          {/* 2 · when and aligned with what */}
          <Section n={2} title="Period and alignment">
            {kind === "task" ? (
              <div className="grid gap-4 md:grid-cols-12">
                <F label="Task" required error={shown(topErrors.title)} className="md:col-span-6" htmlFor="pl-title">
                  <input id="pl-title" className={inputCls(Boolean(shown(topErrors.title)))} value={title} maxLength={200} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Support Gakenke district budget hearings" />
                </F>
                <F label="Starts" required className="md:col-span-3" htmlFor="pl-start" error={shown(topErrors.dates)}>
                  <input id="pl-start" type="date" className={inputCls(Boolean(shown(topErrors.dates)))} value={taskStart} onChange={(e) => setTaskStart(e.target.value)} />
                </F>
                <F label="Ends" required className="md:col-span-3" htmlFor="pl-end" hint={period ? period.label : undefined}>
                  <input id="pl-end" type="date" className={inputCls(Boolean(shown(topErrors.dates)))} value={taskEnd} min={taskStart} onChange={(e) => setTaskEnd(e.target.value)} />
                </F>
              </div>
            ) : (
              <div className="grid gap-4 md:grid-cols-3">
                <F label={PERIOD_LABEL[kind]} required htmlFor="pl-period" error={shown(topErrors.period)} hint={period ? `${dmy(period.start)} – ${dmy(period.end)}` : undefined}>
                  <select id="pl-period" className={inputCls(Boolean(shown(topErrors.period)))} value={periodStart} onChange={(e) => { periodTouched.current = true; setPeriodStart(e.target.value); }}>
                    {!periods.data && <option value="">Loading…</option>}
                    {(periods.data || []).map((p) => {
                      const has = all.some((x) => x.id !== planId && sameKind(x) && dayOf(x.period_start) === p.start);
                      return <option key={p.start} value={p.start}>{p.label}{p.current ? " (current)" : ""}{has ? " — planned" : ""}</option>;
                    })}
                    {period && !(periods.data || []).some((p) => p.start === period.start) && <option value={period.start}>{period.label}</option>}
                  </select>
                </F>
                {kind !== "annual" ? (
                  <F label="Contributes to" required={info.parent.length > 0 && parents.length > 0 && kind !== "department"} htmlFor="pl-parent"
                    hint={parents.length ? "The approved plan for a longer period that this one carries out." : `No approved ${info.parent.map((k) => TYPE_INFO[k].short.toLowerCase()).join(" or ")} plan covers this period yet.`}>
                    <select id="pl-parent" className={inputCls()} value={parent} onChange={(e) => setParent(e.target.value)}>
                      <option value="">{parents.length ? "Not linked" : "—"}</option>
                      {parents.map((p) => <option key={p.id} value={p.id}>{TYPE_INFO[p.plan_type as PlanKind].label} · {p.period_label.split(" · ")[0]} ({p.status === "approved" ? "approved" : p.status})</option>)}
                    </select>
                  </F>
                ) : (
                  <F label="Contributes to" hint="The top of your cycle: your quarterly plans carry it out.">
                    <input className={inputCls()} value={ctx.data?.department ? `${ctx.data.department.name} objectives` : "RALGA strategic objectives"} disabled readOnly />
                  </F>
                )}
                <F label="Main focus of the period" htmlFor="pl-focus" hint={`${focus.length} / ${FOCUS_MAX} characters`}>
                  <input id="pl-focus" className={inputCls()} value={focus} maxLength={FOCUS_MAX} onChange={(e) => setFocus(e.target.value)} placeholder={kind === "annual" ? "e.g. Councillors' leadership and district PFM" : "e.g. Gakenke training and the budgeting guide"} />
                </F>
              </div>
            )}
            {assignMode && (
              <div className="mt-4 grid gap-4 md:grid-cols-2">
                <F label="Where it comes from" htmlFor="pl-source" hint="Optional — e.g. the strategic plan or a request from the Secretary General.">
                  <input id="pl-source" className={inputCls()} value={source} maxLength={200} onChange={(e) => setSource(e.target.value)} placeholder="e.g. RALGA Strategic Plan · Capacity Building" />
                </F>
                <F label="Instructions" htmlFor="pl-instr" hint="What the person should know before starting.">
                  <input id="pl-instr" className={inputCls()} value={instructions} maxLength={1000} onChange={(e) => setInstructions(e.target.value)} placeholder="e.g. Coordinate with the district planner; report by Friday 6 Nov" />
                </F>
              </div>
            )}
            <p className="mt-4 flex items-start gap-2 rounded-lg bg-[#F1F5FB] px-3 py-2.5 text-[13px] text-[#36435A]"><Info size={15} className="mt-px shrink-0 text-[#1466C0]" aria-hidden /> {GUIDE[kind]}</p>
            {clash && (
              <p role="alert" className="mt-3 flex flex-wrap items-center gap-x-1.5 gap-y-1 rounded-lg border border-[#F5DFA3] bg-[#FFF8E6] px-3 py-2 text-[13px] text-[#5B4A1C]">
                <AlertTriangle size={14} className="shrink-0 text-[#9A6300]" aria-hidden />
                There is already a {info.label.toLowerCase()} for {period?.label} ({clash.number}).
                <Link to={`/dashboard/my/plans/${clash.id}`} className="font-bold text-[#1466C0] hover:underline">Open it</Link> or choose another period.
              </p>
            )}
          </Section>

          {/* department activities to contribute to */}
          {showDept && (
            <DepartmentActivitiesCard view={dept.data} loading={dept.isLoading} linked={linked} onContribute={kind === "department" ? undefined : contribute}
              empty={`No department plan shared for ${period?.label} yet — your head of department prepares it. You can still plan your own activities.`} />
          )}

          {/* 3 · activities */}
          <Section n={3} title={info.items} subtitle={`${live.length} ${live.length === 1 ? noun.toLowerCase() : info.items.toLowerCase()}`} flush
            right={
              <div className="flex flex-wrap items-center gap-4">
                {need.weights && (
                  <div className="w-[210px]">
                    <div className="flex items-center justify-between text-[13px]"><span className="font-bold">Total weight</span><b className={weightTotal === 100 ? "text-[#0F6B3A]" : "text-[#8A5A00]"}>{weightTotal}% of 100%</b></div>
                    <div className="mt-1 h-[7px] overflow-hidden rounded-full bg-[#EEF1F5]"><div className="h-full rounded-full" style={{ width: `${Math.min(100, weightTotal)}%`, background: weightTotal === 100 ? "#0F6B3A" : weightTotal > 100 ? "#B42318" : "#9A6300" }} /></div>
                  </div>
                )}
                {kind === "weekly" && parentPlan && (parentPlan.items || []).length > 0 && (
                  <AddFromParent items={parentPlan.items} label={TYPE_INFO[parentPlan.plan_type as PlanKind].label} onAdd={(src) => setItems((xs) => [...xs.filter((x) => !empty(x)), ...src.map((s) => ({ ...blankItem(), title: s.title, output: s.output || "", objective: s.objective || "", priority: s.priority || "medium" }))])} />
                )}
                <button type="button" onClick={() => setItems((xs) => [...xs, blankItem()])} className="inline-flex h-10 items-center gap-1.5 rounded-[9px] border border-[#0B3A6F] bg-white px-4 text-[13.5px] font-bold text-[#0B3A6F] hover:bg-[#EAF2FC]"><Plus size={15} aria-hidden /> Add {noun.toLowerCase()}</button>
              </div>
            }>
            <ol>
              {items.map((it, i) => {
                const e = itemErrors[i];
                const a = it.department_activity ? daOf(it.department_activity) : undefined;
                return (
                  <li key={i} className="border-t border-[#EDF0F5] px-5 py-5">
                    <div className="mb-3 flex items-center gap-2">
                      <span className="text-[14px] font-extrabold text-[#0B3A6F]">{noun} {i + 1}</span>
                      {(a || it.department_activity) && <span className="rounded-full bg-[#F1EAFB] px-2 py-0.5 text-[12px] font-bold text-[#6B2FA3]">Contributes to {a?.code || "a department activity"}</span>}
                      {kind === "department" && it.code && <span className="rounded-full bg-[#F1EAFB] px-2 py-0.5 text-[12px] font-bold text-[#6B2FA3]">{it.code}</span>}
                      <span className="ml-auto flex gap-0.5">
                        <IconBtn label="Move up" disabled={i === 0} onClick={() => move(i, -1)}><ArrowUp size={15} /></IconBtn>
                        <IconBtn label="Move down" disabled={i === items.length - 1} onClick={() => move(i, 1)}><ArrowDown size={15} /></IconBtn>
                        <IconBtn label="Remove" danger disabled={items.length === 1} onClick={() => setItems((xs) => xs.filter((_, j) => j !== i))}><X size={16} /></IconBtn>
                      </span>
                    </div>

                    <div className="grid gap-x-4 gap-y-4 md:grid-cols-12">
                      <F label={noun} required className="md:col-span-8" error={shown(e.title)} htmlFor={`it-${i}-title`}>
                        <input id={`it-${i}-title`} className={inputCls(Boolean(shown(e.title)))} value={it.title} maxLength={200} onChange={(ev) => set(i, { title: ev.target.value })}
                          placeholder={kind === "annual" ? "e.g. Train newly elected councillors on their roles" : kind === "quarterly" ? "e.g. Induction training for councillors of 4 districts" : kind === "task" ? "e.g. Draft the hearing agenda with the district" : "e.g. Train Gakenke district finance staff"} />
                      </F>
                      {kind === "weekly" ? (
                        <F label="Days" className="md:col-span-4">
                          <div className="flex gap-1">
                            {WEEKDAYS.map(([k, l]) => (
                              <button key={k} type="button" aria-pressed={it.days.includes(k)} onClick={() => set(i, { days: it.days.includes(k) ? it.days.filter((d) => d !== k) : [...it.days, k] })}
                                className={cn("h-11 flex-1 rounded-[9px] border text-[12.5px] font-bold", it.days.includes(k) ? "border-[#1466C0] bg-[#EAF2FC] text-[#0B3A6F]" : "border-[#DDE3EC] text-[#5B6577] hover:bg-[#F8FAFC]")}>{l}</button>
                            ))}
                          </div>
                        </F>
                      ) : kind === "annual" ? (
                        <F label="Quarters" className="md:col-span-4">
                          <div className="flex gap-1">
                            {[1, 2, 3, 4].map((q) => (
                              <button key={q} type="button" aria-pressed={it.quarters.includes(q)} onClick={() => set(i, { quarters: it.quarters.includes(q) ? it.quarters.filter((x) => x !== q) : [...it.quarters, q].sort() })}
                                className={cn("h-11 flex-1 rounded-[9px] border text-[12.5px] font-bold", it.quarters.includes(q) ? "border-[#1466C0] bg-[#EAF2FC] text-[#0B3A6F]" : "border-[#DDE3EC] text-[#5B6577] hover:bg-[#F8FAFC]")}>Q{q}</button>
                            ))}
                          </div>
                        </F>
                      ) : (
                        <F label="Due date" required={need.due} className="md:col-span-4" error={shown(e.due)} hint={period ? `Between ${dmy(period.start)} and ${dmy(period.end)}` : undefined} htmlFor={`it-${i}-due`}>
                          <input id={`it-${i}-due`} type="date" className={inputCls(Boolean(shown(e.due)))} value={it.due} min={period?.start} max={period?.end} onChange={(ev) => set(i, { due: ev.target.value })} />
                        </F>
                      )}

                      <F label={kind === "annual" ? "Key result" : "Expected output"} required={need.output} className="md:col-span-5" error={shown(e.output)} htmlFor={`it-${i}-output`}>
                        <input id={`it-${i}-output`} className={inputCls(Boolean(shown(e.output)))} value={it.output} maxLength={500} onChange={(ev) => set(i, { output: ev.target.value })} placeholder="What will exist when it is done" />
                      </F>
                      <F label="Priority" className="md:col-span-3" htmlFor={`it-${i}-priority`}>
                        <select id={`it-${i}-priority`} className={inputCls()} value={it.priority} onChange={(ev) => set(i, { priority: ev.target.value })}>
                          {Object.entries(PRIORITY).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                        </select>
                      </F>
                      <F label="Strategic objective" required={need.objective} className="md:col-span-4" error={shown(e.objective)} htmlFor={`it-${i}-objective`}>
                        <select id={`it-${i}-objective`} className={inputCls(Boolean(shown(e.objective)))} value={it.objective} onChange={(ev) => set(i, { objective: ev.target.value })}>
                          <option value="">Choose…</option>
                          {((objectives.data || []) as any[]).map((o) => <option key={o.id} value={o.id}>{o.code} · {o.name}</option>)}
                        </select>
                      </F>

                      {kind !== "weekly" && (
                        <div className="grid gap-4 rounded-xl bg-[#F4F6F9] p-4 md:col-span-12 md:grid-cols-12">
                          <F label="Indicator" required={need.measure} className={kind === "annual" || kind === "quarterly" ? "md:col-span-4" : "md:col-span-5"} error={shown(e.indicator)} htmlFor={`it-${i}-indicator`}>
                            <input id={`it-${i}-indicator`} className={inputCls(Boolean(shown(e.indicator)))} value={it.indicator} maxLength={300} onChange={(ev) => set(i, { indicator: ev.target.value })} placeholder="e.g. Number of finance staff trained" />
                          </F>
                          <F label="Unit" className={kind === "annual" || kind === "quarterly" ? "md:col-span-2" : "md:col-span-3"} htmlFor={`it-${i}-unit`}>
                            <select id={`it-${i}-unit`} className={inputCls()} value={it.unit} onChange={(ev) => set(i, { unit: ev.target.value })} disabled={Boolean(a)}>
                              <option value="">—</option>
                              {UNITS.concat(it.unit && !UNITS.includes(it.unit) ? [it.unit] : []).map((u) => <option key={u} value={u}>{u}</option>)}
                            </select>
                          </F>
                          {(kind === "annual" || kind === "quarterly") && (
                            <F label="Baseline" className="md:col-span-2" htmlFor={`it-${i}-baseline`}><input id={`it-${i}-baseline`} className={inputCls()} value={it.baseline} maxLength={100} onChange={(ev) => set(i, { baseline: ev.target.value })} placeholder="Today" /></F>
                          )}
                          <F label="Target" required={need.measure} className="md:col-span-2" error={shown(e.target)} htmlFor={`it-${i}-target`}>
                            <input id={`it-${i}-target`} className={inputCls(Boolean(shown(e.target)))} value={it.target} maxLength={100} onChange={(ev) => set(i, { target: ev.target.value })} placeholder="e.g. 24" />
                          </F>
                          {need.weights ? (
                            <F label="Weight %" required className="md:col-span-2" error={shown(e.weight)} htmlFor={`it-${i}-weight`}>
                              <input id={`it-${i}-weight`} type="number" min={0} max={100} className={cn(inputCls(Boolean(shown(e.weight))), "text-right")} value={it.weight || ""} onChange={(ev) => set(i, { weight: Math.max(0, Math.min(100, Math.round(Number(ev.target.value) || 0))) })} />
                            </F>
                          ) : <div className="md:col-span-2" />}
                        </div>
                      )}

                      {CONTRIBUTES.includes(kind) && das.length > 0 && (
                        <F label="Department activity it contributes to" className="md:col-span-6" hint={a ? <span className="font-semibold text-[#6B2FA3]">{linkedHint(it)}</span> : undefined} htmlFor={`it-${i}-da`}>
                          <select id={`it-${i}-da`} className={inputCls()} value={it.department_activity} onChange={(ev) => linkActivity(i, ev.target.value)}>
                            <option value="">Not linked</option>
                            {das.map((d) => <option key={d.id} value={d.id}>{d.code} · {d.title} — {100 - d.progress}% remaining</option>)}
                          </select>
                        </F>
                      )}
                      {kind !== "weekly" && (
                        <F label="Evidence (means of verification)" className={CONTRIBUTES.includes(kind) && das.length > 0 ? "md:col-span-3" : "md:col-span-6"} htmlFor={`it-${i}-evidence`}>
                          <select id={`it-${i}-evidence`} className={inputCls()} value={it.verification} onChange={(ev) => set(i, { verification: ev.target.value })}>
                            <option value="">Choose…</option>
                            {EVIDENCE.concat(it.verification && !EVIDENCE.includes(it.verification) ? [it.verification] : []).map((v) => <option key={v} value={v}>{v}</option>)}
                          </select>
                        </F>
                      )}
                      {kind !== "weekly" && kind !== "annual" && (
                        <F label="Estimated cost (RWF)" className={CONTRIBUTES.includes(kind) && das.length > 0 ? "md:col-span-3" : "md:col-span-6"} htmlFor={`it-${i}-cost`}>
                          <input id={`it-${i}-cost`} type="number" min={0} inputMode="numeric" className={cn(inputCls(), "tabular-nums")} value={it.cost || ""} onChange={(ev) => set(i, { cost: Math.max(0, Math.round(Number(ev.target.value) || 0)) })} placeholder="0 if no cost" />
                        </F>
                      )}
                    </div>
                  </li>
                );
              })}
            </ol>
            {tried && !weightsOk && <p className="border-t border-[#EDF0F5] px-5 py-3 text-[13px] font-semibold text-[#B42318]">The weights add up to {weightTotal}%; they must add up to 100%.</p>}
          </Section>
        </div>

        {/* plan check, summary, actions */}
        <aside className="flex flex-col gap-[14px] lg:sticky lg:top-4">
          <WCard>
            <h2 className="mb-2.5 text-[16px] font-extrabold">Plan check</h2>
            <ul className="flex flex-col gap-2.5">
              <Check1 ok={Boolean(period) && !clash} title={clash ? "Period already planned" : period ? "Period chosen" : "Choose the period"} sub={clash ? `${clash.number} covers it` : period?.label || "Week, month, quarter or year"} />
              {kind === "annual" ? <Check1 ok title="Top of the cycle" sub="Your quarterly plans carry it out" />
                : kind === "department" ? <Check1 ok title="Department level" sub="Staff contribute from their monthly plans" />
                  : kind === "task" ? <Check1 ok={Boolean(staffId)} title={staffId ? `For ${staffName || "the staff member"}` : "Choose the person"} sub="Starts approved" />
                    : <Check1 ok={Boolean(parentPlan)} title={parentPlan ? "Linked to a higher plan" : "Not linked to a higher plan"} sub={parentPlan ? "Aligned" : parents.length ? "Choose the plan it carries out" : "No approved higher plan for this period"} />}
              <Check1 ok={live.length > 0 && (!need.measure || measured === live.length)} title={`${live.length} ${live.length === 1 ? noun.toLowerCase() : info.items.toLowerCase()}`} sub={!live.length ? `Add at least one ${noun.toLowerCase()}` : need.measure ? (measured === live.length ? "Each with indicator and target" : `${live.length - measured} without indicator or target`) : "Listed"} />
              {need.weights && <Check1 ok={weightTotal === 100} title={`Weights total ${weightTotal}%`} sub={weightTotal < 100 ? `${100 - weightTotal}% still to assign` : weightTotal > 100 ? `${weightTotal - 100}% too much` : "Balanced"} />}
              <Check1 ok={fieldsToFix === 0} title={fieldsToFix ? `${fieldsToFix} field${fieldsToFix === 1 ? "" : "s"} to fix` : "Required fields filled"} sub={fieldsToFix ? (tried ? "Shown in red in the form" : "Shown in red after you press Send") : "Ready to send"} />
              {showDept && das.length > 0 && <Check1 ok={linkedCount > 0} title={`${linkedCount} linked to department activities`} sub={linkedCount ? "Counts towards department progress" : "Contribute to a department activity"} />}
            </ul>
          </WCard>

          <WCard>
            <h2 className="mb-2.5 text-[16px] font-extrabold">Summary</h2>
            <dl className="flex flex-col gap-2 text-[13.5px]">
              {[
                ["Plan", info.label],
                ["Period", period?.label || "—"],
                [info.items, String(live.length)],
                ...(showDept && das.length ? [["Linked to department", `${linkedCount} of ${live.length}`]] : []),
                ...(kind !== "weekly" && kind !== "annual" ? [["Estimated cost", `RWF ${cost.toLocaleString("en-US")}`]] : []),
              ].map(([k, v]) => (
                <div key={k} className="flex items-baseline justify-between gap-3"><dt className="text-[#5B6577]">{k}</dt><dd className="text-right font-bold">{v}</dd></div>
              ))}
            </dl>
            <p className="mb-1.5 mt-3.5 text-[12.5px] font-bold text-[#5B6577]">{assignMode ? "Assigned to" : "Approval route"}</p>
            <div className="flex flex-wrap items-center gap-1.5">
              {route.map((r, k) => (
                <React.Fragment key={k}>
                  {k > 0 && <span className="text-[#8A94A6]" aria-hidden>→</span>}
                  <span className="rounded-md border border-[#DDE3EC] bg-[#F8FAFC] px-2 py-0.5 text-[12.5px] font-bold">{r}</span>
                </React.Fragment>
              ))}
              {!assignMode && !supervisor && ctx.data && <span className="text-[12.5px] text-[#5B6577]">approved when you send it</span>}
            </div>
          </WCard>

          <button type="button" disabled={Boolean(busy) || Boolean(clash)} onClick={() => save(true)} className={cn(btnPrimary, "h-12 w-full text-[14.5px]")}>{busy === "send" ? (assignMode ? "Assigning…" : "Sending…") : sendLabel}</button>
          {!assignMode && <button type="button" disabled={Boolean(busy) || Boolean(clash)} onClick={() => save(false)} className={cn(btnOutline, "h-11 w-full")}>{busy === "draft" ? "Saving…" : "Save draft"}</button>}
          <button type="button" onClick={() => navigate(-1)} className="h-9 text-[13.5px] font-bold text-[#5B6577] hover:text-[#14213D]">Cancel</button>
        </aside>
      </div>
    </main>
  );
}

function Check1({ ok, title, sub }: { ok: boolean; title: string; sub?: string }) {
  return (
    <li className="flex items-start gap-2.5">
      <span className={cn("mt-px flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[12px] font-extrabold", ok ? "bg-[#E4F4EA] text-[#0F6B3A]" : "bg-[#FEF3D6] text-[#8A5A00]")} aria-hidden>{ok ? <Check size={12} strokeWidth={3} /> : "!"}</span>
      <span className="min-w-0">
        <span className="block text-[13.5px] font-bold leading-snug">{title}</span>
        {sub && <span className="block text-[12.5px] leading-snug text-[#5B6577]">{sub}</span>}
        <span className="sr-only">{ok ? "done" : "to do"}</span>
      </span>
    </li>
  );
}

function IconBtn({ label, disabled, onClick, children, danger }: { label: string; disabled?: boolean; onClick: () => void; children: React.ReactNode; danger?: boolean }) {
  return (
    <button type="button" aria-label={label} title={label} disabled={disabled} onClick={onClick}
      className={cn("flex h-8 w-8 items-center justify-center rounded-lg hover:bg-[#F1F4F9] disabled:opacity-30", danger ? "text-[#D92D20]" : "text-[#5B6577] hover:text-[#14213D]")}>
      {children}
    </button>
  );
}

function AddFromParent({ items, label, onAdd }: { items: any[]; label: string; onAdd: (items: any[]) => void }) {
  const [open, setOpen] = React.useState(false);
  const [picked, setPicked] = React.useState<Set<string>>(new Set());
  const live = items.filter((i) => i.status !== "done" && i.status !== "dropped");
  return (
    <div className="relative">
      <button type="button" className={btnOutline} onClick={() => setOpen((o) => !o)}><ListPlus size={15} aria-hidden /> From {label.toLowerCase()}</button>
      {open && (
        <div className="absolute right-0 z-20 mt-1 w-[360px] max-w-[85vw] rounded-xl border border-[#E3E8EF] bg-white p-3 shadow-lg">
          <p className="mb-2 text-[12.5px] text-[#5B6577]">Open items of your {label.toLowerCase()}</p>
          <ul className="max-h-64 space-y-1 overflow-auto">
            {live.map((i) => (
              <li key={i.id}>
                <label className="flex cursor-pointer items-start gap-2 rounded-lg px-2 py-1.5 text-[13px] hover:bg-[#F8FAFC]">
                  <input type="checkbox" className="mt-0.5" checked={picked.has(i.id)} onChange={() => setPicked((s) => { const n = new Set(s); if (n.has(i.id)) n.delete(i.id); else n.add(i.id); return n; })} />
                  <span>{i.title}</span>
                </label>
              </li>
            ))}
            {!live.length && <li className="px-2 py-1.5 text-[13px] text-[#5B6577]">Everything is done there.</li>}
          </ul>
          <div className="mt-2 flex justify-end gap-2">
            <button type="button" className="h-9 rounded-lg px-3 text-[13px] font-semibold text-[#5B6577] hover:bg-[#F1F4F9]" onClick={() => setOpen(false)}>Close</button>
            <button type="button" disabled={!picked.size} className="h-9 rounded-lg bg-[#0B3A6F] px-3 text-[13px] font-bold text-white disabled:opacity-50" onClick={() => { onAdd(live.filter((i) => picked.has(i.id))); setPicked(new Set()); setOpen(false); }}>Add {picked.size || ""}</button>
          </div>
        </div>
      )}
    </div>
  );
}
