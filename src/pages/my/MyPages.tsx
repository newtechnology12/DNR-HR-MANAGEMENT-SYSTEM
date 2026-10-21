/**
 * The staff member's own pages (sidebar "My workspace" and "Requests"): attendance, leave, payslips, all
 * requests, performance, documents, expenses & petty cash, equipment. They reuse the existing self-service
 * components; every query is limited to the signed-in person and the API rules enforce the same.
 */
import * as React from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "react-query";
import { format, formatDistanceToNow } from "date-fns";
import { CalendarRange, Laptop, Plus, Wallet } from "lucide-react";
import pocketbase from "@/lib/pocketbase";
import { useAuth } from "@/context/auth.context";
import { useRoles } from "@/context/roles.context";
import useSettings from "@/hooks/useSettings";
import { LOAN_TYPES, MONTHS, leaveApi } from "@/lib/hr";
import { cn } from "@/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { LeaveFormModal } from "@/components/modals/LeaveFormModal";
import { PettryCashRequestModal } from "@/components/modals/PettryCashRequestModal";
import { AssetRequestModal } from "@/components/modals/AssetRequestModal";
import EmployeeAttendances from "@/pages/dashboard/EmployeeAttendances";
import EmployeeLeaves from "@/pages/dashboard/EmployeeLeaves";
import EmployeePrePayments from "@/pages/dashboard/EmployeePrePayments";
import EmployeeDocuments from "@/pages/dashboard/EmployeeDocuments";
import EmployeeAssets from "@/pages/dashboard/EmployeeAssets";
import EmployeePerfomance from "@/pages/dashboard/EmployeePerfomance";
import MyAppraisals from "@/pages/portal/MyAppraisals";
import MyPayslipList from "@/pages/portal/MyPayslips";
import {
  AttendanceCalendar, AttendanceNotice, ClockCard, LeaveBalance, MyHeader, Pill, RequestTable, RequestTabs, ReqTab, WCard, WHead, WLink, btnOutline, btnPrimary,
  buildCalendar, fetchMyAttendance, fetchMyRequests, money, myPage, tabOf, toDate,
} from "@/components/workspace/WorkspaceKit";
import CorrectionDialog, { CORRECTION_REASONS } from "@/components/workspace/CorrectionDialog";

const useUid = () => {
  const { user }: any = useAuth();
  return { uid: (user?.id as string) || "", user };
};
const WORKING = ["monday", "tuesday", "wednesday", "thursday", "friday"];
const statusTone = (s: string) => (["approved", "paid", "disbursed"].includes(s) ? "approved" : ["rejected", "cancelled"].includes(s) ? "rejected" : "pending");
const ago = (v?: string) => (toDate(v) ? formatDistanceToNow(toDate(v) as Date, { addSuffix: true }).replace("about ", "") : "");

function Tabs({ tabs, active, onChange }: { tabs: [string, string][]; active: string; onChange: (k: string) => void }) {
  return (
    <div role="tablist" className="flex gap-1 border-b border-[#E3E8EF]">
      {tabs.map(([k, l]) => (
        <button key={k} type="button" role="tab" aria-selected={active === k} onClick={() => onChange(k)}
          className={cn("-mb-px border-b-2 px-3.5 py-2.5 text-[14px] font-bold", active === k ? "border-[#1466C0] text-[#0B3A6F]" : "border-transparent text-[#5B6577] hover:text-[#14213D]")}>
          {l}
        </button>
      ))}
    </div>
  );
}

// ------------------------------------------------------------------ attendance
export function MyAttendance() {
  const { uid } = useUid();
  const { settings } = useSettings();
  const working: string[] = settings?.working_days?.length ? settings.working_days : WORKING;
  const [asking, setAsking] = React.useState(false);
  const q = useQuery(["my-attendance", uid], () => fetchMyAttendance(uid, 56), { enabled: Boolean(uid), refetchInterval: 60_000 });
  const corrections = useQuery(["my-attendance", "corrections", uid], () => pocketbase.collection("attendance_corrections").getFullList({ filter: `employee = "${uid}"`, sort: "-created", expand: "reviewed_by" }), { enabled: Boolean(uid) });
  const cal = React.useMemo(() => buildCalendar(q.data, working), [q.data, working]);
  const month = (q.data?.attendance || []).filter((a: any) => toDate(a.date || a.clockin_time) && format(toDate(a.date || a.clockin_time) as Date, "yyyy-MM") === format(new Date(), "yyyy-MM"));
  const arrivals = month.filter((a: any) => a.type !== "correction" && toDate(a.clockin_time)).map((a: any) => toDate(a.clockin_time) as Date);
  const avg = arrivals.length ? arrivals.reduce((s, d) => s + d.getHours() * 60 + d.getMinutes(), 0) / arrivals.length : null;
  const hours = month.reduce((s: number, a: any) => (toDate(a.clockin_time) && toDate(a.clockout_time) ? s + ((toDate(a.clockout_time) as Date).getTime() - (toDate(a.clockin_time) as Date).getTime()) / 36e5 : s), 0);
  return (
    <main className={myPage}>
      <MyHeader title="My attendance" subtitle="Clock in when you start and out when you leave. Your working days for the last eight weeks, corrections and the full log." actions={<ClockCard />} />
      <AttendanceNotice cal={cal} onAsk={() => setAsking(true)} />
      <div className="flex flex-wrap items-start gap-[18px]">
        <WCard className="flex-[2_1_560px]">
          <WHead title="Working days" subtitle="Last 8 weeks · hover a day for the times" right={<button type="button" onClick={() => setAsking(true)} className="text-[13px] font-bold text-[#1466C0] hover:underline">Ask HR to correct</button>} />
          {q.isLoading ? <Skeleton className="mt-4 h-[300px] w-full" /> : <AttendanceCalendar cal={cal} />}
        </WCard>
        <WCard className="flex flex-[1_1_300px] flex-col gap-3">
          <WHead title={format(new Date(), "MMMM yyyy")} subtitle="This month so far" />
          <dl className="grid grid-cols-2 gap-3 text-[13px]">
            {[
              ["Days present", String(month.length)],
              ["Late arrivals", String(month.filter((a: any) => a.behaviour === "late").length)],
              ["Average arrival", avg === null ? "—" : `${String(Math.floor(avg / 60)).padStart(2, "0")}:${String(Math.round(avg % 60)).padStart(2, "0")}`],
              ["Hours recorded", `${Math.round(hours)} h`],
            ].map(([k, v]) => <div key={k}><dt className="text-[#5B6577]">{k}</dt><dd className="text-[20px] font-extrabold tabular-nums">{v}</dd></div>)}
          </dl>
          <p className="rounded-lg bg-[#F8FAFC] px-3 py-2 text-[12.5px] text-[#36435A]">Working hours: <b>{settings?.work_start_time || "08:00"} – {settings?.work_end_time || "17:00"}</b>, {working.length} days a week. Clock-in opens {Number(settings?.early_clockin_mins) || 0} minutes before the start.</p>
        </WCard>
      </div>
      <WCard>
        <WHead title="Correction requests" subtitle="Days you were on duty without a clock-in, sent to HR" />
        {corrections.isLoading ? <Skeleton className="mt-3 h-16 w-full" /> : !(corrections.data || []).length ? (
          <p className="mt-3 text-[13px] text-[#5B6577]">None yet. If you were on mission or training, use <b>Ask HR to correct</b>.</p>
        ) : (
          <ul className="mt-3 divide-y divide-[#EDF0F5]">
            {(corrections.data as any[]).map((c) => (
              <li key={c.id} className="flex flex-wrap items-start justify-between gap-3 py-3">
                <div className="min-w-0">
                  <p className="text-[14px] font-bold">{c.number} · {CORRECTION_REASONS[c.reason] || c.reason}</p>
                  <p className="text-[13px] text-[#36435A]">{(c.dates || []).map((d: string) => format(new Date(`${d}T12:00:00`), "EEE d MMM")).join(", ")}</p>
                  <p className="text-[12.5px] text-[#5B6577]">{c.explanation}</p>
                  {c.review_comment && <p className="mt-1 text-[12.5px] text-[#36435A]">HR: {c.review_comment}{c.expand?.reviewed_by ? ` — ${c.expand.reviewed_by.name}` : ""}</p>}
                </div>
                <div className="text-right">
                  <Pill tone={statusTone(c.status)}>{c.status === "pending" ? "Waiting for HR" : c.status === "approved" ? `Approved · ${c.added_days} day${c.added_days === 1 ? "" : "s"} added` : "Rejected"}</Pill>
                  <p className="mt-1 text-[12px] text-[#5B6577]">{ago(c.created)}</p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </WCard>
      <WCard>
        <WHead title="Attendance log" subtitle="Every clock-in and clock-out, with export" />
        <div className="mt-3"><EmployeeAttendances employeeId={uid} /></div>
      </WCard>
      <CorrectionDialog open={asking} onClose={() => { setAsking(false); q.refetch(); corrections.refetch(); }} days={cal.absent} uid={uid} />
    </main>
  );
}

// ------------------------------------------------------------------ leave
export function MyLeave() {
  const { uid } = useUid();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [params, setParams] = useSearchParams();
  const year = new Date().getFullYear();
  const [open, setOpen] = React.useState(params.get("new") === "1");
  const balance = useQuery(["my-leave", "balance", uid, year], () => leaveApi.balances(year, { employee: uid }).then((r) => r.items[0] || null), { enabled: Boolean(uid) });
  const holidays = useQuery(["my-leave", "holidays"], () => pocketbase.collection("public_holidays").getFullList({ sort: "date" }).catch(() => [] as any[]));
  const today = format(new Date(), "yyyy-MM-dd");
  const upcoming = ((holidays.data || []) as any[])
    .map((h) => ({ ...h, next: h.recurring ? `${year}-${String(h.date).slice(5, 10)}` : String(h.date).slice(0, 10) }))
    .filter((h) => h.next >= today)
    .sort((a, b) => a.next.localeCompare(b.next))
    .slice(0, 5);
  const b: any = balance.data;
  return (
    <main className={myPage}>
      <MyHeader title="My leave" subtitle="Your balance for the year, your requests and your leave plan. Requests go to your line manager, then HR." actions={<button type="button" onClick={() => setOpen(true)} className={btnPrimary}><Plus size={15} /> Request leave</button>} />
      <div className="flex flex-wrap items-start gap-[18px]">
        <WCard className="flex flex-[1_1_320px] flex-col gap-3">
          <WHead title={`Annual leave ${year}`} subtitle={b ? `${Math.round(b.entitlement * 10) / 10} days entitlement` : ""} />
          {balance.isLoading ? <Skeleton className="h-28 w-full" /> : <LeaveBalance b={b} />}
          {b && (
            <dl className="grid grid-cols-2 gap-2 border-t border-[#EDF0F5] pt-2.5 text-[12.5px]">
              <div><dt className="text-[#5B6577]">Years of service</dt><dd className="font-bold">{b.years_of_service}</dd></div>
              <div><dt className="text-[#5B6577]">Seniority days</dt><dd className="font-bold">{b.seniority_days}</dd></div>
              <div><dt className="text-[#5B6577]">Carried over</dt><dd className="font-bold">{b.carried_over}</dd></div>
              <div><dt className="text-[#5B6577]">Adjustment</dt><dd className="font-bold">{b.adjustment}{b.adjustment_reason ? ` · ${b.adjustment_reason}` : ""}</dd></div>
            </dl>
          )}
        </WCard>
        <WCard className="flex flex-[1_1_300px] flex-col gap-3">
          <WHead title={`Leave plan ${year}`} subtitle="When you intend to take your leave" right={<WLink to="/dashboard/leave-plan">Open →</WLink>} />
          {b?.plan ? (
            <>
              <p className="text-[30px] font-extrabold tabular-nums">{b.planned}<span className="text-[15px] font-bold text-[#5B6577]"> days planned</span></p>
              <Pill tone={b.plan.status === "approved" ? "approved" : "pending"}>{b.plan.status === "approved" ? "Plan approved" : "Plan in draft"}</Pill>
              <p className="text-[12.5px] text-[#5B6577]">{b.unplanned > 0 ? `${b.unplanned} day(s) not planned yet.` : "All your days are planned."}</p>
            </>
          ) : <p className="text-[13px] text-[#5B6577]">No leave plan yet. HR asks everyone to plan the year's leave early so the work is covered.</p>}
          <button type="button" onClick={() => navigate("/dashboard/leave-plan")} className="h-10 rounded-[9px] border border-[#DDE3EC] text-[13.5px] font-bold hover:bg-[#F1F4F9]"><CalendarRange size={15} className="mr-1.5 inline" /> Plan my leave</button>
        </WCard>
        <WCard className="flex flex-[1_1_260px] flex-col gap-2">
          <WHead title="Public holidays" subtitle="Coming up" />
          {upcoming.length ? (
            <ul className="divide-y divide-[#EDF0F5]">
              {upcoming.map((h) => <li key={h.id} className="flex justify-between gap-3 py-2 text-[13px]"><span>{h.name}</span><span className="whitespace-nowrap text-[#5B6577]">{format(new Date(`${h.next}T12:00:00`), "EEE d MMM")}</span></li>)}
            </ul>
          ) : <p className="text-[13px] text-[#5B6577]">None in the calendar.</p>}
        </WCard>
      </div>
      <WCard>
        <WHead title="My leave requests" subtitle="All your requests with their status" />
        <div className="mt-3"><EmployeeLeaves employeeId={uid} /></div>
      </WCard>
      <LeaveFormModal open={open} setOpen={(o: boolean) => { setOpen(o); if (!o && params.get("new")) setParams({}); }} record={null} employeeId={uid} onComplete={() => { setOpen(false); queryClient.invalidateQueries(); }} />
    </main>
  );
}

// ------------------------------------------------------------------ payslips
export function MyPayslipsPage() {
  const { uid } = useUid();
  return (
    <main className={myPage}>
      <MyHeader title="My payslips" subtitle="Your payslips from approved payrolls. Open one to print it or save it as PDF. Only you, HR & Payroll, Finance and the auditors can see them." />
      <WCard><MyPayslipList employeeId={uid} /></WCard>
      <MyLoans uid={uid} />
    </main>
  );
}

/** Loans repaid through the payslip: what is left, the monthly instalment and when it ends. */
function MyLoans({ uid }: { uid: string }) {
  const q = useQuery(["my-loans", uid], () => pocketbase.collection("staff_loans").getFullList({ filter: `employee = "${uid}"`, sort: "-created" }), { enabled: Boolean(uid) });
  const rows = ((q.data || []) as any[]).filter((l) => l.status !== "cancelled");
  if (!rows.length) return null;
  const STATE: Record<string, [string, string]> = { pending_approval: ["pending", "Waiting for Finance"], active: ["info", "Being repaid"], repaid: ["approved", "Repaid"], rejected: ["rejected", "Not approved"] };
  const end = (l: any) => {
    const k = l.start_year * 12 + l.start_month - 1 + Math.max(1, l.installments) - 1;
    return `${MONTHS[k % 12]} ${Math.floor(k / 12)}`;
  };
  return (
    <WCard>
      <WHead title="My loans" subtitle="Loans repaid through your payslip. The balance goes down each month when the salaries are paid. Questions: HR & Payroll." />
      <ul className="mt-3 divide-y divide-[#EDF0F5]">
        {rows.map((l) => {
          const pct = l.principal ? Math.round((l.repaid / l.principal) * 100) : 0;
          const [tone, label] = STATE[l.status] || ["neutral", l.status];
          return (
            <li key={l.id} className="grid gap-2 py-3 sm:grid-cols-[1fr_220px_auto] sm:items-center">
              <div className="min-w-0">
                <p className="text-[14px] font-bold text-[#14213D]">{LOAN_TYPES[l.loan_type] || "Loan"} · {money(l.principal)}</p>
                <p className="truncate text-[12.5px] text-[#5B6577]">{l.number} · {l.purpose}</p>
              </div>
              <div>
                <div className="flex justify-between text-[12px] text-[#5B6577]"><span>{money(l.installment)} a month</span><span>until {end(l)}</span></div>
                <div className="mt-1 h-2 overflow-hidden rounded-full bg-[#EDF0F5]"><div className="h-full rounded-full bg-[#1F9D55]" style={{ width: `${pct}%` }} /></div>
                <p className="mt-1 text-[12px] text-[#36435A]">Left to repay <b>{money(l.balance)}</b></p>
              </div>
              <Pill tone={tone}>{label}</Pill>
            </li>
          );
        })}
      </ul>
    </WCard>
  );
}

// ------------------------------------------------------------------ all requests
const KINDS = ["All", "Leave", "Expense", "Petty cash", "Equipment", "Purchase"];
export function MyRequests() {
  const { uid } = useUid();
  const navigate = useNavigate();
  const { canPerform } = useRoles();
  const [tab, setTab] = React.useState<ReqTab>("all");
  const [kind, setKind] = React.useState("All");
  const q = useQuery(["my-requests", uid], () => fetchMyRequests(uid, 60), { enabled: Boolean(uid) });
  const rows = (q.data || []).filter((r) => kind === "All" || r.kind === kind);
  const shown = rows.filter((r) => tab === "all" || tabOf(r) === tab);
  return (
    <main className={myPage}>
      <MyHeader
        title="My requests"
        subtitle="Everything you asked for — leave, expenses, petty cash, equipment and purchases — with where it stands and what happens next."
        actions={
          <>
            {canPerform("create_purchase_requisition") && <button type="button" onClick={() => navigate("/dashboard/procurement/requisitions/new")} className={btnOutline}><Plus size={15} /> Purchase requisition</button>}
            <button type="button" onClick={() => navigate("/dashboard/my/leave?new=1")} className={btnPrimary}><Plus size={15} /> Request leave</button>
          </>
        }
      />
      <WCard flush className="overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 pb-3 pt-[18px]">
          <div className="flex flex-wrap gap-1.5">
            {KINDS.map((k) => (
              <button key={k} type="button" aria-pressed={kind === k} onClick={() => setKind(k)} className={cn("h-8 rounded-full border px-3 text-[12.5px] font-bold", kind === k ? "border-[#0B3A6F] bg-[#0B3A6F] text-white" : "border-[#DDE3EC] bg-white text-[#36435A] hover:bg-[#F1F4F9]")}>{k}</button>
            ))}
          </div>
          <RequestTabs rows={rows} tab={tab} onTab={setTab} />
        </div>
        {q.isLoading ? <div className="px-5 pb-5"><Skeleton className="h-40 w-full" /></div> : <RequestTable rows={shown} empty="No request matches." />}
      </WCard>
    </main>
  );
}

// ------------------------------------------------------------------ performance, documents
export function MyPerformance() {
  const { user } = useUid();
  return (
    <main className={myPage}>
      <MyHeader title="My performance" subtitle="Your appraisals: self-assessment, your supervisor's review and the agreed objectives. Your work plans and their assessments are under My plans & reports." actions={<WLink to="/dashboard/my/plans">My plans & reports →</WLink>} />
      <WCard><MyAppraisals /></WCard>
      <WCard><EmployeePerfomance employee={user} hideWhenEmpty /></WCard>
    </main>
  );
}

export function MyDocuments() {
  const { uid } = useUid();
  return (
    <main className={myPage}>
      <MyHeader title="My documents" subtitle="Your contract, certificates and other personal documents. Only you and HR can see them." />
      <WCard><EmployeeDocuments employeeId={uid} /></WCard>
    </main>
  );
}

// ------------------------------------------------------------------ expenses & petty cash
export function MyExpenses() {
  const { uid } = useUid();
  const [params, setParams] = useSearchParams();
  const tab = params.get("tab") === "petty" || params.get("new") === "petty" ? "petty" : "expenses";
  const [pettyOpen, setPettyOpen] = React.useState(params.get("new") === "petty");
  const petty = useQuery(["my-petty", uid], () => pocketbase.collection("petty_cash_requests").getFullList({ filter: `requested_by = "${uid}"`, sort: "-created", expand: "approved_by,rejected_by" }), { enabled: Boolean(uid) });
  return (
    <main className={myPage}>
      <MyHeader
        title="Expenses & petty cash"
        subtitle="Expenses you paid for RALGA (refunded after approval) and small cash advances from the petty cash."
        actions={tab === "petty" && <button type="button" onClick={() => setPettyOpen(true)} className={btnPrimary}><Plus size={15} /> Request petty cash</button>}
      />
      <Tabs tabs={[["expenses", "Expense requests"], ["petty", "Petty cash"]]} active={tab} onChange={(k) => setParams(k === "petty" ? { tab: "petty" } : {})} />
      {tab === "expenses" ? (
        <WCard><EmployeePrePayments employeeId={uid} autoOpen={params.get("new") === "expense"} /></WCard>
      ) : (
        <WCard flush className="overflow-hidden">
          {petty.isLoading ? <div className="p-5"><Skeleton className="h-24 w-full" /></div> : !(petty.data || []).length ? (
            <div className="flex flex-col items-center gap-2 px-5 py-10 text-center">
              <Wallet size={26} className="text-[#5B6577]" />
              <p className="text-[14px] font-bold">No petty cash request yet</p>
              <p className="max-w-sm text-[13px] text-[#5B6577]">For small urgent payments (courier, transport, small supplies). Finance approves and gives you the cash.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] text-[14px]">
                <thead><tr className="bg-[#F8FAFC] text-left text-[12.5px] text-[#5B6577]"><th className="px-5 py-2.5 font-bold">For</th><th className="px-3.5 py-2.5 text-right font-bold">Amount</th><th className="px-3.5 py-2.5 font-bold">Status</th><th className="py-2.5 pl-3.5 pr-5 text-right font-bold">Asked</th></tr></thead>
                <tbody>
                  {(petty.data as any[]).map((r) => (
                    <tr key={r.id} className="border-t border-[#EDF0F5]">
                      <td className="px-5 py-3">{r.notes || "Cash request"}</td>
                      <td className="whitespace-nowrap px-3.5 py-3 text-right font-bold tabular-nums">{money(r.amount)}</td>
                      <td className="px-3.5 py-3"><Pill tone={statusTone(r.status)}>{(r.status || "pending").replace(/^./, (c: string) => c.toUpperCase())}</Pill><div className="mt-[3px] text-[12px] text-[#5B6577]">{r.status === "approved" ? "Cash to collect from finance" : r.status === "rejected" ? r.rejected_reason : "Waiting for finance"}</div></td>
                      <td className="whitespace-nowrap py-3 pl-3.5 pr-5 text-right text-[#5B6577]">{ago(r.created)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </WCard>
      )}
      <PettryCashRequestModal open={pettyOpen} setOpen={(o: boolean) => setPettyOpen(o)} record={null} employeeId={uid} onComplete={() => { setPettyOpen(false); petty.refetch(); }} />
    </main>
  );
}

// ------------------------------------------------------------------ equipment
export function MyEquipment() {
  const { uid } = useUid();
  const [params, setParams] = useSearchParams();
  const tab = params.get("tab") === "assigned" ? "assigned" : "requests";
  const [open, setOpen] = React.useState(params.get("new") === "1");
  const reqs = useQuery(["my-equipment", uid], () => pocketbase.collection("assets_requests").getFullList({ filter: `requested_by = "${uid}"`, sort: "-created", expand: "asset" }), { enabled: Boolean(uid) });
  return (
    <main className={myPage}>
      <MyHeader title="Equipment" subtitle="Equipment assigned to you and your requests for laptops, phones, furniture or other items." actions={<button type="button" onClick={() => setOpen(true)} className={btnPrimary}><Plus size={15} /> Request equipment</button>} />
      <Tabs tabs={[["requests", "My requests"], ["assigned", "Assigned to me"]]} active={tab} onChange={(k) => setParams(k === "assigned" ? { tab: "assigned" } : {})} />
      {tab === "assigned" ? <WCard><EmployeeAssets employeeId={uid} /></WCard> : (
        <WCard flush className="overflow-hidden">
          {reqs.isLoading ? <div className="p-5"><Skeleton className="h-24 w-full" /></div> : !(reqs.data || []).length ? (
            <div className="flex flex-col items-center gap-2 px-5 py-10 text-center"><Laptop size={26} className="text-[#5B6577]" /><p className="text-[14px] font-bold">No equipment request yet</p></div>
          ) : (
            <ul className="divide-y divide-[#EDF0F5]">
              {(reqs.data as any[]).map((r) => (
                <li key={r.id} className="flex flex-wrap items-start justify-between gap-3 px-5 py-3">
                  <div><p className="text-[14px] font-bold">{r.expand?.asset?.name || "Equipment"}</p><p className="text-[13px] text-[#5B6577]">{r.notes}</p></div>
                  <div className="text-right"><Pill tone={statusTone(r.status)}>{(r.status || "pending").replace(/^./, (c: string) => c.toUpperCase())}</Pill><p className="mt-1 text-[12px] text-[#5B6577]">{ago(r.created)}</p></div>
                </li>
              ))}
            </ul>
          )}
        </WCard>
      )}
      <AssetRequestModal open={open} setOpen={(o: boolean) => { setOpen(o); if (!o && params.get("new")) setParams({}); }} record={null} employeeId={uid} onComplete={() => { setOpen(false); reqs.refetch(); }} />
    </main>
  );
}

