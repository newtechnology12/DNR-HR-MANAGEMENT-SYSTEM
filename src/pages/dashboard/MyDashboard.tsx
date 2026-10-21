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
import { ArrowRight, CalendarPlus, Copy, Target } from "lucide-react";
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
import { PettryCashRequestModal } from "@/components/modals/PettryCashRequestModal";
import { PayslipDialog, payrollOf } from "@/pages/hr/payroll/Payslip";
import {
  AttendanceCalendar, AttendanceNotice, ClockCard, LeaveBalance, Pill, RequestTable, RequestTabs, ReqTab, WCard, WHead, WLink, btnNavyOutline, btnOutline, btnPrimary,
  buildCalendar, fetchLatestPayslip, fetchMyAttendance, fetchMyRequests, money, tabOf, usePayHidden, toDate,
} from "@/components/workspace/WorkspaceKit";
import CorrectionDialog from "@/components/workspace/CorrectionDialog";
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
  const [dialog, setDialog] = React.useState<"" | "correction" | "leave" | "petty" | "equipment">("");
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
    <main className="mx-auto flex w-full max-w-[1240px] flex-col gap-[18px] px-4 pb-12 pt-[22px] text-[#14213D] sm:px-8 sm:pt-[26px]">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="text-[13px] text-[#5B6577]">{format(new Date(), "EEEE, d MMMM yyyy")}</div>
          <h1 className="mt-0.5 text-[28px] font-extrabold tracking-[-0.01em]">{greeting}, {first}</h1>
        </div>
        {canPerform("access_employee_portal") && <ClockCard />}
      </header>

      <AttendanceNotice cal={cal} onAsk={() => setDialog("correction")} />

      <div className="flex flex-wrap items-stretch gap-[18px]">
        <WCard className="flex-[2_1_560px]">
          <WHead
            title="My attendance"
            subtitle="Last 30 days · working days only"
            right={
              <div className="text-right">
                <div className="text-[26px] font-extrabold leading-none tabular-nums">{present}<span className="text-[15px] font-bold text-[#5B6577]"> / {cal.days.filter((d) => d.state !== "holiday" && d.state !== "leave").length} days</span></div>
                <WLink to="/dashboard/my/attendance">Open attendance log →</WLink>
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
              <h2 className="text-[17px] font-extrabold">My requests</h2>
              <div className="text-[13px] text-[#5B6577]">Leave, expenses, petty cash, equipment and purchases</div>
            </div>
            <RequestTabs rows={all} tab={tab} onTab={setTab} />
          </div>
          <div className="flex flex-wrap gap-2 px-5 pb-3.5">
            <span className="mr-0.5 self-center text-[12.5px] font-bold text-[#5B6577]">New:</span>
            {[
              ["Leave", () => setDialog("leave"), canPerform("access_employee_portal")],
              ["Expense", () => navigate("/dashboard/my/expenses?new=expense"), canPerform("create_expense")],
              ["Petty cash", () => setDialog("petty"), canPerform("access_employee_portal")],
              ["Equipment", () => navigate("/dashboard/my/equipment?new=1"), canPerform("view_assets_requests")],
              ["Purchase requisition", () => navigate("/dashboard/procurement/requisitions/new"), canPerform("create_purchase_requisition")],
            ].filter((x) => x[2]).map(([l, fn]) => (
              <button key={l as string} type="button" onClick={fn as () => void} className="h-[34px] rounded-lg border border-[#DDE3EC] bg-white px-3 text-[13px] font-semibold text-[#14213D] hover:bg-[#F1F4F9]">+ {l as string}</button>
            ))}
          </div>
          {requests.isLoading ? <div className="px-5 pb-5"><Skeleton className="h-28 w-full" /></div> : <RequestTable rows={shown} empty={tab === "all" ? "You have not made any request yet." : "Nothing here"} />}
          <div className="border-t border-[#EDF0F5] px-5 py-3"><WLink to="/dashboard/my/requests">All my requests →</WLink></div>
        </WCard>

        <WCard className="flex flex-[1_1_300px] flex-col gap-3">
          <WHead
            title="Latest payslip"
            subtitle={payslip.data ? payrollOf(payslip.data)?.period_label || "—" : "—"}
            right={payslip.data && <button type="button" aria-pressed={hidePay} onClick={togglePay} className="h-[30px] rounded-[7px] border border-[#DDE3EC] bg-white px-2.5 text-[12px] font-semibold text-[#36435A] hover:bg-[#F1F4F9]">{hidePay ? "Show amounts" : "Hide amounts"}</button>}
          />
          {payslip.isLoading ? <Skeleton className="h-36 w-full" /> : !payslip.data ? (
            <p className="rounded-lg bg-[#F8FAFC] px-3 py-6 text-center text-[13px] text-[#5B6577]">Your payslip appears here once the monthly payroll is approved.</p>
          ) : (
            <>
              <div>
                <div className="text-[12.5px] font-semibold text-[#5B6577]">Net pay</div>
                <div className="text-[28px] font-extrabold tabular-nums">{hidePay ? "RWF •••••••" : money(payslip.data.net)}</div>
                <Pill tone="approved" className="mt-1">{payrollOf(payslip.data)?.status === "paid" ? "Paid" : "Approved · to be paid"}</Pill>
              </div>
              <div className="flex flex-col gap-[7px] border-t border-[#EDF0F5] pt-2.5 text-[13.5px]">
                <div className="flex justify-between"><span className="text-[#5B6577]">Gross salary</span><b className="tabular-nums">{hidePay ? "RWF •••••••" : money(payslip.data.gross)}</b></div>
                <div className="flex justify-between"><span className="text-[#5B6577]">Tax &amp; contributions</span><b className="tabular-nums text-[#B42318]">{hidePay ? "RWF •••••••" : `− ${money(payslip.data.total_deductions)}`}</b></div>
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
            <ul className="divide-y divide-[#EDF0F5]">
              {queues.map((q) => {
                const n = queueQ.data?.[q.key] || 0;
                return (
                  <li key={q.key}>
                    <button type="button" onClick={() => navigate(q.link)} className="group flex w-full items-center gap-3 py-2.5 text-left">
                      <q.icon size={16} className="shrink-0 text-[#5B6577]" aria-hidden />
                      <span className="flex-1 text-[13.5px] font-semibold text-[#36435A] group-hover:text-[#0B3A6F]">{q.label}</span>
                      <span className={cn("min-w-[26px] rounded-full px-2 py-px text-center text-[12px] font-bold tabular-nums", n ? "bg-[#FEF3D6] text-[#8A5A00]" : "bg-[#EEF2F8] text-[#5B6577]")}>{n}</span>
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
      <PettryCashRequestModal open={dialog === "petty"} setOpen={(o: boolean) => !o && setDialog("")} record={null} employeeId={uid} onComplete={() => { setDialog(""); refresh(); }} />
      {slip && <PayslipDialog slip={slip} payroll={payrollOf(slip)} onClose={() => setSlip(null)} />}
    </main>
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
        <button type="button" onClick={() => navigate(`/dashboard/my/plans/${week.id}`)} className="w-full min-w-0 rounded-xl border border-[#E3E8EF] p-3.5 text-left hover:bg-[#F8FAFD]">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-[14px] font-bold">{week.focus || week.title}</span>
            <Pill tone={PLAN_STATUS[week.status]?.tone}>{PLAN_STATUS[week.status]?.label}</Pill>
          </div>
          <div className="mt-2.5 flex items-center gap-3">
            <div className="h-2 flex-1 overflow-hidden rounded-full bg-[#EEF1F5]"><div className="h-full rounded-full bg-[#1466C0]" style={{ width: `${week.progress}%` }} /></div>
            <span className="text-[13px] font-bold tabular-nums">{week.progress}%</span>
          </div>
          <ul className="mt-2.5 grid grid-cols-1 gap-1.5 sm:grid-cols-2">
            {(week.items || []).slice(0, 4).map((i: any) => (
              <li key={i.id} className="flex min-w-0 items-center gap-2 text-[13px]">
                <span className={cn("h-2 w-2 shrink-0 rounded-full", i.status === "done" ? "bg-[#0F6B3A]" : i.status === "in_progress" ? "bg-[#1466C0]" : "bg-[#C5CDD9]")} aria-hidden />
                <span className="min-w-0 truncate">{i.title}</span>
                <span className="sr-only">{ITEM_STATUS[i.status]?.label}</span>
              </li>
            ))}
          </ul>
        </button>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-dashed border-[#C5CDD9] bg-[#F8FAFC] px-4 py-3.5">
          <p className="text-[13.5px] text-[#36435A]"><b>No plan for this week yet.</b> Plan your activities and send them to your supervisor.</p>
          <div className="flex gap-2">
            {data?.lastWeek && <button type="button" disabled={busy} onClick={copyLast} className={btnOutline}><Copy size={15} /> From last week</button>}
            <button type="button" onClick={() => navigate("/dashboard/my/plans/new?type=weekly")} className={btnPrimary}><CalendarPlus size={15} /> Plan this week</button>
          </div>
        </div>
      )}
      {longer.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {longer.map((p) => (
            <button key={p.id} type="button" onClick={() => navigate(`/dashboard/my/plans/${p.id}`)} className="inline-flex items-center gap-2 rounded-lg border border-[#E3E8EF] px-2.5 py-1.5 text-[12.5px] hover:bg-[#F8FAFD]">
              <Target size={13} className="text-[#1466C0]" aria-hidden />
              <span className="font-semibold">{TYPE_INFO[p.plan_type as keyof typeof TYPE_INFO]?.short}</span>
              <span className="text-[#5B6577]">{p.period_label}</span>
              <b className="tabular-nums">{p.progress}%</b>
              <ArrowRight size={12} className="text-[#5B6577]" aria-hidden />
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
    <div className="border-t border-[#EDF0F5] pt-2.5">
      <div className="mb-1.5 text-[12.5px] font-semibold text-[#5B6577]">Coming up</div>
      <ul className="flex flex-col gap-1.5">
        {q.data.map((x) => (
          <li key={x.id} className="flex items-center gap-2.5 text-[13.5px]">
            <span className={cn("w-[54px] shrink-0 rounded-md px-1.5 py-0.5 text-center text-[12px] font-bold tabular-nums", x.mine ? "bg-[#EAF2FC] text-[#0B3A6F]" : "bg-[#F1F4F9] text-[#36435A]")}>{format(x.date, "d MMM")}</span>
            <span className="min-w-0 flex-1 truncate">{x.what}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
