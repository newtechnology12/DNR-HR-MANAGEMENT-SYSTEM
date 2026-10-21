/**
 * Building blocks of the staff workspace ("My workspace" design): cards, status pills, the attendance
 * calendar by week, the leave balance, my requests with their next step, the latest payslip, the clock-in
 * card. Every query is limited to the signed-in person; the API rules enforce the same boundary.
 */
import * as React from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQuery } from "react-query";
import { format, formatDistanceToNow } from "date-fns";
import { AlertTriangle, LogIn, LogOut, X } from "lucide-react";
import pocketbase from "@/lib/pocketbase";
import { byPeriodDesc } from "@/pages/hr/payroll/Payslip";
import { useClock } from "@/lib/useClock";
import { cn } from "@/utils";
import { Card, PageHeader, Pill as ImsPill, PillTone, buttonClass } from "@/components/ims";

// ------------------------------------------------------------------ design tokens
export const W = {
  ink: "#14213D", muted: "#5B6577", body: "#36435A", navy: "#0B3A6F", blue: "#1466C0", line: "#E3E8EF", soft: "#EDF0F5", field: "#DDE3EC", bg: "#F4F6F9",
};

export const pbDay = (d: Date) => format(d, "yyyy-MM-dd");
export const toDate = (v?: string | Date | null) => {
  if (!v) return null;
  const d = typeof v === "string" ? new Date(v.replace(" ", "T")) : v;
  return Number.isNaN(d.getTime()) ? null : d;
};
export const money = (n: number) => `RWF ${Math.round(Number(n) || 0).toLocaleString("en-US")}`;

export function WCard({ className, children, flush }: { className?: string; children: React.ReactNode; flush?: boolean }) {
  return <Card padded={!flush} className={className}>{children}</Card>;
}

export function WHead({ title, subtitle, right, className }: { title: React.ReactNode; subtitle?: React.ReactNode; right?: React.ReactNode; className?: string }) {
  return (
    <div className={cn("flex flex-wrap items-start justify-between gap-2.5", className)}>
      <div className="min-w-0">
        <h2 className="text-t-section text-ims-text">{title}</h2>
        {subtitle && <div className="mt-0.5 text-t-small text-ims-muted">{subtitle}</div>}
      </div>
      {right}
    </div>
  );
}

export function WLink({ to, children, className }: { to: string; children: React.ReactNode; className?: string }) {
  return <Link to={to} className={cn("text-[13px] font-bold text-ims-link hover:text-ims-primary hover:underline", className)}>{children}</Link>;
}

// Workspace tones → the ims pill tones (status glossary colours).
const PILL: Record<string, PillTone> = { approved: "success", pending: "warning", rejected: "danger", neutral: "neutral", info: "info", returned: "orange", completed: "success-outline" };
export function Pill({ tone = "neutral", children, className }: { tone?: keyof typeof PILL | string; children: React.ReactNode; className?: string }) {
  return <ImsPill tone={PILL[tone] || "neutral"} className={className}>{children}</ImsPill>;
}

export const btnPrimary = buttonClass({ variant: "primary" });
export const btnOutline = buttonClass({ variant: "secondary" });
export const btnNavyOutline = buttonClass({ variant: "secondary" });

// ------------------------------------------------------------------ clock-in card
export function ClockCard() {
  const clock = useClock();
  const [now, setNow] = React.useState(new Date());
  React.useEffect(() => {
    const t = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(t);
  }, []);
  const r = clock.record;
  const hm = (v?: string) => (toDate(v) ? format(toDate(v) as Date, "HH:mm") : "");
  const label = clock.state === "in" ? "Clocked in" : clock.state === "done" ? "Day completed" : clock.isWorkingDay ? "Not clocked in" : "Not a working day";
  const value = clock.state === "in" ? `Since ${hm(r?.clockin_time)}` : clock.state === "done" ? `${hm(r?.clockin_time)} – ${hm(r?.clockout_time)}` : `Today · ${format(now, "HH:mm")}`;
  return (
    <div className="flex items-center gap-3 rounded-xl border border-ims-border bg-white py-2 pl-4 pr-2">
      <div>
        <div className="text-[12px] font-semibold text-ims-muted">{label}</div>
        <div className={cn("text-[15px] font-extrabold tabular-nums", clock.state === "in" ? "text-ims-success" : "text-ims-text")}>{clock.loading ? "…" : value}</div>
      </div>
      {clock.state === "done" ? (
        <span className="inline-flex h-[42px] items-center rounded-[9px] bg-ims-success-bg px-4 text-[13.5px] font-bold text-ims-success">Done for today</span>
      ) : (
        <button
          type="button"
          disabled={clock.busy || clock.loading || (clock.state === "out" && !clock.isWorkingDay)}
          onClick={clock.state === "in" ? clock.clockOut : clock.clockIn}
          className={cn("inline-flex h-[42px] items-center gap-2 rounded-[9px] px-[18px] text-[14px] font-bold text-white transition-colors disabled:opacity-60", clock.state === "in" ? "bg-ims-danger hover:bg-[#9b1e14]" : "bg-ims-primary hover:bg-ims-primary-hover")}
        >
          {clock.state === "in" ? <LogOut size={17} aria-hidden /> : <LogIn size={17} aria-hidden />}
          {clock.busy ? "Please wait…" : clock.state === "in" ? "Clock out" : "Clock in"}
        </button>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ attendance calendar
const DOW = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
export type DayState = "onTime" | "late" | "leave" | "holiday" | "corrected" | "pending" | "absent" | "today" | "future";
export const DAY_STYLE: Record<DayState, { label: string; cell: string; swatch: string }> = {
  onTime: { label: "On time", cell: "bg-ims-link text-white", swatch: "bg-ims-link" },
  late: { label: "Late", cell: "bg-[#E8833A] text-white", swatch: "bg-[#E8833A]" },
  corrected: { label: "Corrected by HR", cell: "bg-[#DCEAFB] text-ims-primary", swatch: "bg-[#DCEAFB]" },
  leave: { label: "On leave", cell: "bg-ims-success-bg text-ims-success", swatch: "bg-ims-success-bg border border-[#BFE3CB]" },
  holiday: { label: "Public holiday", cell: "bg-white text-ims-muted border border-dotted border-ims-priority-low", swatch: "bg-white border border-dotted border-ims-priority-low" },
  pending: { label: "Correction asked", cell: "bg-[repeating-linear-gradient(45deg,#FEF3D6_0_4px,#FBE2A6_4px_8px)] text-ims-warning", swatch: "bg-[repeating-linear-gradient(45deg,#FEF3D6_0_3px,#FBE2A6_3px_6px)]" },
  absent: { label: "No clock-in", cell: "border border-[#E1E6EE] bg-ims-neutral-bg text-ims-muted", swatch: "border border-[#D5DBE5] bg-ims-neutral-bg" },
  today: { label: "Today", cell: "border-[1.5px] border-dashed border-ims-link bg-white text-ims-link", swatch: "border-[1.5px] border-dashed border-ims-link" },
  future: { label: "", cell: "text-ims-priority-low", swatch: "" },
};

export async function fetchMyAttendance(uid: string, days = 30) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const from = new Date(today.getTime() - (days - 1) * 864e5);
  const iso = (d: Date) => `${pbDay(d)} 00:00:00.000Z`;
  const [attendance, leaves, holidays, corrections] = await Promise.all([
    pocketbase.collection("attendance").getFullList({ filter: `employee = "${uid}" && date >= "${iso(new Date(from.getTime() - 864e5))}"`, sort: "date" }),
    pocketbase.collection("leaves").getFullList({ filter: `employee = "${uid}" && status = "approved" && end >= "${iso(from)}"`, fields: "start,end,type" }),
    pocketbase.collection("public_holidays").getFullList({ fields: "date,name,recurring" }).catch(() => [] as any[]),
    pocketbase.collection("attendance_corrections").getFullList({ filter: `employee = "${uid}" && status = "pending"`, fields: "id,number,dates,day_count" }).catch(() => [] as any[]),
  ]);
  return { from, today, attendance, leaves, holidays, corrections };
}

export interface CalDay { date: Date; key: string; state: DayState; tip: string }
export function buildCalendar(data: Awaited<ReturnType<typeof fetchMyAttendance>> | undefined, workingDays: string[]) {
  if (!data) return { weeks: [] as { label: string; days: (CalDay | null)[] }[], days: [] as CalDay[], counts: {} as Record<DayState, number>, absent: [] as CalDay[], pendingDays: 0 };
  const byDay = new Map<string, any>();
  for (const a of data.attendance) {
    const d = toDate(a.date || a.clockin_time);
    if (d) byDay.set(pbDay(d), a);
  }
  const pending = new Set<string>(data.corrections.flatMap((c: any) => c.dates || []));
  const holiday = (d: Date) => data.holidays.find((h: any) => h.date && (h.recurring ? format(toDate(h.date) as Date, "MM-dd") === format(d, "MM-dd") : pbDay(toDate(h.date) as Date) === pbDay(d)));
  const onLeave = (d: Date) => data.leaves.find((l: any) => l.start && l.end && pbDay(toDate(l.start) as Date) <= pbDay(d) && pbDay(d) <= pbDay(toDate(l.end) as Date));
  const days: CalDay[] = [];
  const todayKey = pbDay(data.today);
  for (let d = new Date(data.from); d <= data.today; d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1)) {
    if (!workingDays.includes(DOW[d.getDay()])) continue;
    const key = pbDay(d);
    const rec = byDay.get(key);
    const h = holiday(d);
    const l = onLeave(d);
    const hm = (v?: string) => (toDate(v) ? format(toDate(v) as Date, "HH:mm") : "?");
    let state: DayState;
    let tip: string;
    if (rec && rec.type === "correction") [state, tip] = ["corrected", "Corrected by HR"];
    else if (rec) [state, tip] = [rec.behaviour === "late" ? "late" : "onTime", `In ${hm(rec.clockin_time)}${rec.clockout_time ? ` · out ${hm(rec.clockout_time)}` : ""}`];
    else if (h) [state, tip] = ["holiday", h.name];
    else if (l) [state, tip] = ["leave", l.type || "Leave"];
    else if (pending.has(key)) [state, tip] = ["pending", "Correction asked, waiting for HR"];
    else if (key === todayKey) [state, tip] = ["today", "Today · not clocked in yet"];
    else [state, tip] = ["absent", "No clock-in"];
    days.push({ date: new Date(d), key, state, tip: `${format(d, "EEE d MMM")} · ${tip}` });
  }
  // Rows by week (Monday first), columns Monday–Friday.
  const weeks: { label: string; days: (CalDay | null)[] }[] = [];
  for (const cd of days) {
    const dow = (cd.date.getDay() + 6) % 7;
    if (dow > 4) continue;
    const monday = new Date(cd.date.getFullYear(), cd.date.getMonth(), cd.date.getDate() - dow);
    const label = format(monday, "d MMM");
    let w = weeks[weeks.length - 1];
    if (!w || w.label !== label) weeks.push((w = { label, days: [null, null, null, null, null] }));
    w.days[dow] = cd;
  }
  const counts = days.reduce((acc, d) => ({ ...acc, [d.state]: (acc[d.state] || 0) + 1 }), {} as Record<DayState, number>);
  const absent = days.filter((d) => d.state === "absent");
  return { weeks, days, counts, absent, pendingDays: pending.size };
}

export function AttendanceCalendar({ cal }: { cal: ReturnType<typeof buildCalendar> }) {
  const present = (cal.counts.onTime || 0) + (cal.counts.late || 0) + (cal.counts.corrected || 0);
  const shown: DayState[] = ["onTime", "late", "absent", "corrected", "pending", "leave", "holiday"];
  return (
    <div>
      <div className="mt-3.5 grid grid-cols-[56px_repeat(5,minmax(0,1fr))] gap-1.5 text-[12px]" role="grid" aria-label="Attendance by working day">
        <span />
        {["Mon", "Tue", "Wed", "Thu", "Fri"].map((w) => <span key={w} className="text-center font-bold text-ims-muted">{w}</span>)}
        {cal.weeks.map((wk) => (
          <React.Fragment key={wk.label}>
            <span className="self-center font-semibold text-ims-muted">{wk.label}</span>
            {wk.days.map((d, i) =>
              d ? (
                <span key={d.key} title={d.tip} aria-label={d.tip} className={cn("flex h-[34px] items-center justify-center rounded-[7px] font-bold tabular-nums", DAY_STYLE[d.state].cell)}>{format(d.date, "d")}</span>
              ) : (
                <span key={`${wk.label}-${i}`} className="h-[34px]" />
              )
            )}
          </React.Fragment>
        ))}
      </div>
      <div className="mt-3.5 flex flex-wrap gap-4 border-t border-ims-divider pt-3 text-[13px] text-ims-body">
        {shown.filter((s) => s === "onTime" || s === "late" || s === "absent" || (cal.counts[s] || 0) > 0).map((s) => (
          <span key={s} className="inline-flex items-center gap-1.5">
            <span className={cn("h-3 w-3 rounded-[3px]", DAY_STYLE[s].swatch)} aria-hidden />
            {DAY_STYLE[s].label} <b>{cal.counts[s] || 0}</b>
          </span>
        ))}
        <span className="inline-flex items-center gap-1.5"><span className={cn("h-3 w-3 rounded-[3px]", DAY_STYLE.today.swatch)} aria-hidden />Today</span>
        <span className="sr-only">{present} days present</span>
      </div>
    </div>
  );
}

/** "No clock-in on N working days since …" with the action, or what is waiting for HR. */
export function AttendanceNotice({ cal, onAsk, withinDays = 30 }: { cal: ReturnType<typeof buildCalendar>; onAsk: () => void; withinDays?: number }) {
  const key = `ims.notice.attendance.${pbDay(new Date())}`;
  const [hidden, setHidden] = React.useState(() => {
    try {
      return localStorage.getItem(key) === "1";
    } catch (_) {
      return false;
    }
  });
  const cutoff = Date.now() - withinDays * 86_400_000;
  const absent = cal.absent.filter((d) => d.date.getTime() >= cutoff);
  if (hidden || !absent.length) return null;
  const since = absent[0].date;
  return (
    <div role="status" className="flex flex-wrap items-center gap-3 rounded-xl border border-[#F5DFA3] bg-[#FFF8E6] px-4 py-3">
      <AlertTriangle size={20} className="shrink-0 text-[#9A6300]" aria-hidden />
      <div className="min-w-[240px] flex-1 text-[14px] text-ims-text">
        <b>No clock-in on {absent.length} working day{absent.length === 1 ? "" : "s"}</b>{" "}
        <span className="text-[#5B4A1C]">since {format(since, "d MMMM")}. Missions or approved absences? Ask HR to correct your log.{cal.pendingDays ? ` ${cal.pendingDays} day${cal.pendingDays === 1 ? " is" : "s are"} already waiting for HR.` : ""}</span>
      </div>
      <button type="button" onClick={onAsk} className="h-9 rounded-lg border border-[#D9B45B] bg-white px-3.5 text-[13px] font-bold text-[#6B4A00] hover:bg-[#FFFBF0]">Ask HR to correct</button>
      <button
        type="button"
        aria-label="Dismiss notice"
        onClick={() => {
          setHidden(true);
          try {
            localStorage.setItem(key, "1");
          } catch (_) {}
        }}
        className="flex h-8 w-8 items-center justify-center rounded-lg text-[#6B4A00] hover:bg-[#FCEFC7]"
      >
        <X size={16} />
      </button>
    </div>
  );
}

// ------------------------------------------------------------------ requests
export type ReqTab = "all" | "pending" | "approved" | "rejected";
export interface MyRequest { id: string; kind: string; details: string; amount: number | null; tone: "approved" | "pending" | "rejected" | "neutral"; status: string; next: string; created: string; link: string }

const statusTone = (s: string): MyRequest["tone"] =>
  ["approved", "paid", "disbursed", "converted", "ordered", "completed", "partially_ordered"].includes(s) ? "approved"
  : ["rejected", "cancelled"].includes(s) ? "rejected"
  : ["draft"].includes(s) ? "neutral" : "pending";
const label = (s: string) => (s ? s.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase()) : "—");

const leaveName = (type?: string) => {
  const l = label(type || "Leave");
  return /leave$/i.test(l) ? l : `${l} leave`;
};

export async function fetchMyRequests(uid: string, perKind = 20): Promise<MyRequest[]> {
  const opts = { sort: "-created" };
  const safe = (p: Promise<any>) => p.catch(() => ({ items: [] }));
  const [leaves, expenses, petty, assets, reqs] = await Promise.all([
    safe(pocketbase.collection("leaves").getList(1, perKind, { ...opts, filter: `employee = "${uid}"` })),
    safe(pocketbase.collection("prepayments").getList(1, perKind, { ...opts, filter: `employee = "${uid}"`, expand: "expenseCategory" })),
    safe(pocketbase.collection("petty_cash_requests").getList(1, perKind, { ...opts, filter: `requested_by = "${uid}"` })),
    safe(pocketbase.collection("assets_requests").getList(1, perKind, { ...opts, filter: `requested_by = "${uid}"`, expand: "asset" })),
    safe(pocketbase.collection("purchase_requisitions").getList(1, perKind, { ...opts, filter: `requester = "${uid}"` })),
  ]);
  const rows: MyRequest[] = [
    ...leaves.items.map((r: any) => ({
      id: r.id, kind: "Leave", details: `${leaveName(r.type)} · ${r.days || r.Leaveduration || "?"} day${(r.days || r.Leaveduration) === 1 ? "" : "s"}`, amount: null,
      tone: statusTone(r.status), status: label(r.status), created: r.created, link: "/dashboard/my/leave",
      next: r.status === "pending" ? "Waiting for line manager" : r.status === "approved" ? `${toDate(r.start) ? format(toDate(r.start) as Date, "d MMM") : ""}${toDate(r.end) ? ` – ${format(toDate(r.end) as Date, "d MMM")}` : ""}` : r.rejected_reason || "",
    })),
    ...expenses.items.map((r: any) => ({
      id: r.id, kind: "Expense", details: r.expand?.expenseCategory?.name || r.description || "Expense", amount: r.amount, tone: statusTone(r.status), status: label(r.status),
      created: r.created, link: "/dashboard/my/expenses", next: r.status === "pending" ? "Waiting for approval" : r.status === "approved" ? "Approved · to be paid" : r.status === "paid" ? "Paid" : r.rejected_reason || "",
    })),
    ...petty.items.map((r: any) => ({
      id: r.id, kind: "Petty cash", details: r.notes || "Cash request", amount: r.amount, tone: statusTone(r.status), status: label(r.status), created: r.created, link: "/dashboard/my/expenses?tab=petty",
      next: r.status === "pending" ? "Waiting for finance" : r.status === "approved" ? "Cash to collect from finance" : r.rejected_reason || "",
    })),
    ...assets.items.map((r: any) => ({
      id: r.id, kind: "Equipment", details: r.expand?.asset?.name || r.notes || "Equipment", amount: null, tone: statusTone(r.status), status: label(r.status), created: r.created, link: "/dashboard/my/equipment",
      next: r.status === "pending" ? "Waiting for the asset officer" : r.status === "approved" ? "Approved · collect from stores" : r.rejected_reason || "",
    })),
    ...reqs.items.map((r: any) => ({
      id: r.id, kind: "Purchase", details: r.title || r.number || "Purchase requisition", amount: r.total || r.estimated_total || null, tone: statusTone(r.status), status: r.status === "pending_approval" ? "In approval" : label(r.status),
      created: r.created, link: `/dashboard/procurement/requisitions/${r.id}`,
      next: r.status === "draft" ? "Draft · not submitted" : r.status === "pending_approval" ? "Waiting for approval" : r.status === "approved" ? "Approved · procurement next" : r.status === "returned" ? "Returned for changes" : "",
    })),
  ];
  return rows.sort((a, b) => b.created.localeCompare(a.created));
}

export const tabOf = (r: MyRequest): ReqTab => (r.tone === "approved" ? "approved" : r.tone === "rejected" ? "rejected" : "pending");

export function RequestTabs({ rows, tab, onTab }: { rows: MyRequest[]; tab: ReqTab; onTab: (t: ReqTab) => void }) {
  const n = (t: ReqTab) => (t === "all" ? rows.length : rows.filter((r) => tabOf(r) === t).length);
  return (
    <div role="group" aria-label="Filter requests" className="flex rounded-[9px] bg-ims-subtle p-[3px]">
      {(["all", "pending", "approved", "rejected"] as ReqTab[]).map((t) => (
        <button key={t} type="button" aria-pressed={tab === t} onClick={() => onTab(t)} className={cn("h-[30px] rounded-[7px] px-3 text-[12.5px] font-bold", tab === t ? "bg-white text-ims-primary shadow-[0_1px_2px_rgba(20,33,61,.12)]" : "text-ims-muted hover:text-ims-text")}>
          {t[0].toUpperCase() + t.slice(1)} <span className="opacity-70">{n(t)}</span>
        </button>
      ))}
    </div>
  );
}

export function RequestTable({ rows, empty = "Nothing here" }: { rows: MyRequest[]; empty?: string }) {
  const navigate = useNavigate();
  const ago = (r: MyRequest) => (toDate(r.created) ? formatDistanceToNow(toDate(r.created) as Date, { addSuffix: true }).replace("about ", "") : "");
  return (
    <>
      {/* phones: one card per request */}
      <ul className="divide-y divide-ims-divider border-t border-ims-divider sm:hidden">
        {rows.map((r) => (
          <li key={`${r.kind}-${r.id}`}>
            <button type="button" onClick={() => navigate(r.link)} className="flex w-full flex-col gap-1 px-4 py-3 text-left hover:bg-ims-hover">
              <span className="flex items-center justify-between gap-2"><b className="text-[14px] text-ims-text">{r.kind}</b><Pill tone={r.tone}>{r.status}</Pill></span>
              <span className="text-[13.5px] text-ims-text">{r.details}</span>
              <span className="flex items-center justify-between gap-2 text-[12.5px] text-ims-muted"><span className="min-w-0">{r.next || ago(r)}</span>{r.amount ? <b className="whitespace-nowrap tabular-nums text-ims-text">{money(r.amount)}</b> : null}</span>
            </button>
          </li>
        ))}
        {!rows.length && <li className="p-7 text-center text-ims-muted">{empty}</li>}
      </ul>
    <div className="hidden overflow-x-auto sm:block">
      <table className="w-full min-w-[640px] border-collapse text-[14px] [&_td]:border-r [&_td]:border-ims-divider [&_td:last-child]:border-r-0 [&_th]:border-r [&_th]:border-ims-divider [&_th:last-child]:border-r-0">
        <thead>
          <tr className="bg-ims-thead text-left text-[12.5px] text-ims-muted">
            <th scope="col" className="px-5 py-2.5 font-bold">Type</th>
            <th scope="col" className="px-3.5 py-2.5 font-bold">Details</th>
            <th scope="col" className="px-3.5 py-2.5 text-right font-bold">Amount</th>
            <th scope="col" className="px-3.5 py-2.5 font-bold">Status</th>
            <th scope="col" className="py-2.5 pl-3.5 pr-5 text-right font-bold">Submitted</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={`${r.kind}-${r.id}`} onClick={() => navigate(r.link)} className="cursor-pointer border-t border-ims-divider hover:[&>td]:bg-ims-hover">
              <td className="px-5 py-3 font-bold text-ims-text">{r.kind}</td>
              <td className="max-w-[300px] px-3.5 py-3 text-ims-text"><span className="line-clamp-2">{r.details}</span></td>
              <td className="whitespace-nowrap px-3.5 py-3 text-right font-bold tabular-nums">{r.amount ? money(r.amount) : "—"}</td>
              <td className="px-3.5 py-3"><Pill tone={r.tone}>{r.status}</Pill>{r.next && <div className="mt-[3px] text-[12px] text-ims-muted">{r.next}</div>}</td>
              <td className="whitespace-nowrap py-3 pl-3.5 pr-5 text-right text-ims-muted">{ago(r)}</td>
            </tr>
          ))}
          {!rows.length && <tr><td colSpan={5} className="p-7 text-center text-ims-muted">{empty}</td></tr>}
        </tbody>
      </table>
    </div>
    </>
  );
}

// ------------------------------------------------------------------ leave
const round1 = (n: number) => Math.round((Number(n) || 0) * 10) / 10;

export function LeaveBalance({ b }: { b: any }) {
  if (!b) return <p className="rounded-lg bg-ims-thead px-3 py-5 text-center text-[13px] text-ims-muted">No leave entitlement recorded for this year yet. HR sets it up.</p>;
  const ent = Math.max(Number(b.entitlement) || 0, 0);
  const taken = Number(b.taken) || 0;
  const pending = Number(b.pending) || 0;
  const left = round1(ent - taken);
  const after = round1(left - pending);
  const pct = (n: number) => `${ent ? Math.max(0, Math.min(100, (n / ent) * 100)) : 0}%`;
  return (
    <>
      <div><span className="text-[30px] font-extrabold tabular-nums">{left}</span> <span className="text-[15px] font-bold text-ims-muted">days left</span></div>
      <div role="img" aria-label={`${ent} days: ${taken} taken, ${pending} pending, ${after} available after approval`} className="flex h-2.5 overflow-hidden rounded-[5px] bg-ims-neutral-bg">
        <span style={{ width: pct(taken) }} className="bg-ims-primary" />
        <span style={{ width: pct(pending) }} className="bg-[repeating-linear-gradient(45deg,#F2B544_0_4px,#F8D58E_4px_8px)]" />
        <span style={{ width: pct(Math.max(after, 0)) }} className="bg-ims-link" />
      </div>
      <div className="grid grid-cols-3 gap-2 text-[12.5px]">
        <div><div className="text-ims-muted">Taken</div><b className="text-[15px] tabular-nums">{round1(taken)}</b></div>
        <div><div className="text-ims-warning">Pending</div><b className="text-[15px] tabular-nums text-ims-warning">{round1(pending)}</b></div>
        <div><div className="text-ims-muted">After approval</div><b className="text-[15px] tabular-nums">{after}</b></div>
      </div>
    </>
  );
}

/** Page title in the workspace style. */
/** Page title in the workspace: the ims PageHeader with "Dashboard › My workspace › Page". */
export function MyHeader({ title, subtitle, actions, eyebrow }: { title: string; subtitle?: React.ReactNode; actions?: React.ReactNode; eyebrow?: React.ReactNode }) {
  const crumbs = typeof eyebrow === "string" && eyebrow !== title ? [{ label: eyebrow, to: "/dashboard/my" }, { label: title }] : [{ label: title }];
  return <PageHeader breadcrumbs={crumbs} title={title} subtitle={subtitle} actions={actions} />;
}

/** Same frame as ims Page: 28px padding (16px on phones), 16px between cards. */
export const myPage = "mx-auto flex w-full max-w-[1480px] flex-col gap-4 px-4 pb-10 pt-4 text-ims-text sm:px-[28px] sm:pt-6";

// ------------------------------------------------------------------ payslip
export async function fetchLatestPayslip(uid: string) {
  const rows = await pocketbase.collection("employees_payrolls").getFullList({ filter: `employee = "${uid}" && (payroll.status = "approved" || payroll.status = "paid")`, expand: "payroll" });
  return (rows.sort(byPeriodDesc)[0] as any) || null;
}

export function usePayHidden() {
  const [hidden, setHidden] = React.useState(() => {
    try {
      return localStorage.getItem("ims.hidePay") === "1";
    } catch (_) {
      return false;
    }
  });
  const toggle = () =>
    setHidden((h) => {
      try {
        localStorage.setItem("ims.hidePay", h ? "0" : "1");
      } catch (_) {}
      return !h;
    });
  return [hidden, toggle] as const;
}

export function useMyQuery<T>(key: string, uid: string, fn: () => Promise<T>, opts: { refetchInterval?: number } = {}) {
  return useQuery(["my-dashboard", key, uid], fn, { enabled: Boolean(uid), ...opts });
}
