/**
 * How values read everywhere in RALGA IMS (writing rules):
 *   dates "25 Nov 2026" · date and time "25 Nov 2026, 14:30" · relative only under 7 days ("2 days ago")
 *   money in text "RWF 1,250,000" · money in tables: numbers only, the header says "(RWF)"
 *   overdue "Overdue · 2 days"
 */
import { differenceInCalendarDays, format, formatDistanceToNowStrict } from "date-fns";

/** PocketBase dates ("2026-10-21 08:05:00.000Z"), ISO strings or Date → Date; null when empty or invalid. */
export function toDate(v?: string | Date | null): Date | null {
  if (!v) return null;
  const d = typeof v === "string" ? new Date(/^\d{4}-\d{2}-\d{2}$/.test(v) ? `${v}T12:00:00` : v.replace(" ", "T")) : v;
  return Number.isNaN(d.getTime()) ? null : d;
}

/** "25 Nov 2026" */
export const fmtDate = (v?: string | Date | null, empty = "—") => {
  const d = toDate(v);
  return d ? format(d, "d MMM yyyy") : empty;
};

/** "25 Nov 2026, 14:30" */
export const fmtDateTime = (v?: string | Date | null, empty = "—") => {
  const d = toDate(v);
  return d ? format(d, "d MMM yyyy, HH:mm") : empty;
};

/** "2 days ago" for the last 7 days, otherwise the date. */
export const fmtWhen = (v?: string | Date | null, empty = "—") => {
  const d = toDate(v);
  if (!d) return empty;
  const days = Math.abs(differenceInCalendarDays(new Date(), d));
  if (days >= 7) return format(d, "d MMM yyyy");
  return formatDistanceToNowStrict(d, { addSuffix: true }).replace(/^0 seconds ago$/, "just now");
};

const nf = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
const nf2 = new Intl.NumberFormat("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 });

/** Numbers in tables: "1,250,000" (money columns say "(RWF)" in the header). */
export const fmtNumber = (n?: number | string | null, decimals = false) => (n === null || n === undefined || n === "" || Number.isNaN(Number(n)) ? "—" : (decimals ? nf2 : nf).format(Number(n)));

/** Money in sentences, cards and summaries: "RWF 1,250,000". */
export const fmtMoney = (n?: number | string | null) => (n === null || n === undefined || n === "" || Number.isNaN(Number(n)) ? "—" : `RWF ${nf.format(Math.round(Number(n)))}`);

/** Compact money for KPI bands: "RWF 1.3M". */
export const fmtMoneyShort = (n?: number | null) =>
  `RWF ${new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 }).format(Number(n) || 0)}`;

/** "Overdue · 2 days" when the date has passed, otherwise null. */
export function overdue(due?: string | Date | null, now = new Date()): string | null {
  const d = toDate(due);
  if (!d) return null;
  const days = differenceInCalendarDays(now, d);
  if (days <= 0) return null;
  return `Overdue · ${days} day${days === 1 ? "" : "s"}`;
}

/** Sentence case for labels that arrive in another case ("PENDING_APPROVAL" → "Pending approval"). */
export const sentence = (s?: string | null) => {
  const t = String(s || "").replace(/[_-]+/g, " ").trim().toLowerCase();
  return t ? t.charAt(0).toUpperCase() + t.slice(1) : "";
};

/** "14:30" */
export const fmtTime = (v?: string | Date | null, empty = "—") => {
  const d = toDate(v);
  return d ? format(d, "HH:mm") : empty;
};

/** "Thu 25 Nov" (short dates inside a known period, e.g. a week or a timesheet). */
export const fmtDay = (v?: string | Date | null, empty = "—") => {
  const d = toDate(v);
  return d ? format(d, "EEE d MMM") : empty;
};
