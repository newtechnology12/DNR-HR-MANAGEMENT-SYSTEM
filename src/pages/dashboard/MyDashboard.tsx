/**
 * Personal dashboard for staff (and any role without workforce oversight): today's clock-in, this
 * month's attendance, leave balance, the person's own requests and latest payslip, plus the
 * queues they are allowed to decide on. Every query is limited to the signed-in employee; the API
 * rules enforce the same boundary.
 */
import * as React from "react";
import { useQuery } from "react-query";
import { useNavigate } from "react-router-dom";
import { format, formatDistanceToNow, isSameMonth, startOfMonth, subDays } from "date-fns";
import {
  ArrowRight, CalendarCheck2, CalendarClock, CalendarRange, CheckCircle2, Clock, FileText, Inbox, Laptop, LogIn, Palmtree, Receipt, Wallet,
} from "lucide-react";
import pocketbase from "@/lib/pocketbase";
import { cn } from "@/utils";
import { useAuth } from "@/context/auth.context";
import { useRoles } from "@/context/roles.context";
import useSettings from "@/hooks/useSettings";
import StatCard from "@/components/StatCard";
import BreadCrumb from "@/components/breadcrumb";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState, ListSkeleton, Panel, StatusBadge } from "@/components/enterprise/ui";
import { leaveApi } from "@/lib/hr";
import { queueCounts, queuesFor } from "./queues";

const DAY_NAMES = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
const DEFAULT_WORKING_DAYS = ["monday", "tuesday", "wednesday", "thursday", "friday"];
const WINDOW_DAYS = 30;
const PORTAL = "/dashboard/employee-portal";

const pbDate = (d: Date) => d.toISOString().replace("T", " ");
/** PocketBase dates ("2026-10-21 08:05:00.000Z") as Date; null when empty or invalid. */
const toDate = (v?: Date | string | null) => {
  if (!v) return null;
  const d = typeof v === "string" ? new Date(v.replace(" ", "T")) : v;
  return Number.isNaN(d.getTime()) ? null : d;
};
const fmt = (v: Date | string | null | undefined, pattern: string) => {
  const d = toDate(v);
  return d ? format(d, pattern) : "";
};
const dayKey = (v?: Date | string | null) => fmt(v, "yyyy-MM-dd");
const money = (n: number) => `RWF ${Math.round(Number(n) || 0).toLocaleString("en-US")}`;
const startOfToday = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
};

// Day states in the attendance strip. On time / late reuse the organisation chart's colours.
const DAY_STATES = {
  onTime: { label: "On time", cell: "bg-[#2a78d6] text-white", swatch: "bg-[#2a78d6]" },
  late: { label: "Late", cell: "bg-[#eb6834] text-white", swatch: "bg-[#eb6834]" },
  leave: { label: "On leave", cell: "bg-ralga-green text-white", swatch: "bg-ralga-green" },
  absent: { label: "No clock-in", cell: "bg-red-50 text-red-700 ring-1 ring-inset ring-red-200", swatch: "bg-red-50 ring-1 ring-inset ring-red-200" },
  holiday: { label: "Public holiday", cell: "bg-slate-100 text-slate-500", swatch: "bg-slate-100" },
  today: { label: "Today, not clocked in", cell: "border border-dashed border-slate-300 bg-white text-slate-500", swatch: "border border-dashed border-slate-300 bg-white" },
} as const;
type DayState = keyof typeof DAY_STATES;

// ------------------------------------------------------------------ data (own records only)
async function fetchAttendance(uid: string) {
  const today = startOfToday();
  const from = new Date(Math.min(subDays(today, WINDOW_DAYS - 1).getTime(), startOfMonth(today).getTime()));
  const [attendance, leaves, holidays] = await Promise.all([
    pocketbase.collection("attendance").getFullList({ filter: `employee = "${uid}" && date >= "${pbDate(from)}"`, sort: "date" }),
    pocketbase.collection("leaves").getFullList({ filter: `employee = "${uid}" && status = "approved" && end >= "${pbDate(from)}"`, fields: "start,end,type" }),
    pocketbase.collection("public_holidays").getFullList({ fields: "date,name,recurring" }).catch(() => []),
  ]);
  return { from, attendance, leaves, holidays };
}

async function fetchRequests(uid: string) {
  const opts = { sort: "-created" };
  const [leaves, expenses, petty, assets] = await Promise.all([
    pocketbase.collection("leaves").getList(1, 6, { ...opts, filter: `employee = "${uid}"` }),
    pocketbase.collection("prepayments").getList(1, 6, { ...opts, filter: `employee = "${uid}"`, expand: "expenseCategory" }),
    pocketbase.collection("petty_cash_requests").getList(1, 6, { ...opts, filter: `requested_by = "${uid}"` }),
    pocketbase.collection("assets_requests").getList(1, 6, { ...opts, filter: `requested_by = "${uid}"`, expand: "asset" }),
  ]);
  const rows = [
    ...leaves.items.map((r) => ({ id: r.id, kind: "Leave", icon: Palmtree, created: r.created, status: r.status, what: `${r.type || "Leave"} · ${r.days || r.Leaveduration || "?"} day(s)`, link: `${PORTAL}?tab=Leaves` })),
    ...expenses.items.map((r) => ({ id: r.id, kind: "Expense", icon: Receipt, created: r.created, status: r.status, what: `${r.expand?.expenseCategory?.name || r.description || "Expense"} · ${money(r.amount)}`, link: `${PORTAL}?tab=Expense Request` })),
    ...petty.items.map((r) => ({ id: r.id, kind: "Petty cash", icon: Wallet, created: r.created, status: r.status, what: `${r.notes || "Cash request"} · ${money(r.amount)}`, link: "" })),
    ...assets.items.map((r) => ({ id: r.id, kind: "Equipment", icon: Laptop, created: r.created, status: r.status, what: r.expand?.asset?.name || r.notes || "Equipment request", link: "/dashboard/assets/requests" })),
  ].sort((a, b) => b.created.localeCompare(a.created));
  return { rows: rows.slice(0, 8) };
}

async function fetchOpenCount(uid: string) {
  const count = (col: string, owner: string) =>
    pocketbase.collection(col).getList(1, 1, { filter: `${owner} = "${uid}" && status = "pending"`, fields: "id" }).then((r) => r.totalItems).catch(() => 0);
  const n = await Promise.all([count("leaves", "employee"), count("prepayments", "employee"), count("petty_cash_requests", "requested_by"), count("assets_requests", "requested_by")]);
  return n.reduce((a, b) => a + b, 0);
}

async function fetchPayslip(uid: string) {
  const rows = await pocketbase.collection("employees_payrolls").getFullList({
    filter: `employee = "${uid}" && (payroll.status = "approved" || payroll.status = "paid")`,
    expand: "payroll",
  });
  return rows.sort((a, b) => (b.expand?.payroll?.year * 100 + b.expand?.payroll?.month) - (a.expand?.payroll?.year * 100 + a.expand?.payroll?.month))[0] || null;
}

// ------------------------------------------------------------------ page
export default function MyDashboard() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { canPerform } = useRoles();
  const { settings } = useSettings();
  const uid: string = user?.id || "";
  const year = new Date().getFullYear();

  const workingDays: string[] = settings?.working_days?.length ? settings.working_days : DEFAULT_WORKING_DAYS;
  const isWorkingDay = workingDays.includes(DAY_NAMES[new Date().getDay()]);
  const portal = canPerform("access_employee_portal");

  const attendance = useQuery(["my-dashboard", "attendance", uid], () => fetchAttendance(uid), { enabled: Boolean(uid), refetchInterval: 60_000 });
  const requests = useQuery(["my-dashboard", "requests", uid], () => fetchRequests(uid), { enabled: Boolean(uid) });
  const openCount = useQuery(["my-dashboard", "open", uid], () => fetchOpenCount(uid), { enabled: Boolean(uid) });
  const balance = useQuery(["my-dashboard", "leave", uid, year], () => leaveApi.balances(year, { employee: uid }).then((r) => r.items[0] || null), { enabled: Boolean(uid) });
  const payslip = useQuery(["my-dashboard", "payslip", uid], () => fetchPayslip(uid), { enabled: Boolean(uid) });
  const queues = React.useMemo(() => queuesFor(canPerform), [canPerform]);
  const queueQ = useQuery(["my-dashboard", "queues", uid, queues.map((q) => q.key).join()], () => queueCounts(queues, uid), { enabled: Boolean(uid) && queues.length > 0, refetchInterval: 60_000 });

  const days = React.useMemo(() => buildDays(attendance.data, workingDays), [attendance.data, workingDays]);
  const todayRec = attendance.data?.attendance.find((a) => dayKey(a.date || a.clockin_time) === dayKey(new Date()));
  const month = days.filter((d) => isSameMonth(d.date, new Date()) && d.date < new Date());
  const presentThisMonth = month.filter((d) => d.state === "onTime" || d.state === "late").length;
  const lateThisMonth = month.filter((d) => d.state === "late").length;
  const window30 = days.filter((d) => d.date >= subDays(startOfToday(), WINDOW_DAYS - 1));

  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const time = (v?: string) => fmt(v, "HH:mm");

  const actions = [
    portal && { label: !todayRec ? "Clock in" : !todayRec.clockout_time ? "Clock out" : "Attendance log", icon: LogIn, link: todayRec?.clockout_time ? `${PORTAL}?tab=Attendance Log` : PORTAL },
    portal && { label: "Request leave", icon: Palmtree, link: `${PORTAL}?tab=Leaves` },
    portal && { label: "Expense request", icon: Receipt, link: `${PORTAL}?tab=Expense Request` },
    canPerform("view_assets_requests") && { label: "Equipment request", icon: Laptop, link: "/dashboard/assets/requests" },
    portal && { label: "My leave plan", icon: CalendarRange, link: "/dashboard/leave-plan" },
    portal && { label: "My payslips", icon: FileText, link: `${PORTAL}?tab=Payslips` },
  ].filter(Boolean) as { label: string; icon: typeof LogIn; link: string }[];

  return (
    <div className="flex-1 space-y-5 px-4 py-4 sm:px-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-1">
          <BreadCrumb items={[{ title: "My workspace", link: "/dashboard" }]} />
          <h2 className="text-xl font-semibold tracking-tight text-slate-900">
            {greeting}, {user?.names?.split(" ")[0] || "there"}
          </h2>
          <p className="text-[13px] text-slate-500">
            {format(new Date(), "EEEE, d MMMM yyyy")} · Your own attendance, leave, requests and pay
          </p>
        </div>
        {portal && (
          <button
            type="button"
            onClick={() => navigate(PORTAL)}
            className="inline-flex h-9 items-center gap-2 self-start rounded-md bg-primary px-3.5 text-[13px] font-semibold text-white shadow-sm hover:bg-primaryDark sm:self-auto"
          >
            <LogIn size={15} /> {todayRec ? (todayRec.clockout_time ? "Open my portal" : "Clock out") : "Clock in"}
          </button>
        )}
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <StatCard
          title="Today"
          icon={Clock}
          tone={todayRec ? (todayRec.behaviour === "late" ? "warning" : "success") : "neutral"}
          loading={attendance.isLoading}
          value={todayRec ? time(todayRec.clockin_time) : "—"}
          description={
            todayRec
              ? `${todayRec.behaviour === "late" ? "Late arrival" : "On time"}${todayRec.clockout_time ? ` · out ${time(todayRec.clockout_time)}` : ""}`
              : isWorkingDay ? "Not clocked in yet" : "Not a working day"
          }
          onClick={portal ? () => navigate(PORTAL) : undefined}
        />
        <StatCard
          title="This month"
          icon={CalendarCheck2}
          tone="info"
          loading={attendance.isLoading}
          value={`${presentThisMonth} day${presentThisMonth === 1 ? "" : "s"}`}
          description={`${lateThisMonth} late arrival${lateThisMonth === 1 ? "" : "s"}`}
          onClick={portal ? () => navigate(`${PORTAL}?tab=Attendance Log`) : undefined}
        />
        <StatCard
          title="Annual leave left"
          icon={Palmtree}
          tone="success"
          loading={balance.isLoading}
          value={balance.data ? `${round1(balance.data.available)} days` : "—"}
          description={balance.data ? `${round1(balance.data.taken)} taken of ${round1(balance.data.entitlement)} in ${year}` : "No leave entitlement yet"}
          onClick={portal ? () => navigate(`${PORTAL}?tab=Leaves`) : undefined}
        />
        <StatCard
          title="My open requests"
          icon={Inbox}
          tone={openCount.data ? "warning" : "neutral"}
          loading={openCount.isLoading}
          value={openCount.data ?? 0}
          description="Waiting for a decision"
        />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Panel
          className="xl:col-span-2"
          title="My attendance"
          subtitle={`Working days in the last ${WINDOW_DAYS} days`}
          action={portal ? { label: "Attendance log", onClick: () => navigate(`${PORTAL}?tab=Attendance Log`) } : undefined}
        >
          {attendance.isLoading ? <Skeleton className="h-[150px] w-full" /> : <AttendanceStrip days={window30} />}
        </Panel>

        <Panel title="Quick actions" subtitle="Things you can do yourself">
          {actions.length ? (
            <ul className="grid grid-cols-2 gap-2">
              {actions.map((a) => (
                <li key={a.label}>
                  <button
                    type="button"
                    onClick={() => navigate(a.link)}
                    className="group flex h-full w-full items-center gap-2.5 rounded-md border border-slate-200 px-3 py-2.5 text-left text-[13px] font-medium text-slate-700 transition-colors hover:border-ralga-navy/30 hover:bg-ralga-navy/[0.04] hover:text-ralga-navy"
                  >
                    <a.icon size={16} className="shrink-0 text-slate-400 group-hover:text-ralga-navy" />
                    <span className="leading-tight">{a.label}</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState icon={CalendarClock} text="Your role has no self-service actions." />
          )}
        </Panel>
      </div>

      {queues.length > 0 && (
        <Panel title="Needs your action" subtitle="Requests waiting for your decision">
          {queueQ.isLoading ? (
            <ListSkeleton rows={2} />
          ) : (
            <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
              {queues.map((q) => {
                const n = queueQ.data?.[q.key] || 0;
                return (
                  <li key={q.key}>
                    <button type="button" onClick={() => navigate(q.link)} className="group flex w-full items-center gap-3 rounded-md border border-slate-200 px-3 py-2.5 text-left hover:bg-slate-50">
                      <span className="flex h-8 w-8 items-center justify-center rounded-md bg-slate-100 text-slate-600"><q.icon size={15} /></span>
                      <span className="flex-1 text-[13px] font-medium text-slate-700">{q.label}</span>
                      <span className={cn("min-w-[28px] rounded-full px-2 py-0.5 text-center text-[12px] font-semibold tabular-nums", n > 0 ? "bg-amber-100 text-amber-800" : "bg-slate-100 text-slate-500")}>{n}</span>
                      <ArrowRight size={14} className="text-slate-300 group-hover:text-slate-500" />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </Panel>
      )}

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Panel className="xl:col-span-2" title="My requests" subtitle="Your latest leave, expense, petty cash and equipment requests">
          {requests.isLoading ? (
            <ListSkeleton rows={5} />
          ) : !requests.data?.rows.length ? (
            <EmptyState icon={Inbox} text="You have not made any requests yet." />
          ) : (
            <div className="-mx-4 overflow-x-auto">
              <table className="dnr-grid w-full min-w-[480px] text-[13px]">
                <thead>
                  <tr>
                    <th>Type</th>
                    <th>Details</th>
                    <th>Status</th>
                    <th className="text-right">Submitted</th>
                  </tr>
                </thead>
                <tbody>
                  {requests.data.rows.map((r) => (
                    <tr key={`${r.kind}-${r.id}`} onClick={r.link ? () => navigate(r.link) : undefined} className={cn(r.link && "cursor-pointer")}>
                      <td>
                        <span className="flex items-center gap-2 whitespace-nowrap text-slate-600"><r.icon size={14} className="text-slate-400" />{r.kind}</span>
                      </td>
                      <td className="max-w-[300px] truncate text-slate-700">{r.what}</td>
                      <td><StatusBadge status={r.status} /></td>
                      <td className="whitespace-nowrap text-right text-slate-500">{toDate(r.created) ? formatDistanceToNow(toDate(r.created) as Date, { addSuffix: true }) : ""}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>

        <Panel title="Latest payslip" action={portal ? { label: "All payslips", onClick: () => navigate(`${PORTAL}?tab=Payslips`) } : undefined}>
          {payslip.isLoading ? (
            <ListSkeleton rows={3} />
          ) : !payslip.data ? (
            <EmptyState icon={FileText} text="Your payslip appears here once the monthly payroll is approved." />
          ) : (
            <div className="space-y-3">
              <div className="rounded-md border border-slate-200 p-3">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                  {payslip.data.expand?.payroll?.period_label || (payslip.data.expand?.payroll?.year ? format(new Date(payslip.data.expand.payroll.year, (payslip.data.expand.payroll.month || 1) - 1), "MMMM yyyy") : "Payslip")}
                </p>
                <p className="mt-1 text-lg font-semibold tabular-nums text-slate-900">{money(payslip.data.net)}</p>
                <p className="text-[12px] text-slate-500">Net pay · {payslip.data.expand?.payroll?.status === "paid" ? "paid" : "approved, to be paid"}</p>
              </div>
              <dl className="space-y-1.5 text-[13px]">
                {[
                  ["Gross salary", payslip.data.gross],
                  ["Tax and contributions", payslip.data.total_deductions],
                ].map(([k, v]) => (
                  <div key={k as string} className="flex justify-between gap-3">
                    <dt className="text-slate-500">{k}</dt>
                    <dd className="font-medium tabular-nums text-slate-800">{money(v as number)}</dd>
                  </div>
                ))}
              </dl>
            </div>
          )}
        </Panel>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ attendance strip
type Day = { date: Date; state: DayState | null; detail: string };

function buildDays(data: Awaited<ReturnType<typeof fetchAttendance>> | undefined, workingDays: string[]): Day[] {
  if (!data) return [];
  const today = startOfToday();
  const byDay = new Map(data.attendance.map((a) => [dayKey(a.date || a.clockin_time), a]));
  const holiday = (d: Date) =>
    data.holidays.find((h) => h.date && (h.recurring ? fmt(h.date, "MM-dd") === format(d, "MM-dd") : dayKey(h.date) === dayKey(d)));
  const onLeave = (d: Date) => data.leaves.find((l) => l.start && l.end && dayKey(l.start) <= dayKey(d) && dayKey(d) <= dayKey(l.end));
  const out: Day[] = [];
  for (let d = new Date(data.from); d <= today; d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1)) {
    if (!workingDays.includes(DAY_NAMES[d.getDay()])) continue;
    const rec = byDay.get(dayKey(d));
    const h = holiday(d);
    const l = onLeave(d);
    const isToday = dayKey(d) === dayKey(today);
    let state: DayState | null;
    let detail = "";
    if (rec) {
      state = rec.behaviour === "late" ? "late" : "onTime";
      detail = `in ${fmt(rec.clockin_time, "HH:mm") || "?"}${rec.clockout_time ? `, out ${fmt(rec.clockout_time, "HH:mm")}` : ""}`;
    } else if (h) {
      state = "holiday";
      detail = h.name;
    } else if (l) {
      state = "leave";
      detail = l.type || "Leave";
    } else {
      state = isToday ? "today" : "absent";
    }
    out.push({ date: new Date(d), state, detail });
  }
  return out;
}

function AttendanceStrip({ days }: { days: Day[] }) {
  if (!days.length) return <EmptyState icon={CalendarClock} text="No working days in this period." />;
  const counts = Object.fromEntries((Object.keys(DAY_STATES) as DayState[]).map((k) => [k, days.filter((d) => d.state === k).length]));
  return (
    <div className="space-y-4">
      <ol className="flex flex-wrap gap-1.5" aria-label="Attendance by working day">
        {days.map((d) => {
          const s = DAY_STATES[d.state || "absent"];
          const label = `${format(d.date, "EEE d MMM")}: ${s.label}${d.detail ? ` (${d.detail})` : ""}`;
          return (
            <li key={d.date.toISOString()} title={label} aria-label={label} className="flex w-9 flex-col items-center gap-1">
              <span className={cn("flex h-9 w-9 items-center justify-center rounded-md text-[12px] font-semibold tabular-nums", s.cell)}>{format(d.date, "d")}</span>
              <span className="text-[10.5px] text-slate-400">{format(d.date, "EEEEE")}</span>
            </li>
          );
        })}
      </ol>
      <ul className="flex flex-wrap gap-x-4 gap-y-1.5 text-[12px] text-slate-600">
        {(Object.keys(DAY_STATES) as DayState[])
          .filter((k) => counts[k] > 0 || k === "onTime" || k === "late")
          .map((k) => (
            <li key={k} className="flex items-center gap-1.5">
              <span className={cn("h-3 w-3 rounded-sm", DAY_STATES[k].swatch)} aria-hidden />
              {DAY_STATES[k].label} <span className="font-semibold tabular-nums text-slate-800">{counts[k]}</span>
            </li>
          ))}
      </ul>
      {counts.absent > 0 && (
        <p className="flex items-start gap-2 rounded-md bg-slate-50 px-3 py-2 text-[12px] text-slate-500">
          <CheckCircle2 size={14} className="mt-0.5 shrink-0 text-slate-400" />
          Days without a clock-in may be missions or approved absences recorded elsewhere; HR can correct your attendance log.
        </p>
      )}
    </div>
  );
}

const round1 = (n: number) => Math.round((Number(n) || 0) * 10) / 10;
