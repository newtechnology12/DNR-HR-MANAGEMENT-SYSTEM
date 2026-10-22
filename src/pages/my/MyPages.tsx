/**
 * The staff member's own pages (sidebar "My workspace" and "Requests"): attendance, leave, payslips, all
 * requests, performance, documents, expenses & petty cash, equipment. They reuse the existing self-service
 * components; every query is limited to the signed-in person and the API rules enforce the same.
 */
import * as React from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "react-query";
import { format } from "date-fns";
import { CalendarRange, Laptop, Plus } from "lucide-react";
import pocketbase from "@/lib/pocketbase";
import { useAuth } from "@/context/auth.context";
import { useRoles } from "@/context/roles.context";
import useSettings from "@/hooks/useSettings";
import { LOAN_TYPES, MONTHS, leaveApi } from "@/lib/hr";
import { ASSET_STATUS, CONDITIONS } from "@/lib/assets";
import { toast } from "sonner";
import { errorMessage } from "@/lib/procurement";
import { Skeleton } from "@/components/ui/skeleton";
import { LeaveFormModal } from "@/components/modals/LeaveFormModal";
import EmployeeAttendances from "@/pages/dashboard/EmployeeAttendances";
import EmployeeLeaves from "@/pages/dashboard/EmployeeLeaves";
import EmployeePrePayments from "@/pages/dashboard/EmployeePrePayments";
import EmployeeDocuments from "@/pages/dashboard/EmployeeDocuments";
import EmployeePerfomance from "@/pages/dashboard/EmployeePerfomance";
import MyAppraisals from "@/pages/portal/MyAppraisals";
import MyPayslipList from "@/pages/portal/MyPayslips";
import {
  AttendanceCalendar, AttendanceNotice, ClockCard, LeaveBalance, MyHeader, RequestTable, RequestTabs, ReqTab, WCard, WHead, WLink,
  buildCalendar, fetchMyAttendance, fetchMyRequests, money, myPage, tabOf, toDate,
} from "@/components/workspace/WorkspaceKit";
import CorrectionDialog, { CORRECTION_REASONS } from "@/components/workspace/CorrectionDialog";
import {
  Button,
  EmptyState,
  Field,
  FilterSelect,
  Modal,
  Pill,
  Select,
  StatusPill,
  StatusWord,
  Tabs,
  Textarea,
  fmtDate,
  fmtWhen,
  statusWord,
} from "@/components/ims";

const useUid = () => {
  const { user }: any = useAuth();
  return { uid: (user?.id as string) || "", user };
};
const WORKING = ["monday", "tuesday", "wednesday", "thursday", "friday"];
/** Stored statuses of the staff member's own records → the status glossary. */
const OWN_WORDS: Record<string, StatusWord> = { paid: "Completed", disbursed: "Completed", repaid: "Completed", active: "In progress" };
const word = (s?: string) => statusWord(s || "pending", OWN_WORDS) || "Pending approval";

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
      <MyHeader title="My attendance" subtitle="Your working days for the last eight weeks, your correction requests and the full log." actions={<ClockCard />} />
      <AttendanceNotice cal={cal} onAsk={() => setAsking(true)} />
      <div className="flex flex-wrap items-start gap-4">
        <WCard className="flex-[2_1_560px]">
          <WHead title="Working days" subtitle="Last 8 weeks · point at a day to see the times" right={<Button variant="link" onClick={() => setAsking(true)}>Ask HR to correct</Button>} />
          {q.isLoading ? <Skeleton className="mt-4 h-[300px] w-full" /> : <AttendanceCalendar cal={cal} />}
        </WCard>
        <WCard className="flex flex-[1_1_300px] flex-col gap-3">
          <WHead title={format(new Date(), "MMMM yyyy")} subtitle="This month so far" />
          <dl className="grid grid-cols-2 gap-3 text-t-small">
            {[
              ["Days present", String(month.length)],
              ["Late arrivals", String(month.filter((a: any) => a.behaviour === "late").length)],
              ["Average arrival", avg === null ? "—" : `${String(Math.floor(avg / 60)).padStart(2, "0")}:${String(Math.round(avg % 60)).padStart(2, "0")}`],
              ["Hours recorded", `${Math.round(hours)} h`],
            ].map(([k, v]) => <div key={k}><dt className="text-ims-muted">{k}</dt><dd className="text-t-kpi tabular-nums">{v}</dd></div>)}
          </dl>
          <p className="rounded-control bg-ims-thead px-3 py-2 text-t-small text-ims-body">Working hours: <b>{settings?.work_start_time || "08:00"} – {settings?.work_end_time || "17:00"}</b>, {working.length} days a week. Clock-in opens {Number(settings?.early_clockin_mins) || 0} minutes before the start.</p>
        </WCard>
      </div>
      <WCard>
        <WHead title="Correction requests" subtitle="Days you were on duty without a clock-in, sent to HR" />
        {corrections.isLoading ? <Skeleton className="mt-3 h-16 w-full" /> : !(corrections.data || []).length ? (
          <p className="mt-3 text-t-body text-ims-muted">None yet. If you were on mission or training, use <b>Ask HR to correct</b>.</p>
        ) : (
          <ul className="mt-3 divide-y divide-ims-divider">
            {(corrections.data as any[]).map((c) => (
              <li key={c.id} className="flex flex-wrap items-start justify-between gap-3 py-3">
                <div className="min-w-0">
                  <p className="text-t-body font-bold"><span className="whitespace-nowrap font-mono">{c.number}</span> · {CORRECTION_REASONS[c.reason] || c.reason}</p>
                  <p className="text-t-small text-ims-body">{(c.dates || []).map((d: string) => format(new Date(`${d}T12:00:00`), "EEE d MMM")).join(", ")}</p>
                  <p className="text-t-small text-ims-muted">{c.explanation}</p>
                  {c.review_comment && <p className="mt-1 text-t-small text-ims-body">HR: {c.review_comment}{c.expand?.reviewed_by ? ` · ${c.expand.reviewed_by.name}` : ""}</p>}
                </div>
                <div className="flex flex-col items-end gap-1 text-right">
                  <StatusPill status={word(c.status)} sub={c.status === "pending" ? "With HR" : c.status === "approved" ? `${c.added_days} day${c.added_days === 1 ? "" : "s"} added` : undefined} />
                  <p className="text-t-hint text-ims-muted">{fmtWhen(c.created)}</p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </WCard>
      <WCard>
        <WHead title="Attendance log" subtitle="Every clock-in and clock-out" />
        <div className="mt-3"><EmployeeAttendances employeeId={uid} inset /></div>
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
      <MyHeader title="My leave" subtitle="Your balance, your requests and your leave plan. Requests go to your line manager, then HR." actions={<Button variant="primary" icon={Plus} onClick={() => setOpen(true)}>Request leave</Button>} />
      <div className="flex flex-wrap items-start gap-4">
        <WCard className="flex flex-[1_1_320px] flex-col gap-3">
          <WHead title={`Annual leave ${year}`} subtitle={b ? `${Math.round(b.entitlement * 10) / 10} days entitlement` : ""} />
          {balance.isLoading ? <Skeleton className="h-28 w-full" /> : <LeaveBalance b={b} />}
          {b && (
            <dl className="grid grid-cols-2 gap-2 border-t border-ims-divider pt-2.5 text-t-small">
              <div><dt className="text-ims-muted">Years of service</dt><dd className="font-bold">{b.years_of_service}</dd></div>
              <div><dt className="text-ims-muted">Seniority days</dt><dd className="font-bold">{b.seniority_days}</dd></div>
              <div><dt className="text-ims-muted">Carried over</dt><dd className="font-bold">{b.carried_over}</dd></div>
              <div><dt className="text-ims-muted">Adjustment</dt><dd className="font-bold">{b.adjustment}{b.adjustment_reason ? ` · ${b.adjustment_reason}` : ""}</dd></div>
            </dl>
          )}
        </WCard>
        <WCard className="flex flex-[1_1_300px] flex-col gap-3">
          <WHead title={`Leave plan ${year}`} subtitle="When you intend to take your leave" right={<WLink to="/dashboard/leave-plan">Open →</WLink>} />
          {b?.plan ? (
            <>
              <p className="text-t-title tabular-nums">{b.planned}<span className="text-t-body font-bold text-ims-muted"> days planned</span></p>
              <StatusPill status={b.plan.status === "approved" ? "Approved" : "Draft"} />
              <p className="text-t-small text-ims-muted">{b.unplanned > 0 ? `${b.unplanned} ${b.unplanned === 1 ? "day is" : "days are"} not planned yet.` : "All your days are planned."}</p>
            </>
          ) : <p className="text-t-body text-ims-muted">No leave plan yet. HR asks everyone to plan the year's leave early so the work is covered.</p>}
          <Button icon={CalendarRange} onClick={() => navigate("/dashboard/leave-plan")}>Plan my leave</Button>
        </WCard>
        <WCard className="flex flex-[1_1_260px] flex-col gap-2">
          <WHead title="Public holidays" subtitle="Coming up" />
          {upcoming.length ? (
            <ul className="divide-y divide-ims-divider">
              {upcoming.map((h) => <li key={h.id} className="flex justify-between gap-3 py-2 text-t-body"><span>{h.name}</span><span className="whitespace-nowrap text-ims-muted">{format(new Date(`${h.next}T12:00:00`), "EEE d MMM")}</span></li>)}
            </ul>
          ) : <p className="text-t-body text-ims-muted">None in the calendar.</p>}
        </WCard>
      </div>
      <WCard>
        <WHead title="My leave requests" subtitle="All your requests with their status" />
        <div className="mt-3"><EmployeeLeaves employeeId={uid} inset hideCreate /></div>
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
      <MyHeader title="My payslips" subtitle="Payslips from approved payrolls; open one to print it or save it as PDF. Only you, payroll, finance and the auditors see them." />
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
  const NOTE: Record<string, string> = { pending_approval: "With Finance", active: "Being repaid", repaid: "Repaid", rejected: "Not approved" };
  const end = (l: any) => {
    const k = l.start_year * 12 + l.start_month - 1 + Math.max(1, l.installments) - 1;
    return `${MONTHS[k % 12]} ${Math.floor(k / 12)}`;
  };
  return (
    <WCard>
      <WHead title="My loans" subtitle="Repaid through your payslip; the balance goes down each month when salaries are paid." />
      <ul className="mt-3 divide-y divide-ims-divider">
        {rows.map((l) => {
          const pct = l.principal ? Math.round((l.repaid / l.principal) * 100) : 0;
          return (
            <li key={l.id} className="grid gap-2 py-3 sm:grid-cols-[1fr_220px_auto] sm:items-center">
              <div className="min-w-0">
                <p className="text-t-body font-bold text-ims-text">{LOAN_TYPES[l.loan_type] || "Loan"} · {money(l.principal)}</p>
                <p className="truncate text-t-small text-ims-muted"><span className="whitespace-nowrap font-mono">{l.number}</span> · {l.purpose}</p>
              </div>
              <div>
                <div className="flex justify-between text-t-hint text-ims-muted"><span>{money(l.installment)} a month</span><span>until {end(l)}</span></div>
                <div className="mt-1 h-2 overflow-hidden rounded-pill bg-ims-divider"><div className="h-full rounded-pill bg-ims-success" style={{ width: `${pct}%` }} /></div>
                <p className="mt-1 text-t-hint text-ims-body">Left to repay <b>{money(l.balance)}</b></p>
              </div>
              <StatusPill status={word(l.status)} sub={NOTE[l.status]} />
            </li>
          );
        })}
      </ul>
    </WCard>
  );
}

// ------------------------------------------------------------------ all requests
const KINDS = ["Leave", "Expense", "Petty cash", "Equipment", "Purchase"];
export function MyRequests() {
  const { uid } = useUid();
  const navigate = useNavigate();
  const { canPerform } = useRoles();
  const [tab, setTab] = React.useState<ReqTab>("all");
  const [kind, setKind] = React.useState("");
  const q = useQuery(["my-requests", uid], () => fetchMyRequests(uid, 60), { enabled: Boolean(uid) });
  const rows = (q.data || []).filter((r) => !kind || r.kind === kind);
  const shown = rows.filter((r) => tab === "all" || tabOf(r) === tab);
  return (
    <main className={myPage}>
      <MyHeader
        title="My requests"
        subtitle="Leave, expenses, petty cash, equipment and purchases: where each stands and what happens next."
        actions={
          <>
            {canPerform("create_purchase_requisition") && <Button icon={Plus} onClick={() => navigate("/dashboard/procurement/requisitions/new")}>Purchase requisition</Button>}
            <Button variant="primary" icon={Plus} onClick={() => navigate("/dashboard/my/leave?new=1")}>Request leave</Button>
          </>
        }
      />
      <WCard flush className="overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5">
          <FilterSelect label="Type" value={kind} onChange={setKind} options={KINDS.map((k) => ({ value: k, label: k }))} />
          <RequestTabs rows={rows} tab={tab} onTab={setTab} />
        </div>
        {q.isLoading ? <div className="px-5 pb-5"><Skeleton className="h-40 w-full" /></div> : <RequestTable rows={shown} empty="No request matches these filters." />}
      </WCard>
    </main>
  );
}

// ------------------------------------------------------------------ performance, documents
export function MyPerformance() {
  const { user } = useUid();
  return (
    <main className={myPage}>
      <MyHeader title="My performance" subtitle="Your appraisals: self-assessment, your supervisor's review and the agreed objectives." actions={<WLink to="/dashboard/my/plans">My plans & reports →</WLink>} />
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
      <WCard><EmployeeDocuments employeeId={uid} inset /></WCard>
    </main>
  );
}

// ------------------------------------------------------------------ expenses & advances
export function MyExpenses() {
  const { uid } = useUid();
  const [params] = useSearchParams();
  return (
    <main className={myPage}>
      <MyHeader title="Expenses & advances" subtitle="Money you spent for RALGA, refunded after approval, and salary advances." />
      <WCard><EmployeePrePayments employeeId={uid} autoOpen={params.get("new") === "expense"} /></WCard>
    </main>
  );
}

// ------------------------------------------------------------------ equipment
export function MyEquipment() {
  const { uid } = useUid();
  const [params, setParams] = useSearchParams();
  const tab = params.get("tab") === "requests" ? "requests" : "assigned";
  const [open, setOpen] = React.useState(params.get("new") === "1");
  const held = useQuery(["my-assets", uid], () => pocketbase.collection("assets").getFullList({ filter: `assigned_to = "${uid}" && status != "disposed"`, sort: "code", expand: "category,type" }), { enabled: Boolean(uid) });
  const reqs = useQuery(["my-equipment", uid], () => pocketbase.collection("assets_requests").getFullList({ filter: `requested_by = "${uid}"`, sort: "-created", expand: "asset,asset_type" }), { enabled: Boolean(uid) });
  const pending = ((reqs.data || []) as any[]).filter((r) => r.status === "pending").length;
  return (
    <main className={myPage}>
      <MyHeader
        title="Equipment"
        subtitle="RALGA equipment in your care, and your requests for more. You answer for it at the asset counts."
        actions={<Button variant="primary" icon={Plus} onClick={() => setOpen(true)}>Request equipment</Button>}
      />
      <Tabs
        label="Equipment"
        tabs={[{ key: "assigned", label: "In my care", count: held.data?.length }, { key: "requests", label: "My requests", count: pending || undefined }]}
        active={tab}
        onChange={(k) => setParams(k === "requests" ? { tab: "requests" } : {})}
      />
      {tab === "assigned" ? (
        <WCard flush className="overflow-hidden">
          {held.isLoading ? <div className="p-5"><Skeleton className="h-24 w-full" /></div> : !(held.data || []).length ? (
            <EmptyState icon={Laptop} text="Nothing in your care. Equipment the Store & Asset Officer gives you appears here." />
          ) : (
            <ul className="divide-y divide-ims-divider">
              {(held.data as any[]).map((a) => (
                <li key={a.id} className="grid gap-2 px-5 py-3 sm:grid-cols-[1fr_auto] sm:items-center">
                  <div className="min-w-0">
                    <p className="text-t-body font-bold text-ims-text">{a.name}</p>
                    <p className="text-t-small text-ims-muted"><span className="font-mono">{a.code}</span>{a.serial_number ? ` · S/N ${a.serial_number}` : ""} · {a.expand?.category?.name}{a.location_name ? ` · ${a.location_name}` : ""}</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                    {a.condition && <Pill tone={a.condition === "damaged" || a.condition === "poor" ? "danger" : "neutral"}>{CONDITIONS[a.condition]}</Pill>}
                    <StatusPill status={ASSET_STATUS[a.status]?.label || a.status} sub={ASSET_STATUS[a.status]?.note} />
                    {a.assigned_at && <span className="text-t-hint text-ims-muted">since {fmtDate(a.assigned_at)}</span>}
                  </div>
                </li>
              ))}
            </ul>
          )}
          <p className="border-t border-ims-divider px-5 py-3 text-t-small text-ims-muted">Something broken, lost or no longer needed? Tell the Store & Asset Officer; they record it and arrange repair, return or transfer.</p>
        </WCard>
      ) : (
        <WCard flush className="overflow-hidden">
          {reqs.isLoading ? <div className="p-5"><Skeleton className="h-24 w-full" /></div> : !(reqs.data || []).length ? (
            <EmptyState icon={Laptop} text="No equipment request yet." action={<Button variant="primary" icon={Plus} onClick={() => setOpen(true)}>Request equipment</Button>} />
          ) : (
            <ul className="divide-y divide-ims-divider">
              {(reqs.data as any[]).map((r) => (
                <li key={r.id} className="flex flex-wrap items-start justify-between gap-3 px-5 py-3">
                  <div className="min-w-0">
                    <p className="text-t-body font-bold">{r.expand?.asset_type?.name || r.expand?.asset?.name || "Equipment"}</p>
                    <p className="text-t-small text-ims-muted">{r.notes}</p>
                    {r.status === "approved" && r.expand?.asset && <p className="mt-1 text-t-small text-ims-success">Given: <span className="font-mono">{r.expand.asset.code}</span> {r.expand.asset.name}</p>}
                    {r.status === "rejected" && r.rejected_reason && <p className="mt-1 text-t-small text-ims-danger">{r.rejected_reason}</p>}
                  </div>
                  <div className="flex flex-col items-end gap-1 text-right">
                    <StatusPill status={word(r.status)} sub={r.status === "approved" ? "Given to you" : r.status === "pending" ? "With the asset officer" : undefined} />
                    <p className="text-t-hint text-ims-muted">{fmtWhen(r.created)}</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </WCard>
      )}
      {open && <EquipmentRequestDialog uid={uid} onClose={() => { setOpen(false); if (params.get("new")) setParams({ tab: "requests" }); }} onDone={() => { setOpen(false); reqs.refetch(); setParams({ tab: "requests" }); }} />}
    </main>
  );
}

/** Ask for a type of equipment; the Store & Asset Officer gives a specific asset. */
function EquipmentRequestDialog({ uid, onClose, onDone }: { uid: string; onClose: () => void; onDone: () => void }) {
  const types = useQuery(["equipment-types"], async () => {
    const [cats, list] = await Promise.all([
      pocketbase.collection("assets_categories").getFullList({ sort: "sort,name", fields: "id,name,active" }),
      pocketbase.collection("assets_types").getFullList({ sort: "name", fields: "id,name,category" }),
    ]);
    return (cats as any[]).filter((c) => c.active !== false).map((c) => ({ ...c, types: (list as any[]).filter((t) => t.category === c.id) })).filter((c) => c.types.length);
  }, { staleTime: 300_000 });
  const [type, setType] = React.useState("");
  const [notes, setNotes] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [tried, setTried] = React.useState(false);
  const typeError = tried && !type ? "Choose what you need." : null;
  const notesError = tried && notes.trim().length < 5 ? "Say in a few words why you need it." : null;
  const send = async () => {
    setTried(true);
    if (!type || notes.trim().length < 5) return;
    setBusy(true);
    try {
      await pocketbase.collection("assets_requests").create({ requested_by: uid, asset_type: type, notes: notes.trim(), status: "pending" });
      toast.success("Request sent to the Store & Asset Officer");
      onDone();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal
      open
      onClose={onClose}
      size="sm"
      title="Request equipment"
      description="The Store & Asset Officer gives you an item from the store, or tells you when one is available."
      footer={
        <>
          <Button onClick={onClose} disabled={busy}>Cancel</Button>
          <Button variant="primary" onClick={send} loading={busy}>Send request</Button>
        </>
      }
    >
      <Field label="What do you need?" required htmlFor="eq-type" error={typeError}>
        <Select id="eq-type" value={type} onChange={(e) => setType(e.target.value)} invalid={Boolean(typeError)}>
          <option value="">Choose the equipment</option>
          {(types.data || []).map((c: any) => <optgroup key={c.id} label={c.name}>{c.types.map((t: any) => <option key={t.id} value={t.id}>{t.name}</option>)}</optgroup>)}
        </Select>
      </Field>
      <Field label="Why" required htmlFor="eq-why" error={notesError}>
        <Textarea id="eq-why" value={notes} onChange={(e) => setNotes(e.target.value)} invalid={Boolean(notesError)} placeholder="For example: my laptop no longer charges and I need one for the district training next week." />
      </Field>
    </Modal>
  );
}
