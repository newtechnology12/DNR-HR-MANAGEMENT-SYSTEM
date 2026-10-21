/**
 * Individual work planning (public sector / NGO cycle): annual performance contract → quarterly outputs →
 * monthly activities → weekly plan, each approved by the supervisor, followed up, reported and assessed.
 * Rules: pocketbase/pb_hooks/lib/workspace.js.
 */
import pocketbase from "@/lib/pocketbase";

export type PlanType = "weekly" | "monthly" | "quarterly" | "annual";
export const PLAN_TYPES: PlanType[] = ["weekly", "monthly", "quarterly", "annual"];

export const TYPE_INFO: Record<PlanType, { label: string; short: string; item: string; items: string; parent: PlanType[]; hint: string }> = {
  weekly: { label: "Weekly plan", short: "Week", item: "Activity", items: "Activities", parent: ["monthly", "quarterly", "annual"], hint: "What you will do this week, day by day — from your monthly plan and your department's priorities." },
  monthly: { label: "Monthly plan", short: "Month", item: "Activity", items: "Activities", parent: ["quarterly", "annual"], hint: "The month's activities with their expected outputs and due dates." },
  quarterly: { label: "Quarterly plan", short: "Quarter", item: "Output", items: "Outputs", parent: ["annual"], hint: "The outputs of the quarter, each with an indicator and a target — the basis of the quarterly review." },
  annual: { label: "Annual performance contract", short: "Year", item: "Objective", items: "Objectives", parent: [], hint: "Your commitments for the fiscal year (Imihigo): objectives with indicators, baseline, target, weight and evidence, agreed with your supervisor." },
};

export const PLAN_STATUS: Record<string, { label: string; tone: "neutral" | "pending" | "approved" | "rejected" | "info" }> = {
  draft: { label: "Draft", tone: "neutral" },
  submitted: { label: "Waiting for approval", tone: "pending" },
  returned: { label: "Returned", tone: "rejected" },
  approved: { label: "Approved · in progress", tone: "info" },
  reported: { label: "Report to assess", tone: "pending" },
  assessed: { label: "Assessed", tone: "approved" },
};

export const ITEM_STATUS: Record<string, { label: string; tone: "neutral" | "pending" | "approved" | "rejected" | "info" }> = {
  not_started: { label: "Not started", tone: "neutral" },
  in_progress: { label: "In progress", tone: "info" },
  done: { label: "Done", tone: "approved" },
  postponed: { label: "Postponed", tone: "pending" },
  dropped: { label: "Dropped", tone: "rejected" },
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
}

export const blankItem = (): PlanItem => ({
  id: "", title: "", output: "", indicator: "", baseline: "", target: "", verification: "", weight: 0, start: "", due: "", days: [], quarters: [],
  priority: "medium", objective: "", department_plan: "", cost: 0, status: "not_started", progress: 0, achieved: "", comment: "",
});

export const plansApi = {
  period: (type: PlanType, date: string) => pocketbase.send(`/api/ims/plans/period?type=${type}&date=${date}`, {}) as Promise<{ type: PlanType; start: string; end: string; label: string; fiscal_year: number }>,
  act: (id: string, action: "submit" | "review" | "progress" | "report" | "assess" | "copy", body: Record<string, unknown> = {}) =>
    pocketbase.send(`/api/ims/plans/${id}/${action}`, { method: "POST", body }) as Promise<{ id: string; number: string; status: string; progress: number }>,
};

export const dayOf = (v?: string) => String(v || "").slice(0, 10);
export const shiftPeriod = (type: PlanType, start: string, dir: 1 | -1) => {
  const d = new Date(`${start}T12:00:00Z`);
  if (type === "weekly") d.setUTCDate(d.getUTCDate() + 7 * dir);
  else if (type === "monthly") d.setUTCMonth(d.getUTCMonth() + dir);
  else if (type === "quarterly") d.setUTCMonth(d.getUTCMonth() + 3 * dir);
  else d.setUTCFullYear(d.getUTCFullYear() + dir);
  return d.toISOString().slice(0, 10);
};
