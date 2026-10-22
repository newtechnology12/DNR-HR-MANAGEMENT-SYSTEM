/**
 * My workspace — the personal dashboard of every staff member (and of roles without a workforce view):
 * clock in / out, attendance by working day with a one-click correction request, annual leave balance,
 * my requests with their next step, the latest payslip (amounts can be hidden), this week's work plan and,
 * for approvers and supervisors, what is waiting for them. Own records only; the API enforces the same.
 */
import * as React from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "react-query";
import { format } from "date-fns";
import { ArrowRight, CalendarPlus, Copy, Plus, Target } from "lucide-react";
import { toast } from "sonner";
import pocketbase from "@/lib/pocketbase";
import { cn } from "@/utils";
import { useAuth } from "@/context/auth.context";
import { useRoles } from "@/context/roles.context";
import useSettings from "@/hooks/useSettings";
import { leaveApi } from "@/lib/hr";
import { errorMessage } from "@/lib/procurement";
import { ITEM_STATUS, PLAN_STATUS, TYPE_INFO, plansApi } from "@/lib/plans";
import { Skeleton } from "@/components/ui/skeleton";
import { LeaveFormModal } from "@/components/modals/LeaveFormModal";
import ExpenseRequestDialog from "@/components/expenses/ExpenseRequestDialog";
import { PayslipDialog, payrollOf } from "@/pages/hr/payroll/Payslip";
import {
  AttendanceCalendar, AttendanceNotice, ClockCard, LeaveBalance, RequestTable, RequestTabs, ReqTab, WCard, WHead, WLink, btnNavyOutline, btnOutline, btnPrimary,
  buildCalendar, fetchLatestPayslip, fetchMyAttendance, fetchMyRequests, money, tabOf, usePayHidden, toDate,
} from "@/components/workspace/WorkspaceKit";
import CorrectionDialog from "@/components/workspace/CorrectionDialog";
import { Page, PageHeader, StatusPill, buttonClass } from "@/components/ims";
import { queueCounts, queuesFor } from "./queues";

const DEFAULT_WORKING_DAYS = ["monday", "tuesday", "wednesday", "thursday", "friday"];
const round1 = (n: number) => Math.round((Number(n) || 0) * 10) / 10;

export default function MyDashboard() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user }: any = useAuth();
  const { canPerform } = useRoles();
  const { settings } = useSettings();
  const uid: string = user?.id || "";
  const year = new Date().getFullYear();
  const workingDays: string[] = settings?.working_days?.length ? settings.working_days : DEFAULT_WORKING_DAYS;
  const [tab, setTab] = React.useState<ReqTab>("all");
  const [dialog, setDialog] = React.useState<"" | "correction" | "leave" | "expense" | "equipment">("");
  const [slip, setSlip] = React.useState<any>(null);
  const [hidePay, togglePay] = usePayHidden();

  const attendance = useQuery(["my-dashboard", "attendance", uid], () => fetchMyAttendance(uid), { enabled: Boolean(uid), refetchInterval: 60_000 });
  const requests = useQuery(["my-dashboard", "requests", uid], () => fetchMyRequests(uid, 8), { enabled: Boolean(uid) });
  const balance = useQuery(["my-dashboard", "leave", uid, year], () => leaveApi.balances(year, { employee: uid }).then((r) => r.items[0] || null), { enabled: Boolean(uid) });
  const payslip = useQuery(["my-dashboard", "payslip", uid], () => fetchLatestPayslip(uid), { enabled: Boolean(uid) });
  const plans = useQuery(["my-dashboard", "plans", uid], async () => {
    const week = await plansApi.period("weekly", format(new Date(), "yyyy-MM-dd"));
    const rows = await pocketbase.collection("work_plans").getFullList({ filter: `staff = "${uid}" && period_end >= "${week.start} 00:00:00.000Z" && period_start <= "${week.end} 23:59:59.999Z"`, sort: "plan_type" });
    const last = await pocketbase.collection("work_plans").getList(1, 1, { filter: `staff = "${uid}" && plan_type = "weekly" && period_start < "${week.start} 00:00:00.000Z"`, sort: "-period_start" });
    return { week, rows: rows as any[], lastWeek: (last.items[0] as any) || null };
  }, { enabled: Boolean(uid) });
  const queues = React.useMemo(() => queuesFor(canPerform), [canPerform]);
  const queueQ = useQuery(["my-dashboard", "queues", uid, queues.map((q) => q.key).join()], () => queueCounts(queues, uid), { enabled: Boolean(uid) && queues.length > 0, refetchInterval: 60_000 });

  const cal = React.useMemo(() => buildCalendar(attendance.data, workingDays), [attendance.data, workingDays]);
  const present = (cal.counts.onTime || 0) + (cal.counts.late || 0) + (cal.counts.corrected || 0);
  const all = requests.data || [];
  const shown = all.filter((r) => tab === "all" || tabOf(r) === tab).slice(0, 6);
  const refresh = () => queryClient.invalidateQueries(["my-dashboard"]);

  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const first = (user?.names || user?.name || "").split(" ")[0] || "there";

  return (
    <Page>
      <PageHeader title={`${greeting}, ${first}`} subtitle={format(new Date(), "EEEE, d MMM yyyy")} actions={canPerform("access_employee_portal") ? <ClockCard /> : undefined} />

      <AttendanceNotice cal={cal} onAsk={() => setDialog("correction")} />

      <div className="flex flex-wrap items-stretch gap-4">
        <WCard className="flex-[2_1_560px]">
          <WHead
            title="My attendance"
            subtitle="Last 30 days · working days only"
            right={
              <div className="text-right">
                <div className="text-t-kpi tabular-nums">{present}<span className="text-t-body font-bold text-ims-muted"> / {cal.days.filter((d) => d.state !== "holiday" && d.state !== "leave").length} days</span></div>
                <WLink to="/dashboard/my/attendance">Attendance log →</WLink>
              </div>
            }
          />
          {attendance.isLoading ? <Skeleton className="mt-4 h-[200px] w-full" /> : <AttendanceCalendar cal={cal} />}
        </WCard>

        <WCard className="flex flex-[1_1_300px] flex-col gap-3">
          <WHead title={`Annual leave ${year}`} subtitle={balance.data ? `${round1(balance.data.entitlement)} days entitlement` : "Your entitlement for the year"} right={<WLink to="/dashboard/leave-plan">Leave plan →</WLink>} />
          {balance.isLoading ? <Skeleton className="h-28 w-full" /> : <LeaveBalance b={balance.data} />}
          <ComingUp uid={uid} />
          <button type="button" onClick={() => setDialog("leave")} className={cn(btnNavyOutline, "mt-auto")}>Request leave</button>
        </WCard>

        <WCard flush className="flex-[2_1_560px] overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 px-5 pb-3 pt-[18px]">
            <div>
              <h2 className="text-t-section">My requests</h2>
              <div className="text-t-small text-ims-muted">Leave, expenses and advances, equipment and purchases</div>
            </div>
            <RequestTabs rows={all} tab={tab} onTab={setTab} />
          </div>
          <div className="flex flex-wrap gap-2 px-5 pb-3.5">
            <span className="mr-0.5 self-center text-t-small font-bold text-ims-muted">New:</span>
            {[
              ["Leave", () => setDialog("leave"), canPerform("access_employee_portal")],
              ["Expense or advance", () => setDialog("expense"), canPerform("create_expense") || canPerform("access_employee_portal")],
              ["Equipment", () => navigate("/dashboard/my/equipment?new=1"), canPerform("view_assets_requests")],
              ["Purchase requisition", () => navigate("/dashboard/procurement/requisitions/new"), canPerform("create_purchase_requisition")],
            ].filter((x) => x[2]).map(([l, fn]) => (
              <button key={l as string} type="button" onClick={fn as () => void} className={buttonClass({ variant: "secondary", size: "sm" })}><Plus size={14} aria-hidden /> {l as string}</button>
            ))}
          </div>
          {requests.isLoading ? <div className="px-5 pb-5"><Skeleton className="h-28 w-full" /></div> : <RequestTable rows={shown} empty={tab === "all" ? "You have not made any request yet." : "No request in this group."} />}
          <div className="border-t border-ims-divider px-5 py-3"><WLink to="/dashboard/my/requests">All my requests →</WLink></div>
        </WCard>

        <WCard className="flex flex-[1_1_300px] flex-col gap-3">
          <WHead
            title="Latest payslip"
            subtitle={payslip.data ? payrollOf(payslip.data)?.period_label || "—" : "—"}
            right={payslip.data && <button type="button" aria-pressed={hidePay} onClick={togglePay} className={buttonClass({ variant: "secondary", size: "sm" })}>{hidePay ? "Show amounts" : "Hide amounts"}</button>}
          />
          {payslip.isLoading ? <Skeleton className="h-36 w-full" /> : !payslip.data ? (
            <p className="rounded-control bg-ims-thead px-3 py-6 text-center text-t-small text-ims-muted">Your payslip appears here once the monthly payroll is approved.</p>
          ) : (
            <>
              <div>
                <div className="text-t-small font-semibold text-ims-muted">Net pay</div>
                <div className="text-t-title tabular-nums">{hidePay ? "RWF •••••••" : money(payslip.data.net)}</div>
                <div className="mt-1">{payrollOf(payslip.data)?.status === "paid" ? <StatusPill status="Completed" sub="Paid" /> : <StatusPill status="Approved" sub="To be paid" />}</div>
              </div>
              <div className="flex flex-col gap-[7px] border-t border-ims-divider pt-2.5 text-t-body">
                <div className="flex justify-between"><span className="text-ims-muted">Gross salary</span><b className="tabular-nums">{hidePay ? "RWF •••••••" : money(payslip.data.gross)}</b></div>
                <div className="flex justify-between"><span className="text-ims-muted">Tax &amp; contributions</span><b className="tabular-nums text-ims-danger">{hidePay ? "RWF •••••••" : `− ${money(payslip.data.total_deductions)}`}</b></div>
              </div>
              <div className="mt-auto flex gap-2">
                <button type="button" onClick={() => setSlip(payslip.data)} className={cn(btnPrimary, "flex-1")}>Download PDF</button>
                <button type="button" onClick={() => navigate("/dashboard/my/payslips")} className={cn(btnOutline, "flex-1")}>All payslips</button>
              </div>
            </>
          )}
        </WCard>

        <WeekPlanCard data={plans.data} loading={plans.isLoading} onChanged={refresh} />

        {queues.length > 0 && (
          <WCard className="flex flex-[1_1_300px] flex-col gap-2">
            <WHead title="Needs your action" subtitle="Waiting for your decision" />
            <ul className="divide-y divide-ims-divider">
              {queues.map((q) => {
                const n = queueQ.data?.[q.key] || 0;
                return (
                  <li key={q.key}>
                    <button type="button" onClick={() => navigate(q.link)} className="group flex w-full items-center gap-3 py-2.5 text-left">
                      <q.icon size={16} className="shrink-0 text-ims-muted" aria-hidden />
                      <span className="flex-1 text-t-body font-semibold text-ims-body group-hover:text-ims-primary">{q.label}</span>
                      <span className={cn("min-w-[26px] rounded-pill px-2 py-px text-center text-t-hint font-bold tabular-nums", n ? "bg-ims-warning-bg text-ims-warning" : "bg-ims-neutral-bg text-ims-muted")}>{n}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </WCard>
        )}
      </div>

      <CorrectionDialog open={dialog === "correction"} onClose={() => setDialog("")} days={cal.absent} uid={uid} />
      <LeaveFormModal open={dialog === "leave"} setOpen={(o: boolean) => !o && setDialog("")} record={null} employeeId={uid} onComplete={() => { setDialog(""); refresh(); }} />
      <ExpenseRequestDialog open={dialog === "expense"} onClose={() => setDialog("")} onSaved={() => { setDialog(""); refresh(); }} />
      {slip && <PayslipDialog slip={slip} payroll={payrollOf(slip)} onClose={() => setSlip(null)} />}
    </Page>
  );
}

function WeekPlanCard({ data, loading, onChanged }: { data?: { week: { start: string; end: string; label: string }; rows: any[]; lastWeek: any }; loading: boolean; onChanged: () => void }) {
  const navigate = useNavigate();
  const [busy, setBusy] = React.useState(false);
  const week = data?.rows.find((p) => p.plan_type === "weekly");
  const longer = (data?.rows || []).filter((p) => p.plan_type !== "weekly");
  async function copyLast() {
    if (!data?.lastWeek) return;
    setBusy(true);
    try {
      const r = await plansApi.act(data.lastWeek.id, "copy");
      toast.success(`${r.number} started from last week's open activities`);
      onChanged();
      navigate(`/dashboard/my/plans/${r.id}/edit`);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <WCard className="flex flex-[2_1_560px] flex-col gap-3">
      <WHead title="This week's plan" subtitle={data?.week.label || "Your activities for the week"} right={<WLink to="/dashboard/my/plans">My plans & reports →</WLink>} />
      {loading ? <Skeleton className="h-24 w-full" /> : week ? (
        <button type="button" onClick={() => navigate(`/dashboard/my/plans/${week.id}`)} className="w-full min-w-0 rounded-control border border-ims-border p-3.5 text-left hover:bg-ims-hover">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-t-body font-bold">{week.focus || week.title}</span>
            <StatusPill status={PLAN_STATUS[week.status]?.label || week.status} sub={PLAN_STATUS[week.status]?.note} />
          </div>
          <div className="mt-2.5 flex items-center gap-3">
            <div className="h-2 flex-1 overflow-hidden rounded-full bg-ims-neutral-bg"><div className="h-full rounded-full bg-ims-link" style={{ width: `${week.progress}%` }} /></div>
            <span className="text-t-small font-bold tabular-nums">{week.progress}%</span>
          </div>
          <ul className="mt-2.5 grid grid-cols-1 gap-1.5 sm:grid-cols-2">
            {(week.items || []).slice(0, 4).map((i: any) => (
              <li key={i.id} className="flex min-w-0 items-center gap-2 text-t-small">
                <span className={cn("h-2 w-2 shrink-0 rounded-full", i.status === "done" ? "bg-ims-success" : i.status === "in_progress" ? "bg-ims-link" : "bg-ims-priority-low")} aria-hidden />
                <span className="min-w-0 truncate">{i.title}</span>
                <span className="sr-only">{ITEM_STATUS[i.status]?.label}</span>
              </li>
            ))}
          </ul>
        </button>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-control border border-dashed border-ims-priority-low bg-ims-thead px-4 py-3.5">
          <p className="text-t-body text-ims-body"><b>No plan for this week yet.</b> Plan your activities and send them to your supervisor.</p>
          <div className="flex gap-2">
            {data?.lastWeek && <button type="button" disabled={busy} onClick={copyLast} className={btnOutline}><Copy size={15} /> From last week</button>}
            <button type="button" onClick={() => navigate("/dashboard/my/plans/new?type=weekly")} className={btnPrimary}><CalendarPlus size={15} /> Plan this week</button>
          </div>
        </div>
      )}
      {longer.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {longer.map((p) => (
            <button key={p.id} type="button" onClick={() => navigate(`/dashboard/my/plans/${p.id}`)} className="inline-flex items-center gap-2 rounded-control border border-ims-border px-2.5 py-1.5 text-t-small hover:bg-ims-hover">
              <Target size={13} className="text-ims-link" aria-hidden />
              <span className="font-semibold">{TYPE_INFO[p.plan_type as keyof typeof TYPE_INFO]?.short}</span>
              <span className="text-ims-muted">{p.period_label}</span>
              <b className="tabular-nums">{p.progress}%</b>
              <ArrowRight size={12} className="text-ims-muted" aria-hidden />
            </button>
          ))}
        </div>
      )}
    </WCard>
  );
}

/** The next approved leave and the next public holidays, under the leave balance. */
function ComingUp({ uid }: { uid: string }) {
  const q = useQuery(["my-dashboard", "coming-up", uid], async () => {
    const today = format(new Date(), "yyyy-MM-dd");
    const [leave, holidays] = await Promise.all([
      pocketbase.collection("leaves").getList(1, 1, { filter: `employee = "${uid}" && status = "approved" && end >= "${today} 00:00:00.000Z"`, sort: "start" }).catch(() => ({ items: [] as any[] })),
      pocketbase.collection("public_holidays").getList(1, 2, { filter: `date >= "${today} 00:00:00.000Z"`, sort: "date" }).catch(() => ({ items: [] as any[] })),
    ]);
    return [
      ...leave.items.map((l: any) => ({ id: l.id, date: toDate(l.start), what: `Your leave${l.days ? ` · ${l.days} day${l.days === 1 ? "" : "s"}` : ""}`, mine: true })),
      ...holidays.items.map((h: any) => ({ id: h.id, date: toDate(h.date), what: h.name, mine: false })),
    ].filter((x) => x.date) as { id: string; date: Date; what: string; mine: boolean }[];
  }, { enabled: Boolean(uid), staleTime: 300_000 });
  if (!q.data?.length) return null;
  return (
    <div className="border-t border-ims-divider pt-2.5">
      <div className="mb-1.5 text-t-small font-semibold text-ims-muted">Coming up</div>
      <ul className="flex flex-col gap-1.5">
        {q.data.map((x) => (
          <li key={x.id} className="flex items-center gap-2.5 text-t-body">
            <span className={cn("w-[54px] shrink-0 rounded-md px-1.5 py-0.5 text-center text-t-hint font-bold tabular-nums", x.mine ? "bg-ims-info-bg text-ims-primary" : "bg-ims-subtle text-ims-body")}>{format(x.date, "d MMM")}</span>
            <span className="min-w-0 flex-1 truncate">{x.what}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
