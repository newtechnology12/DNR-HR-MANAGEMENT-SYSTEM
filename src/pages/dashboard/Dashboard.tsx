import * as React from "react";
import { useQuery } from "react-query";
import { useNavigate } from "react-router-dom";
import { format, formatDistanceToNow, startOfMonth, subDays } from "date-fns";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  ArrowRight,
  Banknote,
  CalendarClock,
  CarFront,
  CheckCircle2,
  Clock,
  Inbox,
  Laptop,
  Palmtree,
  Receipt,
  UserCheck,
  Users,
  Wallet,
} from "lucide-react";
import pocketbase from "@/lib/pocketbase";
import { cn } from "@/utils";
import { useAuth } from "@/context/auth.context";
import { useRoles } from "@/context/roles.context";
import useSettings from "@/hooks/useSettings";
import StatCard from "@/components/StatCard";
import { Skeleton } from "@/components/ui/skeleton";
import BreadCrumb from "@/components/breadcrumb";
import { ChartTooltip, EmptyState, HorizontalBars, Initials, ListSkeleton, Panel, StatusBadge } from "@/components/enterprise/ui";

// Chart colours: reference data-viz palette, slots 1–2 (validated for colour-blind separation).
const SERIES_ON_TIME = "#2a78d6";
const SERIES_LATE = "#eb6834";
const GRID = "#e5e7eb";
const AXIS_TEXT = "#64748b";

const PERIODS = [
  { label: "7 days", days: 7 },
  { label: "30 days", days: 30 },
  { label: "90 days", days: 90 },
];

const DAY_NAMES = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
const DEFAULT_WORKING_DAYS = ["monday", "tuesday", "wednesday", "thursday", "friday"];

const pbDate = (d: Date) => d.toISOString().replace("T", " ");
const startOfDay = (d: Date) => {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
};
const endOfDay = (d: Date) => {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
};
const compactMoney = (n: number) =>
  `RWF ${new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 }).format(n || 0)}`;
const fullMoney = (n: number) => `RWF ${(n || 0).toLocaleString()}`;
const count = (collection: string, filter = "") =>
  pocketbase.collection(collection).getList(1, 1, { filter, fields: "id" }).then((r) => r.totalItems);

// ------------------------------------------------------------------ data
async function fetchToday() {
  const now = new Date();
  const todayFrom = pbDate(startOfDay(now));
  const todayTo = pbDate(endOfDay(now));
  const [active, inactive, newHires, attendance, onLeave] = await Promise.all([
    count("users", `status="Active"`),
    count("users", `status!="Active"`),
    count("users", `status="Active" && joined_at >= "${pbDate(startOfMonth(now))}"`),
    pocketbase.collection("attendance").getFullList({
      filter: `date >= "${todayFrom}" && date <= "${todayTo}"`,
      fields: "employee,behaviour",
    }),
    pocketbase.collection("leaves").getFullList({
      filter: `status="approved" && start <= "${todayTo}" && end >= "${todayFrom}"`,
      expand: "employee,employee.department",
      sort: "end",
    }),
  ]);
  const present = new Set(attendance.map((a) => a.employee)).size;
  const late = attendance.filter((a) => a.behaviour === "late").length;
  return { active, inactive, newHires, present, late, onLeave };
}

const PENDING_QUEUES = [
  { key: "leaves", label: "Leave requests", icon: Palmtree, collection: "leaves", link: "/dashboard/hr/leaves", permission: "view_leaves" },
  { key: "expenses", label: "Expense requests", icon: Receipt, collection: "prepayments", link: "/dashboard/hr/prepayments", permission: "view_employee_prepayments" },
  { key: "petty", label: "Petty cash requests", icon: Wallet, collection: "petty_cash_requests", link: "/dashboard/finance/petty-cash-requests", permission: "view_petty_cash_requests" },
  { key: "assets", label: "Asset requests", icon: Laptop, collection: "assets_requests", link: "/dashboard/assets/requests", permission: "view_assets_requests" },
  { key: "cars", label: "Vehicle requests", icon: CarFront, collection: "CarRequests", link: "/dashboard/finance/carmanagement", permission: "view_petty_cash_requests" },
];

async function fetchPending() {
  const counts = await Promise.all(
    PENDING_QUEUES.map((q) => count(q.collection, `status="pending"`).catch(() => 0))
  );
  return Object.fromEntries(PENDING_QUEUES.map((q, i) => [q.key, counts[i]]));
}

async function fetchTrends(days: number, workingDays: string[]) {
  const from = startOfDay(subDays(new Date(), days - 1));
  const [attendance, expenses, leaves, prevExpenses] = await Promise.all([
    pocketbase.collection("attendance").getFullList({
      filter: `date >= "${pbDate(from)}"`,
      fields: "date,behaviour",
    }),
    pocketbase.collection("prepayments").getFullList({
      filter: `status="approved" && date >= "${pbDate(from)}"`,
      fields: "amount",
    }),
    pocketbase.collection("leaves").getFullList({
      filter: `start >= "${pbDate(from)}"`,
      fields: "type",
    }),
    pocketbase.collection("prepayments").getFullList({
      filter: `status="approved" && date >= "${pbDate(subDays(from, days))}" && date < "${pbDate(from)}"`,
      fields: "amount",
    }),
  ]);

  const byDay = new Map<string, { onTime: number; late: number }>();
  for (let i = 0; i < days; i++) {
    const d = subDays(new Date(), days - 1 - i);
    if (!workingDays.includes(DAY_NAMES[d.getDay()])) continue;
    byDay.set(format(d, "yyyy-MM-dd"), { onTime: 0, late: 0 });
  }
  for (const a of attendance) {
    const bucket = byDay.get(format(new Date(a.date), "yyyy-MM-dd"));
    if (!bucket) continue;
    if (a.behaviour === "late") bucket.late++;
    else bucket.onTime++;
  }
  const attendanceTrend = [...byDay.entries()].map(([key, v]) => ({
    day: format(new Date(key), days > 30 ? "MMM d" : "EEE d"),
    ...v,
  }));

  const leaveTypes = new Map<string, number>();
  for (const l of leaves) leaveTypes.set(l.type || "Other", (leaveTypes.get(l.type || "Other") || 0) + 1);

  const spend = expenses.reduce((acc, e) => acc + (Number(e.amount) || 0), 0);
  const prevSpend = prevExpenses.reduce((acc, e) => acc + (Number(e.amount) || 0), 0);

  return {
    attendanceTrend,
    leaveByType: [...leaveTypes.entries()]
      .map(([type, value]) => ({ type: type.replace(/ Leave$/, ""), value }))
      .sort((a, b) => b.value - a.value),
    spend,
    spendChange: prevSpend > 0 ? Math.round(((spend - prevSpend) / prevSpend) * 100) : null,
    leaveCount: leaves.length,
  };
}

async function fetchHeadcount() {
  const [departments, users] = await Promise.all([
    pocketbase.collection("departments").getFullList({ fields: "id,name" }),
    pocketbase.collection("users").getFullList({ filter: `status="Active"`, fields: "department" }),
  ]);
  return departments
    .map((d) => ({ name: d.name, value: users.filter((u) => u.department === d.id).length }))
    .filter((d) => d.value > 0)
    .sort((a, b) => b.value - a.value);
}

async function fetchFinance() {
  const [accounts, payrolls] = await Promise.all([
    pocketbase.collection("accounts").getFullList({ fields: "id,name,currentBalance", sort: "-currentBalance" }),
    pocketbase.collection("payrolls").getList(1, 1, { sort: "-year,-month", fields: "id,month,year,total_gross,total_net" }),
  ]);
  return { accounts, lastPayroll: payrolls.items[0] };
}

async function fetchRecent() {
  const opts = { sort: "-created" };
  const [leaves, expenses, petty] = await Promise.all([
    pocketbase.collection("leaves").getList(1, 6, { ...opts, expand: "employee" }),
    pocketbase.collection("prepayments").getList(1, 6, { ...opts, expand: "employee,expenseCategory" }),
    pocketbase.collection("petty_cash_requests").getList(1, 6, { ...opts, expand: "requested_by" }),
  ]);
  return [
    ...leaves.items.map((r) => ({
      id: r.id, kind: "Leave", icon: Palmtree, created: r.created, status: r.status,
      who: r.expand?.employee?.name, what: `${r.type} · ${r.days || r.Leaveduration || "?"} day(s)`, link: "/dashboard/hr/leaves",
    })),
    ...expenses.items.map((r) => ({
      id: r.id, kind: "Expense", icon: Receipt, created: r.created, status: r.status,
      who: r.expand?.employee?.name, what: `${r.expand?.expenseCategory?.name || "Expense"} · ${fullMoney(r.amount)}`, link: "/dashboard/hr/prepayments",
    })),
    ...petty.items.map((r) => ({
      id: r.id, kind: "Petty cash", icon: Wallet, created: r.created, status: r.status,
      who: r.expand?.requested_by?.name, what: `${r.notes || "Cash request"} · ${fullMoney(r.amount)}`, link: "/dashboard/finance/petty-cash-requests",
    })),
  ]
    .sort((a, b) => b.created.localeCompare(a.created))
    .slice(0, 7);
}

// ------------------------------------------------------------------ page
export default function Dashboard() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { canPerform } = useRoles();
  const { settings } = useSettings();
  const [days, setDays] = React.useState(30);

  const workingDays: string[] = settings?.working_days?.length ? settings.working_days : DEFAULT_WORKING_DAYS;
  const isWorkingDay = workingDays.includes(DAY_NAMES[new Date().getDay()]);

  const today = useQuery(["dashboard", "today"], fetchToday, { refetchInterval: 60_000 });
  const pending = useQuery(["dashboard", "pending"], fetchPending, { refetchInterval: 60_000 });
  const trends = useQuery(["dashboard", "trends", days, workingDays.join()], () => fetchTrends(days, workingDays), {
    keepPreviousData: true,
  });
  const headcount = useQuery(["dashboard", "headcount"], fetchHeadcount);
  const finance = useQuery(["dashboard", "finance"], fetchFinance, { enabled: Boolean(canPerform("view_petty_cash_accounts") || canPerform("view_payrolls")) });
  const recent = useQuery(["dashboard", "recent"], fetchRecent);

  const t = today.data;
  const attendanceRate = t && t.active > 0 ? Math.round((t.present / t.active) * 100) : 0;
  const absent = t && isWorkingDay ? Math.max(t.active - t.present - t.onLeave.length, 0) : 0;
  const queues = PENDING_QUEUES.filter((q) => canPerform(q.permission));
  const totalPending = queues.reduce((acc, q) => acc + (pending.data?.[q.key] || 0), 0);

  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";

  return (
    <div className="flex-1 space-y-5 px-4 py-4 sm:px-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-1">
          <BreadCrumb items={[{ title: "Overview", link: "/dashboard" }]} />
          <h2 className="text-xl font-semibold tracking-tight text-slate-900">
            {greeting}, {user?.names?.split(" ")[0] || "there"}
          </h2>
          <p className="text-[13px] text-slate-500">
            {format(new Date(), "EEEE, d MMMM yyyy")} · {settings?.company_name || "Organisation overview"}
          </p>
        </div>
        <PeriodSwitch value={days} onChange={setDays} />
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <StatCard
          title="Staff"
          icon={Users}
          loading={today.isLoading}
          value={t?.active}
          description={t ? `${t.newHires} new this month` : undefined}
          onClick={() => navigate("/dashboard/hr/employees")}
        />
        <StatCard
          title="Present"
          icon={UserCheck}
          tone="success"
          loading={today.isLoading}
          value={isWorkingDay ? t?.present : "—"}
          description={isWorkingDay ? `${attendanceRate}% attendance rate` : "Not a working day"}
          onClick={() => navigate("/dashboard/attendance/attendance-logs")}
        />
        <StatCard
          title="Late"
          icon={Clock}
          tone="warning"
          loading={today.isLoading}
          value={isWorkingDay ? t?.late : "—"}
          description={isWorkingDay ? `${absent} absent today` : "Not a working day"}
          onClick={() => navigate("/dashboard/attendance/attendance-logs")}
        />
        <StatCard
          title="On leave"
          icon={Palmtree}
          tone="info"
          loading={today.isLoading}
          value={t?.onLeave.length}
          description="Away today"
          onClick={() => navigate("/dashboard/hr/leaves")}
        />
        <StatCard
          title="Pending"
          icon={Inbox}
          tone={totalPending > 0 ? "danger" : "neutral"}
          loading={pending.isLoading}
          value={totalPending}
          description="Awaiting approval"
        />
        <StatCard
          title="Expenses"
          icon={Banknote}
          tone="neutral"
          loading={trends.isLoading}
          value={compactMoney(trends.data?.spend || 0)}
          description={
            trends.data?.spendChange == null
              ? `Approved, last ${days} days`
              : `${trends.data.spendChange > 0 ? "+" : ""}${trends.data.spendChange}% vs prior ${days}d`
          }
          onClick={() => navigate("/dashboard/hr/prepayments")}
        />
      </div>

      {/* Attendance trend + action centre */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Panel
          className="xl:col-span-2"
          title="Attendance trend"
          subtitle={`Clock-ins per working day, last ${days} days`}
          action={{ label: "Attendance logs", onClick: () => navigate("/dashboard/attendance/attendance-logs") }}
        >
          {trends.isLoading ? (
            <Skeleton className="h-[260px] w-full" />
          ) : !trends.data?.attendanceTrend.some((d) => d.onTime + d.late > 0) ? (
            <EmptyState icon={CalendarClock} text="No attendance recorded in this period" />
          ) : (
            <div className="h-[260px]" role="img" aria-label="Stacked bar chart of on-time and late clock-ins per working day">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={trends.data.attendanceTrend} margin={{ top: 8, right: 8, left: -18, bottom: 0 }} barCategoryGap={days > 30 ? 1 : "20%"}>
                  <CartesianGrid vertical={false} stroke={GRID} />
                  <XAxis dataKey="day" tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: AXIS_TEXT }} minTickGap={16} />
                  <YAxis allowDecimals={false} tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: AXIS_TEXT }} />
                  <Tooltip content={<ChartTooltip />} cursor={{ fill: "#f1f5f9" }} />
                  <Legend verticalAlign="top" align="right" height={28} iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12, color: AXIS_TEXT }} />
                  <Bar isAnimationActive={false} dataKey="onTime" name="On time" stackId="a" fill={SERIES_ON_TIME} stroke="#fff" strokeWidth={1} />
                  <Bar isAnimationActive={false} dataKey="late" name="Late" stackId="a" fill={SERIES_LATE} stroke="#fff" strokeWidth={1} radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </Panel>

        <Panel title="Needs your action" subtitle="Requests waiting for a decision">
          {pending.isLoading ? (
            <ListSkeleton rows={5} />
          ) : queues.length === 0 ? (
            <EmptyState icon={CheckCircle2} text="You have no approval queues" />
          ) : (
            <ul className="-mx-1 divide-y divide-slate-100">
              {queues.map((q) => {
                const n = pending.data?.[q.key] || 0;
                return (
                  <li key={q.key}>
                    <button
                      type="button"
                      onClick={() => navigate(q.link)}
                      className="group flex w-full items-center gap-3 rounded-md px-1 py-2.5 text-left hover:bg-slate-50"
                    >
                      <span className="flex h-8 w-8 items-center justify-center rounded-md bg-slate-100 text-slate-600">
                        <q.icon size={15} />
                      </span>
                      <span className="flex-1 text-[13px] font-medium text-slate-700">{q.label}</span>
                      <span
                        className={cn(
                          "min-w-[28px] rounded-full px-2 py-0.5 text-center text-[12px] font-semibold tabular-nums",
                          n > 0 ? "bg-amber-100 text-amber-800" : "bg-slate-100 text-slate-500"
                        )}
                      >
                        {n}
                      </span>
                      <ArrowRight size={14} className="text-slate-300 group-hover:text-slate-500" />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </Panel>
      </div>

      {/* Workforce distribution */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-3">
        <Panel title="Headcount by department" subtitle="Active employees">
          {headcount.isLoading ? (
            <Skeleton className="h-[240px] w-full" />
          ) : !headcount.data?.length ? (
            <EmptyState icon={Users} text="No employees assigned to departments" />
          ) : (
            <HorizontalBars data={headcount.data} label="Employees" />
          )}
        </Panel>

        <Panel title="Leave by type" subtitle={`Requests starting in the last ${days} days`}>
          {trends.isLoading ? (
            <Skeleton className="h-[240px] w-full" />
          ) : !trends.data?.leaveByType.length ? (
            <EmptyState icon={Palmtree} text="No leave requests in this period" />
          ) : (
            <HorizontalBars data={trends.data.leaveByType.map((l) => ({ name: l.type, value: l.value }))} label="Requests" />
          )}
        </Panel>

        <Panel
          title="On leave today"
          subtitle={t ? `${t.onLeave.length} employee(s) away` : undefined}
          className="lg:col-span-2 xl:col-span-1"
        >
          {today.isLoading ? (
            <ListSkeleton rows={4} />
          ) : !t?.onLeave.length ? (
            <EmptyState icon={Palmtree} text="Everyone is in today" />
          ) : (
            <ul className="max-h-[240px] divide-y divide-slate-100 overflow-y-auto pr-1">
              {t.onLeave.map((l) => (
                <li key={l.id} className="flex items-center gap-3 py-2.5">
                  <Initials name={l.expand?.employee?.name} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-medium text-slate-800">{l.expand?.employee?.name || "Unknown"}</p>
                    <p className="truncate text-[12px] text-slate-500">
                      {l.type} · {l.expand?.employee?.expand?.department?.name || "—"}
                    </p>
                  </div>
                  <span className="shrink-0 text-[12px] text-slate-500">Back {format(new Date(l.end), "d MMM")}</span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      {/* Activity + finance */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Panel className="xl:col-span-2" title="Recent requests" subtitle="Latest leave, expense and petty cash submissions">
          {recent.isLoading ? (
            <ListSkeleton rows={6} />
          ) : !recent.data?.length ? (
            <EmptyState icon={Inbox} text="No requests yet" />
          ) : (
            <div className="-mx-4 overflow-x-auto">
              <table className="dnr-grid w-full min-w-[560px] text-[13px]">
                <thead>
                  <tr className="border-y border-slate-100 bg-slate-50/70 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                    <th className="px-4 py-2 font-semibold">Type</th>
                    <th className="px-4 py-2 font-semibold">Employee</th>
                    <th className="px-4 py-2 font-semibold">Details</th>
                    <th className="px-4 py-2 font-semibold">Status</th>
                    <th className="px-4 py-2 text-right font-semibold">Submitted</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {recent.data.map((r) => (
                    <tr key={`${r.kind}-${r.id}`} onClick={() => navigate(r.link)} className="cursor-pointer hover:bg-slate-50">
                      <td className="px-4 py-2.5">
                        <span className="flex items-center gap-2 whitespace-nowrap text-slate-600">
                          <r.icon size={14} className="text-slate-400" />
                          {r.kind}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-4 py-2.5 font-medium text-slate-800">{r.who || "—"}</td>
                      <td className="max-w-[240px] truncate px-4 py-2.5 text-slate-600">{r.what}</td>
                      <td className="px-4 py-2.5">
                        <StatusBadge status={r.status} />
                      </td>
                      <td className="whitespace-nowrap px-4 py-2.5 text-right text-slate-500">
                        {formatDistanceToNow(new Date(r.created), { addSuffix: true })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>

        <Panel
          title="Finance snapshot"
          subtitle="Cash accounts and latest payroll"
          action={canPerform("view_petty_cash_accounts") ? { label: "Accounts", onClick: () => navigate("/dashboard/finance/petty-cash-accounts") } : undefined}
        >
          {!finance.isFetched && finance.isLoading ? (
            <ListSkeleton rows={5} />
          ) : !finance.data ? (
            <EmptyState icon={Wallet} text="You don't have access to finance data" />
          ) : (
            <div className="space-y-4">
              {finance.data.lastPayroll && (
                <button
                  type="button"
                  onClick={() => navigate(`/dashboard/hr/payroll/${finance.data.lastPayroll.id}`)}
                  className="w-full rounded-md border border-slate-200 p-3 text-left hover:bg-slate-50"
                >
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                    Payroll · {format(new Date(finance.data.lastPayroll.year, finance.data.lastPayroll.month - 1), "MMMM yyyy")}
                  </p>
                  <div className="mt-1 flex items-baseline justify-between gap-2">
                    <span className="text-lg font-semibold tabular-nums text-slate-900">{fullMoney(finance.data.lastPayroll.total_net)}</span>
                    <span className="text-[12px] text-slate-500">net of {compactMoney(finance.data.lastPayroll.total_gross)} gross</span>
                  </div>
                </button>
              )}
              <ul className="divide-y divide-slate-100">
                {finance.data.accounts.map((a) => (
                  <li key={a.id} className="flex items-center justify-between gap-3 py-2">
                    <span className="flex min-w-0 items-center gap-2 text-[13px] text-slate-700">
                      <Wallet size={14} className="shrink-0 text-slate-400" />
                      <span className="truncate">{a.name}</span>
                    </span>
                    <span className={cn("text-[13px] font-semibold tabular-nums", a.currentBalance < 0 ? "text-red-600" : "text-slate-900")}>
                      {fullMoney(a.currentBalance)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Panel>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ building blocks
function PeriodSwitch({ value, onChange }: { value: number; onChange: (d: number) => void }) {
  return (
    <div role="radiogroup" aria-label="Reporting period" className="inline-flex rounded-md border border-slate-200 bg-white p-0.5 shadow-card">
      {PERIODS.map((p) => (
        <button
          key={p.days}
          type="button"
          role="radio"
          aria-checked={value === p.days}
          onClick={() => onChange(p.days)}
          className={cn(
            "rounded px-3 py-1.5 text-[12.5px] font-medium transition-colors",
            value === p.days ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100"
          )}
        >
          {p.label}
        </button>
      ))}
    </div>
  );
}
