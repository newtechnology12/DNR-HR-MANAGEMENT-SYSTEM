import pocketbase from "@/lib/pocketbase";
import type { Tone } from "@/lib/procurement";

export const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
export const MONTHS_SHORT = MONTHS.map((m) => m.slice(0, 3));
export const rwf = (n?: number) => `${Math.round(Number(n) || 0).toLocaleString("en-US")}`;

// ------------------------------------------------------------------ leave
export interface LeaveBalance {
  employee: { id: string; name: string; email: string; department: string; department_name: string; joined_at: string; gender: string };
  years_of_service: number;
  months_of_service: number;
  accrual: number;
  seniority_days: number;
  carried_over: number;
  carried_auto: boolean;
  adjustment: number;
  adjustment_reason: string;
  entitlement: number;
  accrued_to_date: number;
  taken: number;
  pending: number;
  taken_months: Record<string, number>;
  planned: number;
  months: Record<string, number>;
  balance: number;
  available: number;
  unplanned: number;
  plan: { id: string; status: "draft" | "approved"; notes: string; updated: string } | null;
}
export interface LeaveSettings {
  accrual: number;
  every: number;
  extra: number;
  maxSeniority: number;
  maxCarry: number;
  allowNegative: boolean;
  working: string[];
}
export interface PlanRow {
  employee: string;
  months: Record<number, number>;
  carried_over?: number | string;
  adjustment?: number | string;
  adjustment_reason?: string;
  notes?: string;
}

export const leaveApi = {
  balances: (year: number, opts: { department?: string; employee?: string } = {}) => {
    const qs = new URLSearchParams({ year: String(year), ...(opts.department ? { department: opts.department } : {}), ...(opts.employee ? { employee: opts.employee } : {}) });
    return pocketbase.send(`/api/dnr/leave/balances?${qs}`, {}) as Promise<{ year: number; settings: LeaveSettings; items: LeaveBalance[] }>;
  },
  count: (start: string, end: string, type: string) =>
    pocketbase.send(`/api/dnr/leave/count?${new URLSearchParams({ start, end, type })}`, {}) as Promise<{ days: number; basis: string; holidays: { date: string; name: string }[] }>,
  savePlans: (year: number, rows: PlanRow[]) =>
    pocketbase.send("/api/dnr/leave/plans", { method: "POST", body: { year, rows } }) as Promise<{ saved: number; errors: { employee: string; name?: string; message: string }[] }>,
  approvePlans: (year: number, employees: string[]) => pocketbase.send("/api/dnr/leave/plans/approve", { method: "POST", body: { year, employees } }) as Promise<{ approved: number }>,
};

// ------------------------------------------------------------------ payroll
export const PAYROLL_STATUS: Record<string, { label: string; tone: Tone }> = {
  draft: { label: "Draft", tone: "neutral" },
  computed: { label: "Calculated", tone: "info" },
  pending_approval: { label: "In approval", tone: "warning" },
  returned: { label: "Returned", tone: "violet" },
  approved: { label: "Approved — to pay", tone: "info" },
  rejected: { label: "Rejected", tone: "danger" },
  paid: { label: "Paid", tone: "success" },
  cancelled: { label: "Cancelled", tone: "neutral" },
};
export const EMPLOYMENT_TYPES = [
  { value: "permanent", label: "Permanent" },
  { value: "contract", label: "Fixed-term contract" },
  { value: "casual", label: "Casual worker" },
  { value: "internship", label: "Intern" },
];
export const CONTRIBUTION_BASES: Record<string, string> = {
  gross: "Gross salary",
  gross_excl_transport: "Gross excluding transport allowance",
  basic: "Basic salary",
  net_before_cbhi: "Net salary (after PAYE and other contributions)",
};
export const payrollApi = {
  create: (body: { year: number; month: number; branch?: string; notes?: string }) => pocketbase.send("/api/dnr/payroll", { method: "POST", body }) as Promise<{ id: string; number: string }>,
  action: (id: string, action: "compute" | "submit" | "paid" | "cancel", body: Record<string, unknown> = {}) =>
    pocketbase.send(`/api/dnr/payroll/${id}/${action}`, { method: "POST", body }) as Promise<{ id: string; status: string }>,
  preview: (body: Record<string, unknown>) => pocketbase.send("/api/dnr/payroll/preview", { method: "POST", body }) as Promise<any>,
};

// ------------------------------------------------------------------ appraisals
export const APPRAISAL_STATUS: Record<string, { label: string; tone: Tone }> = {
  not_started: { label: "Not started", tone: "neutral" },
  in_progress: { label: "In progress", tone: "info" },
  submitted: { label: "Evaluated", tone: "info" },
  shared: { label: "Shared with employee", tone: "warning" },
  acknowledged: { label: "Acknowledged", tone: "success" },
  disputed: { label: "Claim raised", tone: "danger" },
  finalized: { label: "Final", tone: "success" },
};
export const CLAIM_STATUS: Record<string, { label: string; tone: Tone }> = {
  open: { label: "Open", tone: "warning" },
  upheld: { label: "Accepted — being corrected", tone: "success" },
  rejected: { label: "Not accepted", tone: "danger" },
  answered: { label: "Answered", tone: "info" },
};
export const GRADE_TONE: Record<string, Tone> = { A: "success", B: "success", C: "info", D: "warning", E: "danger" };
export interface Criterion {
  id: string;
  title: string;
  description?: string;
  weight: number;
}
export interface Section {
  id: string;
  title: string;
  weight: number;
  criteria: Criterion[];
}
export interface ScaleLevel {
  value: number;
  label: string;
  description?: string;
}
export interface GradeBand {
  min: number;
  grade: string;
  label: string;
}
export const appraisalApi = {
  launch: (cycleId: string) => pocketbase.send(`/api/dnr/appraisals/cycles/${cycleId}/launch`, { method: "POST" }) as Promise<{ created: number }>,
  action: (id: string, action: "review" | "share" | "acknowledge" | "claim" | "finalize" | "refresh", body: Record<string, unknown> = {}) =>
    pocketbase.send(`/api/dnr/appraisals/${id}/${action}`, { method: "POST", body }) as Promise<{ id: string; status: string }>,
  respond: (claimId: string, body: { decision: string; response: string }) => pocketbase.send(`/api/dnr/appraisals/claims/${claimId}/respond`, { method: "POST", body }),
};
/** Same formula as the server (lib/appraisal.js) — used for the live score while rating. */
export function scoreOf(sections: Section[], scale: ScaleLevel[], ratings: Record<string, { value: number }>) {
  const top = Math.max(1, ...scale.map((s) => Number(s.value) || 0));
  let total = 0;
  let weights = 0;
  const bySection: Record<string, number> = {};
  for (const sec of sections) {
    let sum = 0;
    let w = 0;
    for (const c of sec.criteria) {
      const v = Number(ratings[c.id]?.value);
      if (!(v > 0)) continue;
      sum += (v / top) * (Number(c.weight) || 1);
      w += Number(c.weight) || 1;
    }
    if (!w) continue;
    bySection[sec.id] = Math.round((sum / w) * 1000) / 10;
    total += (sum / w) * 100 * (Number(sec.weight) || 0);
    weights += Number(sec.weight) || 0;
  }
  return { score: weights ? Math.round((total / weights) * 10) / 10 : null, bySection };
}
export const gradeOf = (bands: GradeBand[], score: number | null) => {
  if (score === null) return null;
  return [...bands].sort((a, b) => b.min - a.min).find((b) => score >= b.min) || null;
};
