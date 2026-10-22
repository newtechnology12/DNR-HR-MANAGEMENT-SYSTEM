/**
 * Team overview — the dashboard for roles that oversee the workforce: today's attendance, leave and
 * pending decisions in one band, the attendance trend, what waits for the signed-in person, and the
 * latest requests. Staff without such a role go to their own workspace (see Dashboard below).
 */
import * as React from "react";
import { useQuery } from "react-query";
import { Navigate, useNavigate } from "react-router-dom";
import { format, startOfMonth, subDays } from "date-fns";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ArrowRight, CalendarClock, CheckCircle2, Inbox, Palmtree, Receipt, Users, Wallet } from "lucide-react";
import pocketbase from "@/lib/pocketbase";
import { cn } from "@/utils";
import { useAuth } from "@/context/auth.context";
import { useRoles } from "@/context/roles.context";
import useSettings from "@/hooks/useSettings";
import { Skeleton } from "@/components/ui/skeleton";
import { CHART, ChartTooltip, HorizontalBars, ListSkeleton, StatusBadge } from "@/components/enterprise/ui";
import { Card, CardHeader, Column, DataTable, EmptyState, KpiBand, Page, PageHeader, Person, fmtDate, fmtMoney, fmtMoneyShort, fmtNumber, fmtWhen } from "@/components/ims";
import { EXPENSE_STATUS } from "@/lib/expenses";
import { queueCounts, queuesFor } from "./queues";

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
/** "RWF 1.3M" in the band, "RWF 1,250,000" in sentences (kit formats). */
const compactMoney = (n: number) => fmtMoneyShort(n || 0);
const fullMoney = (n: number) => fmtMoney(n || 0);
const count = (collection: string, filter = "") =>
  pocketbase.collection(collection).getList(1, 1, { filter, fields: "id" }).then((r) => r.totalItems);

// ------------------------------------------------------------------ data
// Attendance, leave and expenses come back already limited by the API rules (department for a
// head of department, everyone for HR and management); the staff directory is not, so its
// counts take the department filter explicitly.
async function fetchToday(dept: string) {
  const now = new Date();
  const todayFrom = pbDate(startOfDay(now));
  const todayTo = pbDate(endOfDay(now));
  const inDept = dept ? ` && department = "${dept}"` : "";
  const [active, inactive, newHires, attendance, onLeave] = await Promise.all([
    count("users", `status="Active"${inDept}`),
    count("users", `status!="Active"${inDept}`),
    count("users", `status="Active" && joined_at >= "${pbDate(startOfMonth(now))}"${inDept}`),
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
/**
 * Staff get their personal dashboard. Organisation figures are for people whose role oversees
 * the workforce: everyone for HR and management ("view_employees"), the own department for a
 * head of department (attendance or leave oversight without the staff file).
 */
export default function Dashboard() {
  const { canPerform } = useRoles();
  if (canPerform("view_employees")) return <TeamDashboard scope="organisation" />;
  if (canPerform("view_attendance_logs") || canPerform("view_leaves")) return <TeamDashboard scope="department" />;
  return <Navigate to="/dashboard/my" replace />;
}

type Recent = Awaited<ReturnType<typeof fetchRecent>>[number];

function TeamDashboard({ scope }: { scope: "organisation" | "department" }) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { canPerform } = useRoles();
  const { settings } = useSettings();
  const [days, setDays] = React.useState(30);
  // The auth context keeps the department's name; the filter needs its id.
  const dept = scope === "department" ? String(pocketbase.authStore.model?.department || "") : "";
  const deptName: string | undefined = user?.department;

  const workingDays: string[] = settings?.working_days?.length ? settings.working_days : DEFAULT_WORKING_DAYS;
  const isWorkingDay = workingDays.includes(DAY_NAMES[new Date().getDay()]);

  const queues = React.useMemo(() => queuesFor(canPerform), [canPerform]);
  const today = useQuery(["dashboard", "today", dept], () => fetchToday(dept), { refetchInterval: 60_000 });
  const pending = useQuery(["dashboard", "pending", user?.id, queues.map((q) => q.key).join()], () => queueCounts(queues, user?.id), {
    enabled: Boolean(user?.id),
    refetchInterval: 60_000,
  });
  const trends = useQuery(["dashboard", "trends", days, workingDays.join()], () => fetchTrends(days, workingDays), {
    keepPreviousData: true,
  });
  const headcount = useQuery(["dashboard", "headcount"], fetchHeadcount, { enabled: scope === "organisation" });
  const finance = useQuery(["dashboard", "finance"], fetchFinance, { enabled: Boolean(canPerform("view_petty_cash_accounts") || canPerform("view_payrolls")) });
  const recent = useQuery(["dashboard", "recent"], fetchRecent);

  const t = today.data;
  const attendanceRate = t && t.active > 0 ? Math.round((t.present / t.active) * 100) : 0;
  const absent = t && isWorkingDay ? Math.max(t.active - t.present - t.onLeave.length, 0) : 0;
  const totalPending = queues.reduce((acc, q) => acc + (pending.data?.[q.key] || 0), 0);
  const who = scope === "department" ? `${deptName || "your department"}` : "all staff";

  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";

  const recentColumns: Column<Recent>[] = [
    {
      key: "who",
      header: "Employee",
      className: "max-w-[220px]",
      cell: (r) => (
        <span className="flex min-w-0 items-center gap-2.5">
          <r.icon size={16} className="shrink-0 text-ims-muted" aria-hidden />
          <Person name={r.who} detail={r.kind} />
        </span>
      ),
    },
    { key: "what", header: "Details", clamp: true, cell: (r) => r.what },
    { key: "status", header: "Status", cell: (r) => <StatusBadge status={r.status} map={r.kind === "Expense" ? EXPENSE_STATUS : undefined} /> },
    { key: "created", header: "Submitted", nowrap: true, cell: (r) => fmtWhen(r.created) },
  ];

  return (
    <Page>
      <PageHeader
        title={`${greeting}, ${user?.names?.split(" ")[0] || "there"}`}
        subtitle={`Team overview · ${scope === "department" ? `Department: ${deptName || "your department"}` : settings?.company_name || "the whole organisation"}`}
        meta={format(new Date(), "EEEE, d MMM yyyy")}
        actions={<PeriodSwitch value={days} onChange={setDays} />}
      />

      <KpiBand
        items={[
          { label: scope === "department" ? "Team" : "Staff", value: today.isLoading ? undefined : fmtNumber(t?.active), sub: t ? `${fmtNumber(t.newHires)} new this month` : undefined, to: "/dashboard/hr/employees" },
          {
            label: "Present today",
            value: today.isLoading ? undefined : isWorkingDay ? fmtNumber(t?.present) : "—",
            tone: "success",
            sub: isWorkingDay ? `${attendanceRate}% attendance rate` : "Not a working day",
            to: "/dashboard/attendance/attendance-logs",
          },
          {
            label: "Late today",
            value: today.isLoading ? undefined : isWorkingDay ? fmtNumber(t?.late) : "—",
            tone: isWorkingDay && t?.late ? "warning" : "default",
            sub: isWorkingDay ? `${fmtNumber(absent)} absent` : "Not a working day",
            to: "/dashboard/attendance/attendance-logs",
          },
          { label: "On leave today", value: today.isLoading ? undefined : fmtNumber(t?.onLeave.length), sub: "Approved leave", to: "/dashboard/hr/leaves" },
          { label: "Waiting for you", value: pending.isLoading ? undefined : fmtNumber(totalPending), tone: totalPending > 0 ? "warning" : "default", sub: "Decisions to take" },
          {
            label: `Expenses, ${days} days`,
            value: trends.isLoading ? undefined : compactMoney(trends.data?.spend || 0),
            sub:
              trends.data?.spendChange == null
                ? "Approved"
                : `${trends.data.spendChange > 0 ? "+" : ""}${trends.data.spendChange}% on the ${days} days before`,
            to: "/dashboard/hr/prepayments",
          },
        ]}
      />

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        {/* main column (2/3) */}
        <div className="flex min-w-0 flex-col gap-4 xl:col-span-2">
          <Card>
            <CardHeader
              title="Attendance trend"
              subtitle={`Clock-ins per working day, last ${days} days · ${who}`}
              link={{ label: "Attendance logs", to: "/dashboard/attendance/attendance-logs" }}
            />
            {trends.isLoading ? (
              <Skeleton className="h-[260px] w-full" />
            ) : !trends.data?.attendanceTrend.some((d) => d.onTime + d.late > 0) ? (
              <EmptyState compact icon={CalendarClock} text="No attendance recorded in this period." />
            ) : (
              <>
                <div className="mb-2 flex flex-wrap justify-end gap-4 text-t-small text-ims-body" aria-hidden>
                  <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full" style={{ background: CHART.series1 }} />On time</span>
                  <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full" style={{ background: CHART.series2 }} />Late</span>
                </div>
                <div className="h-[260px]" role="img" aria-label="Stacked bar chart of on-time and late clock-ins per working day">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={trends.data.attendanceTrend} margin={{ top: 4, right: 8, left: -18, bottom: 0 }} barCategoryGap={days > 30 ? 1 : "20%"}>
                      <CartesianGrid vertical={false} stroke={CHART.grid} />
                      <XAxis dataKey="day" tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: CHART.axis }} minTickGap={16} />
                      <YAxis allowDecimals={false} tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: CHART.axis }} />
                      <Tooltip content={<ChartTooltip />} cursor={{ fill: CHART.grid }} />
                      <Bar isAnimationActive={false} dataKey="onTime" name="On time" stackId="a" fill={CHART.series1} />
                      <Bar isAnimationActive={false} dataKey="late" name="Late" stackId="a" fill={CHART.series2} radius={[3, 3, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </>
            )}
          </Card>

          <Card padded={false} className="overflow-hidden">
            <div className="px-5 pt-5">
              <CardHeader title="Recent requests" subtitle={`Latest leave, expense and petty cash submissions you can see · ${who}`} />
            </div>
            <DataTable
              columns={recentColumns}
              rows={recent.data || []}
              rowKey={(r) => `${r.kind}-${r.id}`}
              loading={recent.isLoading}
              error={recent.isError ? recent.error : undefined}
              onRetry={() => recent.refetch()}
              onRowClick={(r) => navigate(r.link)}
              minWidth={560}
              caption="Recent requests"
              empty={<EmptyState compact icon={Inbox} text="No requests yet." />}
            />
          </Card>

          {scope === "organisation" && (
            <Card>
              <CardHeader title="Headcount by department" subtitle="Active employees" link={{ label: "Employees", to: "/dashboard/hr/employees" }} />
              {headcount.isLoading ? (
                <Skeleton className="h-[240px] w-full" />
              ) : !headcount.data?.length ? (
                <EmptyState compact icon={Users} text="No employees assigned to departments yet." />
              ) : (
                <HorizontalBars data={headcount.data} label="Employees" labelWidth={170} />
              )}
            </Card>
          )}
        </div>

        {/* side column (1/3) */}
        <div className="flex min-w-0 flex-col gap-4">
          <Card>
            <CardHeader title="Needs your action" subtitle="Requests waiting for your decision" />
            {pending.isLoading ? (
              <ListSkeleton rows={5} />
            ) : queues.length === 0 ? (
              <EmptyState compact icon={CheckCircle2} text="You have no approval queues." />
            ) : (
              <ul className="-mx-1 divide-y divide-ims-divider">
                {queues.map((q) => {
                  const n = pending.data?.[q.key] || 0;
                  return (
                    <li key={q.key}>
                      <button
                        type="button"
                        onClick={() => navigate(q.link)}
                        className="group flex min-h-[44px] w-full items-center gap-3 rounded-control px-1 py-2 text-left hover:bg-ims-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ims-focus"
                      >
                        <q.icon size={16} className="shrink-0 text-ims-muted" aria-hidden />
                        <span className="min-w-0 flex-1 text-t-body font-semibold text-ims-body group-hover:text-ims-primary">{q.label}</span>
                        <span className={cn("min-w-[28px] rounded-pill px-2 py-0.5 text-center text-t-hint font-bold tabular-nums", n > 0 ? "bg-ims-warning-bg text-ims-warning" : "bg-ims-neutral-bg text-ims-muted")}>
                          {n}
                        </span>
                        <ArrowRight size={14} className="shrink-0 text-ims-faint group-hover:text-ims-muted" aria-hidden />
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>

          <Card>
            <CardHeader title="On leave today" subtitle={`Approved leave · ${who}`} link={{ label: "Leave", to: "/dashboard/hr/leaves" }} />
            {today.isLoading ? (
              <ListSkeleton rows={4} />
            ) : !t?.onLeave.length ? (
              <EmptyState compact icon={Palmtree} text="Everyone is in today." />
            ) : (
              <ul className="max-h-[260px] divide-y divide-ims-divider overflow-y-auto pr-1">
                {t.onLeave.map((l) => (
                  <li key={l.id} className="flex items-center gap-3 py-2.5">
                    <div className="min-w-0 flex-1">
                      <Person name={l.expand?.employee?.name || "Unknown"} detail={`${l.type} · ${l.expand?.employee?.expand?.department?.name || "—"}`} />
                    </div>
                    <span className="shrink-0 text-t-small text-ims-muted">Until {fmtDate(l.end)}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card>
            <CardHeader title="Leave by type" subtitle={`Requests starting in the last ${days} days · ${who}`} />
            {trends.isLoading ? (
              <Skeleton className="h-[200px] w-full" />
            ) : !trends.data?.leaveByType.length ? (
              <EmptyState compact icon={Palmtree} text="No leave requests in this period." />
            ) : (
              <HorizontalBars data={trends.data.leaveByType.map((l) => ({ name: l.type, value: l.value }))} label="Requests" labelWidth={120} />
            )}
          </Card>

          <Card>
            <CardHeader
              title="Finance snapshot"
              subtitle="Cash accounts and the latest payroll"
              link={canPerform("view_petty_cash_accounts") ? { label: "Accounts", to: "/dashboard/finance/petty-cash-accounts" } : undefined}
            />
            {!finance.isFetched && finance.isLoading ? (
              <ListSkeleton rows={5} />
            ) : !finance.data ? (
              <EmptyState compact icon={Wallet} text="Finance figures are shown to roles that see cash accounts or payroll." />
            ) : (
              <div className="space-y-4">
                {finance.data.lastPayroll && (
                  <button
                    type="button"
                    onClick={() => navigate(`/dashboard/hr/payroll/${finance.data.lastPayroll.id}`)}
                    className="w-full rounded-control border border-ims-border p-3.5 text-left hover:bg-ims-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ims-focus"
                  >
                    <p className="text-t-small font-semibold text-ims-muted">
                      Payroll · {format(new Date(finance.data.lastPayroll.year, finance.data.lastPayroll.month - 1), "MMMM yyyy")}
                    </p>
                    <p className="mt-1 text-t-section tabular-nums text-ims-text">{fullMoney(finance.data.lastPayroll.total_net)}</p>
                    <p className="text-t-small text-ims-muted">Net pay, of {compactMoney(finance.data.lastPayroll.total_gross)} gross</p>
                  </button>
                )}
                <ul className="divide-y divide-ims-divider">
                  {finance.data.accounts.map((a) => (
                    <li key={a.id} className="flex items-center justify-between gap-3 py-2">
                      <span className="flex min-w-0 items-center gap-2 text-t-body text-ims-body">
                        <Wallet size={15} className="shrink-0 text-ims-muted" aria-hidden />
                        <span className="truncate">{a.name}</span>
                      </span>
                      <span className={cn("whitespace-nowrap text-t-body font-semibold tabular-nums", a.currentBalance < 0 ? "text-ims-danger" : "text-ims-text")}>
                        {fullMoney(a.currentBalance)}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </Card>
        </div>
      </div>
    </Page>
  );
}

// ------------------------------------------------------------------ building blocks
function PeriodSwitch({ value, onChange }: { value: number; onChange: (d: number) => void }) {
  return (
    <div role="radiogroup" aria-label="Reporting period" className="inline-flex rounded-control border border-ims-field bg-ims-card p-0.5">
      {PERIODS.map((p) => (
        <button
          key={p.days}
          type="button"
          role="radio"
          aria-checked={value === p.days}
          onClick={() => onChange(p.days)}
          className={cn(
            "h-[34px] rounded-md px-3.5 text-t-small font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ims-focus",
            value === p.days ? "bg-ims-primary text-white" : "text-ims-body hover:bg-ims-subtle"
          )}
        >
          {p.label}
        </button>
      ))}
    </div>
  );
}
