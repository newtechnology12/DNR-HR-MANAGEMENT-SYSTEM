import type { Tone } from "@/lib/procurement";

/** Action plan statuses in the status glossary; the detail is the note under the pill. */
export const PLAN_STATUS: Record<string, { label: string; tone: Tone; note?: string }> = {
  not_started: { label: "Draft", tone: "neutral", note: "Not started" },
  in_progress: { label: "In progress", tone: "info" },
  completed: { label: "Completed", tone: "success" },
  on_hold: { label: "In progress", tone: "info", note: "On hold" },
  cancelled: { label: "Cancelled", tone: "danger" },
};
export const PLAN_PRIORITY: Record<string, { label: string; tone: Tone }> = {
  low: { label: "Low", tone: "neutral" },
  medium: { label: "Medium", tone: "info" },
  high: { label: "High", tone: "danger" },
};
export const PLAN_TYPES = [
  { value: "daily", label: "Daily" },
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
];

/** Work report statuses in the status glossary. */
export const REPORT_STATUS: Record<string, { label: string; tone: Tone; note?: string }> = {
  submitted: { label: "Pending approval", tone: "warning", note: "Awaiting review" },
  info_requested: { label: "Returned", tone: "violet", note: "Information requested" },
  reviewed: { label: "Completed", tone: "success", note: "Reviewed" },
};
/** "Pending approval · Awaiting review" — for status choices in a filter. */
export const statusText = (m?: { label: string; note?: string }) => (m ? (m.note ? `${m.label} · ${m.note}` : m.label) : "");
export const REPORT_TYPES = [
  { value: "daily", label: "Daily" },
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
  { value: "mission", label: "Mission / field" },
  { value: "activity", label: "Activity" },
];
export const reportTypeLabel = (t?: string) => REPORT_TYPES.find((x) => x.value === t)?.label || (t ? t[0].toUpperCase() + t.slice(1) : "Report");

export interface HourEntry {
  date: string;
  startTime: string;
  endTime: string;
  hours: number;
  note?: string;
}
export const hoursBetween = (start: string, end: string) => {
  if (!start || !end) return 0;
  const [a, b] = start.split(":").map(Number);
  const [c, d] = end.split(":").map(Number);
  const mins = c * 60 + d - (a * 60 + b);
  return mins > 0 ? Math.round((mins / 60) * 100) / 100 : 0;
};
export const totalHours = (entries: HourEntry[] = []) => Math.round(entries.reduce((a, e) => a + (Number(e.hours) || 0), 0) * 100) / 100;
export const isOverdue = (p: any) => !["completed", "cancelled"].includes(p.status) && p.deadline && new Date(p.deadline.replace(" ", "T")) < new Date(new Date().toDateString());
