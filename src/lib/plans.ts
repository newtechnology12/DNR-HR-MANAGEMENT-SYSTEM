/**
 * Individual work planning (public sector / NGO cycle): annual performance contract → quarterly outputs →
 * monthly activities → weekly plan, each approved by the supervisor, followed up, reported and assessed.
 * Supervisors also assign work (tasks with their own dates, or plans at any level). Rules:
 * pocketbase/pb_hooks/lib/workspace.js.
 */
import pocketbase from "@/lib/pocketbase";

/** The periods people plan for themselves. */
export type PlanType = "weekly" | "monthly" | "quarterly" | "annual";
/** … plus tasks assigned by a supervisor and the department's monthly plan (heads of department). */
export type PlanKind = PlanType | "task" | "department";
export const PLAN_TYPES: PlanType[] = ["weekly", "monthly", "quarterly", "annual"];
/** Top of the cycle first; tasks last. */
export const LEVELS: PlanKind[] = ["annual", "quarterly", "department", "monthly", "weekly", "task"];
/** Display order in lists: the shortest horizon first, as in a work plan. */
export const LEVEL_ORDER: Record<PlanKind, number> = { task: 0, weekly: 1, monthly: 2, department: 2.5, quarterly: 3, annual: 4 };

export const TYPE_INFO: Record<PlanKind, { label: string; short: string; item: string; items: string; parent: PlanType[]; hint: string }> = {
  weekly: { label: "Weekly plan", short: "Week", item: "Activity", items: "Activities", parent: ["monthly", "quarterly", "annual"], hint: "What you will do this week, day by day — from your monthly plan." },
  monthly: { label: "Monthly plan", short: "Month", item: "Activity", items: "Activities", parent: ["quarterly", "annual"], hint: "The month's activities with indicators, targets and due dates." },
  quarterly: { label: "Quarterly plan", short: "Quarter", item: "Output", items: "Outputs", parent: ["annual"], hint: "The quarter's outputs, each with an indicator and a target." },
  annual: { label: "Annual performance contract", short: "Year", item: "Objective", items: "Objectives", parent: [], hint: "Your Imihigo for the fiscal year: objectives, baseline, target, weight, evidence." },
  department: { label: "Department plan", short: "Department", item: "Activity", items: "Department activities", parent: ["quarterly", "annual"], hint: "Shared monthly activities that staff in the department contribute to." },
  task: { label: "Assigned task", short: "Task", item: "Deliverable", items: "Deliverables", parent: ["weekly", "monthly", "quarterly", "annual"], hint: "A piece of work with its own dates, assigned by a supervisor: deliverables, a report and an assessment." },
};

/** Who prepares each kind of plan. */
export const WHO: Record<PlanKind, string> = { weekly: "You", monthly: "You", quarterly: "You", annual: "You + supervisor", department: "Heads of department", task: "Your supervisor" };

/** What each level needs before it is sent (the server checks the same: NEEDS in lib/workspace.js). */
export const NEEDS: Record<PlanKind, { due?: boolean; output?: boolean; objective?: boolean; measure?: boolean; weights?: boolean }> = {
  weekly: {},
  task: {},
  monthly: { due: true, output: true, objective: true, measure: true, weights: true },
  department: { due: true, objective: true, measure: true, weights: true },
  quarterly: { objective: true, measure: true, weights: true },
  annual: { objective: true, measure: true, weights: true },
};
/** Plans whose activities count towards department activities. */
export const CONTRIBUTES: PlanKind[] = ["monthly", "task"];

export const UNITS = ["People", "Percent (%)", "Number", "Districts", "Sessions", "Reports", "Documents", "Chapters", "Meetings", "Visits", "Days", "RWF"];
export const EVIDENCE = ["Attendance list", "Report", "Minutes", "Photos", "Training materials", "Publication", "Field visit report", "Financial report", "Signed document", "Other"];

export type Tone = "neutral" | "pending" | "approved" | "rejected" | "info";

export const PLAN_STATUS: Record<string, { label: string; tone: Tone }> = {
  draft: { label: "Draft", tone: "neutral" },
  submitted: { label: "Waiting for approval", tone: "pending" },
  returned: { label: "Returned", tone: "rejected" },
  approved: { label: "Approved · in progress", tone: "info" },
  reported: { label: "Report to assess", tone: "pending" },
  assessed: { label: "Assessed", tone: "approved" },
};

export const ITEM_STATUS: Record<string, { label: string; tone: Tone }> = {
  not_started: { label: "Not started", tone: "neutral" },
  in_progress: { label: "In progress", tone: "info" },
  done: { label: "Done", tone: "approved" },
  postponed: { label: "Postponed", tone: "pending" },
  dropped: { label: "Dropped", tone: "rejected" },
};

export const SEVERITY: Record<string, { label: string; tone: Tone }> = {
  high: { label: "High", tone: "rejected" },
  medium: { label: "Medium", tone: "pending" },
  low: { label: "Low", tone: "neutral" },
};

export const PRIORITY: Record<string, string> = { high: "High", medium: "Medium", low: "Low" };
export const WEEKDAYS: [string, string][] = [["mon", "Mon"], ["tue", "Tue"], ["wed", "Wed"], ["thu", "Thu"], ["fri", "Fri"]];
export const RATING: Record<number, string> = { 1: "Far below expectations", 2: "Below expectations", 3: "Meets expectations", 4: "Above expectations", 5: "Outstanding" };

export interface PlanItem {
  id: string;
  title: string;
  output: string;
  indicator: string;
  baseline: string;
  target: string;
  verification: string;
  weight: number;
  start: string;
  due: string;
  days: string[];
  quarters: number[];
  priority: string;
  objective: string;
  department_plan: string;
  cost: number;
  status: string;
  progress: number;
  achieved: string;
  comment: string;
  unit: string;
  code: string;
  department_activity: string;
  actual: number | null;
  team: number;
}

export interface PlanIssue {
  id: string;
  title: string;
  detail: string;
  severity: "low" | "medium" | "high";
  item: string;
  status: "open" | "resolved";
  raised_by: string;
  raised_by_name: string;
  raised_at: string;
  resolution: string;
  resolved_by_name: string;
  resolved_at: string;
}

export interface TeamMember { id: string; name: string; department: string; designation: string }
export interface Period { start: string; end: string; label: string; fiscal_year: number; current?: boolean }
export interface PlanContext { supervisor: { id: string; name: string; designation: string } | null; department: { id: string; name: string } | null; is_head: boolean; can_assign: boolean; fiscal_start_month: number }
export interface DepartmentActivity {
  id: string; code: string; title: string; output: string; indicator: string; unit: string; target: string; target_value: number | null; due: string;
  objective: string; weight: number; achieved: number; progress: number; remaining: number | null; team: number; mine: boolean;
}
export interface DepartmentView {
  department: { id: string; name: string }; period: { start: string; end: string; label: string }; overall: number; activities: DepartmentActivity[];
  plan: { id: string; number: string; status: string; title: string; focus: string; period_label: string; head: string } | null;
}

export const blankItem = (): PlanItem => ({
  id: "", title: "", output: "", indicator: "", baseline: "", target: "", verification: "", weight: 0, start: "", due: "", days: [], quarters: [],
  priority: "medium", objective: "", department_plan: "", cost: 0, status: "not_started", progress: 0, achieved: "", comment: "",
  unit: "", code: "", department_activity: "", actual: null, team: 0,
});

type Act = "submit" | "review" | "progress" | "report" | "assess" | "copy" | "cascade" | "issues";
type Result = { id: string; number: string; status: string; progress: number };

export const plansApi = {
  period: (type: PlanType, date: string) => pocketbase.send(`/api/ims/plans/period?type=${type}&date=${date}`, {}) as Promise<{ type: PlanType; start: string; end: string; label: string; fiscal_year: number }>,
  act: (id: string, action: Act, body: Record<string, unknown> = {}) => pocketbase.send(`/api/ims/plans/${id}/${action}`, { method: "POST", body }) as Promise<Result>,
  assign: (body: Record<string, unknown>) => pocketbase.send("/api/ims/plans/assign", { method: "POST", body }) as Promise<Result>,
  team: () => pocketbase.send("/api/ims/plans/team", {}).then((r: any) => (r.items || []) as TeamMember[]),
  context: () => pocketbase.send("/api/ims/plans/context", {}) as Promise<PlanContext>,
  periods: (type: PlanKind) => pocketbase.send(`/api/ims/plans/periods?type=${type}`, {}).then((r: any) => (r.items || []) as Period[]),
  department: (date: string, department?: string) => pocketbase.send(`/api/ims/plans/department?date=${date}${department ? `&department=${department}` : ""}`, {}) as Promise<DepartmentView>,
};

/** "people", "person", "%", "chapters" — for "40 people", "1 report", "60%". */
export function unitText(unit: string | undefined, n?: number | null) {
  const u = String(unit || "").trim();
  if (!u) return "";
  if (/percent|%/i.test(u)) return "%";
  const l = u.toLowerCase();
  if (n === 1) return l === "people" ? "person" : l.replace(/ies$/, "y").replace(/s$/, "");
  return l;
}
const fmtNum = (n: number) => (Math.round(n * 10) / 10).toLocaleString("en-US");
/** "40 people", "60%", "1 report". */
export function qty(n: number | null | undefined, unit?: string) {
  if (n === null || n === undefined || Number.isNaN(Number(n))) return "—";
  const u = unitText(unit, Number(n));
  return u === "%" ? `${fmtNum(Number(n))}%` : u ? `${fmtNum(Number(n))} ${u}` : fmtNum(Number(n));
}
/** The number in a target such as "24", "3 chapters" or "100%". */
export const numberIn = (v: unknown) => {
  const m = String(v ?? "").replace(/[\s,]/g, "").match(/-?\d+(\.\d+)?/);
  return m ? Number(m[0]) : null;
};
/** dd/mm/yyyy, as on the forms. */
export const dmy = (d?: string) => (d ? `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}` : "");

export const dayOf = (v?: string) => String(v || "").slice(0, 10);
export const shiftPeriod = (type: PlanType, start: string, dir: 1 | -1) => {
  const d = new Date(`${start}T12:00:00Z`);
  if (type === "weekly") d.setUTCDate(d.getUTCDate() + 7 * dir);
  else if (type === "monthly") d.setUTCMonth(d.getUTCMonth() + dir);
  else if (type === "quarterly") d.setUTCMonth(d.getUTCMonth() + 3 * dir);
  else d.setUTCFullYear(d.getUTCFullYear() + dir);
  return d.toISOString().slice(0, 10);
};

// ------------------------------------------------------------------ health
export type Health = "not_started" | "on_track" | "at_risk" | "off_track" | "completed";
export const HEALTH: Record<Health, { label: string; tone: Tone; bar: string; text: string }> = {
  not_started: { label: "Not started", tone: "neutral", bar: "#C5CDD9", text: "text-[#5B6577]" },
  on_track: { label: "On track", tone: "approved", bar: "#1466C0", text: "text-[#0F6B3A]" },
  at_risk: { label: "At risk", tone: "pending", bar: "#E8A33A", text: "text-[#8A5A00]" },
  off_track: { label: "Off track", tone: "rejected", bar: "#C0392B", text: "text-[#B42318]" },
  completed: { label: "Completed", tone: "info", bar: "#0F6B3A", text: "text-[#0B3A6F]" },
};
export const HEALTH_NOTE = "Health compares achievement with time passed in the period · On track ≥ expected − 10 pts · At risk ≥ expected − 25 pts · Off track below";

const utcDay = (v: string | Date) => {
  if (v instanceof Date) return Date.UTC(v.getFullYear(), v.getMonth(), v.getDate());
  const [y, m, d] = dayOf(v).split("-").map(Number);
  return Date.UTC(y, (m || 1) - 1, d || 1);
};

/** Share of the period that has passed, today included (0–100). */
export function expectedOf(plan: { period_start: string; period_end: string }, now = new Date()) {
  const start = utcDay(plan.period_start);
  const end = utcDay(plan.period_end);
  const today = utcDay(now);
  if (today < start) return 0;
  if (today >= end) return 100;
  return Math.round(((today - start) / 864e5 + 1) / ((end - start) / 864e5 + 1) * 100);
}

/** Achievement against the time passed: on track ≥ expected − 10 points, at risk ≥ expected − 25, off track below. */
export function healthOf(plan: { status: string; progress: number; period_start: string; period_end: string }, now = new Date()): Health {
  if (plan.status === "reported" || plan.status === "assessed" || Number(plan.progress) >= 100) return "completed";
  if (utcDay(now) < utcDay(plan.period_start)) return "not_started";
  const gap = expectedOf(plan, now) - (Number(plan.progress) || 0);
  return gap <= 10 ? "on_track" : gap <= 25 ? "at_risk" : "off_track";
}

/** Status as shown: an approved plan whose period has not begun is "Not started". */
export function statusOf(plan: { status: string; period_start: string }, now = new Date()): { label: string; tone: Tone } {
  if (plan.status === "approved" && utcDay(now) < utcDay(plan.period_start)) return { label: "Not started", tone: "neutral" };
  return PLAN_STATUS[plan.status] || { label: plan.status, tone: "neutral" };
}

/** "Weekly plan — Rulindo training logistics", "Assigned task — …", "Annual performance contract FY 2026/27". */
export function planTitle(p: any) {
  const info = TYPE_INFO[p.plan_type as PlanKind] || TYPE_INFO.weekly;
  if (p.plan_type === "task") return `${info.label} — ${p.title}`;
  const head = String(p.period_label || "").split(" · ")[0];
  if (p.plan_type === "annual") return `${info.label} ${head}`;
  if (p.focus) return `${info.label} — ${p.focus}`;
  return `${info.label} · ${p.period_label}`;
}

/** Where a plan comes from: the person's own, assigned by a supervisor or from the strategic plan, or cascaded. */
export function originOf(p: any): { assigned: boolean; text: string } {
  if (p.origin === "assigned") {
    if (p.source) return { assigned: true, text: `Assigned · ${p.source}` };
    const a = p.expand?.assigned_by;
    const role = a?.expand?.designation?.name;
    return { assigned: true, text: `Assigned · ${a?.name || "by your supervisor"}${role ? `, ${role}` : ""}` };
  }
  if (p.origin === "cascaded") {
    const parent = p.expand?.parent?.plan_type as PlanKind | undefined;
    return { assigned: true, text: `Assigned · Cascaded from your ${parent ? TYPE_INFO[parent].label.toLowerCase() : "higher-level plan"}` };
  }
  return { assigned: false, text: "My own plan" };
}

export const openIssues = (p: any) => Number(p.open_issues) || ((p.issues || []) as PlanIssue[]).filter((i) => i.status === "open").length;
